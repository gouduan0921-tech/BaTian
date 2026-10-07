/* 规则层测试：对应文档 26 的可自动化用例。运行：node tests/rules.test.cjs */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tscCandidates = [
    process.env.COCOS_TSC,
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc',
].filter(Boolean);
const tscJs = tscCandidates.find(c => fs.existsSync(c));
const out = path.join(root, 'temp/rule-tests');
const scripts = path.join(root, 'assets/scripts');
const entry = ['core/Config.ts', 'rules/Shift.ts', 'rules/Progress.ts', 'rules/Goals.ts', 'save/SaveModel.ts', 'gameplay/GameFlow.ts'].map(f => path.join(scripts, f));
fs.mkdirSync(out, { recursive: true });
const tsconfig = path.join(out, 'tsconfig.rules.json');
fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { module: 'commonjs', target: 'ES2019', strict: true, skipLibCheck: true, outDir: out, rootDir: scripts, lib: ['ES2019'], types: [] },
    files: entry,
}));
const args = ['--pretty', 'false', '-p', tsconfig];
const compiled = tscJs ? spawnSync(process.execPath, [tscJs, ...args], { encoding: 'utf8' }) : spawnSync('tsc', args, { encoding: 'utf8' });
if (compiled.status !== 0) { console.error(compiled.stdout, compiled.stderr); process.exit(1); }

const req = p => require(path.join(out, p));
const { parseConfig, ConfigError, CONFIG_FILES } = req('core/Config.js');
const { Shift, newShiftState } = req('rules/Shift.js');
const { Pantry } = req('rules/Pantry.js');
const { Progress, newProfile } = req('rules/Progress.js');
const { planArrivals, splitByWave } = req('rules/Arrivals.js');
const { SeededRng } = req('simulation/SeededRng.js');
const { FixedClock } = req('simulation/FixedClock.js');
const { emptyPot, startPot, stepPot, stirPot } = req('rules/Pot.js');
const { readAtmosphere, emptyPlacement } = req('rules/Atmosphere.js');
const { SaveStore, memoryStore, parseSave, serializeSave, SAVE_FORMAT } = req('save/SaveModel.js');
const { GameFlow } = req('gameplay/GameFlow.js');
const { dailyGoals, goalStatus } = req('rules/Goals.js');
const { skillInfo, skillTierUp } = req('rules/Skill.js');
const { chapterAt } = req('rules/Chapters.js');

const dataDir = path.join(root, 'assets/resources/data/rules');
const loadRaw = () => Object.fromEntries(CONFIG_FILES.map(f => [f, JSON.parse(fs.readFileSync(path.join(dataDir, `${f}.json`), 'utf8'))]));
const config = parseConfig(loadRaw());
const bal = config.balance;
const R = id => config.recipe.get(id);

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** 建一个直接处于营业中的班次，默认 1 锅 2 座、库存充足。 */
function makeShift(opts = {}) {
    const profile = new Progress(config, newProfile(config, 7));
    for (const [id, n] of Object.entries(opts.stock ?? { I01: 8, I03: 8, I04: 8 })) profile.pantry.add(id, n);
    const setup = { ...profile.shiftSetup(), pots: opts.pots ?? 1, seats: opts.seats ?? 2, recipes: opts.recipes ?? ['R01', 'R02'], ...(opts.setup ?? {}) };
    const state = newShiftState(config, setup, opts.arrivals ?? []);
    const sh = new Shift(config, state, profile.pantry, new SeededRng(opts.seed ?? 3));
    if (opts.readyAll !== false) readyAll(sh);
    sh.open();
    return { sh, profile };
}
function readyAll(sh) {
    for (const b of sh.pantry.state.batches) {
        if (config.ingredient.get(b.id).prep !== 'none') { b.ready += b.raw; b.raw = 0; }
    }
}
function run(sh, seconds, each) {
    const n = Math.round(seconds / 0.05);
    for (let i = 0; i < n; i++) { sh.step(0.05); if (each) each(sh); }
}
function cookUntil(sh, pot, pred, stirEvery = 5) {
    let t = 0;
    while (!pred(sh.state.pots[pot]) && t < 300) {
        sh.step(0.05); t += 0.05;
        if (stirEvery && Math.abs((t % stirEvery)) < 0.049 && !sh.busy) sh.stir(pot);
    }
    return t;
}
function plateAndWait(sh, pot) {
    while (sh.busy) sh.step(0.05);
    assert.equal(sh.plate(pot), null);
    run(sh, bal.actions.serve + bal.actions.plate + 0.1);
    return sh.state.pass[sh.state.pass.length - 1];
}

// ───────────── 配置 ─────────────
test('T26 成本与食材价不符时启动失败并指出 id', () => {
    const raw = loadRaw();
    raw.recipes[0].cost = 8;
    assert.throws(() => parseConfig(raw), e => e instanceof ConfigError && e.file === 'recipes' && e.id === 'R01');
    const raw2 = loadRaw();
    raw2.recipes[0].price = raw2.recipes[0].cost;
    assert.throws(() => parseConfig(raw2), /R01/);
});
test('T27 权重或份额和不为 1 时启动失败', () => {
    const raw = loadRaw();
    raw.atmosphere.weights.crowd = 0.2;
    assert.throws(() => parseConfig(raw), /权重和/);
    const raw2 = loadRaw();
    raw2.balance.demand.waves[0].share = 0.3;
    assert.throws(() => parseConfig(raw2), /份额/);
});
test('粥谱成本等于食材价之和（04 §7）', () => {
    const want = { R01: 4, R02: 18, R03: 9, R04: 15, R05: 19, R06: 8, R07: 16, R08: 9, R09: 21, R10: 19, R11: 17, R12: 28 };
    for (const [id, c] of Object.entries(want)) assert.equal(R(id).cost, c, id);
});

