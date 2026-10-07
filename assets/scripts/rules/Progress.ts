import { SkillChange, skillInfo } from './Skill';
import { ChapterProgress, ChapterRun, chapterAt, chapterGoalValue, chapterKey, newChapterProgress, seasonAt } from './Chapters';
import { emptyStats, MilestoneFacts, newMilestones, ProfileStats } from './Milestones';
import { makeRequest, RequestState } from './Requests';
import { baseIngredients, ChapterGoalCfg, Decor, GameConfig, MilestoneCfg, Recipe, Season, SlotId, Story, StoryReward, StyleId, Upgrade } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';
import { FixedGuest, planArrivals, plannedCount } from './Arrivals';
import { dailyGoals, Goal, goalStatus, GoalStatus } from './Goals';
import { DecorPlacement, emptyPlacement, staticParts } from './Atmosphere';
import { Pantry, PantryState } from './Pantry';
import { newShiftState, Shift, ShiftSetup } from './Shift';
import { eligibleStories, StoryFacts } from './Stories';

/**
 * 长线进度：钱包、租金、升级、装修、好感、熟练、图鉴、短篇（文档 04 §6、§10、§11，09，10，16）。
 * ProfileState 是存档的主体，纯 JSON。
 */

export interface DayLedger {
    day: number;
    revenue: number;
    tips: number;
    purchases: number;
    rent: number;
    debtPaid: number;
    served: number;
    reasons: Record<string, number>;
    best: { recipeId: string; score: number; result?: string } | null;
    worst: { recipeId: string; score: number } | null;
    atmosphere: number;
    walletAfter: number;
    /** 小目标发的铜钱（旧存档没有此项） */
    goalReward?: number;
    /** 请托、章节、手账发的铜钱（文档 30；旧存档没有此项） */
    bonus?: number;
}

const CRITIC = 'C07';

export interface ProfileState {
    wallet: number;
    debt: number;
    completedDays: number;
    upgrades: string[];
    pantry: PantryState;
    boughtToday: Record<string, number>;
    purchasesToday: number;
    styles: StyleId[];
    ownedDecor: string[];
    placement: DecorPlacement;
    tableware: string;
    favor: Record<string, number>;
    proficiency: Record<string, number>;
    codex: { recipes: string[]; customers: string[]; stories: string[] };
    storyQueue: string[];
    pinnedRecipe: string | null;
    pinPending: boolean;
    regularSince: number | null;
    nextDay: { guests: FixedGuest[]; rescue: boolean };
    history: { served: Record<string, number>; recentDays: string[][] };
    ledger: DayLedger[];
    rng: { seed: number; step: number };
    morningDone: boolean;
    // ── 长线（文档 30）：旧存档没有，读入时补默认值 ──
    /** 当前四时章节的累计进度 */
    chapter?: ChapterProgress | null;
    /** 约好的请托（打烊时生成，约定那天打烊时结算） */
    request?: RequestState | null;
    /** 收进粥谱、常年开放的时令粥 */
    keptRecipes?: string[];
    /** 小店手账已记的页 */
    milestones?: string[];
    stats?: ProfileStats;
}

export interface MorningReport { removed: Array<{ id: string; count: number }>; rescueRice: number }

/** 四时章节章末的结算（文档 30 §2.3）。 */
export interface SeasonChapterResult {
    /** 第几章（四时章节从第二章起） */
    number: number;
    name: string;
    recipeId: string;
    goals: Array<{ goal: ChapterGoalCfg; value: number; done: boolean }>;
    reward: number;
    /** 这次两个目标都做到、时令粥收进了粥谱 */
    kept: boolean;
    /** 之前就已经收进过 */
    alreadyKept: boolean;
    next: { name: string; recipeId: string } | null;
}

/** 七日章节收束（文档 02、11）：第 7 日打烊时给出的一页回顾。 */
export interface ChapterSummary {
    days: DayLedger[];
    totalServed: number;
    totalRevenue: number;
    totalTips: number;
    /** 第 7 日食评吃到的招牌粥：perfect 刚好 / served 卖出但不是刚好 / none 没吃到 */
    signature: 'perfect' | 'served' | 'none';
    criticCame: boolean;
    /** 食评嫌铺子冷清没坐下 */
    criticRejected: boolean;
    /** 四时章节（第 8 日起）；为空时是第一章「七日开张」 */
    season?: SeasonChapterResult;
    recipesLit: number;
    storiesHeard: number;
}

