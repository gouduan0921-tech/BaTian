import { FixedClock } from '../simulation/FixedClock';
import { SeededRng } from '../simulation/SeededRng';
import { Catalog, Customer, DayPlan, HeatName, Recipe, Story } from './Catalog';
import { patienceSeconds, quoteDish, ServedDish } from './Score';
import type { ServiceSave } from './DeskSave';

export type ShiftPhase = 'prep' | 'service' | 'close' | 'closed';
export type WaveName = 'dawn' | 'forenoon' | 'lunch' | 'evening';
export type OrderState = 'queued' | 'cooking' | 'ready' | 'served' | 'left';
export type LeaveReason = 'served' | 'impatient' | 'no-seat' | 'sold-out' | 'rejected' | 'busy' | 'closed';

export interface ServiceOrder {
    orderId: string;
    customerId: string;
    recipeId: string;
    potId: string;
    patience: number;
    patienceLeft: number;
    state: OrderState;
    reason: LeaveReason | '';
}

export interface Departure { customerId: string; reason: LeaveReason; orderId: string }

export interface DayReport {
    revenue: number;
    tips: number;
    ingredientCost: number;
    rentDue: number;
    rentPaid: number;
    left: number;
    worst: string;
    wallet: number;
    owingRent: boolean;
    chapterContinues: true;
    favor: Record<string, number>;
}

interface Guest {
    customerId: string;
    orderId: string;
    where: 'door' | 'seat' | 'retry' | 'dining' | 'gone';
    waitLeft: number;
    dineLeft: number;
}

export interface ServiceConfig {
    day: number;
    seed: number;
    pots?: number;
    seats?: number;
    wallet?: number;
    purse?: { amount: number };
    shopLevel?: number;
    atmosphere?: number;
    plan?: DayPlan;
    canCook: (recipeId: string) => boolean;
    emptyHeats?: () => HeatName[];
    ingredientSpend?: () => number;
    holdScoreSeconds?: number;
    initialFavor?: Record<string, number>;
    saved?: ServiceSave;
}

const WAVES: WaveName[] = ['dawn', 'forenoon', 'lunch', 'evening'];

/**
 * 一日客流。不推进火候，也不改钱包。
 * 未送达的客人离开时，钱包保持原值。
 */
export class ServiceDay {
    readonly departures: Departure[] = [];
    readonly favor: Record<string, number> = {};
    report: DayReport | null = null;
    owingRent = false;
    readonly orders: ServiceOrder[] = [];
    readonly planned: number[] = [];
    phase: ShiftPhase = 'prep';
    elapsed = 0;
    soldOut = false;
    prepLeft: number;
    closeLeft = 0;
    private readonly rng: SeededRng;
    private readonly guests: Guest[] = [];
    private readonly clock: FixedClock;
    private readonly pots: number;
    private readonly seats: number;
    private atmosphere: number;
    private readonly plan: DayPlan;
    private readonly rescue: boolean;
    private readonly purse: { amount: number };
    private readonly heldDish = new Map<string, ServedDish>();
    private readonly receipts: Array<{ customerId?: string; recipeId: string; result: string; score: number; pay: number; tip: number; cost: number }> = [];
    private readonly pendingFavor: Array<{ id: string; delta: number }> = [];
    private spawned = 0;
    private serial = 0;

    constructor(private readonly catalog: Catalog, private readonly config: ServiceConfig) {
        const session = catalog.balance.session;
        this.purse = config.purse ?? { amount: config.wallet ?? session.initialWallet };
        this.pots = config.pots ?? session.initialPots;
        this.seats = config.seats ?? session.initialSeats;
        this.atmosphere = config.atmosphere ?? emptyAtmosphere(catalog);
        this.plan = config.plan ?? planForDay(catalog, config.day, config.shopLevel ?? 0);
        this.rescue = config.saved ? config.saved.rescue : this.purse.amount < session.rescueFloor;
        this.prepLeft = config.saved ? config.saved.prepLeft : session.prepSeconds;
        this.clock = new FixedClock(session.fixedStepMs, dt => this.step(dt), session.catchUpSteps);
        this.rng = config.saved ? SeededRng.restore(config.saved.rng) : new SeededRng(config.seed);
        if (config.initialFavor) Object.assign(this.favor, config.initialFavor);
        if (config.saved) this.install(config.saved);
    }

