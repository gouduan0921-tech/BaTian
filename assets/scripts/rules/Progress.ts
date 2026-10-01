import { baseIngredients, Decor, GameConfig, Recipe, SlotId, Story, StoryReward, StyleId, Upgrade } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';
import { FixedGuest, planArrivals } from './Arrivals';
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
}

export interface MorningReport { removed: Array<{ id: string; count: number }>; rescueRice: number }

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
    recipesLit: number;
    storiesHeard: number;
}

export interface DayReport {
    ledger: DayLedger;
    chapter: ChapterSummary | null;
    expiring: Array<{ id: string; count: number }>;
    story: Story | null;
    rewardText: string;
    newRecipes: string[];
    unlockedStyles: StyleId[];
    rescueTomorrow: boolean;
    regularJoins: boolean;
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
    };
}

export type UpgradeStatus = 'owned' | 'days' | 'requires' | 'money' | 'ok';

export class Progress {
    readonly pantry: Pantry;

    constructor(readonly config: GameConfig, readonly state: ProfileState) {
        this.pantry = new Pantry(config, state.pantry);
    }

    get day(): number { return this.state.completedDays + 1; }
    get bal() { return this.config.balance; }

    private effect(key: string): number {
        return this.state.upgrades.reduce((s, id) => s + (this.config.upgrade.get(id)?.effect[key] ?? 0), 0);
    }

    get pots(): number { return this.bal.session.initialPots + this.effect('pots'); }
    get seats(): number { return this.bal.session.initialSeats + this.effect('seats'); }
    get prepSlots(): number { return this.bal.session.initialPrepSlots + this.effect('prepSlots'); }
    get holdBonus(): number { return this.effect('holdScoreSeconds'); }
    get buyKinds(): number {
        return this.state.debt > 0 ? this.bal.session.debtBuyKinds : this.bal.session.initialBuyKinds + this.effect('buySlots');
    }
    /** 铺面等级 = 已购锅位升级数 + 1 */
    get shopLevel(): number { return this.pots - this.bal.session.initialPots + 1; }

    unlockedRecipes(day = this.day): Recipe[] { return this.config.recipes.filter(r => r.unlockDay <= day); }

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

    canBuy(id: string, count = 1): string | null {
        const ing = this.config.ingredient.get(id);
        if (!ing) return '没有这种食材';
        const had = this.state.boughtToday[id] ?? 0;
        if (had === 0 && this.kindsLeft() <= 0) return `今天最多进 ${this.buyKinds} 种`;
        if (had + count > this.bal.session.unitCap) return `单种每天最多 ${this.bal.session.unitCap} 份`;
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

        st.wallet += lg.revenue + lg.tips;
        let rent = 0;
        let debtPaid = 0;
        if (day >= bal.session.rentStartsOnDay) {
            debtPaid = Math.min(st.debt, st.wallet);
            st.wallet -= debtPaid;
            st.debt -= debtPaid;
            rent = Math.min(bal.session.rent, st.wallet);
            st.wallet -= rent;
            st.debt += bal.session.rent - rent;
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
        for (const [rid, d] of Object.entries(s.skillDelta)) st.proficiency[rid] = Math.max(0, (st.proficiency[rid] ?? 0) + d);
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

        this.pantry.age(bal.session.overnightHours);

        const ledger: DayLedger = {
            day, revenue: lg.revenue, tips: lg.tips, purchases: st.purchasesToday, rent, debtPaid, served: lg.served,
            reasons: { ...lg.reasons }, best: lg.best, worst: lg.worst, atmosphere: shift.dayAtmosphere, walletAfter: st.wallet,
        };
        st.ledger.push(ledger);
        if (st.ledger.length > 30) st.ledger.shift();
        let chapter: ChapterSummary | null = null;
        if (day === bal.demand.chapterCriticDay) {
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
        return { ledger, chapter, expiring, story, rewardText, newRecipes, unlockedStyles, rescueTomorrow: st.nextDay.rescue, regularJoins };
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