export interface DayReport {
    ledger: DayLedger;
    /** 当日小目标的结算（第 2 日起） */
    goals: GoalStatus[];
    goalReward: number;
    chapter: ChapterSummary | null;
    expiring: Array<{ id: string; count: number }>;
    story: Story | null;
    rewardText: string;
    newRecipes: string[];
    unlockedStyles: StyleId[];
    rescueTomorrow: boolean;
    regularJoins: boolean;
    /** 今天出过餐（或练过）的粥的熟练变化，打烊页「粥谱熟练」一栏用 */
    skill: SkillChange[];
    /** 今天结算的请托（没有为空） */
    request: { state: RequestState; served: number; done: boolean } | null;
    /** 明天的新请托 */
    nextRequest: RequestState | null;
    /** 手账新记的页 */
    milestones: MilestoneCfg[];
    /** 请托、章节、手账一共发的铜钱 */
    bonus: number;
}

export function newProfile(config: GameConfig, seed: number): ProfileState {
    const s = config.balance.session;
    return {
        wallet: s.initialWallet, debt: 0, completedDays: 0, upgrades: [], pantry: { batches: [], nextUid: 1 },
        boughtToday: {}, purchasesToday: 0,
        styles: config.styles.filter(x => x.unlock.type === 'default').map(x => x.id),
        ownedDecor: config.decor.filter(d => d.kind === 'tableware' && d.price === 0).map(d => d.id),
        placement: emptyPlacement(), tableware: config.decor.find(d => d.kind === 'tableware' && d.price === 0)?.id ?? '',
        favor: config.customers.filter(c => c.tracksFavor).reduce((m, c) => { m[c.id] = 0; return m; }, {} as Record<string, number>),
        proficiency: {}, codex: { recipes: [], customers: [], stories: [] }, storyQueue: [], pinnedRecipe: null, pinPending: false,
        regularSince: null, nextDay: { guests: [], rescue: false }, history: { served: {}, recentDays: [] }, ledger: [],
        rng: { seed: seed >>> 0, step: 0 }, morningDone: false,
        chapter: null, request: null, keptRecipes: [], milestones: [], stats: emptyStats(),
    };
}

export type UpgradeStatus = 'owned' | 'days' | 'requires' | 'money' | 'ok';

export class Progress {
    readonly pantry: Pantry;

    constructor(readonly config: GameConfig, readonly state: ProfileState) {
        this.pantry = new Pantry(config, state.pantry);
        // 旧存档补长线字段（文档 30 §5）
        state.chapter ??= null;
        state.request ??= null;
        state.keptRecipes ??= [];
        state.milestones ??= [];
        if (!state.stats) state.stats = this.statsFromHistory();
    }

    /** 旧存档没有累计数：从历史出餐与账本里尽量还原。 */
    private statsFromHistory(): ProfileStats {
        const st = emptyStats();
        for (const [k, n] of Object.entries(this.state.history.served)) {
            st.servedTotal += n;
            if (k.split('|')[2] === 'perfect') st.perfectTotal += n;
        }
        for (const l of this.state.ledger) st.bestDayIncome = Math.max(st.bestDayIncome, l.revenue + l.tips);
        return st;
    }

    get stats(): ProfileStats { return this.state.stats!; }
    get kept(): string[] { return this.state.keptRecipes!; }

    // ───────────── 四时章节（文档 30 §2） ─────────────

    chapter(day = this.day): ChapterRun | null { return chapterAt(this.config, day); }
    season(day = this.day): Season | null { return seasonAt(this.config, day); }

    /** 这一章到目前为止的进度（还没开打烊的这一章没有记录时为空进度）。 */
    chapterProgress(day = this.day): ChapterProgress | null {
        const run = this.chapter(day);
        if (!run) return null;
        const p = this.state.chapter;
        return p && p.key === chapterKey(run) ? p : newChapterProgress(run);
    }

    /** 粥在这一天是否开放：到了开放日，时令粥还要在季或已收进粥谱。 */
    recipeOpen(r: Recipe, day = this.day): boolean {
        if (r.unlockDay > day) return false;
        return !r.season || this.kept.includes(r.id) || this.season(day) === r.season;
    }

