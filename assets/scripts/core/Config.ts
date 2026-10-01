/**
 * 规则配置类型与启动校验。数值源头见文档 04，字段见文档 05。
 * 纯 TypeScript，不引用 cc，可在 node 测试里直接编译。
 */

export type Heat = 'low' | 'mid' | 'high';
export type PrepKind = 'wash' | 'cut' | 'soak' | 'none';
export type Seasoning = 'plain' | 'savory' | 'sweet';
export type WaveId = 'morning' | 'forenoon' | 'lunch' | 'evening';
export type SlotId = 'door' | 'hall' | 'counter' | 'kitchen' | 'window';
export type StyleId = 'warm-wood' | 'night-blue' | 'morning-white';
export type AtmoKey = 'warmth' | 'clean' | 'aroma' | 'light';
export type AtmoPart = AtmoKey | 'crowd';

export const HEATS: Heat[] = ['low', 'mid', 'high'];
export const SLOTS: SlotId[] = ['door', 'hall', 'counter', 'kitchen', 'window'];
export const WAVES: WaveId[] = ['morning', 'forenoon', 'lunch', 'evening'];
export const STYLES: StyleId[] = ['warm-wood', 'night-blue', 'morning-white'];
export const SEASONINGS: Seasoning[] = ['plain', 'savory', 'sweet'];
export const ATMO_PARTS: AtmoPart[] = ['warmth', 'clean', 'aroma', 'light', 'crowd'];
export const UPGRADE_KEYS = ['pots', 'seats', 'prepSlots', 'buySlots', 'holdScoreSeconds'];

export interface HeatCoef { doneness: number; scorch: number; simmerTarget: number; simmerRate: number }
export interface WaveCfg { id: WaveId; name: string; start: number; end: number; share: number }

export interface Balance {
    version: string;
    session: {
        fixedStepMs: number; catchUpSteps: number; prepSeconds: number; shiftSeconds: number; arrivalCutoffSeconds: number;
        closeSeconds: number; gameHourSeconds: number; overnightHours: number; initialWallet: number; rent: number;
        rentStartsOnDay: number; rescueFloor: number; rescueRice: number; initialPots: number; initialSeats: number;
        initialPrepSlots: number; initialBuyKinds: number; debtBuyKinds: number; unitCap: number; passCapacity: number;
        autosaveSeconds: number;
    };
    actions: { wash: number; cut: number; soak: number; none: number; stirWindup: number; serve: number; plate: number; deliver: number; wipe: number; potWash: number };
    heat: Record<Heat, HeatCoef>;
    stir: { decayFocus: number; decayBlur: number; gain: number; repeatSeconds: number; repeatGainScale: number; warn: number; lowStirScorch: number };
    gates: { serveMin: number; serveMax: number; center: number; burn: number };
    score: {
        base: number; perfect: number; over: number; raw: number; burnt: number; freshStep: number; missing: number; mistime: number;
        mistimeCap: number; addWindow: number; seasonMismatch: number; coolStartSeconds: number; coolStepSeconds: number; coolStep: number;
        coolCap: number; max: number; pickyQualityCare: number; tipRate: number; tipMinScore: number; signatureTipScale: number; signatureAtmosphere: number;
    };
    demand: {
        extraDayBase: number; extraPerShopLevel: number; maxArrivals: number; waves: WaveCfg[]; arrivalJitter: number; criticDailyCap: number;
        basePatience: number; expectPrep: number; expectAdd: number; ordersBase: number; ordersPerPot: number; ordersMax: number;
        doorQueue: number; doorWaitSeconds: number; closePatienceScale: number; dineSeconds: number; tagMatch: number; budgetBase: number;
        budgetPerCompletedDay: number; budgetStep: number; pricePenalty: number; chapterCriticDay: number;
    };
    favor: { match: number; serve: number; fail: number; dailyGainCap: number; max: number; regularUnlockFavor: number };
    skill: { perfect: number; over: number; raw: number; burnt: number; practicePerfect: number; practiceCap: number; tiers: Array<{ min: number; warn?: number; addWindow?: number }> };
}