test('T01 新档：钱包 200，可做白粥与皮蛋瘦肉粥，只有暖木风格与粗瓷碗', () => {
    const p = new Progress(config, newProfile(config, 1));
    assert.equal(p.state.wallet, 200);
    assert.deepEqual(p.unlockedRecipes().map(r => r.id), ['R01', 'R02']);
    assert.deepEqual(p.state.styles, ['warm-wood']);
    assert.equal(p.state.tableware, 'D10');
    assert.ok(p.state.ownedDecor.every(id => ['D10', 'D01'].includes(id)), p.state.ownedDecor.join());
});
test('T36 短篇奖励在打烊结算时就发：跳过 S05 对白，次日仍多一名食评', () => {
    const p = new Progress(config, newProfile(config, 1));
    const s05 = config.stories.find(s => s.id === 'S05');
    p.grant(s05.reward);
    assert.ok(p.state.nextDay.guests.some(g => g.customerId === 'C07' && g.wave === 'lunch'));
});
test('T42 混用三种风格主件：标记「颜色有点杂」，光色 −5', () => {
    const pl = emptyPlacement();
    pl.window.main = 'D01'; pl.door.main = 'D17'; pl.hall.main = 'D09';
    const { staticParts } = req('rules/Atmosphere.js');
    const mixed = staticParts(config, pl);
    pl.hall.main = 'D05';
    const two = staticParts(config, pl);
    assert.equal(mixed.mixed, true);
    assert.equal(two.mixed, false);
    assert.equal(config.atmosphere.mixLightPenalty, 5);
});

test('发布构建的展开语法：不对 Map / Set / 迭代器用 [...x]（构建用宽松转译，会变成 [x]）', () => {
    const bad = [];
    const walk = d => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (n.endsWith('.ts')) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
            if (/\[\.\.\.(new (Set|Map)\b|[\w.]+\.(keys|values|entries)\(\))/.test(l) || /\[\.\.\.(removed|out|this\.overlays|this\.guests)\]/.test(l)) bad.push(`${n}:${i + 1}`);
        }); } };
    walk(scripts);
    assert.deepEqual(bad, []);
});

// ───────────── 锅 ─────────────
test('T09 每道粥中火按时搅拌到 0.80 的时间等于 cookSeconds', () => {
    for (const r of config.recipes) {
        const pot = emptyPot(0);
        startPot(pot, r, 'mid', 0);
        let t = 0;
        const ev = [];
        while (pot.doneness < 0.8) { stepPot(pot, r, bal, 0.05, true, 0.35, ev); t += 0.05; if (pot.stir < 0.5) stirPot(pot, bal); }
        assert.ok(Math.abs(t - r.cookSeconds) <= 0.051, `${r.id} ${t}`);
    }
});
test('T06 30 帧与 60 帧下 doneness 曲线一致', () => {
    const curve = fps => {
        const { sh } = makeShift();
        sh.startCooking(0, 'R01', 'mid');
        const clock = new FixedClock(0.05, 4);
        const pts = [];
        for (let f = 0; f < fps * 20; f++) {
            const steps = clock.feed(1 / fps);
            for (let i = 0; i < steps; i++) sh.step(0.05);
            if (f % fps === fps - 1) pts.push(sh.state.pots[0].doneness.toFixed(6));
        }
        return pts;
    };
    assert.deepEqual(curve(30), curve(60));
});
test('T10 白粥与小米南瓜同时武火不搅拌，小米南瓜更早糊', () => {
    const burnAt = id => {
        const pot = emptyPot(0); startPot(pot, R(id), 'high', 0);
        let t = 0; const ev = [];
        while (pot.phase !== 'burnt' && t < 200) { stepPot(pot, R(id), bal, 0.05, true, 0.35, ev); t += 0.05; }
        return t;
    };
    assert.ok(burnAt('R03') + 5 < burnAt('R01'), `${burnAt('R03')} vs ${burnAt('R01')}`);
});
test('T07 两口锅只操作一口，另一口低于 0.35 时发警告', () => {
    const { sh } = makeShift({ pots: 2, stock: { I01: 4 } });
    sh.startCooking(0, 'R01', 'mid'); sh.startCooking(1, 'R01', 'mid');
    sh.setFocus(0);
    let warned = null; let t = 0;
    while (warned === null && t < 30) {
        sh.step(0.05); t += 0.05;
        if (!sh.busy) sh.stir(0);
        const e = sh.drainEvents().find(x => x.type === 'pot:stir-warn');
        if (e) warned = e.pot;
    }
    assert.equal(warned, 1);
    assert.ok(sh.state.pots[1].stir < 0.35);
});

