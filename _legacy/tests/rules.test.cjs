const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tsc = [
    process.env.COCOS_TSC,
    path.join(root, 'node_modules/typescript/bin/tsc'),
    '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript/bin/tsc',
].find(candidate => candidate && fs.existsSync(candidate));
if (!tsc) throw new Error('缺少 TypeScript 编译器：请设置 COCOS_TSC');
const out = path.join(root, 'temp/rule-tests');
const scripts = path.join(root, 'assets/scripts');
const compiled = spawnSync(process.execPath, [
    tsc, '--pretty', 'false', '--module', 'commonjs', '--target', 'ES2017', '--strict', 'false',
    '--skipLibCheck', '--outDir', out, '--rootDir', scripts,
    path.join(scripts, 'rules/Catalog.ts'),
    path.join(scripts, 'rules/PotSim.ts'),
    path.join(scripts, 'rules/Pantry.ts'),
    path.join(scripts, 'rules/Score.ts'),
    path.join(scripts, 'rules/StoveDesk.ts'),
    path.join(scripts, 'rules/ServiceDay.ts'),
    path.join(scripts, 'rules/DeskSave.ts'),
    path.join(scripts, 'audio/LocalSettings.ts'),
    path.join(scripts, 'rules/UpgradeOffer.ts'),
    path.join(scripts, 'simulation/SeededRng.ts'),
    path.join(scripts, 'simulation/FixedClock.ts'),
], { encoding: 'utf8' });
if (compiled.status !== 0) {
    console.error(compiled.stdout);
    console.error(compiled.stderr);
    process.exit(compiled.status || 1);
}

const { parseCatalog, RuleError, activeActivity } = require(path.join(out, 'rules/Catalog.js'));
const { PotBoard } = require(path.join(out, 'rules/PotSim.js'));
const { Pantry, freshSteps } = require(path.join(out, 'rules/Pantry.js'));
const { expectedSeconds, patienceSeconds, seasonClashes, scoreDish, quoteDish } = require(path.join(out, 'rules/Score.js'));
const { FixedClock } = require(path.join(out, 'simulation/FixedClock.js'));
const { StoveDesk, visibleSoup } = require(path.join(out, 'rules/StoveDesk.js'));
const { ServiceDay, planForDay, atmosphereWords, chapterCloseLine, shareCardText } = require(path.join(out, 'rules/ServiceDay.js'));
const { parseDesk } = require(path.join(out, 'rules/DeskSave.js'));
const { parseLocalSettings, loadLocalSettings, saveLocalSettings, LOCAL_SETTINGS_KEY } = require(path.join(out, 'audio/LocalSettings.js'));
const { upgradeOfferLine } = require(path.join(out, 'rules/UpgradeOffer.js'));
const { SeededRng } = require(path.join(out, 'simulation/SeededRng.js'));

const source = path.resolve(__dirname, '../../../数据/规则');
const runtime = path.join(root, 'assets/resources/data/rules');
const names = ['balance.json', 'ingredients.json', 'recipes.json', 'customers.json', 'upgrades.json', 'decor.json', 'atmosphere.json', 'days.json', 'stories.json', 'audio.json', 'activities.json'];
const files = {};
for (const name of names) {
    const raw = fs.readFileSync(path.join(source, name), 'utf8');
    assert.equal(fs.readFileSync(path.join(runtime, name), 'utf8'), raw, `${name} 运行副本须与数据目录一致`);
    files[name] = JSON.parse(raw);
}
const catalog = parseCatalog(files);
const balance = catalog.balance;

function cloneCatalog(mutate) {
    const copy = JSON.parse(JSON.stringify(files));
    mutate(copy);
    return () => parseCatalog(copy);
}
function rejects(action, pattern) {
    assert.throws(action, (error) => error instanceof RuleError && pattern.test(error.message));
}
function step(target, seconds) {
    const ticks = Math.round(seconds / 0.05);
    for (let index = 0; index < ticks; index++) target.step(0.05);
}
function cook(recipeId, heat) {
    const board = new PotBoard(catalog, 1);
    const pot = board.pots[0];
    assert.equal(pot.begin(recipeId).ok, true);
    step(board, balance.session.dishPrepSeconds);
    assert.equal(pot.phase, 'cooking');
    assert.equal(pot.doneness, 0);
    if (heat) pot.setHeat(heat);
    return { board, pot };
}

{
    assert.equal(catalog.recipes.length, 12);
    assert.equal(catalog.customers.length, 8);
    assert.equal(catalog.upgrades.length, 8);
    assert.equal(balance.version, 'balance-1');
    assert.equal(balance.session.shiftSeconds, 480);
    assert.equal(balance.session.initialWallet, 200);
    assert.equal(balance.heat.mid.doneness, 0.014);
    assert.equal(catalog.recipe('R01').name, '白粥');
    assert.equal(expectedSeconds(catalog, catalog.recipe('R01')), 65);
    assert.equal(expectedSeconds(catalog, catalog.recipe('R02')), 83);
    assert.equal(patienceSeconds(catalog, catalog.recipe('R01'), catalog.customer('C01')), 120);
}

rejects(cloneCatalog(copy => { copy['recipes.json'][0].name = ''; }), /recipes\.json R01/);
rejects(cloneCatalog(copy => { delete copy['recipes.json'][0].cost; }), /recipes\.json R01：缺少字段 cost/);
rejects(cloneCatalog(copy => { copy['recipes.json'][0].cost = copy['recipes.json'][0].price; }), /成本必须低于标价/);
rejects(cloneCatalog(copy => { copy['recipes.json'][0].ingredients[0].id = 'I99'; }), /食材不存在：I99/);
rejects(cloneCatalog(copy => { copy['upgrades.json'][0].effect = { speed: 1 }; }), /效果键无效：speed/);
rejects(cloneCatalog(copy => { copy['decor.json'][0].slot = 'roof'; }), /decor\.json D01：槽位无效/);
rejects(cloneCatalog(copy => { copy['balance.json'].session.fixedStepMs = 16; }), /balance\.json session\.fixedStepMs/);
rejects(cloneCatalog(copy => { copy['ingredients.json'].push({ ...copy['ingredients.json'][0] }); }), /ingredients\.json I01：ID 重复/);
rejects(() => parseCatalog({ ...files, 'audio.json': undefined }), /audio\.json：规则文件缺失/);

{
    const { pot } = cook('R01');
    step(pot, 10);
    const early = pot.serve();
    assert.equal(early.result, 'raw');
    assert.equal(early.ok, true);
}