    /** 食材在这一天能不能买：时令食材只在本季，或它做的时令粥已收进粥谱。 */
    ingredientOpen(id: string, day = this.day): boolean {
        const ing = this.config.ingredient.get(id);
        if (!ing) return false;
        if (!ing.season || this.season(day) === ing.season) return true;
        return this.kept.some(rid => this.config.recipe.get(rid)?.ingredients.some(x => x.id === id));
    }

    get day(): number { return this.state.completedDays + 1; }
    get bal() { return this.config.balance; }

    private effect(key: string): number {
        return this.state.upgrades.reduce((s, id) => s + (this.config.upgrade.get(id)?.effect[key] ?? 0), 0);
    }

    get pots(): number { return this.bal.session.initialPots + this.effect('pots'); }
    get seats(): number { return this.bal.session.initialSeats + this.effect('seats'); }
    /** 当日房租：底租 + 多出来的锅和座位（铺面越大房租越高）。 */
    get rent(): number {
        const s = this.bal.session;
        return s.rent + (s.rentPerPot ?? 0) * (this.pots - s.initialPots) + (s.rentPerSeat ?? 0) * (this.seats - s.initialSeats);
    }
    get prepSlots(): number { return this.bal.session.initialPrepSlots + this.effect('prepSlots'); }
    get holdBonus(): number { return this.effect('holdScoreSeconds'); }
    get buyKinds(): number {
        return this.state.debt > 0 ? this.bal.session.debtBuyKinds : this.bal.session.initialBuyKinds + this.effect('buySlots');
    }
    /** 铺面等级 = 已购锅位升级数 + 1 */
    get shopLevel(): number { return this.pots - this.bal.session.initialPots + 1; }

    unlockedRecipes(day = this.day): Recipe[] { return this.config.recipes.filter(r => this.recipeOpen(r, day)); }

    /** 今天的三件小目标（清晨菜单与营业共用同一份）。 */
    todayGoals(): Goal[] {
        const p = this.state.placement;
        const hasDecor = Object.values(p).some(sl => !!sl.main || sl.smalls.length > 0);
        return dailyGoals(this.config, this.state.rng.seed, this.day, this.unlockedRecipes(), plannedCount(this.config, this.day, this.shopLevel), hasDecor);
    }

    unlockedCustomers(day = this.day): string[] {
        return this.config.customers.filter(c => {
            if (c.unlockFavor) return this.state.regularSince !== null && this.state.regularSince < day;
            return c.unlockDay > 0 && c.unlockDay <= day;
        }).map(c => c.id);
    }

    skillTier(recipeId: string): number {
        const p = this.state.proficiency[recipeId] ?? 0;
        return this.bal.skill.tiers.filter(t => p >= t.min).length;
    }

    // ───────────── 升级 ─────────────

    upgradeStatus(u: Upgrade): UpgradeStatus {
        if (this.state.upgrades.includes(u.id)) return 'owned';
        if (this.state.completedDays < u.requiredCompletedDays) return 'days';
        if (u.requires && !this.state.upgrades.includes(u.requires)) return 'requires';
        if (this.state.wallet < u.price) return 'money';
        return 'ok';
    }

    buyUpgrade(id: string): string | null {
        const u = this.config.upgrade.get(id);
        if (!u) return '没有这项升级';
        const st = this.upgradeStatus(u);
        if (st !== 'ok') return { owned: '已经买过了', days: `还差 ${u.requiredCompletedDays - this.state.completedDays} 天`, requires: '要先买前一口锅', money: '铜钱不够', ok: '' }[st];
        this.state.wallet -= u.price;
        this.state.upgrades.push(id);
        return null;
    }

    // ───────────── 进货 ─────────────

    /** 今日还能买几种新食材。 */
    kindsLeft(): number {
        return this.buyKinds - Object.keys(this.state.boughtToday).filter(k => this.state.boughtToday[k] > 0).length;
    }

    /** 某种食材的单日进货上限（文档 04 §6）。 */
    dailyCap(id: string): number { return this.config.ingredient.get(id)?.dailyCap ?? this.bal.session.unitCap; }

    canBuy(id: string, count = 1): string | null {
        const ing = this.config.ingredient.get(id);
        if (!ing) return '没有这种食材';
        if (!this.ingredientOpen(id)) return `${ing.name}不是这个时节的食材`;
        const had = this.state.boughtToday[id] ?? 0;
        if (had === 0 && this.kindsLeft() <= 0) return `今天最多进 ${this.buyKinds} 种`;
        const cap = this.dailyCap(id);
        if (had + count > cap) return `${ing.name}每天最多进 ${cap} 份`;
        if (this.state.wallet < ing.buyPrice * count) return '铜钱不够';
        return null;
    }

