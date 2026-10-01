import { Catalog } from './Catalog';
import type { BowlKind, HeatName } from './Catalog';
import type { FreshTier } from './Pantry';
import type { CookResult, PotPhase, Season } from './PotSim';
import type { DayReport, Departure, LeaveReason, OrderState, ServiceOrder, ShiftPhase } from './ServiceDay';
import type { ServedDish } from './Score';
import type { RngState } from '../simulation/SeededRng';

/** 营业中断时写下的规则状态。不含节点和材质。 */
export interface PotSave {
    phase: PotPhase;
    heat: HeatName;
    simmer: number;
    stir: number;
    doneness: number;
    scorch: number;
    recipeId: string;
    added: string[];
    season: Season | '';
    mistimes: number;
    result: CookResult | '';
    dumped: boolean;
    plateLeft: number;
    prepLeft: number;
    washLeft: number;
    windup: number;
    sinceStir: number;
    warnLatched: boolean;
    seasonLocked: boolean;
    masteryPoints?: number;
}

export interface PantrySave {
    units: Array<{ id: string; hoursLeft: number; ready: boolean; prepLeft: number }>;
    bought: Array<{ id: string; count: number }>;
}

export interface StoveSave {
    focus: number;
    nightService: boolean;
    owingRent: boolean;
    committedTier: Array<FreshTier | ''>;
    bowls: BowlKind[];
    pots: PotSave[];
    pantry: PantrySave;
    served: ServedDish[];
}

export interface GuestSave {
    customerId: string;
    orderId: string;
    where: 'door' | 'seat' | 'retry' | 'dining' | 'gone';
    waitLeft: number;
    dineLeft: number;
}

export interface ReceiptSave {
    customerId?: string;
    recipeId: string;
    result: string;
    score: number;
    pay: number;
    tip: number;
    cost: number;
}

export interface ServiceSave {
    day: number;
    seed: number;
    pots: number;
    seats: number;
    atmosphere: number;
    rescue: boolean;
    phase: ShiftPhase;
    elapsed: number;
    prepLeft: number;
    closeLeft: number;
    soldOut: boolean;
    spawned: number;
    serial: number;
    rng: RngState;
    wallet: number;
    owingRent: boolean;
    orders: ServiceOrder[];
    guests: GuestSave[];
    planned: number[];
    departures: Departure[];
    favor: Record<string, number>;
    receipts: ReceiptSave[];
    pendingFavor: Array<{ id: string; delta: number }>;
    held: Array<{ orderId: string; dish: ServedDish }>;
    report: DayReport | null;
}

/** 第一日三句教到第几句，以及第二口锅那句有没有看过。 */
export interface LessonSave {
    first: number;
    second: boolean;
    replay: boolean;
}

export interface DeskSave {
    wallet: number;
    completedDays: number;
    upgrades: string[];
    stove: StoveSave;
    service: ServiceSave;
    lessons: LessonSave;
    storyDays?: Record<string, number>;
    decor?: { owned: string[]; activeLight: string };
    codex?: { recipes: string[]; customers: string[] };
    skills?: Record<string, number>;
    dayResults?: Array<{ day: number; arrived: number; served: number; revenue: number; featuredServed?: boolean }>;
}

export type DeskIssue = { ok: false; message: string };
export type DeskOk = { ok: true; desk: DeskSave };

const PHASES: PotPhase[] = ['empty', 'prep', 'cooking', 'window', 'plated', 'burnt', 'washing'];
const HEATS: HeatName[] = ['low', 'mid', 'high'];
const SEASONS = ['', 'plain', 'salty', 'sweet'];
const RESULTS = ['', 'perfect', 'over', 'raw', 'burnt'];
const SHIFT: ShiftPhase[] = ['prep', 'service', 'close', 'closed'];
const ORDER_STATES: OrderState[] = ['queued', 'cooking', 'ready', 'served', 'left'];
const REASONS: Array<LeaveReason | ''> = ['', 'served', 'impatient', 'no-seat', 'sold-out', 'rejected', 'busy', 'closed'];
const GUEST_WHERE = ['door', 'seat', 'retry', 'dining', 'gone'];
const BOWLS: BowlKind[] = ['coarse', 'glaze', 'night'];
const TIERS: Array<FreshTier | ''> = ['', 'today', 'overnight', 'aged', 'expired'];

