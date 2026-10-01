import { Balance, Recipe } from '../core/Balance';
import { SimEvent, SimListener } from './Events';
import { RngState, SeededRng } from './SeededRng';

export type OrderStage = 'waiting' | 'preparing' | 'special' | 'prepared' | 'cooking' | 'ready' | 'serving' | 'tray' | 'garnishing' | 'plated';
export interface Order {
    id: string; recipeId: string; customerId: string; stage: OrderStage;
    patience: number; initialPatience: number; stageTime: number; readyTime: number;
    burner: number; tray: number; costPaid: number; quality: number; garnishes: number;
    specialDone: boolean; actionMask: number; heldSeconds: number; holding: boolean;
}
export type Command = { id: string; session: string; type: 'start' | 'burner' | 'serve' | 'special' | 'action' | 'holdStart' | 'holdEnd' | 'garnish' | 'deliver' | 'pause' | 'resume' | 'end'; orderId?: string; slot?: number; step?: number };
export type CommandResult = { ok: boolean; message: string };
export interface ShiftSave {
    version: string; session: string; day: number; wallet: number; elapsed: number; paused: boolean; ended: boolean;
    delivered: number; missed: number; spawned: number; nextArrival: number; orders: Order[];
    ledger: string[]; seenCommands: string[]; events: string[]; upgrades: string[];
    rng?: RngState; randomOrders?: boolean;
}

export interface ShiftOptions { seed?: number; randomOrders?: boolean; forcedRecipeId?: string }

export class ShiftModel {
    readonly session: string;
    readonly orders: Order[] = [];
    readonly events: string[] = [];
    readonly ledger = new Set<string>();
    readonly seenCommands = new Set<string>();
    wallet: number;
    elapsed = 0;
    paused = false;
    ended = false;
    delivered = 0;
    missed = 0;
    private spawned = 0;
    private nextArrival = 0;
    readonly ownedUpgrades: ReadonlySet<string>;
    rng: SeededRng;
    randomOrders: boolean;
    private readonly forcedRecipeId?: string;
    private readonly listeners: SimListener[] = [];

    constructor(readonly balance: Balance, readonly day = 1, session?: string, initialWallet?: number, ownedUpgrades: ReadonlySet<string> = new Set(), options: ShiftOptions = {}) {
        this.session = session || `day${day}-${Date.now()}`;
        this.wallet = initialWallet === undefined ? balance.session.initialWallet : initialWallet;
        this.ownedUpgrades = new Set(ownedUpgrades);
        this.rng = new SeededRng(options.seed ?? 1, 0);
        this.randomOrders = !!options.randomOrders;
        this.forcedRecipeId = options.forcedRecipeId;
        this.spawnOrder(); // First order at zero seconds.
        this.nextArrival = this.dayPlan.arrivalIntervalSeconds;
    }

    subscribe(listener: SimListener): () => void {
        this.listeners.push(listener);
        return () => { const index = this.listeners.indexOf(listener); if (index >= 0) this.listeners.splice(index, 1); };
    }

    get dayPlan() { return this.balance.days[Math.min(this.day, 7) - 1]; }
    get activeOrders() { return this.orders.filter(o => o.patience > 0); }
    get remaining() { return Math.max(0, this.balance.session.shiftSeconds - this.elapsed); }
    get prepSeconds() { return this.ownedUpgrades.has('U03') ? 2 : this.balance.cooking.prepSeconds; }
    get perfectSeconds() { return this.ownedUpgrades.has('U02') ? 12 : this.balance.cooking.perfectSeconds; }
    recipe(id: string): Recipe { const recipe = this.balance.recipes.find(r => r.id === id); if (!recipe) throw new Error(`未知菜谱 ${id}`); return recipe; }

    snapshot(): ShiftSave {
        return { version: this.balance.version, session: this.session, day: this.day, wallet: this.wallet, elapsed: this.elapsed,
            paused: this.paused, ended: this.ended, delivered: this.delivered, missed: this.missed,
            spawned: this.spawned, nextArrival: this.nextArrival, orders: this.orders.map(order => ({ ...order })),
            ledger: Array.from(this.ledger), seenCommands: Array.from(this.seenCommands), events: [...this.events], upgrades: Array.from(this.ownedUpgrades).sort(),
            rng: this.rng.snapshot(), randomOrders: this.randomOrders };
    }

