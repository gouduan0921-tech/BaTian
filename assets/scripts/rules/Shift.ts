import { skillTierUp } from './Skill';
import { baseIngredients, Customer, GameConfig, Heat, Recipe, Season, Seasoning, WaveId, waveAt } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';
import { Arrival, CRITIC_ID } from './Arrivals';
import { AtmoReading, DecorPlacement, readAtmosphere, tPrime } from './Atmosphere';
import { FreshTier, Pantry } from './Pantry';
import {
    addAudit, canAdd, CookResult, emptyPot, PotEvent, PotState, resultOf, startPot, stepPot, stirPot,
} from './Pot';
import { BowlQuality, coolingPenalty, lookBonus, patienceFor, scoreParts, seasoningMatches, settle } from './Scoring';

/**
 * 一个营业日的全部规则状态（文档 02、07、08）。
 * ShiftState 是纯 JSON，可整体写入存档；Shift 类只负责推进与响应玩家指令。
 */

export type ShiftPhase = 'prep' | 'service' | 'closing' | 'done';
export type LeaveReason = 'served' | 'impatient' | 'no-seat' | 'busy' | 'sold-out' | 'rejected' | 'closed';
export type ActionKind = 'stir' | 'prep' | 'plate' | 'deliver' | 'wipe';

export interface ShiftSetup {
    day: number;
    completedDays: number;
    pots: number;
    seats: number;
    prepSlots: number;
    holdBonus: number;
    placement: DecorPlacement;
    tableware: string;
    /** 当日可做（已解锁）的粥谱 */
    recipes: string[];
    /** 熟练度快照，决定警告线与加料容差 */
    proficiency: Record<string, number>;
    practice: boolean;
    weightShift?: Record<string, number>;
    /** 当日小目标（旧存档没有此项） */
    goals?: import('./Goals').Goal[];
    /** 当天所在章的季节；在季的时令粥更受欢迎（文档 30 §2.2） */
    season?: Season | null;
}

export interface Guest {
    id: string;
    customerId: string;
    wave: WaveId;
    state: 'door' | 'seated' | 'left';
    seat: number;
    doorLeft: number;
    orderId: string | null;
    dineLeft: number;
    served: boolean;
    reordered: boolean;
    onlyRecipe?: string;
    /** 街坊请托约好的客人（文档 30 §3） */
    request?: boolean;
    reason?: LeaveReason;
}

export interface Order {
    id: string;
    guestId: string;
    recipeId: string;
    patienceLeft: number;
    patienceMax: number;
    state: 'waiting' | 'served' | 'left';
    reorder: boolean;
}

export interface Bowl {
    id: string;
    recipeId: string;
    quality: BowlQuality;
    held: number;
}

export interface PrepJob { ingredientId: string; uid: number; left: number; total: number; kind: string }

export interface PlayerAction {
    kind: ActionKind;
    left: number;
    total: number;
    pot?: number;
    slot?: number;
    bowlId?: string;
    orderId?: string;
    seat?: number;
}

export interface ShiftLedger {
    revenue: number;
    tips: number;
    served: number;
    reasons: Record<string, number>;
    best: { recipeId: string; score: number; result?: CookResult } | null;
    worst: { recipeId: string; score: number } | null;
}

export interface ShiftState {
    setup: ShiftSetup;
    phase: ShiftPhase;
    t: number;
    pots: PotState[];
    focus: number;
    prep: Array<PrepJob | null>;
    action: PlayerAction | null;
    pass: Bowl[];
    seats: Array<string | null>;
    dirty: boolean[];
    dirtyClean: number;
    dirtyTimer: number;
    queue: string[];
    guests: Record<string, Guest>;
    orders: Order[];
    arrivals: Arrival[];
    nextArrival: number;
    receptionPaused: boolean;
    nextId: number;
    ledger: ShiftLedger;
    favorGain: Record<string, number>;
    favorDelta: Record<string, number>;
    served: Record<string, number>;
    todayKeys: string[];
    skillDelta: Record<string, number>;
    perfectRecipes: string[];
    seenCustomers: string[];
    /** 今天已送到约好熟客手里的请托碗数（旧存档没有此项） */
    requestServed?: number;
    atmoSum: number;
    atmoCount: number;
    atmoTimer: number;
}