{
    const { board, pot } = cook('R01');
    step(board, 0.72 / balance.heat.mid.doneness);
    assert.equal(pot.phase, 'window');
    assert.ok(pot.scorch < balance.gates.burn);
    assert.equal(pot.serve().result, 'perfect');
}

{
    const { board, pot } = cook('R01');
    let elapsed = 0;
    while (elapsed + 1e-9 < 70) {
        pot.pressStir();
        step(board, balance.stir.windupSeconds + balance.stir.repeatSeconds);
        elapsed += balance.stir.windupSeconds + balance.stir.repeatSeconds;
    }
    assert.ok(pot.doneness > balance.gates.serveMax);
    assert.ok(pot.scorch < balance.gates.burn);
    assert.equal(pot.serve().result, 'over');
}

{
    const { board, pot } = cook('R01', 'high');
    step(board, 50);
    assert.equal(pot.phase, 'burnt');
    const dumped = pot.dump();
    assert.equal(dumped.dumped, true);
    assert.equal(dumped.result, '');
    step(board, balance.session.washSeconds);
    assert.equal(pot.phase, 'empty');
    assert.equal(pot.begin('R01').ok, true, '洗完可以再下锅');
}

{
    const board = new PotBoard(catalog, 2);
    assert.throws(() => new PotBoard(catalog, 5), /锅位/);
    board.pots[0].begin('R01');
    board.pots[1].begin('R01');
    step(board, balance.session.dishPrepSeconds);
    const warnings = [];
    const original = board.step.bind(board);
    board.step = (dt) => { const events = original(dt); warnings.push(...events.filter(event => event.type === 'stirWarn')); return events; };
    step(board, 11);
    assert.ok(board.pots[0].stir > balance.stir.warn);
    assert.ok(board.pots[1].stir < balance.stir.warn);
    assert.deepEqual(warnings.map(event => event.potId), ['P2']);
}

{
    const { board, pot } = cook('R01');
    step(board, 20);
    const before = pot.stir;
    pot.pressStir();
    step(board, balance.stir.windupSeconds);
    const firstGain = pot.stir - before;
    const afterFirst = pot.stir;
    pot.pressStir();
    step(board, balance.stir.windupSeconds);
    const secondGain = pot.stir - afterFirst;
    assert.ok(firstGain > 0.4);
    assert.ok(secondGain < firstGain, '0.8 秒内重复搅拌收益递减');
    assert.equal(pot.cancelStir().ok, false);
}

{
    const fresh = new PotBoard(catalog, 1).pots[0];
    assert.equal(fresh.begin('R01').ok, true);
    assert.equal(fresh.serve().ok, false, '备料阶段不能盛碗');
    assert.equal(fresh.addIngredient('I03').ok, false, '备料阶段不能加料');
    assert.equal(fresh.chooseSeason('plain').ok, false, '备料阶段不能调味');
    assert.equal(fresh.phase, 'prep');
}
{
    const { pot } = cook('R02');
    assert.equal(pot.chooseSeason('salty').ok, false, '出餐窗口前不能调味');
    assert.equal(pot.addIngredient('I03').message, '加料时机偏了');
    assert.equal(pot.mistimes, 1);
    assert.equal(pot.addIngredient('I03').ok, false);
    const timed = cook('R02');
    step(timed.board, 0.45 / balance.heat.mid.doneness);
    assert.equal(timed.pot.addIngredient('I03').message, '加料正好');
    let guard = 0;
    while (timed.pot.phase !== 'window' && timed.pot.phase !== 'burnt' && guard < 2000) {
        if (guard % 24 === 0) timed.pot.pressStir();
        step(timed.board, 0.05);
        guard += 1;
    }
    assert.equal(timed.pot.phase, 'window');
    assert.equal(timed.pot.chooseSeason('salty').ok, true);
    assert.equal(timed.pot.chooseSeason('sweet').ok, false, '调味不能改');
}

{
    const recipe = catalog.recipe('R01');
    const perfect = scoreDish(catalog, { recipe, result: 'perfect', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false });
    const over = scoreDish(catalog, { recipe, result: 'over', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false });
    const raw = scoreDish(catalog, { recipe, result: 'raw', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false });
    const burnt = scoreDish(catalog, { recipe, result: 'burnt', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false });
    assert.equal(perfect.score, 90);
    assert.equal(perfect.pay, 16);
    assert.equal(perfect.tip, 3);
    const emptyShop = scoreDish(catalog, { recipe, result: 'perfect', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false, atmosphere: 17 });
    assert.equal(emptyShop.tip, Math.round(recipe.price * catalog.balance.score.tipRate * (1 + 0.5 * 17 / 100)), '氛围按百分比加成');
    const fullShop = scoreDish(catalog, { recipe, result: 'perfect', freshSteps: 0, missingAdds: 0, mistimes: 0, seasonClash: false, atmosphere: 100 });
    assert.equal(fullShop.tip, Math.round(recipe.price * catalog.balance.score.tipRate * 1.5));
    assert.ok(perfect.pay > over.pay && over.pay > raw.pay && raw.pay > burnt.pay);
    assert.equal(burnt.tip, 0);
    const floored = scoreDish(catalog, { recipe, result: 'burnt', freshSteps: 6, missingAdds: 0, mistimes: 0, seasonClash: false });
    assert.equal(floored.pay, Math.ceil(recipe.cost / 2));
    const seafood = scoreDish(catalog, { recipe: catalog.recipe('R05'), result: 'perfect', freshSteps: 1, missingAdds: 0, mistimes: 0, seasonClash: false });
    assert.equal(seafood.score, 80);
    const capped = scoreDish(catalog, { recipe: catalog.recipe('R02'), result: 'perfect', freshSteps: 0, missingAdds: 2, mistimes: 3, seasonClash: false });
    assert.equal(capped.score, 70 + 20 - 8 * 2 - 4 * 2);
    assert.equal(seasonClashes('plain', ['咸香']), true);
    assert.equal(seasonClashes('sweet', ['清甜']), false);
}