    static restore(balance: Balance, raw: unknown, upgrades: ReadonlySet<string>): ShiftModel {
        const data = raw as ShiftSave;
        const finite = (value: unknown, min: number, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
        if (!data || data.version !== balance.version || !Number.isInteger(data.day) || data.day < 1 || data.day > 7 ||
            typeof data.session !== 'string' || !data.session || !finite(data.wallet, 0) || !finite(data.elapsed, 0, balance.session.shiftSeconds) ||
            !Number.isInteger(data.delivered) || data.delivered < 0 || !Number.isInteger(data.missed) || data.missed < 0 ||
            !Number.isInteger(data.spawned) || data.spawned < 1 || !finite(data.nextArrival, 0) ||
            typeof data.ended !== 'boolean' || !Array.isArray(data.orders) || data.orders.length > balance.session.maxActiveOrders ||
            !Array.isArray(data.ledger) || !Array.isArray(data.seenCommands) || !Array.isArray(data.events) ||
            !Array.isArray(data.upgrades) || JSON.stringify([...upgrades].sort()) !== JSON.stringify([...data.upgrades].sort())) {
            throw new Error('当班记录无效或与当前规则不匹配');
        }
        const stages: OrderStage[] = ['waiting', 'preparing', 'special', 'prepared', 'cooking', 'ready', 'serving', 'tray', 'garnishing', 'plated'];
        const usedIds = new Set<string>(), usedBurners = new Set<number>(), usedTrays = new Set<number>();
        for (const order of data.orders) {
            const recipe = balance.recipes.find(item => item.id === order.recipeId);
            if (!recipe || recipe.unlockDay > data.day || !/^O\d+$/.test(order.id) || usedIds.has(order.id) || !stages.includes(order.stage) ||
                !finite(order.patience, 0) || !finite(order.initialPatience, 1) || !finite(order.stageTime, 0) || !finite(order.readyTime, 0) ||
                ![-1, 0, 1].includes(order.burner) || ![-1, 0, 1, 2].includes(order.tray) || !finite(order.costPaid, 0) ||
                !finite(order.quality, 0, 100) || !Number.isInteger(order.actionMask) || order.actionMask < 0 || order.actionMask > 7 ||
                !finite(order.heldSeconds, 0, 8) || typeof order.specialDone !== 'boolean' || typeof order.holding !== 'boolean') {
                throw new Error('当班订单记录无效');
            }
            usedIds.add(order.id);
            if (order.burner >= 0) { if (usedBurners.has(order.burner)) throw new Error('当班炉位记录冲突'); usedBurners.add(order.burner); }
            if (order.tray >= 0) { if (usedTrays.has(order.tray)) throw new Error('当班托盘记录冲突'); usedTrays.add(order.tray); }
        }
        const shift = new ShiftModel(balance, data.day, data.session, data.wallet, upgrades);
        shift.elapsed = data.elapsed; shift.paused = true; shift.ended = data.ended;
        shift.delivered = data.delivered; shift.missed = data.missed;
        shift.spawned = data.spawned; shift.nextArrival = data.nextArrival;
        shift.orders.length = 0;
        for (const order of data.orders) shift.orders.push({ ...order, holding: false });
        for (const id of data.ledger) if (typeof id === 'string') shift.ledger.add(id);
        for (const id of data.seenCommands) if (typeof id === 'string') shift.seenCommands.add(id);
        for (const event of data.events.slice(-40)) if (typeof event === 'string') shift.events.push(event);
        if (data.rng) shift.rng = SeededRng.restore(data.rng);
        shift.randomOrders = data.randomOrders === true;
        return shift;
    }

    private note(message: string) { this.events.push(message); if (this.events.length > 40) this.events.shift(); }
    private emit(event: SimEvent) { for (const listener of this.listeners) listener(event); }
    private spawnOrder() {
        const recipes = this.balance.recipes.filter(r => r.unlockDay <= this.day);
        if (!recipes.length || this.activeOrders.length >= this.balance.session.maxActiveOrders) return false;
        const forced = this.forcedRecipeId ? recipes.find(item => item.id === this.forcedRecipeId) : undefined;
        const recipe = forced || (this.randomOrders ? recipes[this.rng.index(recipes.length)] : recipes[this.spawned % recipes.length]);
        if (!this.randomOrders) this.rng.next();
        const customers = this.balance.customers.filter(c => c.unlockDay <= this.day && (c.acceptedTags.includes('*') || c.acceptedTags.some(tag => recipe.tags.includes(tag))));
        const customer = customers[this.spawned % customers.length];
        if (!customer) throw new Error(`菜谱 ${recipe.id} 没有可接待顾客`);
        const patience = recipe.standardSeconds + customer.patienceBonusSeconds;
        const order: Order = { id: `O${String(this.spawned + 1).padStart(2, '0')}`, recipeId: recipe.id, customerId: customer.id,
            stage: 'waiting', patience, initialPatience: patience, stageTime: 0, readyTime: 0, burner: -1, tray: -1,
            costPaid: 0, quality: this.balance.cooking.baseQuality + (recipe.action === 'A0' ? 20 : 0), garnishes: 0,
            specialDone: recipe.action === 'A0', actionMask: 0, heldSeconds: 0, holding: false };
        this.orders.push(order); this.spawned++; this.note(`${order.id} ${recipe.name} 来单`);
        this.emit({ type: 'orderCreated', orderId: order.id, recipeId: recipe.id, customerId: customer.id });
        return true;
    }

    tick(dt: number): void {
        if (this.paused || this.ended) return;
        this.elapsed = Math.min(this.balance.session.shiftSeconds, this.elapsed + dt);
        // Expiry precedes any command submitted after this step.
        for (const order of [...this.orders]) {
            order.patience = Math.max(0, order.patience - dt);
            if (order.patience <= 0.000001) {
                this.orders.splice(this.orders.indexOf(order), 1); this.missed++; this.note(`${order.id} 等待超时`);
                this.emit({ type: 'expired', orderId: order.id }); continue;
            }
            if (order.stage === 'preparing' || order.stage === 'special' || order.stage === 'cooking' || order.stage === 'serving' || order.stage === 'garnishing') order.stageTime += dt;
            if (order.stage === 'special' && order.holding) order.heldSeconds += dt;
            if (order.stage === 'preparing' && order.stageTime + 0.000001 >= this.prepSeconds) {
                const action = this.recipe(order.recipeId).action;
                order.stage = action === 'A1' || action === 'A2' ? 'special' : 'prepared';
                order.stageTime = 0;
                this.note(order.stage === 'special' ? `${order.id} 特色操作开始，限时8秒` : `${order.id} 已备料，点炭火灶`);
            }
            if (order.stage === 'special' && order.stageTime + 0.000001 >= 8) {
                const action = this.recipe(order.recipeId).action;
                const hits = action === 'A2' ? order.heldSeconds + 0.000001 >= 4 ? 3 : order.heldSeconds + 0.000001 >= 2 ? 1 : 0 :
                    [0, 1, 2].filter(index => order.actionMask & (1 << index)).length;
                const needed = action === 'A3' ? 2 : 3;
                const score = hits >= needed ? 20 : hits > 0 ? 10 : 0;
                order.quality += score; order.specialDone = true; order.holding = false;
                order.stage = action === 'A1' || action === 'A2' ? 'prepared' : 'tray';
                order.stageTime = 0; this.note(`${order.id} 特色操作完成，得${score}分`);
            }
            if (order.stage === 'cooking' && order.stageTime + 0.000001 >= this.recipe(order.recipeId).cookSeconds) {
                order.stage = 'ready'; order.readyTime = 0; this.note(`${order.id} 已煮好，点锅盛碗`);
                this.emit({ type: 'potReady', orderId: order.id });
            }
            else if (order.stage === 'ready') {
                order.readyTime += dt;
                if (order.readyTime > this.balance.cooking.burnSeconds + 0.000001) {
                    order.stage = 'waiting'; order.burner = -1; order.costPaid = 0; order.readyTime = 0;
                    const action = this.recipe(order.recipeId).action;
                    order.quality = this.balance.cooking.baseQuality + (action === 'A0' ? 20 : 0);
                    order.specialDone = action === 'A0'; order.actionMask = 0; order.heldSeconds = 0; order.holding = false;
                    this.note(`${order.id} 烧糊了，清锅后可重做`);
                    this.emit({ type: 'burned', orderId: order.id });
                }
            }
            if (order.stage === 'serving' && order.stageTime + 0.000001 >= this.balance.cooking.serveSeconds) {
                order.stage = 'tray'; order.stageTime = 0; this.note(`${order.id} 已盛碗，可摆盘或直接交付`);
            }
            if (order.stage === 'garnishing' && order.stageTime + 0.000001 >= this.balance.cooking.garnishSeconds) {
                order.stage = 'plated'; order.stageTime = 0; order.garnishes = 2; order.quality += 10; this.note(`${order.id} 已摆盘，点出餐柜台`);
            }
        }
        if (this.elapsed >= this.nextArrival && this.elapsed < this.balance.session.arrivalCutoffSeconds && this.spawned < this.dayPlan.scheduledArrivals) {
            if (this.spawnOrder()) this.nextArrival += this.dayPlan.arrivalIntervalSeconds;
            else this.nextArrival += this.balance.session.busyRetrySeconds;
        }
        if (this.elapsed + 0.000001 >= this.balance.session.shiftSeconds) this.finish();
    }

    command(command: Command): CommandResult {
        if (command.session !== this.session) return { ok: false, message: '营业会话不匹配' };
        if (this.seenCommands.has(command.id)) return { ok: false, message: '重复操作已忽略' };
        this.seenCommands.add(command.id);
        if (command.type === 'pause') { this.paused = true; for (const order of this.orders) order.holding = false; return { ok: true, message: '已暂停' }; }
        if (command.type === 'resume') { this.paused = false; return { ok: true, message: '继续营业' }; }
        if (this.ended || this.paused) return { ok: false, message: this.ended ? '已打烊' : '请先继续营业' };
        if (command.type === 'end') {
            if (!this.delivered && this.elapsed < this.balance.session.arrivalCutoffSeconds) return { ok: false, message: '至少交付一单或营业240秒才能提前打烊' };
            this.finish(); return { ok: true, message: '已打烊' };
        }
        const order = this.orders.find(o => o.id === command.orderId);
        if (!order) return { ok: false, message: '订单已不存在' };
        const recipe = this.recipe(order.recipeId);
        switch (command.type) {
            case 'start':
                if (order.stage !== 'waiting' || this.orders.some(o => o.stage === 'preparing' || o.stage === 'prepared' || (o.stage === 'special' && ['A1', 'A2'].includes(this.recipe(o.recipeId).action)))) return { ok: false, message: '备料台忙碌或订单不可备料' };
                if (this.wallet < recipe.cost) return { ok: false, message: '金币不足' };
                this.wallet -= recipe.cost; order.costPaid = recipe.cost; order.stage = 'preparing'; order.stageTime = 0;
                this.emit({ type: 'costPaid', orderId: order.id, amount: recipe.cost, wallet: this.wallet });
                return { ok: true, message: `${order.id} 开始备料，扣${recipe.cost}金币` };
            case 'burner':
                if (order.stage !== 'prepared') return { ok: false, message: '请先备料' };
                if ((command.slot !== 0 && command.slot !== 1) || (command.slot === 1 && !this.ownedUpgrades.has('U01')) || this.orders.some(o => o.burner === command.slot)) return { ok: false, message: '炉位忙碌或尚未开放' };
                order.stage = 'cooking'; order.burner = command.slot; order.stageTime = 0;
                this.emit({ type: 'cookingStarted', orderId: order.id, slot: command.slot });
                return { ok: true, message: `${order.id} 开始煮制` };
            case 'special':
                if (order.stage !== 'tray' || !['A3', 'A4'].includes(recipe.action) || order.specialDone) return { ok: false, message: '当前订单不需要摆料操作' };
                if (this.orders.some(o => o.stage === 'garnishing' || (o.stage === 'special' && ['A3', 'A4'].includes(this.recipe(o.recipeId).action)))) return { ok: false, message: '摆盘台忙碌' };
                order.stage = 'special'; order.stageTime = 0;
                return { ok: true, message: `${order.id} 摆料开始，限时8秒` };
            case 'action':
                if (order.stage !== 'special' || command.step === undefined) return { ok: false, message: '当前没有可操作的特色步骤' };
                if (recipe.action === 'A1') {
                    if (command.step < 0 || command.step > 2 || order.stageTime + 0.000001 < 1 + command.step * 2 || order.stageTime > 2 + command.step * 2 + 0.000001 || (order.actionMask & (1 << command.step))) return { ok: false, message: '未到翻炒时机或已完成' };
                } else if (recipe.action === 'A3' || recipe.action === 'A4') {
                    const next = [0, 1, 2].filter(index => order.actionMask & (1 << index)).length;
                    if (command.step !== next || next >= (recipe.action === 'A3' ? 2 : 3)) return { ok: false, message: '请按顺序放入配料' };
                } else return { ok: false, message: '请按住搅拌按钮' };
                order.actionMask |= 1 << command.step;
                return { ok: true, message: `${order.id} 特色步骤 ${command.step + 1} 完成` };
            case 'holdStart':
                if (order.stage !== 'special' || recipe.action !== 'A2' || order.holding) return { ok: false, message: '当前无法搅拌' };
                order.holding = true; return { ok: true, message: `${order.id} 搅拌中，累计按住4秒得满分` };
            case 'holdEnd':
                if (order.stage !== 'special' || recipe.action !== 'A2' || !order.holding) return { ok: false, message: '当前没有持续搅拌' };
                order.holding = false; return { ok: true, message: `${order.id} 已搅拌${order.heldSeconds.toFixed(1)}秒` };
            case 'serve':
                if (order.stage !== 'ready') return { ok: false, message: '粥尚未煮好' };
                if (command.slot !== order.burner) return { ok: false, message: '请点击这份粥所在的锅' };
                const tray = [0, 1, 2].find(slot => !this.orders.some(o => o.tray === slot));
                if (tray === undefined) return { ok: false, message: '托盘已满' };
                order.quality += order.readyTime <= this.perfectSeconds + 0.000001 ? 20 : 10;
                order.stage = 'serving'; order.stageTime = 0; order.burner = -1; order.tray = tray;
                return { ok: true, message: `${order.id} 盛碗中，${this.balance.cooking.serveSeconds}秒后可出餐` };
            case 'garnish':
                if (order.stage !== 'tray' || !order.specialDone || this.orders.some(o => o.stage === 'garnishing')) return { ok: false, message: '摆盘台忙碌或特色操作未完成' };
                order.stage = 'garnishing'; order.stageTime = 0; return { ok: true, message: `${order.id} 摆盘中` };
            case 'deliver':
                if (order.stage !== 'tray' && order.stage !== 'plated') return { ok: false, message: '还没有可交付的成品' };
                if (!order.specialDone) return { ok: false, message: '请先完成特色操作' };
                if (this.ledger.has(order.id)) return { ok: false, message: '此单已结算' };
                this.ledger.add(order.id);
                const tip = Math.floor(recipe.price * this.balance.cooking.tipRate * Math.max(0, order.quality - 60) / 40 * Math.min(1, order.patience / order.initialPatience));
                this.wallet += recipe.price + tip; this.delivered++;
                this.orders.splice(this.orders.indexOf(order), 1);
                this.emit({ type: 'delivered', orderId: order.id, recipeId: recipe.id, customerId: order.customerId, income: recipe.price + tip, tip });
                return { ok: true, message: `${order.id} 已交付，收入${recipe.price + tip}金币（含小费${tip}）` };
        }
    }

    private finish() {
        if (this.ended) return;
        for (const order of this.orders) if (order.costPaid > 0 && order.stage !== 'waiting') this.wallet += order.costPaid;
        this.orders.length = 0; this.ended = true; this.paused = true;
        this.wallet = Math.max(this.wallet, this.balance.session.rescueFloor);
        this.note(`第${this.day}日打烊：交付${this.delivered}单，失单${this.missed}单`);
        this.emit({ type: 'settled', day: this.day, delivered: this.delivered, missed: this.missed, wallet: this.wallet });
    }
}