export type ShiftEvent =
    | PotEvent
    | { type: 'phase'; phase: ShiftPhase }
    | { type: 'guest:arrive'; guest: string }
    | { type: 'guest:sit'; guest: string }
    | { type: 'guest:leave'; guest: string; reason: LeaveReason }
    | { type: 'order:new'; order: string }
    | { type: 'bowl:ready'; bowl: string; result: CookResult }
    | { type: 'delivered'; order: string; revenue: number; tip: number; score: number; result: CookResult }
    | { type: 'stir'; pot: number }
    | { type: 'prep:done'; ingredientId: string }
    | { type: 'wiped'; seat: number }
    | { type: 'skill:up'; recipe: string; tier: number }
    | { type: 'request:served'; recipe: string; served: number }
    | { type: 'reject'; reason: string };

export function newShiftState(config: GameConfig, setup: ShiftSetup, arrivals: Arrival[]): ShiftState {
    return {
        setup, phase: setup.practice ? 'service' : 'prep', t: 0,
        pots: Array.from({ length: setup.pots }, (_, i) => emptyPot(i)), focus: 0,
        prep: Array.from({ length: setup.prepSlots }, () => null), action: null, pass: [],
        seats: Array.from({ length: setup.seats }, () => null), dirty: Array.from({ length: setup.seats }, () => false),
        dirtyClean: 0, dirtyTimer: 0, queue: [], guests: {}, orders: [], arrivals, nextArrival: 0, receptionPaused: false,
        nextId: 1,
        ledger: { revenue: 0, tips: 0, served: 0, reasons: {}, best: null, worst: null },
        favorGain: {}, favorDelta: {}, served: {}, todayKeys: [], skillDelta: {}, perfectRecipes: [], seenCustomers: [],
        atmoSum: 0, atmoCount: 0, atmoTimer: 0,
    };
}

export class Shift {
    readonly events: ShiftEvent[] = [];
    private atmo: AtmoReading;

    constructor(readonly config: GameConfig, readonly state: ShiftState, readonly pantry: Pantry, readonly rng: SeededRng) {
        this.atmo = this.readAtmo();
    }

    get bal() { return this.config.balance; }
    get atmosphere(): AtmoReading { return this.atmo; }
    get phase(): ShiftPhase { return this.state.phase; }

    /** 当前阶段剩余秒。 */
    get phaseLeft(): number {
        const s = this.bal.session;
        const total = this.state.phase === 'prep' ? s.prepSeconds : this.state.phase === 'service' ? s.shiftSeconds : this.state.phase === 'closing' ? s.closeSeconds : 0;
        return Math.max(0, total - this.state.t);
    }

    get wave(): WaveId { return waveAt(this.bal, this.state.phase === 'service' ? this.state.t : this.bal.session.arrivalCutoffSeconds).id; }

    get orderCap(): number {
        const d = this.bal.demand;
        return Math.min(d.ordersMax, d.ordersBase + d.ordersPerPot * this.state.setup.pots);
    }

    get waitingOrders(): Order[] { return this.state.orders.filter(o => o.state === 'waiting'); }

    recipe(id: string | null): Recipe | null { return id ? this.config.recipe.get(id) ?? null : null; }

    skillPoints(recipeId: string): number {
        return (this.state.setup.proficiency[recipeId] ?? 0) + (this.state.skillDelta[recipeId] ?? 0);
    }

    warnLine(recipeId: string | null): number {
        let warn = this.bal.stir.warn;
        if (!recipeId) return warn;
        const p = this.skillPoints(recipeId);
        for (const tier of this.bal.skill.tiers) if (p >= tier.min && tier.warn !== undefined) warn = tier.warn;
        return warn;
    }

    addTolerance(recipeId: string): number {
        let tol = this.bal.score.addWindow;
        const p = this.skillPoints(recipeId);
        for (const tier of this.bal.skill.tiers) if (p >= tier.min && tier.addWindow !== undefined) tol = tier.addWindow;
        return tol;
    }

    private id(prefix: string): string { return `${prefix}${this.state.nextId++}`; }

    // ───────────────────────── 推进 ─────────────────────────