{
    const pantry = new Pantry(catalog);
    assert.equal(pantry.commit(catalog.recipe('R01')).ok, false, '没有库存不能下锅');
    const bought = pantry.purchase('I01', 2, balance.session.initialBuyKinds);
    assert.equal(bought.ok, true);
    assert.equal(bought.cost, 8);
    assert.equal(pantry.commit(catalog.recipe('R01')).ok, false, '没洗完不能下锅');
    assert.equal(pantry.startPrep('I01', 1).ok, true);
    assert.equal(pantry.startPrep('I01', 1).ok, false, '一个备料位不能并行');
    pantry.tick(2);
    assert.equal(pantry.cancelPrep('I01').ok, true);
    assert.equal(pantry.count, 2, '取消预处理不扣库存');
    assert.equal(pantry.startPrep('I01', 1).ok, true);
    pantry.tick(balance.prep.wash);
    assert.equal(pantry.commit(catalog.recipe('R01')).ok, true);
    assert.equal(pantry.held('I01'), 1, '下锅只扣一次');
    assert.equal(pantry.commit(catalog.recipe('R01')).ok, false);
    assert.equal(pantry.purchase('I02', 1, 4).ok, true);
    assert.equal(pantry.purchase('I03', 1, 4).ok, true);
    assert.equal(pantry.purchase('I04', 1, 4).ok, true);
    assert.equal(pantry.purchase('I05', 1, 4).ok, false, '每日 4 种');
    const debt = new Pantry(catalog);
    assert.equal(debt.purchase('I01', 1, balance.session.debtBuyKinds).ok, true);
    assert.equal(debt.purchase('I02', 1, balance.session.debtBuyKinds).ok, true);
    assert.equal(debt.purchase('I03', 1, balance.session.debtBuyKinds).ok, false, '欠租只能买 2 种');
    const capped = new Pantry(catalog);
    assert.equal(capped.purchase('I11', balance.session.unitCap, 4).ok, true);
    assert.equal(capped.purchase('I11', 1, 4).ok, false, '单种 8 份');
    const stale = new Pantry(catalog);
    stale.purchase('I08', 1, 4);
    stale.passHours(catalog.ingredient('I08').freshHours);
    assert.equal(stale.tierOf('I08'), 'expired');
    assert.equal(stale.commit(catalog.recipe('R10')).ok, false, '过期不能下锅');
    assert.equal(freshSteps('overnight'), 1);
    const closed = new Pantry(catalog);
    closed.purchase('I08', 1, 4);
    const tossed = closed.closeShop(catalog.ingredient('I08').freshHours);
    assert.deepEqual(tossed, ['I08']);
    assert.equal(closed.held('I08'), 0);
}

function framedDoneness(frameDt) {
    const board = new PotBoard(catalog, 1);
    const pot = board.pots[0];
    pot.begin('R01');
    const clock = new FixedClock(balance.session.fixedStepMs, dt => board.step(dt));
    const frames = Math.round(28 / frameDt);
    for (let index = 0; index < frames; index++) clock.advance(frameDt);
    return { doneness: pot.doneness, scorch: pot.scorch, phase: pot.phase };
}
{
    const at60 = framedDoneness(1 / 60);
    const at30 = framedDoneness(1 / 30);
    assert.equal(at60.doneness, at30.doneness);
    assert.equal(at60.scorch, at30.scorch);
    assert.equal(at60.phase, at30.phase);
    assert.ok(Math.abs(at60.doneness - 20 * balance.heat.mid.doneness) < 0.000001);
    const { board, pot } = cook('R01');
    const clock = new FixedClock(50, dt => board.step(dt));
    const before = pot.doneness;
    clock.advance(5);
    assert.ok(Math.abs(pot.doneness - before - balance.heat.mid.doneness * 0.2) < 0.000001, '长卡顿只推进 0.2 秒');
}

function runDesk(desk, seconds, paused = false) {
    for (let index = 0; index < Math.round(seconds / 0.05); index++) desk.advance(0.05, paused);
}
function washRice(desk, count = 1) {
    for (let index = 0; index < count; index++) readyIngredient(desk, 'I01');
}
function readyIngredient(desk, id) {
    assert.equal(desk.buy(id).ok, true);
    if (catalog.ingredient(id).prep === 'none') return;
    assert.equal(desk.prep(id).ok, true);
    let guard = 0;
    while (desk.pantry.summary().some(row => row.id === id && row.prepping) && guard < 800) {
        desk.advance(0.05, false);
        guard += 1;
    }
    assert.ok(guard < 800, `${id} 应在时限内处理完`);
}
function burnDesk(desk) {
    let ticks = 0;
    while (desk.readouts()[0].phase === 'prep' && ticks < 400) { desk.advance(0.05, false); ticks += 1; }
    desk.setHeat('high');
    while (desk.readouts()[0].phase !== 'burnt' && ticks < 2000) { desk.advance(0.05, false); ticks += 1; }
    assert.equal(desk.readouts()[0].phase, 'burnt');
}
{
    const desk = new StoveDesk(catalog, 2);
    assert.equal(desk.beginFocused('R01').ok, false, '没有米不能下锅');
    washRice(desk);
    assert.equal(desk.beginFocused('R01').ok, true);
    runDesk(desk, 18);
    assert.equal(desk.serve().result, 'raw');
    assert.equal(desk.readouts()[0].label, '夹生');
    const held = desk.readouts()[0].doneness;
    runDesk(desk, 5, true);
    assert.equal(desk.readouts()[0].doneness, held, '暂停时火候不走');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    let ticks = 0;
    while (desk.readouts()[0].phase !== 'window' && ticks < 1600) {
        if (ticks % 24 === 0) desk.stir();
        desk.advance(0.05, false);
        ticks += 1;
    }
    assert.equal(desk.readouts()[0].label, '可以出餐');
    assert.equal(desk.serve().result, 'perfect');
    assert.equal(desk.readouts()[0].label, '刚好');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    let ticks = 0;
    while (desk.readouts()[0].phase === 'prep' && ticks < 400) { desk.advance(0.05, false); ticks += 1; }
    desk.setHeat('high');
    while (desk.readouts()[0].label !== '糊底' && ticks < 2000) { desk.advance(0.05, false); ticks += 1; }
    assert.equal(desk.readouts()[0].label, '糊底');
    assert.equal(desk.serve().result, 'burnt');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    const pot = desk.board.pots[0];
    pot.phase = 'cooking';
    pot.scorch = 0.75;
    assert.match(desk.readouts()[0].label, /快糊了/);
    assert.equal(desk.readouts()[0].scorchHot, true);
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    let ticks = 0;
    while (desk.readouts()[0].doneness <= balance.gates.serveMax && ticks < 2200) {
        if (ticks % 24 === 0) desk.stir();
        desk.advance(0.05, false);
        ticks += 1;
    }
    assert.equal(desk.serve().result, 'over');
    assert.equal(desk.readouts()[0].label, '过火');
}
{
    const desk = new StoveDesk(catalog, 2);
    washRice(desk, 2);
    desk.beginFocused('R01');
    desk.focus(1);
    desk.beginFocused('R01');
    desk.focus(0);
    runDesk(desk, 8 + 11);
    const [focus, other] = desk.readouts();
    assert.equal(focus.warn, false);
    assert.equal(other.warn, true);
    assert.equal(other.label, '熬煮 · 该搅拌');
}