// ───────────── 评分与结算 ─────────────
function serveTo(sh, customerId, recipeId, cook) {
    const g = { id: 'GX' + Math.random(), customerId, wave: 'morning', state: 'seated', seat: 0, doorLeft: 0, orderId: null, dineLeft: 0, served: false, reordered: false };
    sh.state.guests[g.id] = g; sh.state.seats[0] = g.id;
    const o = { id: 'OX' + Math.random(), guestId: g.id, recipeId, patienceLeft: 999, patienceMax: 999, state: 'waiting', reorder: false };
    sh.state.orders.push(o); g.orderId = o.id;
    sh.startCooking(0, recipeId, cook.heat ?? 'mid');
    cook.run(sh);
    const bowl = plateAndWait(sh, 0);
    sh.drainEvents();
    assert.equal(sh.deliver(bowl.id, o.id), null);
    run(sh, 1.1);
    return sh.drainEvents().find(e => e.type === 'delivered');
}
test('T02 中火熬白粥到窗口原味盛出：评分 100，实收 16', () => {
    const { sh } = makeShift();
    const e = serveTo(sh, 'C01', 'R01', { run: s => cookUntil(s, 0, p => p.doneness >= 0.8) });
    assert.equal(e.result, 'perfect');
    assert.equal(e.score, 100);
    assert.equal(e.revenue, 16);
    assert.ok(e.tip > 0);
});
test('T03 窗口前盛出为夹生，评分 65', () => {
    const { sh } = makeShift();
    const e = serveTo(sh, 'C01', 'R01', { run: s => cookUntil(s, 0, p => p.doneness >= 0.5) });
    assert.equal(e.result, 'raw');
    assert.equal(e.score, 65);
    assert.ok(e.revenue < 16);
});
test('T04 武火不搅拌糊底上桌：评分 40、实收 6、小费 0、锅进入清洗', () => {
    const { sh } = makeShift();
    sh.startCooking(0, 'R01', 'high');
    cookUntil(sh, 0, p => p.phase === 'burnt', 0);
    const g = { id: 'G9', customerId: 'C01', wave: 'morning', state: 'seated', seat: 0, doorLeft: 0, orderId: 'O9', dineLeft: 0, served: false, reordered: false };
    sh.state.guests.G9 = g; sh.state.seats[0] = 'G9';
    sh.state.orders.push({ id: 'O9', guestId: 'G9', recipeId: 'R01', patienceLeft: 999, patienceMax: 999, state: 'waiting', reorder: false });
    const bowl = plateAndWait(sh, 0);
    assert.equal(sh.state.pots[0].phase, 'washing');
    sh.deliver(bowl.id, 'O9'); run(sh, 1.1);
    const e = sh.drainEvents().find(x => x.type === 'delivered');
    assert.equal(e.score, 40); assert.equal(e.revenue, 6); assert.equal(e.tip, 0);
    run(sh, 6);
    assert.equal(sh.state.pots[0].phase, 'empty');
});
test('T11 皮蛋瘦肉粥 0.60 才加肉记时机偏；不加皮蛋记缺料', () => {
    const { sh } = makeShift();
    const e = serveTo(sh, 'C02', 'R02', {
        run: s => {
            cookUntil(s, 0, p => p.doneness >= 0.60);
            assert.equal(s.addIngredient(0, 'I03'), null);
            cookUntil(s, 0, p => p.doneness >= 0.80);
            s.season(0, 'savory');
        },
    });
    assert.equal(e.score, 100 - 4 - 8);
});
test('T12 皮蛋瘦肉调成原味扣 8，锅不报废', () => {
    const { sh } = makeShift();
    const e = serveTo(sh, 'C02', 'R02', {
        run: s => {
            cookUntil(s, 0, p => p.doneness >= 0.45); s.addIngredient(0, 'I03');
            cookUntil(s, 0, p => p.doneness >= 0.80); s.addIngredient(0, 'I04');
            assert.equal(s.season(0, 'plain'), null);
        },
    });
    assert.equal(e.result, 'perfect');
    assert.equal(e.score, 92);
});
test('T21 碗在出餐台放 40 秒扣 10；有保温台不扣', () => {
    for (const [hold, want] of [[0, 90], [20, 100]]) {
        const { sh } = makeShift({ setup: { holdBonus: hold } });
        sh.startCooking(0, 'R01', 'mid');
        cookUntil(sh, 0, p => p.doneness >= 0.8);
        const bowl = plateAndWait(sh, 0);
        bowl.held = 40;
        assert.equal(sh.bowlScore(bowl), want);
    }
});
test('T20 客人离开后，碗可以送给下一位同粥客人', () => {
    const { sh } = makeShift();
    sh.startCooking(0, 'R01', 'mid');
    cookUntil(sh, 0, p => p.doneness >= 0.8);
    const bowl = plateAndWait(sh, 0);
    const mk = (gid, oid, patience) => {
        sh.state.guests[gid] = { id: gid, customerId: 'C01', wave: 'morning', state: 'seated', seat: -1, doorLeft: 0, orderId: oid, dineLeft: 0, served: false, reordered: false };
        sh.state.orders.push({ id: oid, guestId: gid, recipeId: 'R01', patienceLeft: patience, patienceMax: 100, state: 'waiting', reorder: false });
    };
    mk('GA', 'OA', 0.1); mk('GB', 'OB', 100);
    run(sh, 0.2);
    assert.equal(sh.state.orders.find(o => o.id === 'OA').state, 'left');
    assert.equal(sh.deliverBest(bowl.id), null);
    run(sh, 1.1);
    assert.equal(sh.state.orders.find(o => o.id === 'OB').state, 'served');
});

// ───────────── 经营 ─────────────
test('T13/T14 满座记 no-seat，有座但订单满记 busy', () => {
    const arrivals = [0.1, 0.2, 0.3].map(t => ({ time: t, customerId: 'C02', wave: 'morning' }));
    const { sh } = makeShift({ seats: 2, arrivals });
    run(sh, 16);
    assert.equal(sh.state.ledger.reasons['no-seat'], 1);
    const { sh: sh2 } = makeShift({ seats: 4, arrivals });
    run(sh2, 16);
    assert.equal(sh2.state.ledger.reasons['busy'], 1);
});
test('T15 耐心耗尽离开，原因 impatient，好感 −1', () => {
    const { sh } = makeShift({ arrivals: [{ time: 0.1, customerId: 'C02', wave: 'morning' }] });
    run(sh, 200);
    assert.equal(sh.state.ledger.reasons.impatient, 1);
    assert.equal(sh.state.favorDelta.C02, -1);
});
test('T16 第 1–7 日到达人数等于计划，四个波次都有人', () => {
    const profile = new Progress(config, newProfile(config, 1));
    for (let day = 1; day <= 7; day++) {
        const arr = planArrivals(config, { day, shopLevel: 1, unlocked: config.customers.map(c => c.id), guests: [], rescue: false }, new SeededRng(day));
        assert.equal(arr.length, 5 + day, `day ${day}`);
        for (const w of ['morning', 'forenoon', 'lunch', 'evening']) assert.ok(arr.some(a => a.wave === w), `day ${day} ${w}`);
        assert.ok(arr.every(a => a.time <= 420));
    }
    const s = splitByWave(config, 6);
    assert.deepEqual([s.morning, s.forenoon, s.lunch, s.evening], [2, 1, 2, 1]);
    const d8 = planArrivals(config, { day: 8, shopLevel: 4, unlocked: ['C01'], guests: [], rescue: false }, new SeededRng(2));
    assert.equal(d8.length, 18);
    void profile;
});
test('T17 氛围低于 30 时食评约一半离开', () => {
    let rejected = 0;
    for (let seed = 1; seed <= 60; seed++) {
        const { sh } = makeShift({ seed, arrivals: [{ time: 0.1, customerId: 'C07', wave: 'lunch' }], recipes: ['R01'] });
        run(sh, 0.3);
        if (sh.state.ledger.reasons.rejected) rejected++;
    }
    assert.ok(rejected > 15 && rejected < 45, `${rejected}`);
});
test('T31 同种子同操作重放，到达顺序一致', () => {
    const plan = s => planArrivals(config, { day: 5, shopLevel: 2, unlocked: config.customers.map(c => c.id), guests: [], rescue: false }, new SeededRng(s));
    assert.deepEqual(plan(42), plan(42));
});
test('T34 第 7 日午市固定一位食评；刚好的招牌粥氛围 ≥ 40 时小费翻倍', () => {
    const arr = planArrivals(config, { day: 7, shopLevel: 3, unlocked: ['C01', 'C02'], guests: [], rescue: false }, new SeededRng(9));
    assert.ok(arr.some(a => a.customerId === 'C07' && a.wave === 'lunch'));
    const { settle } = req('rules/Scoring.js');
    const c = config.customer.get('C07');
    const lo = settle(bal, R('R12'), c, 'perfect', 100, 0.3, 39);
    const hi = settle(bal, R('R12'), c, 'perfect', 100, 0.3, 41);
    assert.equal(hi.tip, Math.round(lo.tip * 2) === hi.tip ? hi.tip : Math.round(58 * 0.15 * 1.3 * (1 + 0.15) * 2));
    assert.ok(hi.tip >= lo.tip * 2 - 1);
});