    step(dt: number): void {
        const st = this.state;
        if (st.phase === 'done') return;
        st.t += dt;
        this.stepAction(dt);
        this.stepPrep(dt);
        const potEvents: PotEvent[] = [];
        for (const pot of st.pots) {
            stepPot(pot, this.recipe(pot.recipeId), this.bal, dt, pot.index === st.focus, this.warnLine(pot.recipeId), potEvents);
        }
        this.events.push(...potEvents);
        for (const b of st.pass) b.held += dt;
        if (!st.setup.practice) {
            if (st.phase === 'service' || st.phase === 'closing') this.pantry.age(dt / this.bal.session.gameHourSeconds);
            if (st.phase === 'service') this.stepArrivals();
            this.stepDoor(dt);
            this.stepGuests(dt);
            this.stepClean(dt);
        }
        this.atmo = this.readAtmo();
        if (st.phase === 'service' && !st.setup.practice) {
            st.atmoTimer += dt;
            if (st.atmoTimer >= this.config.atmosphere.sampleSeconds) {
                st.atmoTimer -= this.config.atmosphere.sampleSeconds;
                st.atmoSum += this.atmo.total;
                st.atmoCount++;
            }
        }
        this.stepPhase();
    }

    private stepPhase(): void {
        const st = this.state;
        const s = this.bal.session;
        if (st.setup.practice) return;
        if (st.phase === 'prep' && st.t >= s.prepSeconds) this.open();
        else if (st.phase === 'service' && st.t >= s.shiftSeconds) this.setPhase('closing');
        else if (st.phase === 'closing' && st.t >= s.closeSeconds) this.finish();
    }

    private setPhase(phase: ShiftPhase): void {
        this.state.phase = phase;
        this.state.t = 0;
        this.events.push({ type: 'phase', phase });
        if (phase === 'closing') {
            // 门口还在等的人不再入座
            for (const gid of [...this.state.queue]) this.leave(this.state.guests[gid], 'closed');
            this.state.queue = [];
        }
    }

    /** 提前开门。 */
    open(): void {
        if (this.state.phase !== 'prep') return;
        this.setPhase('service');
    }

    /** 提前结束打烊收尾，或收尾时间到。 */
    finish(): void {
        const st = this.state;
        if (st.phase === 'done') return;
        if (st.phase === 'prep') { this.setPhase('service'); }
        for (const o of st.orders) if (o.state === 'waiting') {
            o.state = 'left';
            const g = st.guests[o.guestId];
            if (g && g.state !== 'left') this.leave(g, o.reorder ? 'impatient' : 'closed');
        }
        for (const g of Object.values(st.guests)) if (g.state !== 'left') this.leave(g, g.served ? 'served' : 'closed');
        st.phase = 'done';
        this.events.push({ type: 'phase', phase: 'done' });
    }

    /** 提前打烊（营业中不允许，收尾中允许）。 */
    endClosing(): void { if (this.state.phase === 'closing') this.finish(); }

    private stepAction(dt: number): void {
        const a = this.state.action;
        if (!a) return;
        a.left -= dt;
        if (a.left > 1e-9) return;
        this.state.action = null;
        switch (a.kind) {
            case 'stir': {
                const pot = this.state.pots[a.pot!];
                if (pot && stirPot(pot, this.bal)) this.events.push({ type: 'stir', pot: pot.index });
                break;
            }
            case 'prep': {
                const job = this.state.prep[a.slot!];
                if (job) this.completePrep(a.slot!);
                break;
            }
            case 'plate': this.completePlate(a.pot!); break;
            case 'deliver': this.completeDeliver(a.bowlId!, a.orderId!); break;
            case 'wipe':
                this.state.dirty[a.seat!] = false;
                this.events.push({ type: 'wiped', seat: a.seat! });
                break;
        }
    }

    private stepPrep(dt: number): void {
        this.state.prep.forEach((job, slot) => {
            if (!job || job.kind !== 'soak') return;
            job.left -= dt;
            if (job.left <= 1e-9) this.completePrep(slot);
        });
    }

    private completePrep(slot: number): void {
        const job = this.state.prep[slot];
        if (!job) return;
        this.pantry.finishPrep(job.uid);
        this.state.prep[slot] = null;
        this.events.push({ type: 'prep:done', ingredientId: job.ingredientId });
    }

    private stepArrivals(): void {
        const st = this.state;
        while (st.nextArrival < st.arrivals.length && st.arrivals[st.nextArrival].time <= st.t
            && st.t <= this.bal.session.arrivalCutoffSeconds) {
            const a = st.arrivals[st.nextArrival++];
            const g: Guest = {
                id: this.id('G'), customerId: a.customerId, wave: a.wave, state: 'door', seat: -1,
                doorLeft: this.bal.demand.doorWaitSeconds, orderId: null, dineLeft: 0, served: false, reordered: false,
                onlyRecipe: a.onlyRecipe,
                ...(a.request ? { request: true } : {}),
            };
            st.guests[g.id] = g;
            if (!st.seenCustomers.includes(g.customerId)) st.seenCustomers.push(g.customerId);
            this.events.push({ type: 'guest:arrive', guest: g.id });
            if (!this.chooseRecipe(g)) { this.leave(g, 'sold-out'); continue; }
            if (st.queue.length >= this.bal.demand.doorQueue && !this.canSeat()) {
                this.leave(g, this.freeSeat() < 0 ? 'no-seat' : 'busy');
                continue;
            }
            st.queue.push(g.id);
        }
    }