    buy(id: string, count = 1): string | null {
        const bad = this.canBuy(id, count);
        if (bad) return bad;
        const ing = this.config.ingredient.get(id)!;
        this.state.wallet -= ing.buyPrice * count;
        this.state.purchasesToday += ing.buyPrice * count;
        this.state.boughtToday[id] = (this.state.boughtToday[id] ?? 0) + count;
        this.pantry.add(id, count);
        return null;
    }

    /** 这道粥差什么底料（菜单灰显用）。 */
    missingBase(r: Recipe): string[] {
        return baseIngredients(r).filter(b => this.pantry.total(b.id) < b.count).map(b => this.config.ingredient.get(b.id)!.name);
    }

    // ───────────── 装修 ─────────────

    styleUnlocked(style: string): boolean { return style === 'common' || this.state.styles.includes(style as StyleId); }

    canBuyDecor(d: Decor): string | null {
        if (this.state.ownedDecor.includes(d.id)) return '已拥有';
        if (d.price <= 0) return '只能通过故事获得';
        if (!this.styleUnlocked(d.style)) return '风格还没解锁';
        if (this.state.wallet < d.price) return '铜钱不够';
        return null;
    }

    buyDecor(id: string): string | null {
        const d = this.config.decorById.get(id);
        if (!d) return '没有这件';
        const bad = this.canBuyDecor(d);
        if (bad) return bad;
        this.state.wallet -= d.price;
        this.state.ownedDecor.push(id);
        return null;
    }

    place(id: string): string | null {
        const d = this.config.decorById.get(id);
        if (!d || !this.state.ownedDecor.includes(id)) return '还没有这件';
        if (d.kind === 'tableware') { this.state.tableware = id; return null; }
        const slot = this.state.placement[d.slot as SlotId];
        if (d.kind === 'main') { slot.main = id; return null; }
        if (slot.smalls.includes(id)) return null;
        if (slot.smalls.length >= 2) return '这里最多放两件小物';
        slot.smalls.push(id);
        return null;
    }

    unplace(id: string): void {
        for (const slot of Object.values(this.state.placement)) {
            if (slot.main === id) slot.main = null;
            slot.smalls = slot.smalls.filter(x => x !== id);
        }
    }

    isPlaced(id: string): boolean {
        return this.state.tableware === id || Object.values(this.state.placement).some(s => s.main === id || s.smalls.includes(id));
    }

    staticAtmosphere() { return staticParts(this.config, this.state.placement); }

    // ───────────── 一日开始 ─────────────

    /** 清晨结算：移除过期食材、救援送米。每天只做一次。 */
    morning(): MorningReport {
        if (this.state.morningDone) return { removed: [], rescueRice: 0 };
        this.state.morningDone = true;
        this.state.boughtToday = {};
        this.state.purchasesToday = 0;
        const removed = this.pantry.removeExpired();
        let rescueRice = 0;
        if (this.state.nextDay.rescue) {
            rescueRice = this.bal.session.rescueRice;
            this.pantry.add('I01', rescueRice);
        }
        return { removed, rescueRice };
    }

    shiftSetup(practice = false, practiceRecipe?: string): ShiftSetup {
        return {
            day: this.day,
            completedDays: this.state.completedDays,
            pots: practice ? 1 : this.pots,
            seats: this.seats,
            prepSlots: this.prepSlots,
            holdBonus: this.holdBonus,
            placement: JSON.parse(JSON.stringify(this.state.placement)),
            tableware: this.state.tableware,
            recipes: practice && practiceRecipe ? [practiceRecipe] : this.unlockedRecipes().map(r => r.id),
            proficiency: { ...this.state.proficiency },
            practice,
            goals: practice ? [] : this.todayGoals(),
            season: practice ? null : this.season(),
        };
    }

    /** 生成当日营业。rng 由调用方持有并随存档保存。 */
    startShift(rng: SeededRng): Shift {
        const setup = this.shiftSetup();
        const arrivals = planArrivals(this.config, {
            day: this.day, shopLevel: this.shopLevel, unlocked: this.unlockedCustomers(),
            guests: this.state.nextDay.guests, rescue: this.state.nextDay.rescue,
        }, rng);
        return new Shift(this.config, newShiftState(this.config, setup, arrivals), this.pantry, rng);
    }

