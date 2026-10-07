/*
 * 长期数值模拟：一个「中上水平」的自动玩家按规则层连续经营 N 天，输出每天的铜钱流水。
 * 运行：node tools/sim/economy.cjs [天数=60] [种子=1] [--csv out.csv] [--skill good|ok]
 *
 * 自动玩家的策略（尽量贴近认真玩的人，不作弊）：
 * - 清晨：按「锅 → 宽案板 → 双人桌 → 进货账 → …」顺序买升级，留 60 铜周转；升级买完后按价格从低到高买装修并摆上。
 *   进货：按毛利挑能做的粥（含时令粥），在每日可进种类内，按预计客数备货。
 * - 营业：有单先做单，没单时按库存预熬最受欢迎的粥；该搅就搅、按时加料、到窗口调味盛出、送给耐心最少的人、擦桌。
 * 不处理短篇选择（短篇奖励不计入），不刷练习。
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const DAYS = Number(argv.find(a => /^\d+$/.test(a)) ?? 60);
const SEED = Number(argv.filter(a => /^\d+$/.test(a))[1] ?? 1);
const csvAt = argv.indexOf('--csv');
const CSV = csvAt >= 0 ? argv[csvAt + 1] : null;
const skillAt = argv.indexOf('--skill');
const SKILL = skillAt >= 0 ? argv[skillAt + 1] : 'good';
const SPEC = argv.includes('--spec');

// ── 编译规则层（与 tests/rules.test.cjs 同一方式）──
const tscCandidates = [process.env.COCOS_TSC, path.join(root, 'node_modules/typescript/bin/tsc'),
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc'].filter(Boolean);
const tscJs = tscCandidates.find(c => fs.existsSync(c));
const out = path.join(root, 'temp/sim-economy');
const scripts = path.join(root, 'assets/scripts');
fs.mkdirSync(out, { recursive: true });
const tsconfig = path.join(out, 'tsconfig.json');
fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { module: 'commonjs', target: 'ES2019', strict: true, skipLibCheck: true, outDir: out, rootDir: scripts, lib: ['ES2019'], types: [] },
    files: ['core/Config.ts', 'rules/Shift.ts', 'rules/Progress.ts', 'rules/Arrivals.ts'].map(f => path.join(scripts, f)),
}));
const args = ['--pretty', 'false', '-p', tsconfig];
const compiled = tscJs ? spawnSync(process.execPath, [tscJs, ...args], { encoding: 'utf8' }) : spawnSync('tsc', args, { encoding: 'utf8' });
if (compiled.status !== 0) { console.error(compiled.stdout, compiled.stderr); process.exit(1); }
const req = p => require(path.join(out, p));
const { parseConfig, CONFIG_FILES, baseIngredients } = req('core/Config.js');
const { Progress, newProfile } = req('rules/Progress.js');
const { plannedCount } = req('rules/Arrivals.js');
const { SeededRng } = req('simulation/SeededRng.js');

const dataDir = path.join(root, 'assets/resources/data/rules');
const rawCfg = Object.fromEntries(CONFIG_FILES.map(f => [f, JSON.parse(fs.readFileSync(path.join(dataDir, `${f}.json`), 'utf8'))]));
// 试数值：SIM_PATCH='raw => { raw.balance.session.unitCap = 12 }'
if (process.env.SIM_PATCH) eval(process.env.SIM_PATCH)(rawCfg);
const config = parseConfig(rawCfg);
const bal = config.balance;
const ING = id => config.ingredient.get(id);
const REC = id => config.recipe.get(id);

const UPGRADE_ORDER = ['U01', 'U06', 'U04', 'U07', 'U02', 'U05', 'U08', 'U03'];
const RESERVE = 60;
let COOKED = 0;

// ───────────── 清晨 ─────────────
function morningShop(p, log) {
    p.morning();
    const spent = { upgrades: 0, decor: 0 };
    for (const id of UPGRADE_ORDER) {
        const u = config.upgrade.get(id);
        if (p.state.upgrades.includes(id)) continue;
        if (p.state.wallet - u.price < RESERVE + 40) break;          // 按顺序买，不跳着买
        if (p.buyUpgrade(id) === null) { spent.upgrades += u.price; log.push(`买升级 ${u.name}`); }
        else break;
    }
    if (UPGRADE_ORDER.every(id => p.state.upgrades.includes(id))) {
        const decor = config.decor.filter(d => d.price > 0 && !p.state.ownedDecor.includes(d.id)).sort((a, b) => a.price - b.price);
        for (const d of decor) {
            if (p.state.wallet - d.price < RESERVE + 80) break;
            if (p.buyDecor(d.id) === null) { spent.decor += d.price; p.place(d.id); log.push(`买装修 ${d.name}`); }
        }
    }
    stockUp(p);
    return spent;
}

function margin(r) { return r.price - r.cost; }

function stockUp(p) {
    const recipes = p.unlockedRecipes().slice().sort((a, b) => margin(b) - margin(a));
    const season = p.season();
    const guests = plannedCount(config, p.day, p.shopLevel) + (p.state.nextDay.guests?.length ?? 0);
    const menu = [];
    const kinds = new Set();
    const kindsMax = p.kindsLeft();
    // 在季时令粥优先（点单加权）
    recipes.sort((a, b) => (b.season === season ? 1 : 0) - (a.season === season ? 1 : 0) || margin(b) - margin(a));
    for (const r of recipes) {
        const need = r.ingredients.map(i => i.id).filter(id => !kinds.has(id));
        if (kinds.size + need.length > kindsMax) continue;
        if (r.ingredients.some(i => !p.ingredientOpen(i.id))) continue;
        need.forEach(id => kinds.add(id));
        menu.push(r);
        if (menu.length >= Math.max(2, p.pots + 1)) break;
    }
    if (!menu.length) return;
    // 一天能出的碗数：锅数 × 营业时长 / (平均熬煮 + 盛碗)，再受底料单日上限约束
    const cookCycle = 75;
    const potCap = Math.floor(p.pots * bal.session.arrivalCutoffSeconds / cookCycle) + p.pots;
    const bowls = Math.min(Math.ceil(guests * 1.05), potCap);
    const per = Math.ceil(bowls / menu.length);
    const want = {};
    for (const r of menu) for (const i of r.ingredients) want[i.id] = (want[i.id] ?? 0) + per * (i.count ?? 1);
    for (const id of Object.keys(want)) want[id] = Math.min(want[id], p.dailyCap(id) + p.pantry.total(id));
    for (const [id, n] of Object.entries(want)) {
        let k = Math.min(n - p.pantry.total(id), p.dailyCap(id));
        while (k > 0 && p.buy(id, k) !== null) k--;
    }
}

// ───────────── 营业 ─────────────
function playShift(sh) {
    const dt = 0.05;
    const st = sh.state;
    const careless = SKILL === 'ok';
    let guard = 0;
    while (st.phase !== 'done' && guard++ < 20000) {
        sh.step(dt);
        sh.drainEvents();
        if (st.phase === 'prep') { doPrep(sh); continue; }
        if (st.phase === 'done') break;
        if (sh.busy) continue;
        // 一般玩家：平均约 1 秒才反应一次
        if (careless && Math.random() > 0.05) continue;
        if (act(sh, careless)) continue;
        if (st.phase === 'closing' && !st.orders.some(o => o.state === 'waiting') && !st.pots.some(p => p.phase !== 'empty')) sh.endClosing();
    }
}

function usable(sh, id) { return sh.pantry.usable(id); }

function doPrep(sh) {
    // 底料和配料都按需要处理：可用量少的先做
    const ids = [...new Set(sh.state.setup.recipes.flatMap(r => REC(r).ingredients.map(i => i.id)))]
        .filter(id => ING(id).prep !== 'none' && sh.pantry.total(id) > sh.pantry.usable(id))
        .sort((a, b) => usable(sh, a) - usable(sh, b));
    for (const id of ids) {
        if (ING(id).prep !== 'soak' && sh.busy) continue;
        if (sh.prepIngredient(id) === null) return true;
    }
    return false;
}

function act(sh, careless) {
    const st = sh.state;
    // 1. 到窗口的锅：调味 → 盛出
    for (const pot of st.pots) {
        const r = REC(pot.recipeId);
        if (!r) continue;
        if (pot.phase === 'burnt') { sh.washPot(pot.index); return true; }
        if (pot.phase === 'window' || pot.phase === 'over') {
            if (r.seasoning !== 'plain' && !pot.seasoning) sh.season(pot.index, r.seasoning);
            if (careless && pot.phase === 'window' && Math.random() < 0.3) continue;
            if (sh.plate(pot.index) === null) return true;
        }
    }
    // 2. 送餐
    for (const b of st.pass) {
        if (sh.waitingOrders.some(o => o.recipeId === b.recipeId)) { if (sh.deliverBest(b.id) === null) return true; }
        else if (b.held > 45) sh.discardBowl(b.id);
    }
    // 3. 搅拌
    const low = st.pots.filter(p => ['cooking', 'window'].includes(p.phase) && p.stir < sh.warnLine(p.recipeId) + (careless ? 0.02 : 0.15))
        .sort((a, b) => a.stir - b.stir)[0];
    if (low) { sh.setFocus(low.index); if (sh.stir(low.index) === null) return true; }
    // 4. 加料
    for (const pot of st.pots) {
        const r = REC(pot.recipeId);
        if (!r || !['cooking', 'window', 'over'].includes(pot.phase)) continue;
        for (const a of r.adds) {
            if (pot.added.some(x => x.id === a.id) || pot.doneness < a.atDoneness) continue;
            if (usable(sh, a.id) > 0) { sh.addIngredient(pot.index, a.id); }
            else if (sh.prepIngredient(a.id) === null) return true;
        }
    }
    // 5. 擦桌
    const seat = st.dirty.findIndex(x => x);
    if (seat >= 0 && sh.wipe(seat) === null) return true;
    // 6. 开锅：先做单，再预熬
    for (const pot of st.pots) {
        if (pot.phase !== 'empty') continue;
        const inFlight = rid => st.pots.filter(p => p.recipeId === rid && p.phase !== 'empty').length + st.pass.filter(b => b.recipeId === rid).length;
        const orders = sh.waitingOrders.slice().sort((a, b) => a.patienceLeft - b.patienceLeft);
        let rid = null;
        for (const o of orders) {
            const owed = orders.filter(x => x.recipeId === o.recipeId).length - inFlight(o.recipeId);
            if (owed > 0 && canStart(sh, o.recipeId)) { rid = o.recipeId; break; }
        }
        if (!rid && SPEC && st.phase === 'service' && st.t < bal.session.arrivalCutoffSeconds - 30 && st.queue.length > 0) {
            const total = st.pots.filter(p => p.phase !== 'empty').length + st.pass.length;
            const expected = sh.waitingOrders.length + st.queue.length + 1;
            if (total < expected + 1) {
                const options = sh.orderable().filter(r => canStart(sh, r.id))
                    .sort((a, b) => popularity(sh, b.id) - popularity(sh, a.id) - inFlight(b.id) + inFlight(a.id));
                rid = options[0]?.id ?? null;
            }
        }
        if (rid) { if (sh.startCooking(pot.index, rid, REC(rid).heatHint) === null) COOKED++; return true; }
    }
    // 7. 备料
    return doPrep(sh);
}

function canStart(sh, rid) {
    return baseIngredients(REC(rid)).every(b => sh.pantry.usable(b.id) >= b.count);
}
function popularity(sh, rid) {
    const r = REC(rid);
    const season = sh.state.setup.season;
    return margin(r) / 10 + (r.season && r.season === season ? 3 : 0);
}

// ───────────── 主循环 ─────────────
const p = new Progress(config, newProfile(config, SEED));
const rng = new SeededRng(SEED * 7919);
const rows = [];
let totals = { upgrades: 0, decor: 0 };
for (let d = 0; d < DAYS; d++) {
    const log = [];
    const walletStart = p.state.wallet;
    const spent = morningShop(p, log);
    totals.upgrades += spent.upgrades; totals.decor += spent.decor;
    COOKED = 0;
    const sh = p.startShift(rng);
    const arrivals = sh.state.arrivals?.length ?? 0;
    playShift(sh);
    const rep = p.closeDay(sh);
    const L = rep.ledger;
    rows.push({
        day: L.day, walletStart, walletEnd: p.state.wallet, revenue: L.revenue, tips: L.tips, purchases: L.purchases, rent: L.rent,
        goal: rep.goalReward, bonus: rep.bonus, upgrades: spent.upgrades, decor: spent.decor, served: L.served, arrivals,
        walked: L.reasons.impatient ?? 0, reasons: JSON.stringify(L.reasons), orders: sh.state.orders.length, cooked: COOKED, perfect: Object.entries(sh.state.served).filter(([k]) => k.includes('|perfect|')).reduce((s, [, n]) => s + n, 0),
        pots: p.pots, seats: p.seats, chapter: rep.chapter?.season ? `${rep.chapter.season.id ?? ''}` : '', log: log.join('；'),
    });
}

// ───────────── 输出 ─────────────
const pad = (s, n) => String(s).padStart(n);
console.log(`种子 ${SEED}，${DAYS} 天，手法 ${SKILL}`);
console.log(' 日   早钱包   营收  小费   进货  房租 小目标 长线   升级  装修  出餐/到客 走掉 刚好  锅 座  晚钱包  备注');
for (const r of rows) {
    console.log(`${pad(r.day, 3)} ${pad(r.walletStart, 7)} ${pad(r.revenue, 6)} ${pad(r.tips, 5)} ${pad(-r.purchases, 6)} ${pad(-r.rent, 5)} ${pad(r.goal, 5)} ${pad(r.bonus, 5)} ${pad(-r.upgrades, 6)} ${pad(-r.decor, 5)} ${pad(r.served, 5)}/${pad(r.arrivals, 2)} ${pad(r.walked, 4)} ${pad(r.perfect, 4)} ${pad(r.pots, 3)} ${pad(r.seats, 2)} ${pad(r.walletEnd, 7)}  ${r.log} ${process.env.DBG ? r.reasons + ' o' + r.orders + ' c' + r.cooked : ''}`);
}
const sum = k => rows.reduce((s, r) => s + r[k], 0);
const net = rows.map(r => r.revenue + r.tips + r.goal + r.bonus - r.purchases - r.rent);
const after = (from) => net.slice(from - 1);
const avg = a => Math.round(a.reduce((s, x) => s + x, 0) / Math.max(1, a.length));
const allUp = rows.find(r => UPGRADE_ORDER.every(id => p.state.upgrades.includes(id)) && r.upgrades > 0 && r.pots === 4)?.day;
console.log('\n合计：营收', sum('revenue'), '小费', sum('tips'), '小目标', sum('goal'), '长线', sum('bonus'), '进货', sum('purchases'), '房租', sum('rent'));
console.log('花在升级', totals.upgrades, '装修', totals.decor, '；最终钱包', p.state.wallet);
console.log('日均净收入：1–7 日', avg(net.slice(0, 7)), '｜8–21 日', avg(net.slice(7, 21)), '｜22 日后', avg(after(22)));
const upDone = rows.findIndex((r, i) => UPGRADE_ORDER.every(id => rows.slice(0, i + 1).some(x => x.log.includes(config.upgrade.get(id).name))));
const decorDone = rows.findIndex((r, i) => config.decor.filter(d => d.price > 0).every(d => rows.slice(0, i + 1).some(x => x.log.includes(d.name))));
console.log('升级全部买齐：第', upDone >= 0 ? upDone + 1 : '—', '日；可买装修全部买齐：第', decorDone >= 0 ? decorDone + 1 : '—', '日');
if (CSV) {
    const keys = Object.keys(rows[0]);
    fs.writeFileSync(CSV, [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'));
    console.log('CSV →', CSV);
}