function fail(message: string): DeskIssue { return { ok: false, message }; }

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function integer(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function unit(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function span(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
}

function whole(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

/** 整档失败，不丢掉未知 id，也不改调用方已经拿着的旧档。 */
export function parseDesk(raw: unknown, catalog: Catalog): DeskOk | DeskIssue {
    const data = record(raw);
    if (!data) return fail('当班记录无效');
    if (!integer(data.wallet, 0, 999999) || !integer(data.completedDays, 0, 7)) return fail('存档金额或进度无效');
    if (!Array.isArray(data.upgrades)) return fail('存档缺少升级或账本');
    for (const id of data.upgrades) {
        if (typeof id !== 'string' || !catalog.upgrade(id)) return fail('存档中的升级无效');
    }
    const stove = parseStove(data.stove, catalog);
    if (stove.ok === false) return stove;
    const service = parseService(data.service, catalog);
    if (service.ok === false) return service;
    if (service.save.wallet !== data.wallet) return fail('存档金额或进度无效');
    if (service.save.pots !== stove.save.pots.length) return fail('当班记录无效');
    const pots = catalog.balance.session.initialPots + data.upgrades.reduce((sum: number, id: string) => sum + (catalog.upgrade(id)?.effect.pots || 0), 0);
    if (stove.save.pots.length !== pots) return fail('当班记录无效');
    const storyDays = data.storyDays == null ? {} : record(data.storyDays);
    if (!storyDays) return fail('熟客故事记录无效');
    for (const [id, day] of Object.entries(storyDays)) {
        if (!catalog.stories.some(story => story.id === id) || !integer(day, 1, 999)) return fail('熟客故事记录无效');
    }
    const decor = data.decor == null ? { owned: [], activeLight: '' } : record(data.decor);
    if (!decor || !Array.isArray(decor.owned) || typeof decor.activeLight !== 'string') return fail('装修记录无效');
    if (decor.owned.some(id => typeof id !== 'string' || !catalog.decorItem(id))) return fail('装修记录无效');
    if (decor.activeLight && (!decor.owned.includes(decor.activeLight) || !['D01', 'D02', 'D03'].includes(decor.activeLight))) return fail('装修记录无效');
    const codex = data.codex == null ? { recipes: [], customers: [] } : record(data.codex);
    if (!codex || !Array.isArray(codex.recipes) || !Array.isArray(codex.customers)) return fail('图鉴记录无效');
    if (codex.recipes.some(id => typeof id !== 'string' || !catalog.recipe(id)) || codex.customers.some(id => typeof id !== 'string' || !catalog.customer(id))) return fail('图鉴记录无效');
    const skills = data.skills == null ? {} : record(data.skills);
    if (!skills || Object.entries(skills).some(([id, points]) => !catalog.recipe(id) || !integer(points, 0, 999))) return fail('厨艺记录无效');
    const dayResults = data.dayResults == null ? [] : data.dayResults;
    if (!Array.isArray(dayResults)) return fail('每日成绩记录无效');
    for (const item of dayResults) {
        const row = record(item);
        if (!row || !integer(row.day, 1, 999) || !integer(row.arrived, 0, 999) || !integer(row.served, 0, 999) || !integer(row.revenue, 0, 999999) || (row.featuredServed != null && typeof row.featuredServed !== 'boolean')) return fail('每日成绩记录无效');
    }
    const lessons = parseLessons(data.lessons, data.completedDays);
    if (lessons.ok === false) return lessons;
    return { ok: true, desk: { wallet: data.wallet, completedDays: data.completedDays, upgrades: [...data.upgrades], stove: stove.save, service: service.save, lessons: lessons.save, storyDays: storyDays as Record<string, number>, decor: { owned: [...decor.owned], activeLight: decor.activeLight }, codex: { recipes: [...codex.recipes], customers: [...codex.customers] }, skills: skills as Record<string, number>, dayResults: dayResults.map(item => ({ day: item.day, arrived: item.arrived, served: item.served, revenue: item.revenue, featuredServed: item.featuredServed === true })) } };
}

function parseLessons(raw: unknown, completedDays: number): { ok: true; save: LessonSave } | DeskIssue {
    if (raw == null) return { ok: true, save: { first: completedDays > 0 ? 3 : 0, second: false, replay: false } };
    const data = record(raw);
    if (!data || !integer(data.first, 0, 3) || typeof data.second !== 'boolean' || typeof data.replay !== 'boolean') return fail('当班记录无效');
    return { ok: true, save: { first: data.first, second: data.second, replay: data.replay } };
}

function parseStove(raw: unknown, catalog: Catalog): { ok: true; save: StoveSave } | DeskIssue {
    const data = record(raw);
    if (!data || !Array.isArray(data.pots) || data.pots.length < 1 || data.pots.length > 4) return fail('当班记录无效');
    if (!integer(data.focus, 0, data.pots.length - 1) || typeof data.nightService !== 'boolean' || typeof data.owingRent !== 'boolean') return fail('当班记录无效');
    if (!Array.isArray(data.committedTier) || !Array.isArray(data.bowls) || data.committedTier.length !== data.pots.length || data.bowls.length !== data.pots.length) return fail('当班记录无效');
    const pots: PotSave[] = [];
    for (const item of data.pots) {
        const pot = parsePot(item, catalog);
        if (pot.ok === false) return pot;
        pots.push(pot.save);
    }
    for (const tier of data.committedTier) if (!TIERS.includes(tier as FreshTier | '')) return fail('当班记录无效');
    for (const bowl of data.bowls) if (!BOWLS.includes(bowl as BowlKind)) return fail('当班记录无效');
    const pantry = parsePantry(data.pantry, catalog);
    if (pantry.ok === false) return pantry;
    if (!Array.isArray(data.served)) return fail('当班记录无效');
    const served: ServedDish[] = [];
    for (const item of data.served) {
        const dish = parseDish(item, catalog);
        if (dish.ok === false) return dish;
        served.push(dish.dish);
    }
    return {
        ok: true,
        save: {
            focus: data.focus, nightService: data.nightService, owingRent: data.owingRent,
            committedTier: [...data.committedTier] as Array<FreshTier | ''>, bowls: [...data.bowls] as BowlKind[],
            pots, pantry: pantry.save, served,
        },
    };
}

function parsePot(raw: unknown, catalog: Catalog): { ok: true; save: PotSave } | DeskIssue {
    const data = record(raw);
    if (!data || !PHASES.includes(data.phase as PotPhase) || !HEATS.includes(data.heat as HeatName)) return fail('当班记录无效');
    if (!unit(data.simmer) || !unit(data.stir) || !unit(data.doneness) || !unit(data.scorch)) return fail('锅的熟度无效');
    if (typeof data.recipeId !== 'string' || (data.recipeId && !catalog.recipe(data.recipeId))) return fail('图鉴引用了未知菜谱');
    if (!Array.isArray(data.added) || data.added.some(id => typeof id !== 'string' || !catalog.ingredient(id))) return fail('图鉴引用了未知菜谱');
    if (!SEASONS.includes(data.season as string) || !RESULTS.includes(data.result as string) || typeof data.dumped !== 'boolean') return fail('当班记录无效');
    if (!integer(data.mistimes, 0, 99)) return fail('当班记录无效');
    if (!span(data.plateLeft) || !span(data.prepLeft) || !span(data.washLeft) || !span(data.windup) || !span(data.sinceStir)) return fail('当班记录无效');
    if (typeof data.warnLatched !== 'boolean' || typeof data.seasonLocked !== 'boolean') return fail('当班记录无效');
    if (data.masteryPoints != null && !integer(data.masteryPoints, 0, 999)) return fail('厨艺记录无效');
    return { ok: true, save: data as unknown as PotSave };
}

function parsePantry(raw: unknown, catalog: Catalog): { ok: true; save: PantrySave } | DeskIssue {
    const data = record(raw);
    if (!data || !Array.isArray(data.units) || !Array.isArray(data.bought)) return fail('当班记录无效');
    for (const unitRow of data.units) {
        const row = record(unitRow);
        if (!row || typeof row.id !== 'string' || !catalog.ingredient(row.id) || !span(row.hoursLeft) || typeof row.ready !== 'boolean' || !span(row.prepLeft)) return fail('图鉴引用了未知菜谱');
    }
    for (const bought of data.bought) {
        const row = record(bought);
        if (!row || typeof row.id !== 'string' || !catalog.ingredient(row.id) || !integer(row.count, 0, 99)) return fail('图鉴引用了未知菜谱');
    }
    return { ok: true, save: data as unknown as PantrySave };
}

function parseDish(raw: unknown, catalog: Catalog): { ok: true; dish: ServedDish } | DeskIssue {
    const data = record(raw);
    if (!data || typeof data.potId !== 'string' || typeof data.recipeId !== 'string' || !catalog.recipe(data.recipeId)) return fail('图鉴引用了未知菜谱');
    if (!RESULTS.includes(data.result as string) || !data.result || !SEASONS.includes(data.season as string) || !data.season) return fail('当班记录无效');
    if (!integer(data.missingAdds, 0, 9) || !integer(data.mistimes, 0, 99) || !integer(data.freshSteps, 0, 9) || !integer(data.appearance, 0, 99)) return fail('当班记录无效');
    return { ok: true, dish: data as unknown as ServedDish };
}

function parseService(raw: unknown, catalog: Catalog): { ok: true; save: ServiceSave } | DeskIssue {
    const data = record(raw);
    if (!data) return fail('当班记录无效');
    if (!integer(data.day, 1, 999) || !whole(data.seed) || !integer(data.pots, 1, 4) || !integer(data.seats, 1, 20)) return fail('当班记录无效');
    if (typeof data.atmosphere !== 'number' || !Number.isFinite(data.atmosphere) || data.atmosphere < 0 || data.atmosphere > 100) return fail('当班记录无效');
    if (typeof data.rescue !== 'boolean' || !SHIFT.includes(data.phase as ShiftPhase) || typeof data.soldOut !== 'boolean') return fail('当班记录无效');
    if (!span(data.elapsed) || !span(data.prepLeft) || !span(data.closeLeft)) return fail('当班记录无效');
    if (!integer(data.spawned, 0, 99) || !integer(data.serial, 0, 999999) || !integer(data.wallet, 0, 999999) || typeof data.owingRent !== 'boolean') return fail('存档金额或进度无效');
    const rng = record(data.rng);
    if (!rng || !whole(rng.seed) || !integer(rng.step, 0, 1_000_000_000)) return fail('随机数位置无效');
    if (!Array.isArray(data.orders) || !Array.isArray(data.guests) || !Array.isArray(data.planned) || !Array.isArray(data.departures)) return fail('当班记录无效');
    for (const order of data.orders) {
        const row = record(order);
        if (!row || typeof row.orderId !== 'string' || typeof row.customerId !== 'string' || !catalog.customer(row.customerId)) return fail('图鉴引用了未知顾客');
        if (typeof row.recipeId !== 'string' || !catalog.recipe(row.recipeId) || typeof row.potId !== 'string') return fail('图鉴引用了未知菜谱');
        if (!ORDER_STATES.includes(row.state as OrderState) || !REASONS.includes(row.reason as LeaveReason | '')) return fail('当班记录无效');
        if (!span(row.patience) || !span(row.patienceLeft)) return fail('当班记录无效');
    }
    for (const guest of data.guests) {
        const row = record(guest);
        if (!row || (row.customerId !== '' && (typeof row.customerId !== 'string' || !catalog.customer(row.customerId)))) return fail('图鉴引用了未知顾客');
        if (typeof row.orderId !== 'string' || !GUEST_WHERE.includes(row.where as string) || !span(row.waitLeft) || !span(row.dineLeft)) return fail('当班记录无效');
    }
    if (data.planned.some(time => !span(time))) return fail('当班记录无效');
    for (const left of data.departures) {
        const row = record(left);
        if (!row || (row.customerId !== '' && !catalog.customer(String(row.customerId))) || typeof row.orderId !== 'string' || !REASONS.includes(row.reason as LeaveReason)) return fail('当班记录无效');
    }
    const favor = record(data.favor);
    if (!favor) return fail('当班记录无效');
    for (const [id, value] of Object.entries(favor)) {
        if (!catalog.customer(id) || !integer(value, 0, catalog.balance.demand.favorMax)) return fail('图鉴引用了未知顾客');
    }
    if (!Array.isArray(data.receipts) || !Array.isArray(data.pendingFavor) || !Array.isArray(data.held)) return fail('当班记录无效');
    for (const line of data.receipts) {
        const row = record(line);
        if (!row || typeof row.recipeId !== 'string' || !catalog.recipe(row.recipeId) || !RESULTS.includes(row.result as string)) return fail('图鉴引用了未知菜谱');
        if (row.customerId !== undefined && (typeof row.customerId !== 'string' || !catalog.customer(row.customerId))) return fail('图鉴引用了未知顾客');
        if (!integer(row.score, 0, 999) || !integer(row.pay, 0, 999999) || !integer(row.tip, 0, 999999) || !integer(row.cost, 0, 999999)) return fail('存档金额或进度无效');
    }
    for (const change of data.pendingFavor) {
        const row = record(change);
        if (!row || typeof row.id !== 'string' || !catalog.customer(row.id) || !integer(row.delta, -99, 99)) return fail('图鉴引用了未知顾客');
    }
    for (const held of data.held) {
        const row = record(held);
        if (!row || typeof row.orderId !== 'string') return fail('当班记录无效');
        const dish = parseDish(row.dish, catalog);
        if (dish.ok === false) return dish;
    }
    if (data.report !== null) {
        const report = record(data.report);
        const favorReport = report ? record(report.favor) : null;
        if (!report || !favorReport || typeof report.worst !== 'string' || typeof report.owingRent !== 'boolean' || report.chapterContinues !== true) return fail('存档金额或进度无效');
        if (!integer(report.revenue, 0, 999999) || !integer(report.tips, 0, 999999) || !integer(report.ingredientCost, 0, 999999)) return fail('存档金额或进度无效');
        if (!integer(report.rentDue, 0, 999999) || !integer(report.rentPaid, 0, 999999) || !integer(report.left, 0, 999) || !integer(report.wallet, 0, 999999)) return fail('存档金额或进度无效');
        if (report.wallet !== data.wallet || report.owingRent !== data.owingRent) return fail('存档金额或进度无效');
        for (const [id, value] of Object.entries(favorReport)) {
            if (!catalog.customer(id) || !integer(value, 0, catalog.balance.demand.favorMax)) return fail('图鉴引用了未知顾客');
        }
    }
    return { ok: true, save: data as unknown as ServiceSave };
}