// ───────────── 进度、租金、救援 ─────────────
function closeEmptyDay(p, extra = 0) {
    const sh = p.startShift(new SeededRng(p.day));
    sh.state.ledger.revenue += extra;
    sh.finish();
    return p.closeDay(sh);
}
test('T18 第三日钱不够付租金记欠租，次日进货 2 种，再次打烊先还欠租', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.wallet = 10;
    p.state.completedDays = 2;
    closeEmptyDay(p);
    assert.equal(p.state.debt, 20);
    assert.equal(p.state.wallet, 0);
    assert.equal(p.buyKinds, 2);
    closeEmptyDay(p, 100);
    assert.equal(p.state.debt, 0);
    assert.equal(p.state.wallet, 100 - 20 - 30);
    assert.equal(p.buyKinds, 4);
});
test('房租随铺面变大：每多一口锅、两个座位加租（04 §6）', () => {
    const p = new Progress(config, newProfile(config, 1));
    assert.equal(p.rent, bal.session.rent);
    p.state.upgrades.push('U01', 'U04');
    assert.equal(p.rent, bal.session.rent + bal.session.rentPerPot + 2 * bal.session.rentPerSeat);
    p.state.wallet = 500; p.state.completedDays = 3;
    const rep = closeEmptyDay(p);
    assert.equal(rep.ledger.rent, p.rent);
});
test('米和小米单日可进 20 份，其他食材 8 份', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.wallet = 999;
    p.morning();
    assert.equal(p.buy('I01', 20), null);
    assert.match(p.buy('I01', 1), /20 份/);
    assert.equal(p.buy('I03', 8), null);
    assert.match(p.buy('I03', 1), /8 份/);
});
test('T19 打烊后钱包 < 40：次日 +2 份大米，清晨第一位是点白粥的街坊', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.wallet = 20;
    closeEmptyDay(p);
    assert.equal(p.state.nextDay.rescue, true);
    const m = p.morning();
    assert.equal(m.rescueRice, 2);
    assert.equal(p.pantry.total('I01'), 2);
    const arr = planArrivals(config, { day: p.day, shopLevel: 1, unlocked: p.unlockedCustomers(), guests: [], rescue: true }, new SeededRng(1));
    assert.equal(arr[0].customerId, 'C02');
    assert.equal(arr[0].onlyRecipe, 'R01');
});
test('T32/T33 升级与粥谱的日期锁', () => {
    const p = new Progress(config, newProfile(config, 1));
    assert.equal(p.buyUpgrade('U02'), '还差 3 天');
    p.state.completedDays = 1;
    assert.equal(p.buyUpgrade('U01'), null);
    assert.equal(p.pots, 2);
    assert.ok(!p.unlockedRecipes(6).some(r => r.id === 'R12'));
    assert.ok(p.unlockedRecipes(7).some(r => r.id === 'R12'));
});

// ───────────── 食材 ─────────────
test('T22–T24 三类保鲜', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.morning();
    p.buy('I03', 1); p.buy('I04', 1); p.buy('I07', 1);
    const sh = p.startShift(new SeededRng(1));
    sh.open(); run(sh, 480); run(sh, 60);
    const report = p.closeDay(sh);
    assert.ok(report.expiring.some(e => e.id === 'I03'));
    p.morning();
    assert.equal(p.pantry.total('I03'), 0);
    assert.equal(p.pantry.total('I07'), 0);
    assert.equal(p.pantry.total('I04'), 1);
    assert.equal(p.pantry.bestTier('I04'), 1);
});
test('T25 只缺配料时能下锅，出餐缺料 −8', () => {
    const { sh } = makeShift({ stock: { I01: 2 }, recipes: ['R07'] });
    const e = serveTo(sh, 'C02', 'R07', { run: s => { cookUntil(s, 0, p => p.doneness >= 0.8); s.season(0, 'savory'); } });
    assert.equal(e.score, 100 - 16);
});
test('底料没处理不能下锅', () => {
    const { sh } = makeShift({ readyAll: false, stock: { I01: 1 } });
    assert.equal(sh.startCooking(0, 'R01'), '大米还没处理');
    sh.state.phase = 'service';
    assert.equal(sh.prepIngredient('I01'), null);
    run(sh, 4.1);
    assert.equal(sh.startCooking(0, 'R01'), null);
});

// ───────────── 氛围 ─────────────
test('氛围：空铺 20，纸灯 + 一口锅 + 食评坐下 ≥ 30', () => {
    const pl = emptyPlacement();
    assert.equal(readAtmosphere(config, pl, { cookingPots: 0, burntPots: 0, dirtyClean: 0, seated: 0, seats: 2 }).total, 20);
    pl.window.main = 'D01';
    const r = readAtmosphere(config, pl, { cookingPots: 1, burntPots: 0, dirtyClean: 0, seated: 1, seats: 6 });
    assert.ok(r.total >= 30, `${r.total}`);
    pl.door.main = 'D08'; pl.hall.main = 'D18';
    assert.ok(readAtmosphere(config, pl, { cookingPots: 0, burntPots: 0, dirtyClean: 0, seated: 0, seats: 2 }).mixed);
});