    static restore(catalog: Catalog, saved: ServiceSave, purse: { amount: number }, canCook: (recipeId: string) => boolean, emptyHeats?: () => HeatName[], ingredientSpend?: () => number, holdScoreSeconds = 0, shopLevel = 1): ServiceDay {
        purse.amount = saved.wallet;
        return new ServiceDay(catalog, {
            day: saved.day, seed: saved.seed, pots: saved.pots, seats: saved.seats, atmosphere: saved.atmosphere,
            purse, canCook, emptyHeats, ingredientSpend, holdScoreSeconds, shopLevel, saved,
        });
    }

    capture(): ServiceSave {
        return {
            day: this.config.day, seed: this.config.seed, pots: this.pots, seats: this.seats, atmosphere: this.atmosphere,
            rescue: this.rescue, phase: this.phase, elapsed: this.elapsed, prepLeft: Math.max(0, this.prepLeft), closeLeft: Math.max(0, this.closeLeft),
            soldOut: this.soldOut, spawned: this.spawned, serial: this.serial, rng: this.rng.snapshot(), wallet: this.purse.amount,
            owingRent: this.owingRent,
            orders: this.orders.map(order => ({ ...order, patienceLeft: Math.max(0, order.patienceLeft) })),
            guests: this.guests.map(guest => ({ ...guest, waitLeft: Math.max(0, guest.waitLeft), dineLeft: Math.max(0, guest.dineLeft) })),
            planned: [...this.planned], departures: this.departures.map(item => ({ ...item })), favor: { ...this.favor },
            receipts: this.receipts.map(line => ({ ...line })), pendingFavor: this.pendingFavor.map(item => ({ ...item })),
            held: Array.from(this.heldDish.entries()).map(([orderId, dish]) => ({ orderId, dish: { ...dish } })),
            report: this.report ? { ...this.report, favor: { ...this.report.favor } } : null,
        };
    }

    private install(saved: ServiceSave): void {
        this.phase = saved.phase;
        this.elapsed = saved.elapsed;
        this.prepLeft = saved.prepLeft;
        this.closeLeft = saved.closeLeft;
        this.soldOut = saved.soldOut;
        this.spawned = saved.spawned;
        this.serial = saved.serial;
        this.owingRent = saved.owingRent;
        this.purse.amount = saved.wallet;
        this.orders.splice(0, this.orders.length, ...saved.orders.map(order => ({ ...order })));
        this.guests.splice(0, this.guests.length, ...saved.guests.map(guest => ({ ...guest })));
        this.planned.splice(0, this.planned.length, ...saved.planned);
        this.departures.splice(0, this.departures.length, ...saved.departures.map(item => ({ ...item })));
        for (const id of Object.keys(this.favor)) delete this.favor[id];
        Object.assign(this.favor, saved.favor);
        this.receipts.splice(0, this.receipts.length, ...saved.receipts.map(line => ({ ...line })));
        this.pendingFavor.splice(0, this.pendingFavor.length, ...saved.pendingFavor.map(item => ({ ...item })));
        this.heldDish.clear();
        for (const item of saved.held) this.heldDish.set(item.orderId, { ...item.dish });
        this.report = saved.report ? { ...saved.report, favor: { ...saved.report.favor } } : null;
    }

    get day(): number { return this.config.day; }
    get arrivedCount(): number { return this.spawned; }

    get wallet(): number { return this.purse.amount; }

    get atmosphereValue(): number { return this.atmosphere; }

    /** 当天评分最高的一碗。不含铜钱。 */
    highlightDish(): { name: string; result: string } | null {
        const best = this.receipts.reduce<typeof this.receipts[number] | null>((pick, line) => !pick || line.score > pick.score ? line : pick, null);
        if (!best) return null;
        return { name: this.catalog.recipe(best.recipeId)?.name || best.recipeId, result: cookWord(best.result) };
    }

    setAtmosphere(value: number): void { this.atmosphere = Math.max(0, Math.min(100, value)); }