    /** 空座：优先干净的桌；没擦的桌也能坐，但会一直拉低整洁。 */
    private freeSeat(): number {
        const clean = this.state.seats.findIndex((s, i) => s === null && !this.state.dirty[i]);
        return clean >= 0 ? clean : this.state.seats.findIndex(s => s === null);
    }
    private canSeat(): boolean { return this.freeSeat() >= 0 && this.waitingOrders.length < this.orderCap; }

    private stepDoor(dt: number): void {
        const st = this.state;
        if (st.phase !== 'service') return;
        while (st.queue.length && !st.receptionPaused && this.canSeat()) {
            const g = st.guests[st.queue.shift()!];
            this.seat(g);
        }
        if (st.receptionPaused) return;
        for (const gid of [...st.queue]) {
            const g = st.guests[gid];
            g.doorLeft -= dt;
            if (g.doorLeft <= 0) {
                st.queue = st.queue.filter(x => x !== gid);
                this.leave(g, this.freeSeat() < 0 ? 'no-seat' : 'busy');
            }
        }
    }

    private seat(g: Guest): void {
        const st = this.state;
        const seat = this.freeSeat();
        g.state = 'seated';
        g.seat = seat;
        st.seats[seat] = g.id;
        this.events.push({ type: 'guest:sit', guest: g.id });
        this.atmo = this.readAtmo();
        const a = this.config.atmosphere;
        if (g.customerId === CRITIC_ID && this.atmo.total < a.criticRejectBelow && this.rng.chance(a.criticRejectChance)) {
            this.leave(g, 'rejected');
            return;
        }
        const recipe = this.chooseRecipe(g);
        if (!recipe) { this.leave(g, 'sold-out'); return; }
        this.placeOrder(g, recipe, false);
    }

    private placeOrder(g: Guest, recipe: Recipe, reorder: boolean): void {
        const c = this.config.customer.get(g.customerId)!;
        // 约好的熟客多等一会儿（文档 30 §3）
        const patience = patienceFor(this.bal, recipe, c) * (g.request ? this.bal.requests.patienceMul : 1);
        const o: Order = { id: this.id('O'), guestId: g.id, recipeId: recipe.id, patienceLeft: patience, patienceMax: patience, state: 'waiting', reorder };
        this.state.orders.push(o);
        g.orderId = o.id;
        this.events.push({ type: 'order:new', order: o.id });
    }

    /** 顾客能点的粥：已解锁、底料有库存。 */
    orderable(): Recipe[] {
        return this.state.setup.recipes
            .map(id => this.config.recipe.get(id)!)
            .filter(r => r && baseIngredients(r).every(i => this.pantry.total(i.id) >= i.count));
    }

    private chooseRecipe(g: Guest): Recipe | null {
        let cands = this.orderable();
        if (!cands.length) return null;
        if (g.onlyRecipe) {
            const only = cands.find(r => r.id === g.onlyRecipe);
            if (only) return only;
        }
        const c = this.config.customer.get(g.customerId)!;
        const d = this.bal.demand;
        // 在季的时令粥和合口味的粥一样会被优先考虑（文档 30 §2.2）
        const season = this.state.setup.season ?? null;
        const inSeason = (r: Recipe) => !!r.season && r.season === season;
        const tagged = cands.filter(r => matchesTaste(c, r) || inSeason(r));
        if (tagged.length) cands = tagged;
        const budget = d.budgetBase + d.budgetPerCompletedDay * this.state.setup.completedDays;
        let best: Recipe | null = null;
        let bestScore = -Infinity;
        for (const r of cands) {
            const s = (matchesTaste(c, r) && c.acceptedTags.length ? d.tagMatch : 0) + (inSeason(r) ? d.seasonalBonus : 0)
                - d.pricePenalty * c.priceCare * Math.max(0, r.price - budget) / d.budgetStep
                + this.rng.next();
            if (s > bestScore) { bestScore = s; best = r; }
        }
        return best;
    }

