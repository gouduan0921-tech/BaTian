const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const built = process.argv[2];
if (!built) throw new Error('Usage: node simulation.test.cjs <compiled scripts directory>');
const { parseBalance } = require(path.join(built, 'core/Balance.js'));
const { ShiftModel } = require(path.join(built, 'simulation/ShiftModel.js'));
const { Campaign } = require(path.join(built, 'core/Campaign.js'));
const { FixedClock } = require(path.join(built, 'simulation/FixedClock.js'));
const { SaveService, memoryDb } = require(path.join(built, 'save/SaveService.js'));
const { emptySave, parseSaveText, SAVE_FORMAT } = require(path.join(built, 'save/SaveDocument.js'));
const { PlaySession } = require(path.join(built, 'gameplay/PlaySession.js'));
const { AudioBus } = require(path.join(built, 'audio/AudioBus.js'));
const { pickStation } = require(path.join(built, 'input/StationRay.js'));
const { readDebugOverrides } = require(path.join(built, 'debug/DebugOverrides.js'));
const { SeededRng } = require(path.join(built, 'simulation/SeededRng.js'));
const canonical = path.resolve(__dirname, '../../../数据/balance.json');
const imported = path.resolve(__dirname, '../assets/resources/data/balance.json');
assert.equal(fs.readFileSync(imported, 'utf8'), fs.readFileSync(canonical, 'utf8'), '游戏规则数据须与原始数据一致');
const balance = parseBalance(JSON.parse(fs.readFileSync(canonical, 'utf8')));
function firstRecipe(id) {
    return { ...balance, recipes: [balance.recipes.find(recipe => recipe.id === id), ...balance.recipes.filter(recipe => recipe.id !== id)] };
}

function command(model, type, orderId = model.orders[0]?.id, extra = {}) {
    return model.command({ id: `test-${command.serial++}`, session: model.session, type, orderId, ...extra });
}
command.serial = 1;
function tick(model, seconds) { for (let i = 0; i < seconds * 20; i++) model.tick(0.05); }

{
    const model = new ShiftModel(balance, 1, 'normal');
    const order = model.orders[0];
    assert.equal(order.recipeId, 'R01');
    assert.equal(command(model, 'start').ok, true);
    assert.equal(model.wallet, 1190);
    assert.equal(command(model, 'start').ok, false, '重复开工不可重复扣费');
    tick(model, 4); assert.equal(order.stage, 'prepared');
    assert.equal(command(model, 'burner', order.id, { slot: 0 }).ok, true);
    tick(model, 16); assert.equal(order.stage, 'ready');
    assert.equal(command(model, 'serve', order.id, { slot: 0 }).ok, true);
    assert.equal(order.stage, 'serving');
    assert.equal(command(model, 'deliver', order.id).ok, false, '盛碗完成前不可交付');
    tick(model, 2); assert.equal(order.stage, 'tray');
    assert.equal(command(model, 'garnish', order.id).ok, true);
    tick(model, 4); assert.equal(order.stage, 'plated');
    assert.equal(command(model, 'deliver', order.id).ok, true);
    assert.equal(model.delivered, 1);
    assert.equal(model.wallet, 1226);
    assert.equal(command(model, 'deliver', order.id).ok, false, '结算后不可再领钱');
    assert.equal(model.wallet, 1226);
    assert.equal(command(model, 'end').ok, true);
    assert.equal(model.ended, true);
}

{
    const model = new ShiftModel(balance, 1, 'pause');
    command(model, 'pause');
    tick(model, 30);
    assert.equal(model.elapsed, 0);
    assert.equal(model.orders[0].patience, model.orders[0].initialPatience);
    command(model, 'resume');
    tick(model, 1);
    assert.ok(Math.abs(model.elapsed - 1) < 0.00001);
}

{
    const model = new ShiftModel(balance, 1, 'burn');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 4);
    command(model, 'burner', order.id, { slot: 0 }); tick(model, 16);
    tick(model, 21);
    assert.equal(order.stage, 'waiting');
    assert.equal(order.burner, -1);
    assert.equal(model.wallet, 1190, '烧糊成本不退');
    assert.equal(command(model, 'start', order.id).ok, true, '烧糊后可重做');
    assert.equal(model.wallet, 1180);
}

{
    const model = new ShiftModel(balance, 1, 'expiry');
    const order = model.orders[0];
    tick(model, order.initialPatience);
    assert.equal(model.orders.includes(order), false);
    assert.equal(command(model, 'deliver', order.id).ok, false);
    assert.equal(model.delivered, 0);
}

{
    const model = new ShiftModel(balance, 1, 'full');
    assert.equal(command(model, 'end').ok, false, '未交付且不足240秒不可提前结束');
    tick(model, 300);
    assert.equal(model.ended, true);
    assert.equal(model.remaining, 0);
}