export interface Ingredient { id: string; name: string; unit: string; buyPrice: number; freshHours: number; prep: PrepKind; tags: string[] }
export interface RecipeIngredient { id: string; count: number }
export interface RecipeAdd { id: string; atDoneness: number }
export interface Recipe {
    id: string; name: string; unlockDay: number; cost: number; price: number; cookSeconds: number; scorchMul: number;
    ingredients: RecipeIngredient[]; adds: RecipeAdd[]; seasoning: Seasoning; tags: string[]; color: string; heatHint: Heat; freshPenalty: number;
}
export interface Customer {
    id: string; name: string; unlockDay: number; unlockFavor?: Record<string, number>; patienceBonus: number; acceptedTags: string[];
    priceCare: number; qualityCare: number; atmosphereCare: number; tracksFavor: boolean; waveWeights: Record<WaveId, number>;
}
export interface DayPlan { day: number; scheduledArrivals: number }
export interface Upgrade { id: string; name: string; requiredCompletedDays: number; price: number; requires?: string; effect: Record<string, number> }
export interface StyleCfg { id: StyleId; name: string; unlock: { type: 'default' | 'completedDays' | 'story'; value?: number | string; fallbackDays?: number } }
export interface TablewareLook { bonus: number; tags: string[]; wave: WaveId | null; otherWave: number }
export interface Decor {
    id: string; name: string; kind: 'main' | 'small' | 'tableware'; slot: SlotId | null; style: StyleId | 'common'; price: number;
    atmosphere: Record<AtmoKey, number>; look?: TablewareLook; mesh: string;
}
export interface AtmosphereCfg {
    id: string; base: Record<AtmoPart, number>; weights: Record<AtmoPart, number>; cookingAroma: number; burntAroma: number;
    dirtyBowlClean: number; dirtyBowlInterval: number; burntPotClean: number; mixStyleLimit: number; mixLightPenalty: number;
    criticRejectBelow: number; criticRejectChance: number; reorderAtLeast: number; reorderChance: number; reorderCustomers: string[]; sampleSeconds: number;
}
export type StoryCondition =
    | { type: 'favor'; customerId: string; min: number }
    | { type: 'served'; customerId: string; recipeId?: string; tag?: string; result?: string; wave?: WaveId }
    | { type: 'streak'; customerId: string; recipeIds: string[]; result: string; days: number }
    | { type: 'dayAtmosphere'; min: number }
    | { type: 'codex'; min: number };
export type StoryReward =
    | { type: 'none' }
    | { type: 'recipe'; id: string }
    | { type: 'decor'; id: string }
    | { type: 'style'; id: StyleId; fallback?: StoryReward }
    | { type: 'proficiency'; recipeId: string; amount: number }
    | { type: 'guest'; customerId: string; wave: WaveId; first: boolean }
    | { type: 'pin' };
export interface Story { id: string; customerId: string; conditions: StoryCondition[]; lines: string[]; reward: StoryReward }
export interface Activity {
    id: string; name: string; startDay: number; lastDays: number; recipeId: string;
    atmosphereShift?: Partial<Record<AtmoPart, number>>; arrivalBias?: Record<string, number>;
}
export interface AudioCue { id: string; event: string; file: string }

export interface GameConfig {
    balance: Balance;
    ingredients: Ingredient[];
    recipes: Recipe[];
    customers: Customer[];
    days: DayPlan[];
    upgrades: Upgrade[];
    styles: StyleCfg[];
    decor: Decor[];
    atmosphere: AtmosphereCfg;
    stories: Story[];
    activities: Activity[];
    audio: AudioCue[];
    ingredient: Map<string, Ingredient>;
    recipe: Map<string, Recipe>;
    customer: Map<string, Customer>;
    upgrade: Map<string, Upgrade>;
    decorById: Map<string, Decor>;
    story: Map<string, Story>;
}

export const CONFIG_FILES = [
    'balance', 'ingredients', 'recipes', 'customers', 'days', 'upgrades', 'styles', 'decor', 'atmosphere', 'stories', 'activities', 'audio',
] as const;
export type ConfigFile = typeof CONFIG_FILES[number];