    private stepGuests(dt: number): void {
        const st = this.state;
        const scale = st.phase === 'closing' ? this.bal.demand.closePatienceScale : 1;
        for (const o of st.orders) {
            if (o.state !== 'waiting') continue;
            if (st.receptionPaused) continue;
            o.patienceLeft -= dt * scale;
            if (o.patienceLeft <= 0) {
                o.state = 'left';
                const g = st.guests[o.guestId];
                if (!o.reorder) this.favor(g.customerId, this.bal.favor.fail);
                this.leave(g, 'impatient');
            }
        }
        for (const g of Object.values(st.guests)) {
            if (g.state !== 'seated' || !g.served) continue;
            const order = st.orders.find(o => o.id === g.orderId);
            if (order && order.state === 'waiting') continue;
            g.dineLeft -= dt;
            if (g.dineLeft > 0) continue;
            if (!g.reordered && this.tryReorder(g)) continue;
            this.leave(g, 'served');
        }
    }

    private tryReorder(g: Guest): boolean {
        const a = this.config.atmosphere;
        g.reordered = true;
        if (this.state.phase !== 'service' || this.atmo.total < a.reorderAtLeast) return false;
        if (!a.reorderCustomers.includes(g.customerId)) return false;
        if (this.waitingOrders.length >= this.orderCap) return false;
        if (!this.rng.chance(a.reorderChance)) return false;
        const cheapest = this.orderable().sort((x, y) => x.price - y.price)[0];
        if (!cheapest) return false;
        this.placeOrder(g, cheapest, true);
        return true;
    }

    private leave(g: Guest, reason: LeaveReason): void {
        const st = this.state;
        if (!g || g.state === 'left') return;
        if (g.seat >= 0) {
            st.seats[g.seat] = null;
            if (g.served) st.dirty[g.seat] = true;
        }
        st.queue = st.queue.filter(x => x !== g.id);
        g.state = 'left';
        g.reason = reason;
        st.ledger.reasons[reason] = (st.ledger.reasons[reason] ?? 0) + 1;
        this.events.push({ type: 'guest:leave', guest: g.id, reason });
    }

    private stepClean(dt: number): void {
        const st = this.state;
        const dirty = st.dirty.filter(Boolean).length;
        const a = this.config.atmosphere;
        if (dirty > st.setup.seats / 2) {
            st.dirtyTimer += dt;
            while (st.dirtyTimer >= a.dirtyBowlInterval) {
                st.dirtyTimer -= a.dirtyBowlInterval;
                st.dirtyClean += a.dirtyBowlClean;
            }
        } else {
            st.dirtyTimer = 0;
            st.dirtyClean = 0;
        }
    }

    private readAtmo(): AtmoReading {
        const st = this.state;
        const cooking = st.pots.filter(p => p.phase === 'cooking' || p.phase === 'window' || p.phase === 'over').length;
        const burnt = st.pots.filter(p => p.phase === 'burnt').length;
        const seated = st.seats.filter(Boolean).length;
        return readAtmosphere(this.config, st.setup.placement, { cookingPots: cooking, burntPots: burnt, dirtyClean: st.dirtyClean, seated, seats: st.setup.seats }, st.setup.weightShift);
    }

    private favor(customerId: string, delta: number): void {
        const c = this.config.customer.get(customerId);
        if (!c || !c.tracksFavor || delta === 0) return;
        const st = this.state;
        if (delta > 0) {
            const gained = st.favorGain[customerId] ?? 0;
            const room = Math.max(0, this.bal.favor.dailyGainCap - gained);
            delta = Math.min(delta, room);
            if (delta <= 0) return;
            st.favorGain[customerId] = gained + delta;
        }
        st.favorDelta[customerId] = (st.favorDelta[customerId] ?? 0) + delta;
    }

    // ───────────────────────── 玩家指令 ─────────────────────────
    // 返回 null 表示成功，返回字符串为拒绝原因（界面直接显示）。

    get busy(): boolean { return !!this.state.action; }

    private reject(reason: string): string {
        this.events.push({ type: 'reject', reason });
        return reason;
    }

    private needService(): string | null {
        if (this.state.phase === 'service' || this.state.phase === 'closing') return null;
        return this.state.phase === 'prep' ? '还没开门' : '今天已经打烊';
    }

    setFocus(index: number): void {
        if (index >= 0 && index < this.state.pots.length) this.state.focus = index;
    }