// ───────────── 短篇 ─────────────
test('T35/T37 好感不足不出 S01；同晚满足两则只播一则', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.history.served['C02|R01|perfect|morning'] = 1;
    p.state.favor.C02 = 3;
    let rep = closeEmptyDay(p);
    assert.equal(rep.story, null);
    p.state.favor.C02 = 4;
    p.state.favor.C06 = 6;
    p.state.history.served['C06|R04|perfect|forenoon'] = 1;
    rep = closeEmptyDay(p);
    assert.equal(rep.story.id, 'S01');
    assert.deepEqual(p.state.storyQueue, ['S02']);
    assert.equal(p.state.nextDay.guests[0].customerId, 'C02');
    rep = closeEmptyDay(p);
    assert.equal(rep.story.id, 'S02');
    assert.ok(p.state.ownedDecor.includes('D12'));
});
test('T38 第 12 日仍未触发 S03，夜蓝自动开放', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.completedDays = 11;
    const rep = closeEmptyDay(p);
    assert.ok(rep.unlockedStyles.includes('night-blue'));
});
test('常客：街坊好感 ≥ 6 的次日加入客流', () => {
    const p = new Progress(config, newProfile(config, 1));
    p.state.favor.C02 = 6;
    closeEmptyDay(p);
    assert.ok(p.unlockedCustomers().includes('C08'));
});
test('每原型每日好感最多 +3', () => {
    const { sh } = makeShift();
    for (let i = 0; i < 4; i++) sh['favor']('C02', 2);
    assert.equal(sh.state.favorDelta.C02, 3);
});

// ───────────── 存档 ─────────────
test('T28 超过 1MB 或 format 更高：拒绝读取，原档保留', () => {
    const kv = memoryStore();
    const flow = new GameFlow(config, new SaveStore(kv, config));
    flow.newGame(5);
    const text = kv.get('batian.save.primary');
    const newer = JSON.parse(text); newer.format = SAVE_FORMAT + 1;
    kv.set('batian.save.primary', JSON.stringify(newer));
    const flow2 = new GameFlow(config, new SaveStore(kv, config));
    assert.equal(flow2.boot(), false);
    assert.equal(flow2.store.write(JSON.parse(text)), '存档受保护，未写入');
    assert.equal(JSON.parse(kv.get('batian.save.primary')).format, SAVE_FORMAT + 1);
    assert.equal(parseSave('x'.repeat(1024 * 1024 + 1), config).ok, false);
});
test('T29 存档里的升级 id 不在表内，整档失败', () => {
    const kv = memoryStore();
    const flow = new GameFlow(config, new SaveStore(kv, config));
    flow.newGame(5);
    const f = JSON.parse(kv.get('batian.save.primary'));
    f.profile.upgrades = ['U99'];
    assert.equal(parseSave(JSON.stringify(f), config).ok, false);
});
test('T30 营业中存档后重进：锅、出餐台、订单都在，不重复入账', () => {
    const kv = memoryStore();
    const flow = new GameFlow(config, new SaveStore(kv, config));
    flow.newGame(11);
    flow.progress.buy('I01', 4);
    flow.startPrep();
    readyAll(flow.shift);
    flow.shift.open();
    flow.shift.startCooking(0, 'R01', 'mid');
    for (let i = 0; i < 31 * 20; i++) flow.tick(0.05);
    const before = JSON.stringify(flow.shift.state);
    const wallet = flow.progress.state.wallet;
    const flow2 = new GameFlow(config, new SaveStore(kv, config));
    assert.equal(flow2.boot(), true);
    assert.ok(flow2.shift);
    const saved = JSON.parse(kv.get('batian.save.primary')).shift;
    assert.equal(JSON.stringify(flow2.shift.state), JSON.stringify(saved));
    assert.equal(flow2.shift.state.pots[0].recipeId, 'R01');
    assert.equal(flow2.progress.state.wallet, wallet);
    assert.equal(flow2.rng.step, JSON.parse(kv.get('batian.save.primary')).rngStep);
    void before;
});
test('完整一日流程：清晨 → 预处理 → 营业 → 日结 → 次日', () => {
    const kv = memoryStore();
    const flow = new GameFlow(config, new SaveStore(kv, config));
    flow.newGame(3);
    assert.equal(flow.mode, 'morning');
    assert.equal(flow.progress.buy('I01', 6), null);
    flow.startPrep();
    assert.equal(flow.shift.phase, 'prep');
    for (let i = 0; i < 6; i++) { flow.shift.prepIngredient('I01'); for (let k = 0; k < 90; k++) flow.tick(0.05); }
    flow.shift.open();
    let served = 0;
    for (let k = 0; k < 20 * 560 && flow.mode === 'shift'; k++) {
        const sh = flow.shift;
        if (sh.phase === 'service' && sh.state.pots[0].phase === 'empty' && sh.waitingOrders.length && !sh.busy) {
            const want = sh.waitingOrders.find(o => !sh.state.pass.some(b => b.recipeId === o.recipeId));
            if (want) sh.startCooking(0, want.recipeId, 'mid');
        }
        if (sh.state.pots[0].phase === 'window' && !sh.state.pots[0].seasoning) sh.season(0, sh.recipe(sh.state.pots[0].recipeId).seasoning);
        const p = sh.state.pots[0];
        if (p.phase === 'window' && p.doneness > 0.78 && !sh.busy) sh.plate(0);
        else if (p.stir < 0.5 && !sh.busy && p.phase === 'cooking') sh.stir(0);
        if (sh.state.pass.length && !sh.busy && sh.deliverBest(sh.state.pass[0].id) === null) served++;
        flow.tick(0.05);
    }
    assert.equal(flow.mode, 'report');
    assert.ok(flow.dayReport.ledger.served >= 3, `served ${JSON.stringify(flow.dayReport.ledger)}`);
    assert.equal(flow.progress.state.completedDays, 1);
    flow.nextDay();
    assert.equal(flow.mode, 'morning');
    assert.equal(flow.progress.day, 2);
});

test('每日小目标：第 1 日没有；第 4 日三件，同种子同日相同，类型错开', () => {
    const recipes = config.recipes.filter(r => r.unlockDay <= 4);
    assert.equal(dailyGoals(config, 9, 1, recipes, 6, false).length, 0);
    const a = dailyGoals(config, 9, 4, recipes, 9, true);
    const b = dailyGoals(config, 9, 4, recipes, 9, true);
    assert.equal(a.length, bal.goals.count);
    assert.deepEqual(a, b);
    assert.ok(a.some(g => g.type === 'serve' || g.type === 'tips'));
    assert.ok(a.some(g => g.type === 'perfect' || g.type === 'noWalk'));
    assert.ok(!(a.some(g => g.type === 'serve') && a.some(g => g.type === 'tips')));
    for (const g of a) if (g.type === 'recipe') assert.ok(recipes.some(r => r.id === g.recipeId));
    // 不消耗主随机数：生成目标前后，客流随机序列不变
    const rng = new SeededRng(5);
    const before = rng.step;
    dailyGoals(config, 5, 3, recipes, 8, false);
    assert.equal(rng.step, before);
});