{
    const desk = new StoveDesk(catalog, 1);
    assert.equal(desk.buy('I01').ok, true);
    assert.equal(desk.pantry.gap(catalog.recipe('R01')), '大米待处理');
    assert.equal(desk.pantry.gap(catalog.recipe('R04')), '大米待处理');
    assert.equal(desk.wallet, balance.session.initialWallet - catalog.ingredient('I01').buyPrice);
    assert.equal(desk.prep('I01').ok, true);
    runDesk(desk, 2);
    assert.equal(desk.cancelPrep().ok, true);
    assert.equal(desk.pantry.held('I01'), 1, '取消淘洗不扣库存');
    assert.equal(desk.beginFocused('R01').ok, false, '没洗完不能下锅');
    assert.equal(desk.prep('I01').ok, true);
    runDesk(desk, balance.prep.wash);
    assert.equal(desk.pantry.gap(catalog.recipe('R01')), '');
    assert.equal(desk.pantry.gap(catalog.recipe('R02')), '缺瘦肉');
    assert.equal(desk.beginFocused('R01').ok, true);
    assert.equal(desk.pantry.held('I01'), 0, '下锅只扣一次');
    assert.equal(desk.pantry.gap(catalog.recipe('R01')), '缺大米');
    assert.equal(desk.beginFocused('R01').ok, false);
    desk.wallet = 3;
    assert.equal(desk.buy('I01').ok, false, '铜钱不足不加库存');
    assert.equal(desk.wallet, 3);
}
{
    const desk = new StoveDesk(catalog, 1);
    assert.equal(catalog.recipe('R03').unlockDay, 2);
    assert.equal(desk.pantry.gap(catalog.recipe('R03')), '缺小米');
    assert.equal(desk.buy('I05').ok, true);
    assert.equal(desk.prep('I05').ok, true);
    runDesk(desk, balance.prep.cut);
    assert.equal(desk.pantry.gap(catalog.recipe('R03')), '缺小米');
    assert.equal(desk.buy('I02').ok, true);
    assert.equal(desk.pantry.gap(catalog.recipe('R03')), '小米待处理');
    assert.equal(desk.prep('I02').ok, true);
    runDesk(desk, balance.prep.wash);
    assert.equal(desk.pantry.gap(catalog.recipe('R03')), '');
    const spent = catalog.ingredient('I02').buyPrice + catalog.ingredient('I05').buyPrice;
    assert.equal(desk.wallet, balance.session.initialWallet - spent);
    assert.equal(desk.beginFocused('R03').ok, true);
    const millet = new StoveDesk(catalog, 1);
    assert.equal(millet.buy('I02').ok, true);
    assert.equal(millet.prep('I02').ok, true);
    runDesk(millet, balance.prep.wash);
    assert.equal(millet.pantry.gap(catalog.recipe('R03')), '缺南瓜');
}
{
    const plain = catalog.recipe('R01');
    const greens = catalog.recipe('R04');
    const chicken = catalog.recipe('R07');
    assert.equal(visibleSoup('cooking', '熬煮', plain.color), '#F3E2C4');
    assert.equal(visibleSoup('cooking', '熬煮', greens.color), '#8FA86A');
    assert.equal(visibleSoup('window', '可以出餐', chicken.color), '#E6C48A');
    assert.equal(visibleSoup('plated', '刚好', plain.color), '');
    assert.equal(visibleSoup('plated', '夹生', greens.color), '');
    assert.equal(visibleSoup('plated', '过火', chicken.color), '');
    assert.equal(visibleSoup('burnt', '糊底', chicken.color), '');
    const desk = new StoveDesk(catalog, 1);
    for (const id of ['I01', 'I03', 'I06']) {
        assert.equal(desk.buy(id).ok, true);
        const prep = catalog.ingredient(id).prep;
        if (prep !== 'none') {
            assert.equal(desk.prep(id).ok, true);
            runDesk(desk, balance.prep[prep]);
        }
    }
    assert.equal(desk.beginFocused('R04').ok, true);
    let steps = 0;
    while (desk.readouts()[0].phase !== 'cooking' && steps < 80) {
        desk.advance(0.2, false);
        steps += 1;
    }
    assert.equal(desk.readouts()[0].pendingAdd, '青菜');
    assert.match(desk.addNext().message, /加料时机偏了/);
    assert.equal(desk.readouts()[0].pendingAdd, '瘦肉');
    desk.dump();
}
{
    const chicken = catalog.recipe('R07');
    const held = { recipe: chicken, result: 'raw', freshSteps: 0, mistimes: 0, seasonClash: false, atmosphere: 0, appearance: 0 };
    const withAdd = scoreDish(catalog, { ...held, missingAdds: 0 });
    const without = scoreDish(catalog, { ...held, missingAdds: 1 });
    assert.ok(without.pay < withAdd.pay, `${without.pay} 应低于 ${withAdd.pay}`);
    const desk = new StoveDesk(catalog, 1);
    assert.equal(desk.buy('I01').ok, true);
    assert.equal(desk.prep('I01').ok, true);
    runDesk(desk, balance.prep.wash);
    assert.equal(desk.beginFocused('R01').ok, true);
    let steps = 0;
    while (desk.readouts()[0].phase !== 'cooking' && steps < 80) {
        desk.advance(0.2, false);
        steps += 1;
    }
    assert.equal(desk.readouts()[0].pendingAdd, '');
    assert.match(desk.addNext().message, /这道粥不用加料/);
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.pantry.passHours(catalog.ingredient('I01').freshHours);
    assert.equal(desk.beginFocused('R01').ok, false, '过期米不能下锅');
    assert.match(desk.lastMessage, /大米/);
}
{
    const desk = new StoveDesk(catalog, 1);
    desk.owingRent = true;
    assert.equal(desk.kindLimit(), balance.session.debtBuyKinds);
    assert.equal(desk.buy('I01').ok, true);
    assert.equal(desk.buy('I03').ok, true);
    assert.equal(desk.buy('I04').ok, false, '欠租每天只能买 2 种');
    assert.match(desk.stockText(), /欠租/);
}