    storyReady(story: Story): boolean {
        return (this.favor[story.customerId] ?? 0) >= story.minFavor && this.atmosphere >= story.minAtmosphere
            && this.receipts.some(line => line.customerId === story.customerId
                && (!story.requiresRecipe || line.recipeId === story.requiresRecipe)
                && (!story.requiresResult || line.result === story.requiresResult));
    }

    get wave(): WaveName { return waveAt(this.catalog, this.elapsed); }

    get arrivals(): number { return this.spawned; }

    get doorCount(): number { return this.guests.filter(guest => guest.where === 'door').length; }

    get seatedCount(): number { return this.guests.filter(guest => guest.where === 'seat' || guest.where === 'dining').length; }

    orderLimit(): number {
        const demand = this.catalog.balance.demand;
        const extra = Math.max(0, this.pots - 1) * demand.orderSlotsPerExtraPot;
        return Math.min(this.catalog.balance.session.maxOrders, demand.orderSlotsAtOnePot + extra);
    }

    open(): { ok: boolean; message: string } {
        if (this.phase !== 'prep') return { ok: false, message: '正在营业' };
        this.startService();
        return { ok: true, message: '开门' };
    }

    advance(deltaSeconds: number, paused: boolean): void {
        if (paused) { this.clock.reset(); return; }
        this.clock.advance(deltaSeconds);
    }

    assign(orderId: string, potId: string): { ok: boolean; message: string } {
        const order = this.orders.find(item => item.orderId === orderId);
        if (!order || order.state !== 'queued') return { ok: false, message: '这单不能上锅' };
        if (this.orders.some(item => item.potId === potId && (item.state === 'cooking' || item.state === 'ready'))) {
            return { ok: false, message: '这口锅已有单' };
        }
        order.potId = potId;
        order.state = 'cooking';
        return { ok: true, message: `${order.orderId} 上了 ${potId}` };
    }

    offer(potId: string, dish?: ServedDish): boolean {
        const order = this.orders.find(item => item.potId === potId && item.state === 'cooking');
        if (!order) return false;
        if (dish && dish.recipeId !== order.recipeId) return false;
        if (dish) this.heldDish.set(order.orderId, dish);
        order.state = 'ready';
        order.patienceLeft += this.config.holdScoreSeconds ?? 0;
        return true;
    }

    /** 送达先锁评分。铜钱、小费和租金到日结才入账。 */
    deliver(orderId: string): { ok: boolean; message: string } {
        const order = this.orders.find(item => item.orderId === orderId);
        if (!order || order.state !== 'ready') return { ok: false, message: '还不能送达' };
        const guest = this.guests.find(item => item.orderId === orderId && item.where === 'seat');
        const dish = this.heldDish.get(orderId);
        const quoted = dish ? this.lockReceipt(order.customerId, dish) : null;
        order.state = 'served';
        order.reason = 'served';
        if (guest) {
            guest.where = 'dining';
            guest.dineLeft = this.catalog.balance.demand.dineSeconds * (1 + 0.5 * this.atmosphere / 100);
        }
        if (!quoted) return { ok: true, message: '已送达，日结入账' };
        return { ok: true, message: `评分 ${quoted.score}，实收 ${quoted.pay}，小费 ${quoted.tip}，日结入账` };
    }

    /** 打烊入账。可以重复读取，不会重复扣款。 */
    settle(): DayReport {
        if (this.report) return this.report;
        for (const change of this.pendingFavor) this.applyFavor(change.id, change.delta);
        this.pendingFavor.length = 0;
        const revenue = this.receipts.reduce((sum, line) => sum + line.pay, 0);
        const tips = this.receipts.reduce((sum, line) => sum + line.tip, 0);
        const ingredientCost = this.config.ingredientSpend?.() ?? 0;
        this.purse.amount = Math.max(0, this.purse.amount + revenue + tips);
        const session = this.catalog.balance.session;
        const rentDue = this.config.day >= session.rentStartsOnDay ? session.rent : 0;
        let rentPaid = 0;
        if (rentDue > 0) {
            if (this.purse.amount >= rentDue) {
                this.purse.amount -= rentDue;
                rentPaid = rentDue;
                this.owingRent = false;
            } else {
                rentPaid = this.purse.amount;
                this.purse.amount = 0;
                this.owingRent = true;
            }
        }
        const worstLine = this.receipts.reduce<typeof this.receipts[number] | null>((worst, line) => !worst || line.score < worst.score ? line : worst, null);
        const worst = worstLine ? `${this.catalog.recipe(worstLine.recipeId)?.name || worstLine.recipeId} ${cookWord(worstLine.result)} ${worstLine.score}分` : '没有出餐';
        this.report = {
            revenue, tips, ingredientCost, rentDue, rentPaid,
            left: this.departures.filter(item => item.reason !== 'served').length,
            worst, wallet: this.purse.amount, owingRent: this.owingRent,
            chapterContinues: true, favor: { ...this.favor },
        };
        return this.report;
    }