test('每日小目标：进度、等走即失败、打烊发铜钱与满贯', () => {
    const { sh, profile } = makeShift();
    sh.state.setup.goals = [
        { id: 'serve', type: 'serve', target: 2, reward: 12 },
        { id: 'recipe-R01', type: 'recipe', target: 1, recipeId: 'R01', reward: 12 },
        { id: 'noWalk', type: 'noWalk', target: 0, reward: 20 },
    ];
    const st = sh.state;
    st.ledger.served = 2;
    st.served['C01|R01|perfect|morning'] = 2;
    let all = st.setup.goals.map(g => goalStatus(g, st, 30, false));
    assert.deepEqual(all.map(x => x.done), [true, true, false]);
    all = st.setup.goals.map(g => goalStatus(g, st, 30, true));
    assert.ok(all.every(x => x.done));
    const wallet = profile.state.wallet;
    const rep = profile.closeDay(sh);
    assert.equal(rep.goalReward, 12 + 12 + 20 + bal.goals.bonusAll);
    assert.equal(rep.ledger.goalReward, rep.goalReward);
    assert.equal(profile.state.wallet, wallet + st.ledger.revenue + st.ledger.tips + rep.goalReward + rep.bonus - rep.ledger.rent - rep.ledger.debtPaid);
    st.ledger.reasons.impatient = 1;
    const walk = goalStatus(st.setup.goals[2], st, 30, true);
    assert.ok(walk.failed && !walk.done);
});

// ───────────── 厨艺熟练（文档 10 §4）─────────────
test('厨艺：0 入门、8 顺手、20 拿手，档内进度正确', () => {
    assert.equal(skillInfo(config, 0).name, '入门');
    assert.equal(skillInfo(config, 4).progress, 0.5);
    assert.equal(skillInfo(config, 8).name, '顺手');
    assert.equal(skillInfo(config, 14).progress, 0.5);
    const top = skillInfo(config, 25);
    assert.equal(top.name, '拿手'); assert.equal(top.next, null); assert.equal(top.progress, 1);
    assert.equal(skillTierUp(config, 7, 9), 1);
    assert.equal(skillTierUp(config, 9, 11), null);
    assert.equal(skillTierUp(config, 9, 7), null);
});
test('厨艺：刚好出餐跨过 8 分发「顺手」事件，打烊报告带熟练变化', () => {
    const { sh, profile } = makeShift();
    profile.state.proficiency.R01 = 7;
    sh.state.setup.proficiency = { R01: 7 };
    const g = { id: 'GS', customerId: 'C01', wave: 'morning', state: 'seated', seat: 0, doorLeft: 0, orderId: 'OS', dineLeft: 0, served: false, reordered: false };
    sh.state.guests.GS = g; sh.state.seats[0] = 'GS';
    sh.state.orders.push({ id: 'OS', guestId: 'GS', recipeId: 'R01', patienceLeft: 999, patienceMax: 999, state: 'waiting', reorder: false });
    sh.startCooking(0, 'R01', 'mid');
    cookUntil(sh, 0, p => p.doneness >= 0.8);
    const bowl = plateAndWait(sh, 0);
    sh.drainEvents();
    sh.deliver(bowl.id, 'OS'); run(sh, 1.1);
    const ev = sh.drainEvents();
    assert.equal(ev.find(e => e.type === 'delivered').result, 'perfect');
    const up = ev.find(e => e.type === 'skill:up');
    assert.ok(up, '应有升档事件');
    assert.equal(up.recipe, 'R01'); assert.equal(up.tier, 1);
    assert.equal(sh.warnLine('R01'), 0.38);
    sh.finish();
    const rep = profile.closeDay(sh);
    const c = rep.skill.find(x => x.recipeId === 'R01');
    assert.deepEqual([c.before, c.after], [7, 9]);
    assert.equal(profile.state.proficiency.R01, 9);
});
test('日结记下最好与最差的一碗', () => {
    const { sh } = makeShift();
    serveTo(sh, 'C01', 'R01', { run: s => cookUntil(s, 0, p => p.doneness >= 0.8) });
    run(sh, 7);
    serveTo(sh, 'C01', 'R01', { run: s => cookUntil(s, 0, p => p.doneness >= 0.5) });
    const lg = sh.state.ledger;
    assert.equal(lg.best.score, 100);
    assert.equal(lg.worst.score, 65);
});