{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    assert.equal(desk.beginFocused('R02').ok, false, '缺肉不能下皮蛋粥');
    assert.match(desk.lastMessage, /瘦肉/);
    assert.equal(desk.pantry.held('I01'), 1, '拒绝启动时不扣已有食材');
    assert.equal(desk.readouts()[0].phase, 'empty');
    readyIngredient(desk, 'I03');
    readyIngredient(desk, 'I04');
    assert.equal(desk.beginFocused('R02').ok, true);
    assert.equal(desk.serve().ok, false);
    assert.equal(desk.addNext().ok, false);
    assert.equal(desk.season('salty').ok, false);
    let guard = 0;
    while (desk.readouts()[0].phase === 'prep' && guard < 400) { desk.advance(0.05, false); guard += 1; }
    assert.equal(desk.addNext().message, '加料时机偏了');
    while (desk.readouts()[0].phase !== 'window' && guard < 2400) {
        if (guard % 24 === 0) desk.stir();
        desk.advance(0.05, false);
        guard += 1;
    }
    assert.equal(desk.readouts()[0].phase, 'window');
    assert.equal(desk.season('salty').ok, true);
    assert.equal(desk.season('sweet').ok, false);
    assert.equal(desk.chooseBowl('glaze').ok, true);
    assert.equal(desk.serve().result, 'perfect');
    assert.equal(desk.takeServed(), undefined, '摆盘没完不能交给经营');
    assert.equal(desk.beginFocused('R01').ok, false, '摆盘中不能下新单');
    runDesk(desk, balance.session.plateSeconds);
    const dish = desk.takeServed();
    assert.equal(dish.missingAdds, 1);
    assert.equal(dish.mistimes, 1);
    assert.equal(dish.appearance, balance.bowls.glaze);
    assert.equal(quoteDish(catalog, dish, ['清甜']).score, 70 + 20 - 8 - 4 + 2 - 8);
    assert.equal(desk.readouts()[0].phase, 'empty', '摆盘结束腾锅');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    burnDesk(desk);
    assert.equal(desk.serve().result, 'burnt');
    const dish = desk.takeServed();
    assert.equal(dish.result, 'burnt');
    assert.equal(quoteDish(catalog, dish).tip, 0);
    assert.equal(desk.beginFocused('R01').ok, false, '糊锅没洗不能再用');
    runDesk(desk, balance.session.washSeconds);
    assert.equal(desk.readouts()[0].phase, 'empty');
    washRice(desk);
    assert.equal(desk.beginFocused('R01').ok, true, '洗完可以再下锅');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    burnDesk(desk);
    assert.equal(desk.dump().ok, true);
    assert.equal(desk.takeServed(), undefined, '倒掉没有收入');
    runDesk(desk, balance.session.washSeconds);
    assert.equal(desk.readouts()[0].phase, 'empty');
}
{
    const desk = new StoveDesk(catalog, 1);
    washRice(desk);
    desk.beginFocused('R01');
    runDesk(desk, 18);
    assert.equal(desk.serve().result, 'raw');
    desk.nightService = false;
    assert.equal(desk.chooseBowl('night').ok, true);
    runDesk(desk, balance.session.plateSeconds);
    assert.equal(desk.takeServed().appearance, 0, '非夜班深蓝盏不加分');
    washRice(desk);
    desk.nightService = true;
    desk.beginFocused('R01');
    runDesk(desk, 18);
    desk.serve();
    desk.chooseBowl('night');
    runDesk(desk, balance.session.plateSeconds);
    assert.equal(desk.takeServed().appearance, balance.bowls.night);
}