    reportText(): string {
        const report = this.report;
        if (!report) return '还没有日结';
        const debt = report.owingRent ? '欠租，明日只能买 2 种' : '未欠租';
        return [
            `日结 营收${report.revenue} 小费${report.tips} 食材${report.ingredientCost} ${this.rentLine()} 离开${report.left}人`,
            `最差 ${report.worst}`,
            `结余 ${report.wallet} ${debt} 章节继续`,
        ].join('\n');
    }

    /** 租金付清时写明已付。还没到收租日，或没付清，仍写租金。 */
    rentLine(): string {
        const report = this.report;
        if (report && report.rentDue > 0 && !report.owingRent && report.rentPaid === report.rentDue) return `已付租金 ${report.rentPaid}`;
        return `租金 ${report?.rentPaid ?? 0}`;
    }

    private lockReceipt(customerId: string, dish: ServedDish): { score: number; pay: number; tip: number } | null {
        const customer = this.catalog.customer(customerId);
        const recipe = this.catalog.recipe(dish.recipeId);
        if (!customer || !recipe) return null;
        const quote = quoteDish(this.catalog, dish, customer.acceptedTags, this.atmosphere);
        this.receipts.push({ customerId, recipeId: recipe.id, result: dish.result, score: quote.score, pay: quote.pay, tip: quote.tip, cost: recipe.cost });
        if (customer.tracksFavor) {
            const demand = this.catalog.balance.demand;
            const matched = !customer.acceptedTags.length || recipe.tags.some(tag => customer.acceptedTags.includes(tag));
            let delta = dish.result === 'burnt' ? demand.favorFail : dish.result === 'perfect' && matched ? demand.favorMatch : demand.favorServe;
            if (dish.result !== 'burnt' && customer.id === 'C08') delta += Math.round(this.atmosphere / 100 * 2);
            this.pendingFavor.push({ id: customer.id, delta });
        }
        return quote;
    }

    private noteMiss(customerId: string): void {
        const customer = this.catalog.customer(customerId);
        if (!customer?.tracksFavor) return;
        this.pendingFavor.push({ id: customerId, delta: this.catalog.balance.demand.favorFail });
    }

    private applyFavor(id: string, delta: number): void {
        const customer = this.catalog.customer(id);
        if (!customer?.tracksFavor || !delta) return;
        const next = (this.favor[id] ?? 0) + delta;
        this.favor[id] = Math.max(0, Math.min(this.catalog.balance.demand.favorMax, next));
    }

    summary(): string {
        if (this.report) return this.reportText();
        const phase = this.phase === 'prep' ? `备料 ${Math.ceil(this.prepLeft)} 秒` : this.phase === 'service' ? `营业 ${waveWord(this.wave)}` : this.phase === 'close' ? '打烊' : '已打烊';
        const sign = this.soldOut ? ' · 今日售罄' : '';
        const door = `门口 ${this.doorCount}`;
        const lines = this.orders.filter(order => order.state !== 'left').slice(0, 3).map(order => {
            const customer = this.catalog.customer(order.customerId);
            const recipe = this.catalog.recipe(order.recipeId);
            return `${customer?.name || order.customerId} ${recipe?.name || order.recipeId} ${orderWord(order.state)} ${Math.ceil(order.patienceLeft)}秒`;
        });
        return [`${phase}${sign} · ${door}`, ...lines].join('\n');
    }

    private startService(): void {
        this.phase = 'service';
        this.elapsed = 0;
        this.planned.push(...schedule(this.catalog, this.plan));
    }

