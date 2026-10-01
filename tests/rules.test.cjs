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
const entry = ['core/Config.ts', 'rules/Shift.ts', 'rules/Progress.ts', 'save/SaveModel.ts', 'gameplay/GameFlow.ts'].map(f => path.join(scripts, f));
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

(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log(`  ✓ ${name}`); }
        catch (e) { console.error(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 3).join('\n    ')}`); process.exitCode = 1; }
    }
    console.log(`\n${passed}/${tests.length} 通过`);
})();