    setHeat(index: number, heat: Heat): string | null {
        const pot = this.state.pots[index];
        if (!pot) return this.reject('没有这口锅');
        pot.heat = heat;
        return null;
    }

    setReceptionPaused(paused: boolean): void { this.state.receptionPaused = paused; }

    /** 下锅：底料必须已预处理，下锅时扣除。 */
    startCooking(index: number, recipeId: string, heat?: Heat): string | null {
        const bad = this.needService();
        if (bad) return this.reject(bad);
        const pot = this.state.pots[index];
        const recipe = this.recipe(recipeId);
        if (!pot || !recipe) return this.reject('没有这口锅或这道粥');
        if (pot.phase !== 'empty') return this.reject('这口锅还没空');
        if (!this.state.setup.recipes.includes(recipeId)) return this.reject('这道粥还没解锁');
        const base = baseIngredients(recipe);
        if (!this.state.setup.practice) {
            for (const b of base) {
                if (this.pantry.usable(b.id) < b.count) {
                    const name = this.config.ingredient.get(b.id)!.name;
                    return this.reject(this.pantry.total(b.id) >= b.count ? `${name}还没处理` : `缺${name}`);
                }
            }
        }
        let worst: FreshTier = 0;
        if (!this.state.setup.practice) {
            for (const b of base) for (let i = 0; i < b.count; i++) worst = Math.max(worst, this.pantry.consume(b.id) ?? 0) as FreshTier;
        }
        startPot(pot, recipe, heat ?? recipe.heatHint, worst);
        return null;
    }

    addIngredient(index: number, ingredientId: string): string | null {
        const pot = this.state.pots[index];
        const recipe = this.recipe(pot?.recipeId ?? null);
        if (!pot || !recipe || !canAdd(pot, recipe, ingredientId)) return this.reject('现在不能加这个');
        let tier: FreshTier = 0;
        if (!this.state.setup.practice) {
            if (this.pantry.usable(ingredientId) < 1) {
                const name = this.config.ingredient.get(ingredientId)!.name;
                return this.reject(this.pantry.total(ingredientId) > 0 ? `${name}还没处理` : `缺${name}`);
            }
            tier = this.pantry.consume(ingredientId) ?? 0;
        }
        pot.added.push({ id: ingredientId, at: pot.doneness });
        pot.addFresh = Math.max(pot.addFresh, tier);
        return null;
    }

    season(index: number, s: Seasoning): string | null {
        const pot = this.state.pots[index];
        if (!pot || (pot.phase !== 'window' && pot.phase !== 'over')) return this.reject('汤色到了再调味');
        if (pot.seasoning) return this.reject('已经调过味了');
        pot.seasoning = s;
        return null;
    }

    stir(index: number): string | null {
        const pot = this.state.pots[index];
        if (!pot || pot.phase === 'empty' || pot.phase === 'washing' || pot.phase === 'burnt') return this.reject('这口锅不用搅');
        if (this.busy) return this.reject('手上正忙');
        this.state.action = { kind: 'stir', left: this.bal.actions.stirWindup, total: this.bal.actions.stirWindup, pot: index };
        return null;
    }

    /** 预处理一份。洗、切占用玩家；浸泡只占备料位。 */
    prepIngredient(ingredientId: string): string | null {
        if (this.state.phase === 'done') return this.reject('今天已经打烊');
        const ing = this.config.ingredient.get(ingredientId);
        if (!ing || ing.prep === 'none') return this.reject('这样东西不用处理');
        const slot = this.state.prep.findIndex(x => x === null);
        if (slot < 0) return this.reject('备料台满了');
        const occupies = ing.prep !== 'soak';
        if (occupies && this.busy) return this.reject('手上正忙');
        const uid = this.pantry.takeForPrep(ingredientId);
        if (uid === null) return this.reject(`没有未处理的${ing.name}`);
        const secs = this.bal.actions[ing.prep];
        this.state.prep[slot] = { ingredientId, uid, left: secs, total: secs, kind: ing.prep };
        if (occupies) this.state.action = { kind: 'prep', left: secs, total: secs, slot };
        return null;
    }