// ───────────── 长线（文档 30）─────────────
const atDay = (day, mutate) => { const p = new Progress(config, newProfile(config, 5)); p.state.completedDays = day - 1; p.state.wallet = 500; mutate?.(p); return p; };
const ids = rs => rs.map(r => r.id);
test('L01/L02 时令粥只在本章开放，时令食材只在本季能买', () => {
    let p = atDay(7);
    assert.ok(!ids(p.unlockedRecipes()).includes('R13'));
    assert.ok(p.canBuy('I13'));
    p = atDay(8);
    assert.ok(ids(p.unlockedRecipes()).includes('R13'));
    assert.ok(!ids(p.unlockedRecipes()).some(id => ['R14', 'R15', 'R16'].includes(id)));
    assert.equal(p.canBuy('I13'), null);
    assert.equal(p.shiftSetup().season, 'autumn');
    p = atDay(15);
    assert.ok(!ids(p.unlockedRecipes()).includes('R13'));
    assert.ok(ids(p.unlockedRecipes()).includes('R14'));
    assert.ok(p.canBuy('I13'));
});
test('L03 章末两个目标都做到：时令粥收进粥谱，下一章仍可做、食材仍可买', () => {
    const p = atDay(14);
    p.state.chapter = { key: 'CH2-0', startDay: 8, served: { R13: 17 }, perfect: 29, requests: 0, fullGoalDays: 0, calmDays: 0 };
    const sh = p.startShift(new SeededRng(14));
    sh.state.served['C02|R13|perfect|lunch'] = 1;
    sh.state.ledger.served = 1;
    sh.finish();
    const wallet = p.state.wallet;
    const rep = p.closeDay(sh);
    assert.ok(rep.chapter && rep.chapter.season, '应出现章节回顾');
    assert.deepEqual(rep.chapter.season.goals.map(g => g.done), [true, true]);
    assert.ok(rep.chapter.season.kept);
    assert.equal(rep.chapter.season.reward, 120);
    assert.equal(rep.chapter.season.next.recipeId, 'R14');
    assert.deepEqual(p.state.keptRecipes, ['R13']);
    assert.equal(p.stats.chaptersDone, 1);
    assert.equal(p.day, 15);
    assert.ok(ids(p.unlockedRecipes()).includes('R13') && ids(p.unlockedRecipes()).includes('R14'));
    assert.equal(p.canBuy('I13'), null);
    assert.ok(p.state.wallet >= wallet + 120 + rep.ledger.revenue - rep.ledger.rent - rep.ledger.debtPaid);
});
test('L03b 只做到一个目标：按项发钱，不收进粥谱', () => {
    const p = atDay(14);
    p.state.chapter = { key: 'CH2-0', startDay: 8, served: { R13: 20 }, perfect: 3, requests: 0, fullGoalDays: 0, calmDays: 0 };
    const sh = p.startShift(new SeededRng(14)); sh.finish();
    const rep = p.closeDay(sh);
    assert.deepEqual(rep.chapter.season.goals.map(g => g.done), [true, false]);
    assert.equal(rep.chapter.season.reward, 60);
    assert.ok(!rep.chapter.season.kept);
    assert.ok(!ids(p.unlockedRecipes()).includes('R13'));
});
test('L04 第 36 日回到白露，目标 ×1.25；第 8 日起每 7 日一章', () => {
    assert.equal(chapterAt(config, 7), null);
    assert.equal(chapterAt(config, 8).cfg.id, 'CH2');
    assert.equal(chapterAt(config, 14).endDay, 14);
    assert.equal(chapterAt(config, 15).cfg.id, 'CH3');
    assert.equal(chapterAt(config, 35).cfg.id, 'CH5');
    const y2 = chapterAt(config, 36);
    assert.equal(y2.cfg.id, 'CH2'); assert.equal(y2.year, 1);
    assert.equal(y2.goals[0].count, Math.round(18 * 1.25));
    assert.match(y2.name, /第 2 年/);
});
test('L05/L06 请托：打烊生成、次日约好的客人只点这道粥，送到发钱加好感，没送到不扣钱', () => {
    const q = bal.requests; const chance = q.chance; q.chance = 1;
    try {
        const p = atDay(5, p => { p.state.codex.customers.push('C02', 'C06'); p.state.favor.C02 = 8; p.state.favor.C06 = 0; });
        const rep = closeEmptyDay(p);
        const r = rep.nextRequest;
        assert.ok(r, '应生成请托');
        assert.equal(r.customerId, 'C02');
        assert.equal(r.day, 6);
        assert.ok(p.unlockedRecipes().some(x => x.id === r.recipeId));
        assert.equal(p.state.nextDay.guests.filter(g => g.request && g.onlyRecipe === r.recipeId).length, r.count);
        const sh = p.startShift(new SeededRng(6));
        const a = sh.state.arrivals.filter(x => x.request);
        assert.equal(a.length, r.count);
        assert.ok(a.every(x => x.onlyRecipe === r.recipeId && x.wave === r.wave && x.customerId === 'C02'));
        sh.state.requestServed = r.count;
        sh.finish();
        const favor = p.state.favor.C02;
        const rep2 = p.closeDay(sh);
        assert.ok(rep2.request.done);
        assert.equal(p.state.favor.C02, Math.min(bal.favor.max, favor + q.favor));
        assert.equal(p.stats.requestsDone, 1);
        assert.ok(rep2.bonus >= r.reward);
        // 没送到：不扣钱
        const r2 = rep2.nextRequest;
        if (r2) {
            const sh2 = p.startShift(new SeededRng(7)); sh2.finish();
            const rep3 = p.closeDay(sh2);
            assert.equal(rep3.request.done, false);
            assert.equal(rep3.request.served, 0);
        }
    } finally { q.chance = chance; }
});
test('请托：第 4 日打烊前不出现；没见过或好感不够的常客不来托', () => {
    const q = bal.requests; const chance = q.chance; q.chance = 1;
    try {
        let p = atDay(3, p => { p.state.codex.customers.push('C02'); p.state.favor.C02 = 8; });
        assert.equal(closeEmptyDay(p).nextRequest, null);
        p = atDay(6, p => { p.state.favor.C02 = 8; });
        assert.equal(closeEmptyDay(p).nextRequest, null);
        p = atDay(6, p => { p.state.codex.customers.push('C02'); p.state.favor.C02 = 1; });
        assert.equal(closeEmptyDay(p).nextRequest, null);
    } finally { q.chance = chance; }
});
test('L07 手账：第一碗刚好那天打烊记「头一碗刚好」，钱包 +10', () => {
    const p = atDay(2);
    const sh = p.startShift(new SeededRng(2));
    sh.state.served['C01|R01|perfect|morning'] = 1; sh.state.ledger.served = 1;
    sh.finish();
    const rep = p.closeDay(sh);
    assert.ok(rep.milestones.some(m => m.id === 'M01'));
    assert.ok(p.state.milestones.includes('M01'));
    assert.ok(rep.bonus >= 10);
    // 不重复记
    const sh2 = p.startShift(new SeededRng(3)); sh2.finish();
    assert.ok(!p.closeDay(sh2).milestones.some(m => m.id === 'M01'));
});
test('L08 旧存档没有长线字段：读入补默认值，累计从历史还原', () => {
    const prof = newProfile(config, 9);
    for (const k of ['chapter', 'request', 'keptRecipes', 'milestones', 'stats']) delete prof[k];
    prof.history.served = { 'C01|R01|perfect|morning': 3, 'C02|R02|over|lunch': 2 };
    prof.completedDays = 9;
    const p = new Progress(config, prof);
    assert.deepEqual(p.state.keptRecipes, []);
    assert.equal(p.stats.perfectTotal, 3);
    assert.equal(p.stats.servedTotal, 5);
    assert.equal(p.chapterProgress().key, 'CH2-0');
    const file = { format: SAVE_FORMAT, version: 'x', serial: 1, profile: prof, shift: null, rngStep: 0, settings: {} };
    assert.ok(parseSave(serializeSave(file), config).ok);
    prof.keptRecipes = ['R99'];
    assert.equal(parseSave(serializeSave(file), config).ok, false);
});
test('在季时令粥更受欢迎：同口味客人更常点', () => {
    const count = season => {
        let n = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const { sh } = makeShift({ seed, recipes: ['R01', 'R13'], stock: { I01: 20, I13: 20 }, setup: { season } });
            sh.state.arrivals = [{ time: 0, customerId: 'C01', wave: 'morning' }];
            run(sh, 1);
            const o = sh.state.orders[0];
            if (o && o.recipeId === 'R13') n++;
        }
        return n;
    };
    assert.ok(count('autumn') > count(null));
});