function runService(day, seconds) {
    for (let index = 0; index < Math.round(seconds / 0.05); index++) day.advance(0.05, false);
}
function openDay(options = {}) {
    const day = new ServiceDay(catalog, Object.assign({
        day: 1, seed: 1, pots: 2, seats: 2, wallet: balance.session.initialWallet,
        canCook: () => true, emptyHeats: () => ['mid'],
    }, options));
    return day;
}
{
    const day = openDay();
    runService(day, 10);
    assert.equal(day.phase, 'prep');
    assert.equal(day.orders.length, 0, '备料阶段不来客');
    assert.equal(day.open().ok, true);
    assert.equal(day.phase, 'service');
    const later = openDay();
    runService(later, balance.session.prepSeconds);
    assert.equal(later.phase, 'service', '备料时间到了会开门');
}
{
    const day = openDay();
    day.open();
    const gap = (times) => times.length < 2 ? 999 : times[1] - times[0];
    const dawn = day.planned.filter(time => time < balance.demand.waveSeconds);
    const lunch = day.planned.filter(time => time >= balance.demand.waveSeconds * 2 && time < balance.demand.waveSeconds * 3);
    assert.equal(day.planned.length, catalog.days[0].scheduledArrivals);
    assert.ok(gap(lunch) < gap(dawn), '午市到来更密');
    assert.ok(day.planned.every(time => time < balance.session.arrivalCutoffSeconds));
}
{
    const day = openDay({ plan: { day: 1, arrivalIntervalSeconds: 70, scheduledArrivals: 20 } });
    day.open();
    assert.ok(day.planned.length < 20);
    assert.ok(day.planned.every(time => time < balance.session.arrivalCutoffSeconds));
    runService(day, balance.session.arrivalCutoffSeconds + 5);
    const stopped = day.arrivals;
    runService(day, 30);
    assert.equal(day.arrivals, stopped, '来客截止后不再进人');
    assert.equal(day.wallet, balance.session.initialWallet);
}
{
    const capped = openDay({ pots: 1, seats: 4, plan: { day: 1, arrivalIntervalSeconds: 1, scheduledArrivals: 4 } });
    assert.equal(capped.orderLimit(), balance.demand.orderSlotsAtOnePot);
    capped.open();
    runService(capped, 3);
    assert.equal(capped.orders.filter(order => order.state === 'queued').length, 2);
    runService(capped, balance.session.busyRetrySeconds);
    assert.ok(capped.departures.some(item => item.reason === 'busy'), '订单满员后离开');
    assert.equal(capped.wallet, balance.session.initialWallet);
}
{
    const door = openDay({ seats: 0, pots: 1, plan: { day: 1, arrivalIntervalSeconds: 4, scheduledArrivals: 4 } });
    door.open();
    runService(door, 13);
    assert.equal(door.doorCount, balance.demand.doorQueue);
    assert.ok(door.departures.some(item => item.reason === 'no-seat'));
    assert.equal(door.wallet, balance.session.initialWallet);
    runService(door, balance.session.doorWaitSeconds);
    assert.ok(door.departures.filter(item => item.reason === 'no-seat').length >= 2);
    assert.equal(door.wallet, balance.session.initialWallet, '无座离开不扣钱包');
}
{
    const sold = openDay({ canCook: () => false });
    sold.open();
    runService(sold, 1);
    assert.equal(sold.soldOut, true);
    assert.equal(sold.orders.length, 0);
    assert.equal(sold.departures[0].reason, 'sold-out');
    assert.equal(sold.wallet, balance.session.initialWallet, '售罄离开不扣钱包');
}
{
    const day = openDay();
    day.open();
    runService(day, 0.05);
    const order = day.orders[0];
    const wallet = day.wallet;
    runService(day, order.patience + 0.2);
    assert.equal(order.state, 'left');
    assert.equal(order.reason, 'impatient');
    assert.equal(day.wallet, wallet, '超时离开不扣钱包');
}
{
    const day = openDay();
    day.open();
    runService(day, 0.05);
    const order = day.orders[0];
    assert.equal(day.assign(order.orderId, 'P1').ok, true);
    assert.equal(order.state, 'cooking');
    assert.equal(day.assign('O99', 'P2').ok, false);
    assert.equal(day.offer('P1'), true);
    assert.equal(order.state, 'ready');
    const wallet = day.wallet;
    assert.equal(day.deliver(order.orderId).ok, true);
    assert.equal(order.state, 'served');
    assert.equal(day.wallet, wallet, '送达本身不加钱也不扣钱');
}
{
    const day = openDay({ seats: 4, pots: 4, plan: { day: 1, arrivalIntervalSeconds: 200, scheduledArrivals: 3 } });
    day.open();
    runService(day, balance.session.shiftSeconds);
    assert.equal(day.phase, 'close');
    const live = day.orders.find(order => order.state === 'queued' || order.state === 'cooking' || order.state === 'ready');
    assert.ok(live, '打烊时店里还可以有未送达的单');
    const before = live.patienceLeft;
    runService(day, 1);
    assert.ok(Math.abs(before - live.patienceLeft - balance.demand.closePatienceScale) < 0.02, '打烊后耐心加倍流逝');
    assert.equal(day.wallet, balance.session.initialWallet);
}
{
    const patienceOf = (frames, dt) => {
        const day = openDay({ seed: 4 });
        day.open();
        for (let index = 0; index < frames; index++) day.advance(dt, false);
        return day.orders[0].patienceLeft;
    };
    assert.equal(patienceOf(600, 1 / 60), patienceOf(300, 1 / 30));
}
{
    const picture = (seed) => {
        const day = openDay({ seed, day: 3, seats: 4, pots: 2 });
        day.open();
        runService(day, 40);
        return day.orders.map(order => `${order.customerId}:${order.recipeId}`).join(',');
    };
    assert.equal(picture(9), picture(9), '同一随机种子来客相同');
}
{
    const harsh = openDay({ day: 7, seed: 399, atmosphere: 0, seats: 4, pots: 4 });
    harsh.open();
    runService(harsh, 0.05);
    assert.equal(harsh.departures[0].reason, 'rejected');
    assert.equal(harsh.departures[0].customerId, 'C07');
    assert.equal(harsh.orders.length, 0);
    assert.equal(harsh.wallet, balance.session.initialWallet, '食评拒绝不扣钱包');
    const stayed = openDay({ day: 7, seed: 238, atmosphere: 0, seats: 4, pots: 4 });
    stayed.open();
    runService(stayed, 0.05);
    assert.equal(stayed.orders[0].customerId, 'C07');
    const calm = openDay({ day: 7, seed: 399, atmosphere: 40, seats: 4, pots: 4 });
    calm.open();
    runService(calm, 0.05);
    assert.equal(calm.orders[0].customerId, 'C07');
    assert.equal(calm.departures.some(item => item.reason === 'rejected'), false);
}
{
    const day = openDay({ wallet: 30, canCook: (id) => id === 'R01' });
    day.open();
    runService(day, 0.05);
    assert.equal(day.orders[0].customerId, 'C02');
    assert.equal(day.orders[0].recipeId, 'R01');
    assert.equal(day.wallet, 30, '救援客人也不发钱');
}