    /** 盛碗 + 摆盘：结果在开始时锁定，完成后碗进入出餐台。 */
    plate(index: number): string | null {
        const bad = this.needService();
        if (bad) return this.reject(bad);
        const pot = this.state.pots[index];
        if (!pot || !['cooking', 'window', 'over', 'burnt'].includes(pot.phase)) return this.reject('锅里没有粥');
        if (this.busy) return this.reject('手上正忙');
        if (this.state.pass.length >= this.bal.session.passCapacity) return this.reject('出餐台满了');
        pot.locked = true;
        const secs = this.bal.actions.serve + this.bal.actions.plate;
        this.state.action = { kind: 'plate', left: secs, total: secs, pot: index };
        return null;
    }

    private completePlate(index: number): void {
        const pot = this.state.pots[index];
        const recipe = this.recipe(pot.recipeId);
        if (!recipe) return;
        const result = resultOf(this.bal, pot);
        const audit = addAudit(pot, recipe, this.addTolerance(recipe.id));
        const tableware = this.config.decorById.get(this.state.setup.tableware);
        const quality: BowlQuality = {
            result,
            freshTier: Math.max(pot.baseFresh, pot.addFresh),
            missing: audit.missing,
            mistimed: audit.mistimed,
            seasoningOk: seasoningMatches(recipe, pot.seasoning),
            look: lookBonus(tableware, recipe, this.wave),
        };
        const bowl: Bowl = { id: this.id('B'), recipeId: recipe.id, quality, held: 0 };
        this.state.pass.push(bowl);
        if (result === 'burnt') {
            Object.assign(pot, emptyPot(index), { phase: 'washing', washLeft: this.bal.actions.potWash });
        } else {
            Object.assign(pot, emptyPot(index));
        }
        this.events.push({ type: 'bowl:ready', bowl: bowl.id, result });
        if (this.state.setup.practice) this.practiceCredit(recipe.id, result);
    }

    /** 倒掉：无收入，食材不退；糊锅还要洗。 */
    dump(index: number): string | null {
        const pot = this.state.pots[index];
        if (!pot || pot.locked || !['cooking', 'window', 'over', 'burnt'].includes(pot.phase)) return this.reject('没有可倒的');
        const burnt = pot.phase === 'burnt';
        Object.assign(pot, emptyPot(index));
        if (burnt) { pot.phase = 'washing'; pot.washLeft = this.bal.actions.potWash; }
        return null;
    }

    discardBowl(bowlId: string): void {
        this.state.pass = this.state.pass.filter(b => b.id !== bowlId);
    }

    deliver(bowlId: string, orderId: string): string | null {
        const bowl = this.state.pass.find(b => b.id === bowlId);
        const order = this.state.orders.find(o => o.id === orderId);
        if (!bowl || !order || order.state !== 'waiting') return this.reject('这单已经不在了');
        if (bowl.recipeId !== order.recipeId) return this.reject('这碗不是他点的');
        if (this.busy) return this.reject('手上正忙');
        this.state.action = { kind: 'deliver', left: this.bal.actions.deliver, total: this.bal.actions.deliver, bowlId, orderId };
        return null;
    }

    /** 自动选：把出餐台上的碗送给点这道粥、耐心最少的那位。 */
    deliverBest(bowlId: string): string | null {
        const bowl = this.state.pass.find(b => b.id === bowlId);
        if (!bowl) return this.reject('没有这碗');
        const target = this.waitingOrders.filter(o => o.recipeId === bowl.recipeId).sort((a, b) => a.patienceLeft - b.patienceLeft)[0];
        if (!target) return this.reject('没人点这道');
        return this.deliver(bowlId, target.id);
    }

    bowlScore(bowl: Bowl): number {
        const recipe = this.recipe(bowl.recipeId)!;
        const base = scoreParts(this.bal, recipe, bowl.quality).score;
        return Math.max(0, base + coolingPenalty(this.bal, bowl.held, this.state.setup.holdBonus));
    }