export class ConfigError extends Error {
    constructor(readonly file: string, readonly id: string, readonly detail: string) {
        super(`${file}.json${id ? ` [${id}]` : ''}：${detail}`);
        this.name = 'ConfigError';
    }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function need(cond: unknown, file: string, id: string, detail: string): void {
    if (!cond) throw new ConfigError(file, id, detail);
}

function list<T>(raw: unknown, file: string): T[] {
    need(Array.isArray(raw), file, '', '应为数组');
    return raw as T[];
}

function uniqueIds(rows: Array<{ id: string }>, file: string, prefix: string): void {
    const seen = new Set<string>();
    for (const row of rows) {
        need(isObj(row) && typeof row.id === 'string', file, '', '缺少 id');
        need(new RegExp(`^${prefix}\\d{2}$`).test(row.id), file, row.id, `id 应为 ${prefix} 加两位数字`);
        need(!seen.has(row.id), file, row.id, 'id 重复');
        seen.add(row.id);
    }
}

function numbers(obj: unknown, keys: string[], file: string, id: string): void {
    need(isObj(obj), file, id, '应为对象');
    for (const k of keys) need(num((obj as Record<string, unknown>)[k]), file, id, `${k} 应为数字`);
}

/** 读入全部规则表并校验。任一错误抛出 ConfigError，指出文件、id 与字段。 */
export function parseConfig(raw: Partial<Record<ConfigFile, unknown>>): GameConfig {
    for (const f of CONFIG_FILES) need(raw[f] !== undefined, f, '', '文件缺失');
    const balance = raw.balance as Balance;
    need(isObj(balance) && typeof balance.version === 'string', 'balance', '', '缺少 version');
    numbers(balance.session, ['fixedStepMs', 'catchUpSteps', 'prepSeconds', 'shiftSeconds', 'arrivalCutoffSeconds', 'closeSeconds',
        'gameHourSeconds', 'overnightHours', 'initialWallet', 'rent', 'rentStartsOnDay', 'rescueFloor', 'rescueRice', 'initialPots',
        'initialSeats', 'initialPrepSlots', 'initialBuyKinds', 'debtBuyKinds', 'unitCap', 'passCapacity', 'autosaveSeconds'], 'balance', 'session');
    need(balance.session.fixedStepMs === 50, 'balance', 'session', 'fixedStepMs 必须为 50');
    numbers(balance.actions, ['wash', 'cut', 'soak', 'none', 'stirWindup', 'serve', 'plate', 'deliver', 'wipe', 'potWash'], 'balance', 'actions');
    for (const h of HEATS) numbers(balance.heat?.[h], ['doneness', 'scorch', 'simmerTarget', 'simmerRate'], 'balance', `heat.${h}`);
    numbers(balance.stir, ['decayFocus', 'decayBlur', 'gain', 'repeatSeconds', 'repeatGainScale', 'warn', 'lowStirScorch'], 'balance', 'stir');
    numbers(balance.gates, ['serveMin', 'serveMax', 'center', 'burn'], 'balance', 'gates');
    numbers(balance.score, ['base', 'perfect', 'over', 'raw', 'burnt', 'freshStep', 'missing', 'mistime', 'mistimeCap', 'addWindow',
        'seasonMismatch', 'coolStartSeconds', 'coolStepSeconds', 'coolStep', 'coolCap', 'max', 'pickyQualityCare', 'tipRate', 'tipMinScore',
        'signatureTipScale', 'signatureAtmosphere'], 'balance', 'score');
    numbers(balance.demand, ['extraDayBase', 'extraPerShopLevel', 'maxArrivals', 'arrivalJitter', 'criticDailyCap', 'basePatience',
        'expectPrep', 'expectAdd', 'ordersBase', 'ordersPerPot', 'ordersMax', 'doorQueue', 'doorWaitSeconds', 'closePatienceScale',
        'dineSeconds', 'tagMatch', 'budgetBase', 'budgetPerCompletedDay', 'budgetStep', 'pricePenalty', 'chapterCriticDay'], 'balance', 'demand');
    const waves = list<WaveCfg>(balance.demand.waves, 'balance');
    need(waves.length === 4 && waves.every((w, i) => w.id === WAVES[i]), 'balance', 'demand.waves', '必须按 morning/forenoon/lunch/evening 排列');
    need(Math.abs(waves.reduce((s, w) => s + w.share, 0) - 1) < 0.001, 'balance', 'demand.waves', '份额和必须为 1');
    numbers(balance.favor, ['match', 'serve', 'fail', 'dailyGainCap', 'max', 'regularUnlockFavor'], 'balance', 'favor');
    numbers(balance.skill, ['perfect', 'over', 'raw', 'burnt', 'practicePerfect', 'practiceCap'], 'balance', 'skill');

    const ingredients = list<Ingredient>(raw.ingredients, 'ingredients');
    uniqueIds(ingredients, 'ingredients', 'I');
    for (const i of ingredients) {
        need(typeof i.name === 'string' && i.name.length > 0, 'ingredients', i.id, 'name 缺失');
        need(num(i.buyPrice) && i.buyPrice > 0, 'ingredients', i.id, 'buyPrice 应为正数');
        need([24, 48, 72].includes(i.freshHours), 'ingredients', i.id, 'freshHours 只能是 24/48/72');
        need(['wash', 'cut', 'soak', 'none'].includes(i.prep), 'ingredients', i.id, 'prep 枚举非法');
    }
    const ingredient = new Map(ingredients.map(i => [i.id, i]));

    const recipes = list<Recipe>(raw.recipes, 'recipes');
    uniqueIds(recipes, 'recipes', 'R');
    for (const r of recipes) {
        need(Array.isArray(r.ingredients) && r.ingredients.length > 0, 'recipes', r.id, 'ingredients 为空');
        let cost = 0;
        for (const it of r.ingredients) {
            const ing = ingredient.get(it.id);
            need(ing, 'recipes', r.id, `食材 ${it.id} 不存在`);
            need(num(it.count) && it.count > 0, 'recipes', r.id, `食材 ${it.id} 数量非法`);
            cost += ing!.buyPrice * it.count;
        }
        need(Array.isArray(r.adds), 'recipes', r.id, 'adds 应为数组');
        for (const a of r.adds) {
            need(r.ingredients.some(x => x.id === a.id), 'recipes', r.id, `配料 ${a.id} 不在 ingredients 中`);
            need(num(a.atDoneness) && a.atDoneness >= 0.2 && a.atDoneness <= 0.85, 'recipes', r.id, `配料 ${a.id} atDoneness 应在 0.2–0.85`);
        }
        need(r.ingredients.some(x => !r.adds.some(a => a.id === x.id)), 'recipes', r.id, '至少需要一种底料');
        need(r.cost === cost, 'recipes', r.id, `cost ${r.cost} 与食材价之和 ${cost} 不符`);
        need(num(r.price) && r.cost < r.price, 'recipes', r.id, 'cost 必须小于 price');
        need(num(r.cookSeconds) && r.cookSeconds > 0, 'recipes', r.id, 'cookSeconds 非法');
        need(num(r.scorchMul) && r.scorchMul >= 0.5 && r.scorchMul <= 2, 'recipes', r.id, 'scorchMul 应在 0.5–2.0');
        need(SEASONINGS.includes(r.seasoning), 'recipes', r.id, 'seasoning 枚举非法');
        need(HEATS.includes(r.heatHint), 'recipes', r.id, 'heatHint 枚举非法');
        need(r.freshPenalty === 1 || r.freshPenalty === 2, 'recipes', r.id, 'freshPenalty 只能是 1 或 2');
        need(/^#[0-9A-Fa-f]{6}$/.test(r.color), 'recipes', r.id, 'color 应为 #RRGGBB');
    }
    const recipe = new Map(recipes.map(r => [r.id, r]));

    const customers = list<Customer>(raw.customers, 'customers');
    uniqueIds(customers, 'customers', 'C');
    for (const c of customers) {
        for (const k of ['priceCare', 'qualityCare', 'atmosphereCare'] as const) {
            need(num(c[k]) && c[k] >= 0 && c[k] <= 1, 'customers', c.id, `${k} 应在 0–1`);
        }
        need(isObj(c.waveWeights) && WAVES.every(w => num(c.waveWeights[w])), 'customers', c.id, 'waveWeights 需含四个波次');
        need(WAVES.some(w => c.waveWeights[w] > 0), 'customers', c.id, 'waveWeights 不能全为 0');
        need(typeof c.tracksFavor === 'boolean', 'customers', c.id, 'tracksFavor 应为布尔');
    }
    const customer = new Map(customers.map(c => [c.id, c]));
    for (const c of customers) {
        for (const k of Object.keys(c.unlockFavor ?? {})) need(customer.has(k), 'customers', c.id, `unlockFavor 引用 ${k} 不存在`);
    }

    const days = list<DayPlan>(raw.days, 'days');
    need(days.length === 7 && days.every((d, i) => d.day === i + 1 && num(d.scheduledArrivals)), 'days', '', '需要第 1–7 日的 scheduledArrivals');

    const upgrades = list<Upgrade>(raw.upgrades, 'upgrades');
    uniqueIds(upgrades, 'upgrades', 'U');
    const upgrade = new Map(upgrades.map(u => [u.id, u]));
    for (const u of upgrades) {
        need(isObj(u.effect), 'upgrades', u.id, 'effect 缺失');
        for (const k of Object.keys(u.effect)) need(UPGRADE_KEYS.includes(k), 'upgrades', u.id, `效果键 ${k} 不在白名单`);
        if (u.requires) need(upgrade.has(u.requires), 'upgrades', u.id, `requires ${u.requires} 不存在`);
    }

    const styles = list<StyleCfg>(raw.styles, 'styles');
    need(styles.length === 3 && STYLES.every(s => styles.some(x => x.id === s)), 'styles', '', '需要三种风格');

    const decor = list<Decor>(raw.decor, 'decor');
    uniqueIds(decor, 'decor', 'D');
    for (const d of decor) {
        need(['main', 'small', 'tableware'].includes(d.kind), 'decor', d.id, 'kind 枚举非法');
        need(d.style === 'common' || STYLES.includes(d.style as StyleId), 'decor', d.id, 'style 不存在');
        if (d.kind === 'tableware') need(isObj(d.look), 'decor', d.id, '餐具必须有 look');
        else need(SLOTS.includes(d.slot as SlotId), 'decor', d.id, 'slot 枚举非法');
        need(num(d.price) && d.price >= 0, 'decor', d.id, 'price 非法');
    }
    const decorById = new Map(decor.map(d => [d.id, d]));

    const atmosphere = raw.atmosphere as AtmosphereCfg;
    need(isObj(atmosphere), 'atmosphere', '', '应为对象');
    const wsum = ATMO_PARTS.reduce((s, k) => s + (atmosphere.weights?.[k] ?? NaN), 0);
    need(Math.abs(wsum - 1) < 0.001, 'atmosphere', atmosphere.id ?? '', '权重和必须为 1');

    const stories = list<Story>(raw.stories, 'stories');
    uniqueIds(stories, 'stories', 'S');
    const checkReward = (s: Story, r: StoryReward): void => {
        switch (r?.type) {
            case 'none': case 'pin': return;
            case 'recipe': need(recipe.has(r.id), 'stories', s.id, `奖励粥谱 ${r.id} 不存在`); return;
            case 'decor': need(decorById.has(r.id), 'stories', s.id, `奖励装修 ${r.id} 不存在`); return;
            case 'style': need(STYLES.includes(r.id), 'stories', s.id, `奖励风格 ${r.id} 不存在`); if (r.fallback) checkReward(s, r.fallback); return;
            case 'proficiency': need(recipe.has(r.recipeId), 'stories', s.id, '熟练奖励粥谱不存在'); return;
            case 'guest': need(customer.has(r.customerId) && WAVES.includes(r.wave), 'stories', s.id, '来客奖励非法'); return;
            default: throw new ConfigError('stories', s.id, '奖励类型非法');
        }
    };
    for (const s of stories) {
        need(customer.has(s.customerId), 'stories', s.id, 'customerId 不存在');
        need(Array.isArray(s.lines) && s.lines.length > 0 && s.lines.length <= 8, 'stories', s.id, 'lines 应为 1–8 句');
        for (const c of s.conditions) {
            switch (c.type) {
                case 'favor': need(customer.has(c.customerId), 'stories', s.id, '条件客人不存在'); break;
                case 'served': need(customer.has(c.customerId) && (!c.recipeId || recipe.has(c.recipeId)), 'stories', s.id, 'served 条件引用不存在'); break;
                case 'streak': need(c.recipeIds.every(r => recipe.has(r)), 'stories', s.id, 'streak 粥谱不存在'); break;
                case 'dayAtmosphere': case 'codex': break;
                default: throw new ConfigError('stories', s.id, '条件类型非法');
            }
        }
        checkReward(s, s.reward);
    }

    const activities = list<Activity>(raw.activities, 'activities');
    for (const a of activities) {
        need(recipe.has(a.recipeId), 'activities', a.id, `活动粥谱 ${a.recipeId} 不存在`);
        const shift = Object.values(a.atmosphereShift ?? {}).reduce((s: number, v) => s + (v ?? 0), 0);
        need(Math.abs(shift) < 0.001, 'activities', a.id, 'atmosphereShift 之和必须为 0');
    }
    const audio = list<AudioCue>(raw.audio, 'audio');

    return {
        balance, ingredients, recipes, customers, days, upgrades, styles, decor, atmosphere, stories, activities, audio,
        ingredient, recipe, customer, upgrade, decorById, story: new Map(stories.map(s => [s.id, s])),
    };
}

/** 粥谱的底料：不在 adds 里的食材。 */
export function baseIngredients(r: Recipe): RecipeIngredient[] {
    return r.ingredients.filter(i => !r.adds.some(a => a.id === i.id));
}

export function waveAt(balance: Balance, t: number): WaveCfg {
    const waves = balance.demand.waves;
    for (const w of waves) if (t < w.end) return w;
    return waves[waves.length - 1];
}