    startPractice(recipeId: string, rng: SeededRng): Shift {
        const setup = this.shiftSetup(true, recipeId);
        return new Shift(this.config, newShiftState(this.config, setup, []), new Pantry(this.config), rng);
    }

    /** 练习结束：只写回熟练度（上限在 Shift 里已经处理）。 */
    applyPractice(shift: Shift): void {
        for (const [rid, d] of Object.entries(shift.state.skillDelta)) {
            this.state.proficiency[rid] = Math.max(0, (this.state.proficiency[rid] ?? 0) + d);
        }
    }

    /** 手账条件用到的事实。 */
    milestoneFacts(): MilestoneFacts {
        const st = this.state;
        return {
            stats: this.stats,
            recipesLit: st.codex.recipes.length,
            masterCount: Object.values(st.proficiency).filter(p => skillInfo(this.config, p).tier >= 2).length,
            daysCompleted: st.completedDays,
            storiesHeard: st.codex.stories.length,
            favorMax: Math.max(0, ...Object.values(st.favor)),
            keptRecipes: this.kept.length,
            stylesUnlocked: st.styles.length,
            decorOwned: st.ownedDecor.length,
        };
    }

    // ───────────── 打烊结算 ─────────────

    closeDay(shift: Shift): DayReport {
        const st = this.state;
        const cfg = this.config;
        const bal = this.bal;
        const s = shift.state;
        const day = this.day;
        const lg = s.ledger;

        this.pantry.closeDay();
        const expiring = this.pantry.expiringAfter(bal.session.overnightHours);

        // 小目标：做到的件数发铜钱，三件全做到再加满贯
        const goals = (s.setup.goals ?? []).map(g => goalStatus(g, s, shift.dayAtmosphere, true));
        let goalReward = goals.filter(g => g.done).reduce((n, g) => n + g.goal.reward, 0);
        if (goals.length && goals.every(g => g.done)) goalReward += bal.goals.bonusAll;
        const allGoals = goals.length > 0 && goals.every(g => g.done);
        const stats = this.stats;

        // ── 街坊请托（文档 30 §3）：约定那天打烊时结算 ──
        let requestReport: DayReport['request'] = null;
        let requestReward = 0;
        const req = st.request;
        if (req && req.day === day) {
            const served = s.requestServed ?? 0;
            const done = served >= req.count;
            if (done) {
                requestReward = req.reward;
                st.favor[req.customerId] = Math.min(bal.favor.max, (st.favor[req.customerId] ?? 0) + bal.requests.favor);
                stats.requestsDone++;
            }
            requestReport = { state: req, served, done };
            st.request = null;
        } else if (req && req.day < day) st.request = null;

        // ── 四时章节（文档 30 §2）：累计本章进度，章末结算 ──
        const perfectToday = Object.entries(s.served).filter(([k]) => k.split('|')[2] === 'perfect').reduce((n, [, v]) => n + v, 0);
        const run = this.chapter(day);
        let chapterReward = 0;
        let season: SeasonChapterResult | undefined;
        if (run) {
            const prog = this.chapterProgress(day)!;
            for (const [k, n] of Object.entries(s.served)) {
                const rid = k.split('|')[1];
                prog.served[rid] = (prog.served[rid] ?? 0) + n;
            }
            prog.perfect += perfectToday;
            if (requestReport?.done) prog.requests++;
            if (allGoals) prog.fullGoalDays++;
            if (lg.served > 0 && !(lg.reasons['impatient'] ?? 0)) prog.calmDays++;
            st.chapter = prog;
            if (day === run.endDay) {
                const res = run.goals.map(g => { const value = chapterGoalValue(g, prog); return { goal: g, value, done: value >= g.count }; });
                const doneCount = res.filter(x => x.done).length;
                chapterReward = run.reward * doneCount;
                const alreadyKept = this.kept.includes(run.cfg.recipeId);
                const all = doneCount === res.length;
                if (all) {
                    stats.chaptersDone++;
                    if (!alreadyKept) this.kept.push(run.cfg.recipeId);
                }
                const next = this.chapter(day + 1);
                season = {
                    number: run.index + 2, name: run.name, recipeId: run.cfg.recipeId, goals: res, reward: chapterReward, kept: all && !alreadyKept, alreadyKept,
                    next: next ? { name: next.name, recipeId: next.cfg.recipeId } : null,
                };
            }
        }

        // ── 累计（手账用） ──
        stats.perfectTotal += perfectToday;
        stats.servedTotal += lg.served;
        stats.bestDayIncome = Math.max(stats.bestDayIncome, lg.revenue + lg.tips);
        if (allGoals) stats.fullGoalDays++;

        st.wallet += lg.revenue + lg.tips + goalReward + requestReward + chapterReward;
        let rent = 0;
        let debtPaid = 0;
        if (day >= bal.session.rentStartsOnDay) {
            debtPaid = Math.min(st.debt, st.wallet);
            st.wallet -= debtPaid;
            st.debt -= debtPaid;
            const due = this.rent;
            rent = Math.min(due, st.wallet);
            st.wallet -= rent;
            st.debt += due - rent;
        }

        for (const [cid, d] of Object.entries(s.favorDelta)) {
            st.favor[cid] = Math.max(0, Math.min(bal.favor.max, (st.favor[cid] ?? 0) + d));
        }
        const regular = cfg.customers.find(c => c.unlockFavor);
        let regularJoins = false;
        if (regular && st.regularSince === null) {
            const ok = Object.entries(regular.unlockFavor!).every(([cid, min]) => (st.favor[cid] ?? 0) >= min);
            if (ok) { st.regularSince = day; regularJoins = true; if (st.favor[regular.id] === undefined) st.favor[regular.id] = 0; }
        }
        const skill: SkillChange[] = [];
        for (const [rid, d] of Object.entries(s.skillDelta)) {
            const before = st.proficiency[rid] ?? 0;
            st.proficiency[rid] = Math.max(0, before + d);
            skill.push({ recipeId: rid, before, after: st.proficiency[rid] });
        }
        const newRecipes = s.perfectRecipes.filter(r => !st.codex.recipes.includes(r));
        st.codex.recipes.push(...newRecipes);
        for (const c of s.seenCustomers) if (!st.codex.customers.includes(c)) st.codex.customers.push(c);
        for (const [k, n] of Object.entries(s.served)) st.history.served[k] = (st.history.served[k] ?? 0) + n;
        st.history.recentDays.push([...s.todayKeys]);
        if (st.history.recentDays.length > 3) st.history.recentDays.shift();

        st.completedDays++;
        st.nextDay = { guests: [], rescue: false };

        const unlockedStyles: StyleId[] = [];
        for (const sc of cfg.styles) {
            if (st.styles.includes(sc.id)) continue;
            const u = sc.unlock;
            if ((u.type === 'completedDays' && st.completedDays >= (u.value as number))
                || (u.type === 'story' && u.fallbackDays !== undefined && st.completedDays >= u.fallbackDays)) {
                st.styles.push(sc.id);
                unlockedStyles.push(sc.id);
            }
        }

        const facts: StoryFacts = {
            favor: st.favor, served: st.history.served, recentDays: st.history.recentDays, dayAtmosphere: shift.dayAtmosphere,
            codexCount: st.codex.recipes.length, seen: st.codex.stories,
        };
        let story: Story | null = null;
        if (st.storyQueue.length) story = cfg.story.get(st.storyQueue.shift()!) ?? null;
        const fresh = eligibleStories(cfg, facts, st.storyQueue);
        if (!story && fresh.length) story = fresh.shift()!;
        for (const s2 of fresh) if (s2 !== story && !st.storyQueue.includes(s2.id)) st.storyQueue.push(s2.id);
        let rewardText = '';
        if (story) {
            st.codex.stories.push(story.id);
            st.storyQueue = st.storyQueue.filter(x => x !== story!.id);
            rewardText = this.grant(story.reward);
        }

        st.nextDay.rescue = st.wallet < bal.session.rescueFloor;
        st.morningDone = false;

        // 明天的请托：明天开放、清晨能买齐食材的粥里挑（文档 30 §3）
        const tomorrow = day + 1;
        let nextRequest: RequestState | null = null;
        if (!st.request) {
            const recipes = this.unlockedRecipes(tomorrow).filter(r => r.ingredients.every(i => this.ingredientOpen(i.id, tomorrow)));
            nextRequest = makeRequest(cfg, {
                day: tomorrow, seed: st.rng.seed, seen: st.codex.customers, favor: st.favor,
                unlockedCustomers: this.unlockedCustomers(tomorrow), recipes, season: this.season(tomorrow),
            });
            if (nextRequest) {
                st.request = nextRequest;
                for (let k = 0; k < nextRequest.count; k++) {
                    st.nextDay.guests.push({ customerId: nextRequest.customerId, wave: nextRequest.wave, first: false, onlyRecipe: nextRequest.recipeId, request: true });
                }
            }
        }

        // 小店手账（文档 30 §4）：所有累计更新完后再评估
        const pages = newMilestones(cfg, st.milestones!, this.milestoneFacts());
        const milestoneReward = pages.reduce((n, m) => n + m.reward, 0);
        st.milestones!.push(...pages.map(m => m.id));
        st.wallet += milestoneReward;
        const bonus = requestReward + chapterReward + milestoneReward;

        this.pantry.age(bal.session.overnightHours);

        const ledger: DayLedger = {
            day, revenue: lg.revenue, tips: lg.tips, purchases: st.purchasesToday, rent, debtPaid, served: lg.served,
            reasons: { ...lg.reasons }, best: lg.best, worst: lg.worst, atmosphere: shift.dayAtmosphere, walletAfter: st.wallet, goalReward, bonus,
        };
        st.ledger.push(ledger);
        if (st.ledger.length > 30) st.ledger.shift();
        let chapter: ChapterSummary | null = null;
        if (season && run) {
            const days = st.ledger.filter(d => d.day >= run.startDay && d.day <= run.endDay);
            chapter = {
                days,
                totalServed: days.reduce((n, d) => n + d.served, 0),
                totalRevenue: days.reduce((n, d) => n + d.revenue, 0),
                totalTips: days.reduce((n, d) => n + d.tips, 0),
                signature: 'none', criticCame: false, criticRejected: false,
                recipesLit: st.codex.recipes.length, storiesHeard: st.codex.stories.length, season,
            };
        } else if (day === bal.demand.chapterCriticDay) {
            const keys = Object.keys(s.served);
            const critic = keys.filter(k => k.startsWith(`${CRITIC}|R12|`));
            const days = st.ledger.slice(-day);
            chapter = {
                days,
                totalServed: days.reduce((n, d) => n + d.served, 0),
                totalRevenue: days.reduce((n, d) => n + d.revenue, 0),
                totalTips: days.reduce((n, d) => n + d.tips, 0),
                signature: critic.some(k => k.includes('|perfect|')) ? 'perfect' : critic.length ? 'served' : 'none',
                criticCame: s.seenCustomers.includes(CRITIC),
                criticRejected: (lg.reasons['rejected'] ?? 0) > 0,
                recipesLit: st.codex.recipes.length,
                storiesHeard: st.codex.stories.length,
            };
        }
        // 短篇奖励的熟练也算进今天的变化
        for (const c of skill) c.after = st.proficiency[c.recipeId] ?? c.after;
        return { ledger, goals, goalReward, chapter, expiring, story, rewardText, newRecipes, unlockedStyles, rescueTomorrow: st.nextDay.rescue, regularJoins, skill,
            request: requestReport, nextRequest, milestones: pages, bonus };
    }