{
    const model = new ShiftModel(firstRecipe('R04'), 2, 'stir');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 4);
    assert.equal(order.stage, 'special');
    assert.equal(command(model, 'action', order.id, { step: 0 }).ok, false, '翻炒必须等提示');
    for (let step = 0; step < 3; step++) {
        tick(model, step === 0 ? 1 : 2);
        assert.equal(command(model, 'action', order.id, { step }).ok, true);
        assert.equal(command(model, 'action', order.id, { step }).ok, false, '同一次翻炒不得重复得分');
    }
    tick(model, 3);
    assert.equal(order.stage, 'prepared');
    assert.equal(order.quality, 70);
}

{
    const model = new ShiftModel(firstRecipe('R04'), 2, 'no-stir');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 12);
    assert.equal(order.stage, 'prepared');
    assert.equal(order.quality, 50, '零次翻炒得零分但可以继续');
}

{
    const model = new ShiftModel(firstRecipe('R07'), 4, 'hold');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 4);
    assert.equal(order.stage, 'special');
    assert.equal(command(model, 'holdStart', order.id).ok, true);
    tick(model, 4);
    assert.equal(command(model, 'holdEnd', order.id).ok, true);
    tick(model, 4);
    assert.equal(order.stage, 'prepared');
    assert.equal(order.quality, 70);
}

{
    const model = new ShiftModel(firstRecipe('R08'), 4, 'two-colors');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 4);
    command(model, 'burner', order.id, { slot: 0 }); tick(model, 18);
    command(model, 'serve', order.id, { slot: 0 }); tick(model, 2);
    assert.equal(order.stage, 'tray');
    assert.equal(command(model, 'deliver', order.id).ok, false, '双色铺面不可跳过');
    assert.equal(command(model, 'special', order.id).ok, true);
    assert.equal(command(model, 'action', order.id, { step: 1 }).ok, false, '错序铺面不计分');
    assert.equal(command(model, 'action', order.id, { step: 0 }).ok, true);
    assert.equal(command(model, 'action', order.id, { step: 1 }).ok, true);
    tick(model, 8);
    assert.equal(order.stage, 'tray');
    assert.equal(order.quality, 90);
    assert.equal(command(model, 'deliver', order.id).ok, true);
}

{
    const model = new ShiftModel(firstRecipe('R12'), 7, 'seafood');
    const order = model.orders[0];
    command(model, 'start'); tick(model, 4);
    command(model, 'burner', order.id, { slot: 0 }); tick(model, 30);
    command(model, 'serve', order.id, { slot: 0 }); tick(model, 2);
    command(model, 'special', order.id);
    for (let step = 0; step < 3; step++) assert.equal(command(model, 'action', order.id, { step }).ok, true);
    tick(model, 8);
    assert.equal(order.quality, 90);
    assert.equal(command(model, 'deliver', order.id).ok, true);
}

{
    const campaign = new Campaign(balance);
    assert.equal(campaign.purchase('U01').ok, false, '第一日结束前不能升级');
    const day1 = campaign.createShift();
    tick(day1, 300); campaign.finish(day1);
    assert.equal(campaign.completedDays, 1);
    assert.throws(() => campaign.finish(day1), /重复结算/);
    assert.equal(campaign.purchase('U01').ok, true);
    assert.equal(campaign.purchase('U01').ok, false, '升级只能买一次');
    assert.equal(campaign.wallet, 900);
    const resumed = new Campaign(balance, campaign.snapshot());
    assert.equal(resumed.nextDay, 2);
    assert.equal(resumed.upgrades.has('U01'), true);
    const day2 = resumed.createShift();
    day2.nextArrival = 0;
    day2.tick(0.05);
    const [first, second] = day2.orders;
    assert.equal(day2.orders.length, 2);
    command(day2, 'start', first.id); tick(day2, 4);
    assert.equal(command(day2, 'burner', first.id, { slot: 0 }).ok, true);
    command(day2, 'start', second.id); tick(day2, 4);
    assert.equal(command(day2, 'burner', second.id, { slot: 1 }).ok, true);
    assert.equal(first.burner, 0);
    assert.equal(second.burner, 1);
    tick(day2, 12);
    assert.equal(first.stage, 'ready');
    assert.equal(command(day2, 'serve', first.id, { slot: 1 }).ok, false, '不能点错锅盛碗');
    assert.equal(command(day2, 'serve', first.id, { slot: 0 }).ok, true);
}

{
    const model = new ShiftModel(balance, 1, 'restore');
    const original = { id: 'fixed-command', session: model.session, type: 'start', orderId: model.orders[0].id };
    assert.equal(model.command(original).ok, true);
    tick(model, 2);
    const saved = model.snapshot();
    const restored = ShiftModel.restore(balance, saved, new Set());
    assert.equal(restored.paused, true, '刷新后先暂停');
    assert.equal(restored.elapsed, model.elapsed);
    assert.equal(restored.wallet, 1190);
    assert.equal(restored.orders[0].stage, 'preparing');
    assert.equal(restored.command(original).ok, false, '恢复后仍能阻止重复命令');
    const frozenTime = restored.elapsed;
    tick(restored, 8); assert.equal(restored.elapsed, frozenTime);
    command(restored, 'resume'); tick(restored, 2);
    assert.equal(restored.orders[0].stage, 'prepared');
    assert.throws(() => ShiftModel.restore(balance, { ...saved, orders: [{ ...saved.orders[0], burner: 9 }] }, new Set()), /无效/);
}