// 本轮发布回归：实际发现的存档、结算和重复操作边界。
test('T28 结构损坏不抛异常，中文按 UTF-8 的 1MB 限制', () => {
    const file = { format: 1, version: 'x', serial: 0, profile: newProfile(config, 3), shift: null, rngStep: 0, settings: {} };
    for (const field of ['upgrades', 'pantry', 'favor', 'codex', 'history', 'nextDay']) {
        const broken = JSON.parse(JSON.stringify(file)); delete broken.profile[field];
        assert.equal(parseSave(JSON.stringify(broken), config).ok, false, field);
    }
    file.note = '粥'.repeat(350000);
    assert.equal(parseSave(JSON.stringify(file), config).ok, false);
});
test('T28 从备份恢复再保存：损坏原文另存，有效备份不被坏档替换', () => {
    const kv = memoryStore();
    const file = { format: 1, version: 'x', serial: 0, profile: newProfile(config, 3), shift: null, rngStep: 0, settings: {} };
    const valid = serializeSave(file), damaged = '{broken';
    kv.set('batian.save.primary', damaged); kv.set('batian.save.backup', valid);
    const store = new SaveStore(kv, config), got = store.load();
    assert.ok(got.file); assert.equal(got.blocked, false);
    assert.equal(store.write(got.file), null);
    assert.equal(kv.get('batian.save.primary.damaged'), damaged);
    assert.equal(kv.get('batian.save.backup'), valid);
    assert.ok(parseSave(kv.get('batian.save.primary'), config).ok);
});
test('日结刷新恢复原账单，连续刷新不重复收入、奖励、租金或天数', () => {
    const kv = memoryStore(); const flow = new GameFlow(config, new SaveStore(kv, config));
    flow.newGame(33); flow.progress.state.completedDays = 2; flow.progress.state.wallet = 200;
    flow.startPrep(); flow.shift.open();
    flow.shift.state.ledger.revenue = 16; flow.shift.state.ledger.tips = 3;
    flow.shift.state.served['C01|R01|perfect|morning'] = 1; flow.shift.state.ledger.served = 1;
    flow.shift.finish(); flow.tick(.05);
    const wallet = flow.progress.state.wallet, report = flow.dayReport;
    assert.equal(flow.mode, 'report'); assert.equal(report.ledger.rent, 30);
    for (let i = 0; i < 3; i++) {
        const next = new GameFlow(config, new SaveStore(kv, config));
        assert.ok(next.boot()); next.continueGame(); next.tick(1);
        assert.equal(next.mode, 'report'); assert.equal(next.progress.state.wallet, wallet);
        assert.deepEqual(next.dayReport, report); assert.equal(next.progress.state.completedDays, 3);
        next.save();
    }
});
test('重复开始备料、进入次日和升级购买不会重置锅或重复扣款', () => {
    const flow = new GameFlow(config, new SaveStore(memoryStore(), config)); flow.newGame(4);
    flow.progress.state.completedDays = 1; flow.progress.state.wallet = 1000;
    assert.equal(flow.progress.buyUpgrade('U01'), null);
    const wallet = flow.progress.state.wallet;
    assert.ok(flow.progress.buyUpgrade('U01')); assert.equal(flow.progress.state.wallet, wallet);
    flow.startPrep(); const shift = flow.shift;
    flow.startPrep(); assert.equal(flow.shift, shift);
    flow.nextDay(); assert.equal(flow.mode, 'shift'); assert.equal(flow.shift, shift);
});
test('装修暂停接待和客人耐心，已下锅仍推进；关闭后恢复接待', () => {
    const { sh } = makeShift({ pots: 2, arrivals: [{time: 0, customerId: 'C01', wave: 'morning'}] });
    assert.equal(sh.startCooking(0, 'R01', 'mid'), null); run(sh, .5);
    const order = sh.waitingOrders[0], beforePatience = order.patienceLeft, beforeCook = sh.state.pots[0].doneness;
    sh.setReceptionPaused(true); run(sh, 3);
    assert.equal(order.patienceLeft, beforePatience); assert.ok(sh.state.pots[0].doneness > beforeCook);
    sh.setReceptionPaused(false); run(sh, 1); assert.ok(order.patienceLeft < beforePatience);
});

test('装修中保存并刷新：不恢复装修页时接待必须恢复，锅和订单继续原来的进度', () => {
    const kv = memoryStore(); const first = new GameFlow(config, new SaveStore(kv, config));
    first.newGame(9); first.progress.pantry.add('I01', 8);
    first.startPrep(); readyAll(first.shift); first.shift.open();
    first.shift.state.arrivals = [{ time: 0, customerId: 'C01', wave: 'morning' }]; first.shift.state.nextArrival = 0;
    first.shift.startCooking(0, 'R01', 'mid'); first.tick(.5);
    first.shift.setReceptionPaused(true); first.tick(.5); first.save();
    const before = JSON.parse(JSON.stringify(first.shift.state));
    const restored = new GameFlow(config, new SaveStore(kv, config));
    assert.ok(restored.boot()); assert.equal(restored.shift.state.receptionPaused, true);
    restored.continueGame(); assert.equal(restored.shift.state.receptionPaused, false);
    assert.equal(restored.shift.state.pots[0].doneness, before.pots[0].doneness);
    assert.equal(restored.shift.state.orders[0].patienceLeft, before.orders[0].patienceLeft);
    restored.tick(.2);
    assert.ok(restored.shift.state.pots[0].doneness > before.pots[0].doneness);
    assert.ok(restored.shift.state.orders[0].patienceLeft < before.orders[0].patienceLeft);
});

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`); process.exitCode = 1; }
    }
    console.log(`\n${passed}/${tests.length} 通过`);
})();