    /** 发放短篇奖励，返回一句说明。 */
    grant(r: StoryReward): string {
        const st = this.state;
        switch (r.type) {
            case 'none': return '';
            case 'recipe': return `新粥谱：${this.config.recipe.get(r.id)?.name ?? r.id}`;
            case 'decor':
                if (!st.ownedDecor.includes(r.id)) st.ownedDecor.push(r.id);
                return `收到：${this.config.decorById.get(r.id)?.name ?? r.id}`;
            case 'style':
                if (st.styles.includes(r.id)) return r.fallback ? this.grant(r.fallback) : '';
                st.styles.push(r.id);
                return `可以买「${this.config.styles.find(x => x.id === r.id)?.name}」风格的陈设了`;
            case 'proficiency':
                st.proficiency[r.recipeId] = (st.proficiency[r.recipeId] ?? 0) + r.amount;
                return `${this.config.recipe.get(r.recipeId)?.name}熟练 +${r.amount}`;
            case 'guest':
                st.nextDay.guests.push({ customerId: r.customerId, wave: r.wave, first: r.first });
                return r.first ? '明早第一位客人会是他' : '明天会多来一位客人';
            case 'pin':
                st.pinPending = true;
                return '可以在菜单顶上钉一道拿手粥';
        }
        return '';
    }
}