    private step(dt: number): void {
        this.soldOut = !this.cookable().length;
        if (this.phase === 'prep') {
            this.prepLeft = Math.max(0, this.prepLeft - dt);
            if (this.prepLeft <= 0.000001) this.startService();
            return;
        }
        if (this.phase === 'service') {
            this.elapsed += dt;
            this.spawn();
            this.tickGuests(dt, 1);
            if (this.elapsed + 0.000001 >= this.catalog.balance.session.shiftSeconds) this.startClose();
            return;
        }
        if (this.phase === 'close') {
            this.closeLeft = Math.max(0, this.closeLeft - dt);
            this.tickGuests(dt, this.catalog.balance.demand.closePatienceScale);
            if (this.closeLeft <= 0.000001) this.finishClose();
        }
    }

    private startClose(): void {
        this.phase = 'close';
        this.closeLeft = this.catalog.balance.session.closeSeconds;
    }

    private finishClose(): void {
        for (const order of this.orders) {
            if (order.state === 'queued' || order.state === 'cooking' || order.state === 'ready') this.leaveOrder(order, 'closed');
        }
        for (const guest of this.guests) {
            if (guest.where === 'dining') this.leaveGuest(guest, 'served');
            else if (guest.where !== 'gone') this.leaveGuest(guest, 'closed');
        }
        this.phase = 'closed';
        this.settle();
    }

    private spawn(): void {
        const cutoff = this.catalog.balance.session.arrivalCutoffSeconds;
        while (this.spawned < this.planned.length && this.planned[this.spawned] <= this.elapsed && this.planned[this.spawned] < cutoff) {
            this.spawned += 1;
            this.arrive(this.spawned === 1 && this.rescue);
        }
    }

    private arrive(rescue: boolean): void {
        if (!this.cookable().length) {
            this.departures.push({ customerId: rescue ? 'C02' : '', reason: 'sold-out', orderId: '' });
            return;
        }
        const customer = rescue ? this.catalog.customer('C02') : this.pickCustomer();
        if (!customer) return;
        if (!rescue && customer.id === 'C07' && this.atmosphere < this.catalog.atmosphere.criticRejectAtmosphere && this.rng.next() < this.catalog.atmosphere.criticRejectChance) {
            this.departures.push({ customerId: customer.id, reason: 'rejected', orderId: '' });
            return;
        }
        this.consider(customer, rescue);
    }

    private consider(customer: Customer, rescue: boolean): void {
        if (this.activeOrders() >= this.orderLimit()) {
            this.guests.push({ customerId: customer.id, orderId: '', where: 'retry', waitLeft: this.catalog.balance.session.busyRetrySeconds, dineLeft: 0 });
            return;
        }
        if (this.seatedCount >= this.seats) {
            if (this.doorCount >= this.catalog.balance.demand.doorQueue) {
                this.departures.push({ customerId: customer.id, reason: 'no-seat', orderId: '' });
                return;
            }
            this.guests.push({ customerId: customer.id, orderId: '', where: 'door', waitLeft: this.catalog.balance.session.doorWaitSeconds, dineLeft: 0 });
            return;
        }
        this.seat(customer, rescue);
    }

    private seat(customer: Customer, rescue: boolean): void {
        const recipe = rescue ? this.catalog.recipe('R01') : this.chooseRecipe(customer);
        if (!recipe || !this.config.canCook(recipe.id)) {
            this.departures.push({ customerId: customer.id, reason: 'sold-out', orderId: '' });
            return;
        }
        this.serial += 1;
        const patience = patienceSeconds(this.catalog, recipe, customer);
        const order: ServiceOrder = {
            orderId: `O${this.serial}`, customerId: customer.id, recipeId: recipe.id, potId: '',
            patience, patienceLeft: patience, state: 'queued', reason: '',
        };
        this.orders.push(order);
        this.guests.push({ customerId: customer.id, orderId: order.orderId, where: 'seat', waitLeft: 0, dineLeft: 0 });
    }