function seedFor(dayNumber, customerId) {
    const pool = catalog.customers.filter(customer => customer.unlockDay <= dayNumber);
    for (let seed = 1; seed < 8000; seed++) {
        const rng = new SeededRng(seed);
        if (pool[rng.index(pool.length)].id === customerId) return seed;
    }
    throw new Error(customerId);
}
function plated(recipeId, result) {
    return { potId: 'P1', recipeId, result, season: 'plain', missingAdds: 0, mistimes: 0, freshSteps: 0, appearance: 0 };
}
{
    const day = openDay({ day: 2, seed: seedFor(2, 'C06'), canCook: (id) => id === 'R01', atmosphere: 0 });
    day.open();
    runService(day, 0.05);
    const order = day.orders[0];
    assert.equal(order.customerId, 'C06');
    assert.equal(order.recipeId, 'R01');
    assert.equal(day.assign(order.orderId, 'P1').ok, true);
    const dish = plated('R01', 'perfect');
    assert.equal(day.offer('P1', dish), true);
    assert.equal(day.deliver(order.orderId).ok, true);
    assert.equal(day.wallet, balance.session.initialWallet, '送达当时不加钱');
    const quote = quoteDish(catalog, dish, catalog.customer('C06').acceptedTags, 0);
    assert.equal(quote.tip > 0, true);
    const report = day.settle();
    assert.equal(report.revenue, quote.pay);
    assert.equal(report.tips, quote.tip);
    assert.equal(report.ingredientCost, 0, '没有采购记录时不能虚记食材支出');
    assert.equal(report.rentPaid, 0);
    assert.equal(day.wallet, balance.session.initialWallet + quote.pay + quote.tip);
    assert.equal(report.favor.C06, balance.demand.favorMatch);
    assert.equal(report.chapterContinues, true);
    assert.equal(day.settle().wallet, day.wallet, '日结不能重复入账');
}
{
    const day = openDay({ day: 3, wallet: 20, canCook: (id) => id === 'R01', atmosphere: 0 });
    day.open();
    runService(day, 0.05);
    const order = day.orders[0];
    const dish = plated('R01', 'burnt');
    const quote = quoteDish(catalog, dish, catalog.customer('C02').acceptedTags, 0);
    assert.equal(quote.tip, 0, '糊底没有小费');
    day.assign(order.orderId, 'P1');
    day.offer('P1', dish);
    day.deliver(order.orderId);
    const report = day.settle();
    assert.equal(report.tips, 0);
    assert.equal(report.revenue, quote.pay);
    assert.equal(day.wallet, 0, '付不出租金时钱包归零');
    assert.equal(report.owingRent, true);
    assert.equal(report.chapterContinues, true, '糊底和欠租不结束章节');
    assert.equal(report.favor.C02, 0);
    assert.ok(day.wallet >= 0);
}
{
    const paid = openDay({ day: 3, wallet: 50, canCook: () => false });
    const report = paid.settle();
    assert.equal(paid.wallet, 20);
    assert.equal(report.rentPaid, balance.session.rent);
    assert.equal(report.owingRent, false);
    assert.match(paid.reportText(), /已付租金 30/);
    assert.equal(report.chapterContinues, true);
    const broke = openDay({ day: 3, wallet: 0, canCook: () => false });
    broke.settle();
    assert.equal(broke.wallet, 0);
    assert.equal(broke.owingRent, true);
}
{
    const purse = { amount: balance.session.initialWallet };
    const stove = new StoveDesk(catalog, 1, purse);
    const day = new ServiceDay(catalog, { day: 1, seed: 1, pots: 1, seats: 2, purse, canCook: () => true, emptyHeats: () => ['mid'], ingredientSpend: () => stove.ingredientSpendToday() });
    assert.equal(stove.buy('I01').ok, true);
    assert.equal(day.wallet, purse.amount);
    assert.equal(stove.ingredientSpendToday(), 4);
    const report = day.settle();
    assert.equal(report.ingredientCost, 4);
    assert.equal(report.wallet, 196, '结余应等于期初减实际采购');
    assert.equal(day.settle().wallet, 196, '再次日结不能重复改账');
    stove.pantry.closeShop();
    assert.equal(stove.ingredientSpendToday(), 0, '新一天采购统计清零');
    stove.wallet = -5;
    assert.equal(stove.wallet, 0, '钱包不为负');
}
{
    const purse = { amount: balance.session.initialWallet };
    const stove = new StoveDesk(catalog, 1, purse);
    washRice(stove);
    const day = new ServiceDay(catalog, { day: 1, seed: 7, pots: 1, seats: 2, purse, canCook: () => true, emptyHeats: () => ['mid'] });
    assert.equal(day.open().ok, true);
    runService(day, 1);
    assert.ok(day.orders.length > 0, '营业后应有订单');
    assert.equal(stove.beginFocused('R01').ok, true);
    runDesk(stove, 20);
    const pot = stove.board.pots[0];
    const desk = { wallet: purse.amount, completedDays: 0, upgrades: [], stove: stove.capture(), service: day.capture() };
    const parsed = parseDesk(JSON.parse(JSON.stringify(desk)), catalog);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    const purse2 = { amount: 0 };
    const stove2 = StoveDesk.restore(catalog, parsed.desk.stove, purse2);
    const day2 = ServiceDay.restore(catalog, parsed.desk.service, purse2, () => true, () => ['mid']);
    assert.equal(stove2.board.pots[0].phase, pot.phase);
    assert.ok(Math.abs(stove2.board.pots[0].doneness - pot.doneness) < 0.000001, '恢复后熟度一致');
    assert.equal(stove2.pantry.held('I01'), stove.pantry.held('I01'));
    assert.deepEqual(day2.orders.map(order => order.orderId), day.orders.map(order => order.orderId));
    assert.equal(day2.wallet, day.wallet);
    const probe = new SeededRng(day.capture().rng.seed, day.capture().rng.step);
    const resumed = new SeededRng(day2.capture().rng.seed, day2.capture().rng.step);
    assert.equal(resumed.next(), probe.next(), '恢复后随机进度一致');
    runService(day, 30);
    runService(day2, 30);
    assert.deepEqual(day2.orders.map(order => order.customerId + order.recipeId), day.orders.map(order => order.customerId + order.recipeId));
}
{
    const purse = { amount: 50 };
    const stove = new StoveDesk(catalog, 1, purse);
    const day = new ServiceDay(catalog, { day: 3, seed: 1, pots: 1, seats: 2, purse, canCook: () => false, emptyHeats: () => ['mid'] });
    const report = day.settle();
    const wallet = day.wallet;
    const desk = { wallet, completedDays: 1, upgrades: [], stove: stove.capture(), service: day.capture() };
    const parsed = parseDesk(JSON.parse(JSON.stringify(desk)), catalog);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    const restored = ServiceDay.restore(catalog, parsed.desk.service, { amount: 999 }, () => false);
    assert.equal(restored.wallet, wallet);
    const again = restored.settle();
    assert.equal(restored.wallet, wallet, '恢复后日结不再入账或扣租');
    assert.equal(again.rentPaid, report.rentPaid);
    assert.equal(again.revenue, report.revenue);
}
{
    const badUpgrade = parseDesk({ wallet: 200, completedDays: 0, upgrades: ['U99'], stove: {}, service: {} }, catalog);
    assert.equal(badUpgrade.ok, false);
    assert.match(badUpgrade.message, /升级无效/);
    const purse = { amount: 200 };
    const stove = new StoveDesk(catalog, 1, purse);
    const day = new ServiceDay(catalog, { day: 1, seed: 1, pots: 1, seats: 2, purse, canCook: () => true, emptyHeats: () => ['mid'] });
    const desk = { wallet: 200, completedDays: 0, upgrades: [], stove: stove.capture(), service: day.capture() };
    desk.stove.pots[0].doneness = 1.5;
    const badPot = parseDesk(desk, catalog);
    assert.equal(badPot.ok, false);
    assert.match(badPot.message, /熟度/);
    assert.equal(desk.stove.pots[0].doneness, 1.5, '拒绝坏档时不改原记录');
}