    private completeDeliver(bowlId: string, orderId: string): void {
        const st = this.state;
        const bowl = st.pass.find(b => b.id === bowlId);
        const order = st.orders.find(o => o.id === orderId);
        if (!bowl || !order || order.state !== 'waiting') return;
        const g = st.guests[order.guestId];
        const recipe = this.recipe(bowl.recipeId)!;
        const c = this.config.customer.get(g.customerId)!;
        const score = this.bowlScore(bowl);
        const tp = tPrime(this.atmo.total, c);
        const res = settle(this.bal, recipe, c, bowl.quality.result, score, tp, this.atmo.total);
        st.pass = st.pass.filter(b => b.id !== bowlId);
        order.state = 'served';
        g.served = true;
        g.dineLeft = this.bal.demand.dineSeconds * (1 + 0.5 * tp);
        st.ledger.revenue += res.revenue;
        st.ledger.tips += res.tip;
        st.ledger.served++;
        if (!st.ledger.best || score > st.ledger.best.score) st.ledger.best = { recipeId: recipe.id, score, result: bowl.quality.result };
        if (!st.ledger.worst || score < st.ledger.worst.score) st.ledger.worst = { recipeId: recipe.id, score };

        const result = bowl.quality.result;
        const f = this.bal.favor;
        if (result === 'burnt') this.favor(c.id, f.fail);
        else {
            const base = result === 'perfect' && matchesTaste(c, recipe) ? f.match : f.serve;
            this.favor(c.id, base + Math.floor((this.atmo.total / 100) * 2));
        }
        const key = `${c.id}|${recipe.id}|${result}|${g.wave}`;
        st.served[key] = (st.served[key] ?? 0) + 1;
        if (g.request && recipe.id === g.onlyRecipe) {
            st.requestServed = (st.requestServed ?? 0) + 1;
            this.events.push({ type: 'request:served', recipe: recipe.id, served: st.requestServed });
        }
        const dayKey = `${c.id}|${recipe.id}|${result}`;
        if (!st.todayKeys.includes(dayKey)) st.todayKeys.push(dayKey);
        const sk = this.bal.skill;
        const before = this.skillPoints(recipe.id);
        st.skillDelta[recipe.id] = (st.skillDelta[recipe.id] ?? 0) + ({ perfect: sk.perfect, over: sk.over, raw: sk.raw, burnt: sk.burnt }[result]);
        this.noteSkillUp(recipe.id, before);
        if (result === 'perfect' && !st.perfectRecipes.includes(recipe.id)) st.perfectRecipes.push(recipe.id);
        this.events.push({ type: 'delivered', order: order.id, revenue: res.revenue, tip: res.tip, score, result });
    }

    private practiceCredit(recipeId: string, result: CookResult): void {
        if (result !== 'perfect') return;
        const sk = this.bal.skill;
        const now = this.skillPoints(recipeId);
        if (now >= sk.practiceCap) return;
        this.state.skillDelta[recipeId] = (this.state.skillDelta[recipeId] ?? 0) + Math.min(sk.practicePerfect, sk.practiceCap - now);
        this.noteSkillUp(recipeId, now);
        if (!this.state.perfectRecipes.includes(recipeId)) this.state.perfectRecipes.push(recipeId);
    }

    /** 熟练跨档时发事件，界面据此提示「练到顺手了」（规则效果已由 warnLine / addTolerance 实时生效）。 */
    private noteSkillUp(recipeId: string, before: number): void {
        const tier = skillTierUp(this.config, before, this.skillPoints(recipeId));
        if (tier !== null) this.events.push({ type: 'skill:up', recipe: recipeId, tier });
    }

    wipe(seat: number): string | null {
        if (!this.state.dirty[seat]) return this.reject('桌上是干净的');
        if (this.busy) return this.reject('手上正忙');
        this.state.action = { kind: 'wipe', left: this.bal.actions.wipe, total: this.bal.actions.wipe, seat };
        return null;
    }

    washPot(index: number): string | null {
        const pot = this.state.pots[index];
        if (!pot || pot.phase !== 'burnt') return this.reject('不用洗');
        return this.dump(index);
    }

    cancelAction(): void {
        const a = this.state.action;
        if (!a) return;
        if (a.kind === 'prep' && a.slot !== undefined) {
            const job = this.state.prep[a.slot];
            if (job) this.pantry.cancelPrep(job.uid);
            this.state.prep[a.slot] = null;
        }
        if (a.kind === 'plate' && a.pot !== undefined) this.state.pots[a.pot].locked = false;
        this.state.action = null;
    }

    cancelSoak(slot: number): void {
        const job = this.state.prep[slot];
        if (!job || job.kind !== 'soak') return;
        this.pantry.cancelPrep(job.uid);
        this.state.prep[slot] = null;
    }

    /** 当日平均氛围。 */
    get dayAtmosphere(): number {
        return this.state.atmoCount ? this.state.atmoSum / this.state.atmoCount : this.atmo.total;
    }

    drainEvents(): ShiftEvent[] { return this.events.splice(0, this.events.length); }
}

export function matchesTaste(c: Customer, r: Recipe): boolean {
    return c.acceptedTags.length === 0 || r.tags.some(t => c.acceptedTags.includes(t));
}