{
    let seconds = 0;
    const clock = new FixedClock(50, dt => { seconds += dt; });
    clock.advance(5);
    assert.ok(Math.abs(seconds - 0.2) < 0.00001, '单帧最多追 4 步，后台大间隔不可追赶');
    clock.reset();
    clock.advance(0.05);
    assert.ok(Math.abs(seconds - 0.25) < 0.00001);
}

{
    const audio = new AudioBus();
    const session = PlaySession.start(balance, null, {}, audio);
    const start = session.issue('start', session.model.orders[0].id);
    assert.equal(start.ok, true);
    assert.equal(session.consumeSaveRequest(), true, '扣费后要存档');
    tick(session.model, 4);
    session.issue('burner', session.model.orders[0].id, 0);
    tick(session.model, 16);
    session.issue('serve', session.model.orders[0].id, 0);
    tick(session.model, 2);
    session.issue('deliver', session.model.orders[0].id);
    const coins = audio.cues.filter(cue => cue === 'ui:金币');
    assert.equal(coins.length, 1, '重复交付不重复登记金币声');
    const saved = session.snapshot();
    assert.equal(JSON.stringify(saved).includes('MeshRenderer'), false);
    assert.ok(saved.shift, '未打烊时保留当班状态');
    const resumed = PlaySession.start(balance, saved);
    assert.equal(resumed.model.paused, true, '刷新后先暂停');
    assert.equal(resumed.campaign.codex.recipes.has('R01'), true);
    assert.equal(resumed.campaign.wallet, session.model.wallet);
    session.consumeSaveRequest();
    for (let step = 0; step < 20; step++) session.advance(0.2);
    assert.equal(session.consumeSaveRequest(), true, '每 5 秒模拟时间存档');
}

{
    const rng = new SeededRng(7, 0);
    rng.index(12);
    const saved = rng.snapshot();
    const restored = SeededRng.restore(saved);
    const fresh = new SeededRng(7, saved.step);
    assert.equal(restored.index(4), fresh.index(4), '随机数位置可以续上');
    assert.equal(readDebugOverrides('?seed=3&recipe=R04&day=2', false).seed, undefined);
    assert.equal(readDebugOverrides('?seed=3&recipe=R04&day=2', true).recipeId, 'R04');
    assert.equal(pickStation({ x: -2.5, y: 2, z: -1.8 }, { x: 0, y: -1, z: 0 }), 'PREP');
}

async function checkSave() {
    const file = emptySave(balance);
    const service = new SaveService(memoryDb());
    assert.equal((await service.write(file, balance)).ok, true);
    const loaded = await service.load(balance);
    assert.equal(loaded.file.wallet, balance.session.initialWallet);
    const recovered = new SaveService(memoryDb({ primary: '{', backup: JSON.stringify(file) }));
    const fromBackup = await recovered.load(balance);
    assert.equal(fromBackup.file.version, balance.version);
    assert.match(fromBackup.warning, /备份/);
    assert.ok(fromBackup.preservedText);
    const newer = parseSaveText(JSON.stringify({ ...file, format: SAVE_FORMAT + 1 }), balance);
    assert.equal(newer.ok, false);
    assert.match(newer.message, /较新版本/);
    const blocked = new SaveService(memoryDb({ primary: JSON.stringify({ ...file, format: SAVE_FORMAT + 1 }) }));
    const refused = await blocked.load(balance);
    assert.equal(refused.blocked, true);
    assert.equal((await blocked.write(file, balance)).ok, false);
    const keptOld = emptySave(balance);
    keptOld.wallet = 12;
    keptOld.serial = 4;
    const keptDb = memoryDb({ primary: JSON.stringify(keptOld) });
    const kept = new SaveService(keptDb);
    await kept.keepPrimary();
    const fresh = emptySave(balance);
    fresh.wallet = 200;
    assert.equal((await kept.write(fresh, balance)).ok, true);
    fresh.serial = 2;
    assert.equal((await kept.write(fresh, balance)).ok, true);
    assert.equal(JSON.parse(await keptDb.get('backup')).wallet, 12, '新档刷新不能盖掉固定备份');
    assert.equal(JSON.parse(await keptDb.get('primary')).wallet, 200);
    const huge = parseSaveText(JSON.stringify(file).padEnd(1024 * 1024 + 1, ' '), balance);
    assert.equal(huge.ok, false);
    console.log('PASS: 规则数据、交付/盛碗/重复操作、暂停/烧糊/超时/打烊、A1-A4、跨日升级与双炉位、刷新恢复、存档与分层');
}

checkSave().catch(error => { console.error(error); process.exit(1); });