{
    const purse = { amount: balance.session.initialWallet };
    const stove = new StoveDesk(catalog, 1, purse);
    const day = new ServiceDay(catalog, {
        day: 1, seed: 7, pots: 1, seats: 2, purse,
        canCook: (id) => catalog.recipe(id).unlockDay <= 1 && stove.pantry.canCommit(catalog.recipe(id)),
        emptyHeats: () => stove.readouts().filter(read => read.phase === 'empty').map(read => read.heat),
        ingredientSpend: () => stove.ingredientSpendToday(),
    });
    washRice(stove);
    assert.equal(day.open().ok, true);
    let cooked = false;
    for (let index = 0; index < 20000 && !day.report; index++) {
        const read = stove.readouts()[0];
        const queued = day.orders.find(order => order.state === 'queued' && order.recipeId === 'R01');
        if (queued && read.phase === 'empty' && !cooked) {
            assert.equal(stove.beginFocused('R01').ok, true);
            assert.equal(day.assign(queued.orderId, stove.readouts()[0].potId).ok, true);
            cooked = true;
        }
        if (read.phase === 'cooking' && read.warn) stove.stir();
        if (read.phase === 'window') {
            stove.season('plain');
            stove.serve();
        }
        let dish = stove.takeServed();
        while (dish) {
            day.offer(dish.potId, dish);
            dish = stove.takeServed();
        }
        const ready = day.orders.find(order => order.state === 'ready');
        if (ready) day.deliver(ready.orderId);
        day.advance(0.05, false);
        stove.advance(0.05, false);
    }
    assert.ok(day.report, '第一日应打烊');
    assert.equal(day.report.revenue, 16);
    assert.equal(day.report.tips, 3);
    assert.equal(day.report.ingredientCost, 4);
    assert.equal(day.report.rentPaid, 0);
    assert.equal(day.report.wallet, 215);
    assert.equal(day.report.wallet, 200 - day.report.ingredientCost + day.report.revenue + day.report.tips - day.report.rentPaid);
    assert.equal(day.report.worst, '白粥 刚好 90分');
    const guest = day.capture().guests.find(item => item.where === 'gone');
    assert.ok(guest && guest.dineLeft >= 0, '用餐剩余不为负');
    const desk = { wallet: day.wallet, completedDays: 1, upgrades: [], stove: stove.capture(), service: day.capture() };
    const parsed = parseDesk(JSON.parse(JSON.stringify(desk)), catalog);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    assert.equal(parsed.desk.lessons.first, 3, '已经打烊过的旧档不再从头教');
    assert.equal(parsed.desk.lessons.second, false);
    const taught = JSON.parse(JSON.stringify(desk));
    taught.lessons = { first: 1, second: true, replay: false };
    const kept = parseDesk(taught, catalog);
    assert.equal(kept.ok, true, kept.ok ? '' : kept.message);
    assert.equal(kept.desk.lessons.first, 1);
    assert.equal(kept.desk.lessons.second, true);
    taught.lessons.first = 4;
    assert.equal(parseDesk(taught, catalog).ok, false);
    const restored = ServiceDay.restore(catalog, parsed.desk.service, { amount: 0 }, () => true, () => ['mid'], () => stove.ingredientSpendToday());
    assert.equal(restored.settle().wallet, 215, '恢复日结不会重复收钱');
}

{
    const fresh = parseLocalSettings(null);
    assert.equal(fresh.music, 3);
    assert.equal(fresh.largeText, false);
    const kept = parseLocalSettings({ music: 0, pot: 1, room: 2, largeText: true });
    assert.deepEqual(kept, { music: 0, pot: 1, room: 2, largeText: true });
    assert.equal(parseLocalSettings({ music: 4, pot: 1.5, room: '高', largeText: 'yes' }).music, 3);
    const memory = { value: '' };
    const storage = {
        getItem(key) { return key === LOCAL_SETTINGS_KEY ? memory.value || null : null; },
        setItem(key, value) { if (key === LOCAL_SETTINGS_KEY) memory.value = value; },
    };
    saveLocalSettings(storage, kept);
    assert.deepEqual(loadLocalSettings(storage), kept);
    memory.value = '{';
    assert.equal(loadLocalSettings(storage).pot, 3);
    const owned = new Set(['U01']);
    const third = catalog.upgrade('U02');
    const fourth = catalog.upgrade('U03');
    const table = catalog.upgrade('U04');
    const windowSeat = catalog.upgrade('U05');
    assert.equal(upgradeOfferLine(third, new Set(), 3, 9999), '第三口锅  先买第二口锅');
    assert.equal(upgradeOfferLine(third, owned, 3, 2), '第三口锅  420 铜 · 铜钱不够');
    assert.equal(upgradeOfferLine(fourth, owned, 6, 9999), '第四口锅  先买第三口锅');
    assert.equal(upgradeOfferLine(table, owned, 3, 2), '双人桌  150 铜 · 铜钱不够');
    assert.equal(upgradeOfferLine(windowSeat, owned, 3, 2), '窗边座  还要 1 天');
}

{
    assert.equal(catalog.activities.length, 0);
    assert.equal(activeActivity(catalog.activities, 1), null);
    const withEvents = cloneCatalog(copy => {
        copy['activities.json'] = [
            { id: 'E02', name: '后到', startDay: 1, lastDays: 3, recipeId: 'R01', atmosphereShift: { warmth: 0, light: 0 }, arrivalBias: {} },
            { id: 'E01', name: '先到', startDay: 1, lastDays: 3, recipeId: 'R01', atmosphereShift: { warmth: 0.05, light: -0.05 }, arrivalBias: { C01: 1.2 } },
        ];
    })();
    assert.equal(activeActivity(withEvents.activities, 1).id, 'E01');
    assert.equal(activeActivity(withEvents.activities, 4), null);
    const purse = { amount: 200 };
    for (let day = 1; day <= 7; day++) {
        const service = new ServiceDay(catalog, { day, seed: day, pots: 1, purse, shopLevel: 1, canCook: () => false });
        assert.equal(service.open().ok, true);
        let guard = 0;
        while (service.phase !== 'closed' && guard < 4000) {
            service.advance(0.2, false);
            guard++;
        }
        assert.equal(service.phase, 'closed');
        assert.equal(service.report.chapterContinues, true);
        assert.equal(service.highlightDish(), null);
    }
    assert.equal(chapterCloseLine(7), '七日篇收束。明日起按铺面等级来客，章节继续。');
    assert.equal(planForDay(catalog, 8, 1).scheduledArrivals, 13);
    assert.equal(planForDay(catalog, 8, 3).scheduledArrivals, 15);
    assert.ok(planForDay(catalog, 8, 9).scheduledArrivals <= 18);
    assert.equal(atmosphereWords(12), '今天铺子有点冷清');
    const card = shareCardText({ day: 7, dish: '白粥', result: '刚好', atmosphere: atmosphereWords(60), close: chapterCloseLine(7) });
    assert.match(card, /粥霸天/);
    assert.match(card, /白粥 · 刚好/);
    assert.equal(/铜|结余|钱包/.test(card), false);
}

console.log('PASS: 规则表、坏档校验、火候四结果、双锅警告、30/60 帧、备料扣料、加料调味摆盘、客流订单、日结租金、七日收束、空活动、分享卡');