    private tickGuests(dt: number, patienceScale: number): void {
        for (const order of this.orders) {
            if (order.state !== 'queued' && order.state !== 'cooking' && order.state !== 'ready') continue;
            order.patienceLeft = Math.max(0, order.patienceLeft - dt * patienceScale);
            if (order.patienceLeft <= 0.000001) this.leaveOrder(order, 'impatient');
        }
        for (const guest of this.guests) {
            if (guest.where === 'door' || guest.where === 'retry') {
                guest.waitLeft = Math.max(0, guest.waitLeft - dt);
                if (guest.waitLeft <= 0.000001) this.releaseWait(guest);
            } else if (guest.where === 'dining') {
                guest.dineLeft = Math.max(0, guest.dineLeft - dt);
                if (guest.dineLeft <= 0.000001) this.leaveGuest(guest, 'served');
            }
        }
        this.pullDoor();
    }

    private releaseWait(guest: Guest): void {
        const customer = this.catalog.customer(guest.customerId);
        const retry = guest.where === 'retry';
        guest.where = 'gone';
        if (!customer) return;
        if (!this.cookable().length) {
            this.departures.push({ customerId: customer.id, reason: 'sold-out', orderId: '' });
            return;
        }
        if (this.activeOrders() >= this.orderLimit()) {
            this.departures.push({ customerId: customer.id, reason: 'busy', orderId: '' });
            return;
        }
        if (this.seatedCount >= this.seats) {
            if (retry && this.doorCount < this.catalog.balance.demand.doorQueue) {
                this.guests.push({ customerId: customer.id, orderId: '', where: 'door', waitLeft: this.catalog.balance.session.doorWaitSeconds, dineLeft: 0 });
                return;
            }
            this.departures.push({ customerId: customer.id, reason: 'no-seat', orderId: '' });
            return;
        }
        this.seat(customer, false);
    }

    private pullDoor(): void {
        if (this.phase !== 'service') return;
        const waiting = this.guests.filter(guest => guest.where === 'door');
        for (const guest of waiting) {
            if (this.seatedCount >= this.seats || this.activeOrders() >= this.orderLimit() || !this.cookable().length) return;
            const customer = this.catalog.customer(guest.customerId);
            guest.where = 'gone';
            if (customer) this.seat(customer, false);
        }
    }

    private leaveOrder(order: ServiceOrder, reason: LeaveReason): void {
        if (order.state === 'left' || order.state === 'served') return;
        order.state = 'left';
        order.reason = reason;
        this.noteMiss(order.customerId);
        const guest = this.guests.find(item => item.orderId === order.orderId && item.where === 'seat');
        if (guest) this.leaveGuest(guest, reason);
        else this.departures.push({ customerId: order.customerId, reason, orderId: order.orderId });
    }

    private leaveGuest(guest: Guest, reason: LeaveReason): void {
        if (guest.where === 'gone') return;
        guest.where = 'gone';
        this.departures.push({ customerId: guest.customerId, reason, orderId: guest.orderId });
        this.pullDoor();
    }

    private activeOrders(): number {
        return this.orders.filter(order => order.state === 'queued' || order.state === 'cooking' || order.state === 'ready').length;
    }

    private cookable(): Recipe[] {
        return this.catalog.recipes.filter(recipe => recipe.unlockDay <= this.config.day && this.config.canCook(recipe.id));
    }

    private pickCustomer(): Customer | undefined {
        const pool = this.catalog.customers.filter(customer => customer.unlockDay <= this.config.day);
        if (!pool.length) return undefined;
        return pool[this.rng.index(pool.length)];
    }

    private chooseRecipe(customer: Customer): Recipe | undefined {
        const all = this.cookable();
        const matched = customer.acceptedTags.length ? all.filter(recipe => recipe.tags.some(tag => customer.acceptedTags.includes(tag))) : all;
        const pool = matched.length ? matched : all;
        const demand = this.catalog.balance.demand;
        const budget = demand.budgetBase + Math.max(0, this.config.day - 1) * demand.budgetPerCompletedDay;
        const heats = this.config.emptyHeats?.() ?? [];
        const ranked = [...pool].sort((left, right) => {
            if (customer.qualityCare > 0.5) {
                const heat = Number(heats.includes(right.heatHint)) - Number(heats.includes(left.heatHint));
                if (heat) return heat;
            }
            return this.rank(right, customer, budget) - this.rank(left, customer, budget) || left.price - right.price || left.id.localeCompare(right.id);
        });
        return ranked[0];
    }

    private rank(recipe: Recipe, customer: Customer, budget: number): number {
        const demand = this.catalog.balance.demand;
        const matched = !customer.acceptedTags.length || recipe.tags.some(tag => customer.acceptedTags.includes(tag));
        const over = recipe.price > budget ? Math.floor((recipe.price - budget) / demand.budgetStep) : 0;
        return (matched ? demand.tagMatch : 0) - over;
    }
}

export function waveWord(wave: WaveName): string {
    if (wave === 'dawn') return '清晨';
    if (wave === 'forenoon') return '午前';
    if (wave === 'lunch') return '午市';
    return '傍晚';
}

function cookWord(result: string): string {
    if (result === 'perfect') return '刚好';
    if (result === 'raw') return '夹生';
    if (result === 'over') return '过火';
    if (result === 'burnt') return '糊底';
    return result;
}

function orderWord(state: OrderState): string {
    if (state === 'queued') return '排队';
    if (state === 'cooking') return '熬煮中';
    if (state === 'ready') return '可送达';
    if (state === 'served') return '已送达';
    return '已离开';
}

function waveAt(catalog: Catalog, elapsed: number): WaveName {
    const index = Math.min(WAVES.length - 1, Math.max(0, Math.floor(elapsed / catalog.balance.demand.waveSeconds)));
    return WAVES[index];
}

function intervalOf(catalog: Catalog, day: number, wave: WaveName, base: number): number {
    const demand = catalog.balance.demand;
    const raw = wave === 'lunch' ? base / demand.lunchIntervalDivisor : base;
    return day >= 8 ? Math.max(demand.minArrivalIntervalSeconds, raw) : raw;
}

function schedule(catalog: Catalog, plan: DayPlan): number[] {
    const cutoff = catalog.balance.session.arrivalCutoffSeconds;
    const times: number[] = [];
    let time = 0;
    while (times.length < plan.scheduledArrivals && time < cutoff) {
        times.push(time);
        time += plan.day >= 8 ? Math.min(plan.arrivalIntervalSeconds, (cutoff - 1) / plan.scheduledArrivals) :
            intervalOf(catalog, plan.day, waveAt(catalog, time), plan.arrivalIntervalSeconds);
    }
    return times;
}

export function atmosphereWords(value: number): string {
    if (value < 30) return '今天铺子有点冷清';
    if (value < 60) return '有人愿意把粥喝完';
    return '有人坐下来又点了一碗';
}

export function chapterCloseLine(day: number): string {
    if (day === 7) return '七日篇收束。明日起按铺面等级来客，章节继续。';
    if (day > 0 && day % 7 === 0) return `第${day / 7}周收束。明日继续经营。`;
    return '';
}

/** 分享卡正文。只有店名、完成日、一碗粥和氛围人话。 */
export function shareCardText(card: { day: number; dish: string; result: string; atmosphere: string; close: string }): string {
    return ['粥霸天', `第${card.day}日`, `${card.dish} · ${card.result}`, card.atmosphere, card.close].filter(line => line).join('\n');
}

export function planForDay(catalog: Catalog, day: number, shopLevel = 0): DayPlan {
    if (day >= 1 && day <= catalog.days.length) {
        const plan = catalog.days[day - 1];
        return day < 8 ? plan : {
            ...plan,
            scheduledArrivals: Math.min(catalog.balance.demand.maxArrivals, plan.scheduledArrivals + Math.max(0, shopLevel - 1)),
        };
    }
    const last = catalog.days[catalog.days.length - 1];
    const demand = catalog.balance.demand;
    const extraDays = day - last.day;
    return {
        day,
        arrivalIntervalSeconds: Math.max(20, last.arrivalIntervalSeconds - Math.floor(extraDays / 2) + extraDays % 3),
        scheduledArrivals: Math.min(demand.maxArrivals, last.scheduledArrivals + Math.floor(extraDays / 2) + Math.max(0, shopLevel)),
    };
}

function emptyAtmosphere(catalog: Catalog): number {
    const tone = catalog.atmosphere;
    const raw = tone.base.warmth * tone.weights.warmth + tone.base.clean * tone.weights.clean + tone.base.aroma * tone.weights.aroma + tone.base.light * tone.weights.light + tone.base.crowd * tone.weights.crowd;
    return Math.min(100, Math.max(0, raw));
}
