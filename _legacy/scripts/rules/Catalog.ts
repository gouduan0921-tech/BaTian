/** 启动时读入文档 05 的规则表。失败时带上文件名和 ID，调用方应阻止进店。 */

export class RuleError extends Error {
    readonly file: string;
    readonly id: string;
    constructor(file: string, id: string, detail: string) {
        super(id ? `${file} ${id}：${detail}` : `${file}：${detail}`);
        this.name = 'RuleError';
        this.file = file;
        this.id = id;
    }
}

export type HeatName = 'low' | 'mid' | 'high';
export type PrepKind = 'wash' | 'soak' | 'cut' | 'none';
export type DecorSlot = 'door' | 'hall' | 'counter' | 'kitchen' | 'window';
export type DecorStyle = 'warm-wood' | 'night-blue' | 'morning-white';

export interface HeatRate { doneness: number; scorch: number; simmer: number }
export interface Balance {
    version: string;
    session: {
        initialWallet: number; shiftSeconds: number; arrivalCutoffSeconds: number;
        prepSeconds: number; closeSeconds: number; rent: number; rentStartsOnDay: number;
        rescueFloor: number; fixedStepMs: number; dishPrepSeconds: number; serveSeconds: number;
        plateSeconds: number; washSeconds: number; basePatience: number; doorWaitSeconds: number;
        busyRetrySeconds: number; initialPots: number; initialSeats: number; initialPrepSlots: number;
        initialBuyKinds: number; unitCap: number; debtBuyKinds: number; maxOrders: number;
        catchUpSteps: number; addPatienceSeconds: number;
    };
    heat: Record<HeatName, HeatRate>;
    stir: {
        decayFocus: number; decayBlur: number; gain: number; warn: number;
        windupSeconds: number; repeatSeconds: number; lowStirScorch: number;
    };
    gates: { serveMin: number; serveMax: number; burn: number };
    score: {
        base: number; perfect: number; over: number; raw: number; burnt: number;
        freshStep: number; missing: number; mistime: number; mistimeCap: number;
        addWindow: number; seasonMismatch: number; tipRate: number; tipMinScore: number;
    };
    prep: Record<PrepKind, number>;
    bowls: { coarse: number; glaze: number; night: number };
    demand: {
        tagMatch: number; budgetBase: number; budgetPerCompletedDay: number; budgetStep: number;
        orderSlotsAtOnePot: number; orderSlotsPerExtraPot: number; doorQueue: number;
        lunchIntervalDivisor: number; minArrivalIntervalSeconds: number; waveSeconds: number;
        closePatienceScale: number; dineSeconds: number; maxArrivals: number;
        favorMatch: number; favorServe: number; favorFail: number; favorMax: number;
    };
}
export type BowlKind = 'coarse' | 'glaze' | 'night';
export interface Ingredient { id: string; name: string; unit: string; buyPrice: number; freshHours: number; prep: PrepKind; tags: string[] }
export interface IngredientUse { id: string; count: number }
export interface AddPoint { id: string; atDoneness: number }
export interface Recipe {
    id: string; name: string; unlockDay: number; cost: number; price: number; cookSeconds: number;
    ingredients: IngredientUse[]; adds: AddPoint[]; tags: string[]; color: string; heatHint: HeatName; freshPenalty: number;
}
export interface Customer {
    id: string; name: string; unlockDay: number; patienceBonus: number; acceptedTags: string[];
    priceCare: number; qualityCare: number; atmosphereCare: number; tracksFavor: boolean;
}
export interface Upgrade { id: string; name: string; requiredCompletedDays: number; price: number; effect: Record<string, number> }
export interface DecorAtmosphere { warmth: number; clean: number; aroma: number; light: number }
export interface Decor { id: string; name: string; slot: DecorSlot; style: DecorStyle; price: number; atmosphere: DecorAtmosphere; mesh: string }
export interface Atmosphere {
    id: string;
    weights: DecorAtmosphere & { crowd: number };
    base: DecorAtmosphere & { crowd: number };
    cookingAroma: number; burntAroma: number; mixLightPenalty: number;
    criticRejectAtmosphere: number; criticRejectChance: number; reorderAtmosphere: number;
}
export interface DayPlan { day: number; arrivalIntervalSeconds: number; scheduledArrivals: number }
export interface Story {
    id: string; customerId: string; requiresRecipe: string; requiresResult: '' | 'perfect';
    minFavor: number; minAtmosphere: number; lines: string[]; reward: string;
}
export interface AudioCue { id: string; event: string; file: string }

export interface Activity {
    id: string;
    name: string;
    startDay: number;
    lastDays: number;
    recipeId: string;
    atmosphereShift: { warmth: number; light: number };
    arrivalBias: Record<string, number>;
}

/** 同一天只取 id 最小的一条。空表返回空。 */
export function activeActivity(activities: Activity[], day: number): Activity | null {
    const live = activities.filter(item => day >= item.startDay && day < item.startDay + item.lastDays);
    live.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    return live[0] ?? null;
}

const FILES = ['balance.json', 'ingredients.json', 'recipes.json', 'customers.json', 'upgrades.json', 'decor.json', 'atmosphere.json', 'days.json', 'stories.json', 'audio.json', 'activities.json'];
const EFFECT_KEYS = ['pots', 'seats', 'prepSlots', 'buySlots', 'holdScoreSeconds'];
const HEATS: HeatName[] = ['low', 'mid', 'high'];
const PREPS: PrepKind[] = ['wash', 'soak', 'cut', 'none'];
const SLOTS: DecorSlot[] = ['door', 'hall', 'counter', 'kitchen', 'window'];
const STYLES: DecorStyle[] = ['warm-wood', 'night-blue', 'morning-white'];

export class Catalog {
    constructor(
        readonly balance: Balance,
        readonly ingredients: Ingredient[],
        readonly recipes: Recipe[],
        readonly customers: Customer[],
        readonly upgrades: Upgrade[],
        readonly decor: Decor[],
        readonly atmosphere: Atmosphere,
        readonly days: DayPlan[],
        readonly stories: Story[],
        readonly audio: AudioCue[],
        readonly activities: Activity[],
    ) {}

    ingredient(id: string): Ingredient | undefined { return this.ingredients.find(item => item.id === id); }
    recipe(id: string): Recipe | undefined { return this.recipes.find(item => item.id === id); }
    customer(id: string): Customer | undefined { return this.customers.find(item => item.id === id); }
    upgrade(id: string): Upgrade | undefined { return this.upgrades.find(item => item.id === id); }
    decorItem(id: string): Decor | undefined { return this.decor.find(item => item.id === id); }
}

export function parseCatalog(files: Readonly<Record<string, unknown>>): Catalog {
    for (const file of FILES) if (files[file] == null) throw new RuleError(file, '', '规则文件缺失');
    const balance = parseBalance(files['balance.json']);
    const ingredients = parseIngredients(files['ingredients.json']);
    const recipes = parseRecipes(files['recipes.json'], ingredients);
    const customers = parseCustomers(files['customers.json']);
    const upgrades = parseUpgrades(files['upgrades.json']);
    const decor = parseDecor(files['decor.json']);
    const atmosphere = parseAtmosphere(files['atmosphere.json']);
    const days = parseDays(files['days.json']);
    const stories = parseStories(files['stories.json'], customers, recipes, decor);
    const audio = parseAudio(files['audio.json']);
    const activities = parseActivities(files['activities.json'], new Set(recipes.map(recipe => recipe.id)));
    return new Catalog(balance, ingredients, recipes, customers, upgrades, decor, atmosphere, days, stories, audio, activities);
}

function parseBalance(raw: unknown): Balance {
    const file = 'balance.json';
    const data = record(raw, file, '');
    exactKeys(data, ['version', 'session', 'heat', 'stir', 'gates', 'score', 'prep', 'bowls', 'demand'], file, '');
    if (data.version !== 'balance-1') throw new RuleError(file, '', '版本必须是 balance-1');
    const session = record(data.session, file, 'session');
    exactKeys(session, ['initialWallet', 'shiftSeconds', 'arrivalCutoffSeconds', 'prepSeconds', 'closeSeconds', 'rent', 'rentStartsOnDay', 'rescueFloor', 'fixedStepMs', 'dishPrepSeconds', 'serveSeconds', 'plateSeconds', 'washSeconds', 'basePatience', 'doorWaitSeconds', 'busyRetrySeconds', 'initialPots', 'initialSeats', 'initialPrepSlots', 'initialBuyKinds', 'unitCap', 'debtBuyKinds', 'maxOrders', 'catchUpSteps', 'addPatienceSeconds'], file, 'session');
    const numbers = {} as Balance['session'];
    for (const key of Object.keys(session)) numbers[key as keyof Balance['session']] = nonNegative(session[key], file, `session.${key}`);
    if (numbers.fixedStepMs !== 50) throw new RuleError(file, 'session.fixedStepMs', '固定步长必须为 50');
    if (numbers.catchUpSteps !== 4) throw new RuleError(file, 'session.catchUpSteps', '单帧最多追 4 步');
    if (numbers.arrivalCutoffSeconds > numbers.shiftSeconds) throw new RuleError(file, 'session.arrivalCutoffSeconds', '来客截止不能晚于打烊');
    const heat = {} as Balance['heat'];
    const heatRaw = record(data.heat, file, 'heat');
    exactKeys(heatRaw, HEATS, file, 'heat');
    for (const name of HEATS) {
        const rate = record(heatRaw[name], file, name);
        exactKeys(rate, ['doneness', 'scorch', 'simmer'], file, name);
        heat[name] = {
            doneness: unitRate(rate.doneness, file, `${name}.doneness`),
            scorch: unitRate(rate.scorch, file, `${name}.scorch`),
            simmer: unitRate(rate.simmer, file, `${name}.simmer`),
        };
    }
    const stirRaw = record(data.stir, file, 'stir');
    exactKeys(stirRaw, ['decayFocus', 'decayBlur', 'gain', 'warn', 'windupSeconds', 'repeatSeconds', 'lowStirScorch'], file, 'stir');
    const stir = {
        decayFocus: unitRate(stirRaw.decayFocus, file, 'stir.decayFocus'),
        decayBlur: unitRate(stirRaw.decayBlur, file, 'stir.decayBlur'),
        gain: unitRate(stirRaw.gain, file, 'stir.gain'),
        warn: unitRate(stirRaw.warn, file, 'stir.warn'),
        windupSeconds: unitRate(stirRaw.windupSeconds, file, 'stir.windupSeconds'),
        repeatSeconds: unitRate(stirRaw.repeatSeconds, file, 'stir.repeatSeconds'),
        lowStirScorch: unitRate(stirRaw.lowStirScorch, file, 'stir.lowStirScorch'),
    };
    if (stir.decayBlur <= stir.decayFocus) throw new RuleError(file, 'stir.decayBlur', '非焦点衰减必须高于焦点');
    const gatesRaw = record(data.gates, file, 'gates');
    exactKeys(gatesRaw, ['serveMin', 'serveMax', 'burn'], file, 'gates');
    const gates = {
        serveMin: unitRate(gatesRaw.serveMin, file, 'gates.serveMin'),
        serveMax: unitRate(gatesRaw.serveMax, file, 'gates.serveMax'),
        burn: unitRate(gatesRaw.burn, file, 'gates.burn'),
    };
    if (!(gates.serveMin < gates.serveMax)) throw new RuleError(file, 'gates', '出餐窗口下限必须小于上限');
    const scoreRaw = record(data.score, file, 'score');
    exactKeys(scoreRaw, ['base', 'perfect', 'over', 'raw', 'burnt', 'freshStep', 'missing', 'mistime', 'mistimeCap', 'addWindow', 'seasonMismatch', 'tipRate', 'tipMinScore'], file, 'score');
    const score = {
        base: nonNegative(scoreRaw.base, file, 'score.base'),
        perfect: finiteNumber(scoreRaw.perfect, file, 'score.perfect'),
        over: finiteNumber(scoreRaw.over, file, 'score.over'),
        raw: finiteNumber(scoreRaw.raw, file, 'score.raw'),
        burnt: finiteNumber(scoreRaw.burnt, file, 'score.burnt'),
        freshStep: finiteNumber(scoreRaw.freshStep, file, 'score.freshStep'),
        missing: finiteNumber(scoreRaw.missing, file, 'score.missing'),
        mistime: finiteNumber(scoreRaw.mistime, file, 'score.mistime'),
        mistimeCap: nonNegative(scoreRaw.mistimeCap, file, 'score.mistimeCap'),
        addWindow: unitRate(scoreRaw.addWindow, file, 'score.addWindow'),
        seasonMismatch: finiteNumber(scoreRaw.seasonMismatch, file, 'score.seasonMismatch'),
        tipRate: unitRate(scoreRaw.tipRate, file, 'score.tipRate'),
        tipMinScore: nonNegative(scoreRaw.tipMinScore, file, 'score.tipMinScore'),
    };
    const prepRaw = record(data.prep, file, 'prep');
    exactKeys(prepRaw, PREPS, file, 'prep');
    const prep = {} as Balance['prep'];
    for (const kind of PREPS) prep[kind] = nonNegative(prepRaw[kind], file, `prep.${kind}`);
    if (prep.none !== 0) throw new RuleError(file, 'prep.none', '无需预处理的时长必须为 0');
    const bowlsRaw = record(data.bowls, file, 'bowls');
    exactKeys(bowlsRaw, ['coarse', 'glaze', 'night'], file, 'bowls');
    const bowls = {
        coarse: nonNegative(bowlsRaw.coarse, file, 'bowls.coarse'),
        glaze: nonNegative(bowlsRaw.glaze, file, 'bowls.glaze'),
        night: nonNegative(bowlsRaw.night, file, 'bowls.night'),
    };
    if (bowls.coarse !== 0) throw new RuleError(file, 'bowls.coarse', '粗瓷碗不加外观分');
    const demandRaw = record(data.demand, file, 'demand');
    exactKeys(demandRaw, ['tagMatch', 'budgetBase', 'budgetPerCompletedDay', 'budgetStep', 'orderSlotsAtOnePot', 'orderSlotsPerExtraPot', 'doorQueue', 'lunchIntervalDivisor', 'minArrivalIntervalSeconds', 'waveSeconds', 'closePatienceScale', 'dineSeconds', 'maxArrivals', 'favorMatch', 'favorServe', 'favorFail', 'favorMax'], file, 'demand');
    const demand = {
        tagMatch: nonNegative(demandRaw.tagMatch, file, 'demand.tagMatch'),
        budgetBase: nonNegative(demandRaw.budgetBase, file, 'demand.budgetBase'),
        budgetPerCompletedDay: nonNegative(demandRaw.budgetPerCompletedDay, file, 'demand.budgetPerCompletedDay'),
        budgetStep: positive(demandRaw.budgetStep, file, 'demand.budgetStep'),
        orderSlotsAtOnePot: positive(demandRaw.orderSlotsAtOnePot, file, 'demand.orderSlotsAtOnePot'),
        orderSlotsPerExtraPot: nonNegative(demandRaw.orderSlotsPerExtraPot, file, 'demand.orderSlotsPerExtraPot'),
        doorQueue: positive(demandRaw.doorQueue, file, 'demand.doorQueue'),
        lunchIntervalDivisor: positive(demandRaw.lunchIntervalDivisor, file, 'demand.lunchIntervalDivisor'),
        minArrivalIntervalSeconds: positive(demandRaw.minArrivalIntervalSeconds, file, 'demand.minArrivalIntervalSeconds'),
        waveSeconds: positive(demandRaw.waveSeconds, file, 'demand.waveSeconds'),
        closePatienceScale: positive(demandRaw.closePatienceScale, file, 'demand.closePatienceScale'),
        dineSeconds: positive(demandRaw.dineSeconds, file, 'demand.dineSeconds'),
        maxArrivals: positive(demandRaw.maxArrivals, file, 'demand.maxArrivals'),
        favorMatch: nonNegative(demandRaw.favorMatch, file, 'demand.favorMatch'),
        favorServe: nonNegative(demandRaw.favorServe, file, 'demand.favorServe'),
        favorFail: finiteNumber(demandRaw.favorFail, file, 'demand.favorFail'),
        favorMax: positive(demandRaw.favorMax, file, 'demand.favorMax'),
    };
    if (demand.lunchIntervalDivisor <= 1) throw new RuleError(file, 'demand.lunchIntervalDivisor', '午市间隔必须短于其他波次');
    if (demand.closePatienceScale <= 1) throw new RuleError(file, 'demand.closePatienceScale', '打烊后耐心必须更快流逝');
    if (demand.waveSeconds * 4 !== numbers.shiftSeconds) throw new RuleError(file, 'demand.waveSeconds', '四个波次必须铺满营业时长');
    return { version: 'balance-1', session: numbers, heat, stir, gates, score, prep, bowls, demand };
}

function parseIngredients(raw: unknown): Ingredient[] {
    return uniqueRows('ingredients.json', raw, /^I\d{2}$/, 12).map(row => {
        exactKeys(row, ['id', 'name', 'unit', 'buyPrice', 'freshHours', 'prep', 'tags'], 'ingredients.json', String(row.id));
        const id = String(row.id);
        if (!PREPS.includes(row.prep as PrepKind)) throw new RuleError('ingredients.json', id, '预处理类型无效');
        return {
            id, name: text(row.name, 'ingredients.json', id), unit: text(row.unit, 'ingredients.json', id),
            buyPrice: nonNegative(row.buyPrice, 'ingredients.json', id),
            freshHours: positive(row.freshHours, 'ingredients.json', id),
            prep: row.prep as PrepKind, tags: texts(row.tags, 'ingredients.json', id, false),
        };
    });
}

function parseRecipes(raw: unknown, ingredients: Ingredient[]): Recipe[] {
    const known = new Set(ingredients.map(item => item.id));
    return uniqueRows('recipes.json', raw, /^R\d{2}$/, 12).map(row => {
        exactKeys(row, ['id', 'name', 'unlockDay', 'cost', 'price', 'cookSeconds', 'ingredients', 'adds', 'tags', 'color', 'heatHint', 'freshPenalty'], 'recipes.json', String(row.id));
        const id = String(row.id);
        const cost = positive(row.cost, 'recipes.json', id);
        const price = positive(row.price, 'recipes.json', id);
        if (cost >= price) throw new RuleError('recipes.json', id, '成本必须低于标价');
        if (!HEATS.includes(row.heatHint as HeatName)) throw new RuleError('recipes.json', id, '火候提示无效');
        if (typeof row.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(row.color)) throw new RuleError('recipes.json', id, '目标色必须是 #RRGGBB');
        const uses = usesOf(row.ingredients, 'recipes.json', id, known);
        const adds = addsOf(row.adds, 'recipes.json', id, new Set(uses.map(item => item.id)));
        return {
            id, name: text(row.name, 'recipes.json', id), unlockDay: dayNumber(row.unlockDay, 'recipes.json', id),
            cost, price, cookSeconds: positive(row.cookSeconds, 'recipes.json', id), ingredients: uses, adds,
            tags: texts(row.tags, 'recipes.json', id, false), color: row.color, heatHint: row.heatHint as HeatName,
            freshPenalty: positive(row.freshPenalty, 'recipes.json', id),
        };
    });
}

function parseCustomers(raw: unknown): Customer[] {
    return uniqueRows('customers.json', raw, /^C\d{2}$/, 8).map(row => {
        exactKeys(row, ['id', 'name', 'unlockDay', 'patienceBonus', 'acceptedTags', 'priceCare', 'qualityCare', 'atmosphereCare', 'tracksFavor'], 'customers.json', String(row.id));
        const id = String(row.id);
        if (typeof row.tracksFavor !== 'boolean') throw new RuleError('customers.json', id, 'tracksFavor 必须是布尔值');
        return {
            id, name: text(row.name, 'customers.json', id), unlockDay: dayNumber(row.unlockDay, 'customers.json', id),
            patienceBonus: finiteNumber(row.patienceBonus, 'customers.json', id),
            acceptedTags: texts(row.acceptedTags, 'customers.json', id, true),
            priceCare: care(row.priceCare, 'customers.json', id),
            qualityCare: care(row.qualityCare, 'customers.json', id),
            atmosphereCare: care(row.atmosphereCare, 'customers.json', id),
            tracksFavor: row.tracksFavor,
        };
    });
}

function parseUpgrades(raw: unknown): Upgrade[] {
    return uniqueRows('upgrades.json', raw, /^U\d{2}$/, 8).map(row => {
        exactKeys(row, ['id', 'name', 'requiredCompletedDays', 'price', 'effect'], 'upgrades.json', String(row.id));
        const id = String(row.id);
        const effectRaw = record(row.effect, 'upgrades.json', id);
        const effect: Record<string, number> = {};
        const keys = Object.keys(effectRaw);
        if (!keys.length) throw new RuleError('upgrades.json', id, '效果不能为空');
        for (const key of keys) {
            if (!EFFECT_KEYS.includes(key)) throw new RuleError('upgrades.json', id, `效果键无效：${key}`);
            effect[key] = positive(effectRaw[key], 'upgrades.json', id);
        }
        return {
            id, name: text(row.name, 'upgrades.json', id),
            requiredCompletedDays: dayNumber(row.requiredCompletedDays, 'upgrades.json', id),
            price: positive(row.price, 'upgrades.json', id), effect,
        };
    });
}

function parseDecor(raw: unknown): Decor[] {
    return uniqueRows('decor.json', raw, /^D\d{2}$/, 7).map(row => {
        exactKeys(row, ['id', 'name', 'slot', 'style', 'price', 'atmosphere', 'mesh'], 'decor.json', String(row.id));
        const id = String(row.id);
        if (!SLOTS.includes(row.slot as DecorSlot)) throw new RuleError('decor.json', id, '槽位无效');
        if (!STYLES.includes(row.style as DecorStyle)) throw new RuleError('decor.json', id, '风格无效');
        const atmosphere = record(row.atmosphere, 'decor.json', id);
        exactKeys(atmosphere, ['warmth', 'clean', 'aroma', 'light'], 'decor.json', id);
        return {
            id, name: text(row.name, 'decor.json', id), slot: row.slot as DecorSlot, style: row.style as DecorStyle,
            price: nonNegative(row.price, 'decor.json', id), mesh: text(row.mesh, 'decor.json', id),
            atmosphere: {
                warmth: finiteNumber(atmosphere.warmth, 'decor.json', id), clean: finiteNumber(atmosphere.clean, 'decor.json', id),
                aroma: finiteNumber(atmosphere.aroma, 'decor.json', id), light: finiteNumber(atmosphere.light, 'decor.json', id),
            },
        };
    });
}

function parseAtmosphere(raw: unknown): Atmosphere {
    const rows = uniqueRows('atmosphere.json', raw, /^AT\d{2}$/, 1);
    const row = rows[0];
    exactKeys(row, ['id', 'weights', 'base', 'cookingAroma', 'burntAroma', 'mixLightPenalty', 'criticRejectAtmosphere', 'criticRejectChance', 'reorderAtmosphere'], 'atmosphere.json', String(row.id));
    const id = String(row.id);
    const part = (value: unknown, label: string) => {
        const data = record(value, 'atmosphere.json', id);
        exactKeys(data, ['warmth', 'clean', 'aroma', 'light', 'crowd'], 'atmosphere.json', id);
        return {
            warmth: finiteNumber(data.warmth, 'atmosphere.json', `${id}.${label}`),
            clean: finiteNumber(data.clean, 'atmosphere.json', `${id}.${label}`),
            aroma: finiteNumber(data.aroma, 'atmosphere.json', `${id}.${label}`),
            light: finiteNumber(data.light, 'atmosphere.json', `${id}.${label}`),
            crowd: finiteNumber(data.crowd, 'atmosphere.json', `${id}.${label}`),
        };
    };
    const weights = part(row.weights, 'weights');
    const sum = weights.warmth + weights.clean + weights.aroma + weights.light + weights.crowd;
    if (Math.abs(sum - 1) > 0.0001) throw new RuleError('atmosphere.json', id, '权重之和必须为 1');
    return {
        id, weights, base: part(row.base, 'base'),
        cookingAroma: finiteNumber(row.cookingAroma, 'atmosphere.json', id),
        burntAroma: finiteNumber(row.burntAroma, 'atmosphere.json', id),
        mixLightPenalty: nonNegative(row.mixLightPenalty, 'atmosphere.json', id),
        criticRejectAtmosphere: nonNegative(row.criticRejectAtmosphere, 'atmosphere.json', id),
        criticRejectChance: unitRate(row.criticRejectChance, 'atmosphere.json', id),
        reorderAtmosphere: nonNegative(row.reorderAtmosphere, 'atmosphere.json', id),
    };
}

function parseDays(raw: unknown): DayPlan[] {
    const rows = asArray(raw, 'days.json');
    if (rows.length < 7) throw new RuleError('days.json', '', '至少需要前 7 天');
    return rows.map(item => {
        const row = record(item, 'days.json', '');
        exactKeys(row, ['day', 'arrivalIntervalSeconds', 'scheduledArrivals'], 'days.json', String(row.day ?? ''));
        const day = positive(row.day, 'days.json', String(row.day ?? ''));
        if (!Number.isInteger(day) || day > 999) throw new RuleError('days.json', String(day), '日期须为 1 到 999 的整数');
        return {
            day,
            arrivalIntervalSeconds: positive(row.arrivalIntervalSeconds, 'days.json', String(day)),
            scheduledArrivals: positive(row.scheduledArrivals, 'days.json', String(day)),
        };
    }).sort((a, b) => a.day - b.day).map((row, index) => {
        if (row.day !== index + 1) throw new RuleError('days.json', String(row.day), '日期必须从 1 连续填写');
        return row;
    });
}

function parseStories(raw: unknown, customers: Customer[], recipes: Recipe[], decor: Decor[]): Story[] {
    const customerIds = new Set(customers.map(item => item.id));
    const recipeIds = new Set(recipes.map(item => item.id));
    const rewardIds = new Set([...recipeIds, ...decor.map(item => item.id)]);
    return uniqueRows('stories.json', raw, /^S\d{2}$/, 6).map(row => {
        exactKeys(row, ['id', 'customerId', 'requiresRecipe', 'requiresResult', 'minFavor', 'minAtmosphere', 'lines', 'reward'], 'stories.json', String(row.id));
        const id = String(row.id);
        if (typeof row.customerId !== 'string' || !customerIds.has(row.customerId)) throw new RuleError('stories.json', id, '顾客不存在');
        if (typeof row.requiresRecipe !== 'string' || (row.requiresRecipe && !recipeIds.has(row.requiresRecipe))) throw new RuleError('stories.json', id, '粥谱不存在');
        if (row.requiresResult !== '' && row.requiresResult !== 'perfect') throw new RuleError('stories.json', id, '结果条件无效');
        if (typeof row.reward !== 'string' || (row.reward && !rewardIds.has(row.reward))) throw new RuleError('stories.json', id, '奖励必须是粥谱或装修');
        const lines = texts(row.lines, 'stories.json', id, false);
        if (lines.length > 8) throw new RuleError('stories.json', id, '对白不能超过 8 句');
        return {
            id, customerId: row.customerId, requiresRecipe: row.requiresRecipe, requiresResult: row.requiresResult,
            minFavor: nonNegative(row.minFavor, 'stories.json', id), minAtmosphere: nonNegative(row.minAtmosphere, 'stories.json', id),
            lines, reward: row.reward,
        };
    });
}

function parseActivities(raw: unknown, recipeIds: Set<string>): Activity[] {
    const rows = asArray(raw, 'activities.json');
    const seen = new Set<string>();
    return rows.map(item => {
        const row = record(item, 'activities.json', '');
        const id = text(row.id, 'activities.json', '');
        if (!/^E\d{2}$/.test(id)) throw new RuleError('activities.json', id, '编号无效');
        if (seen.has(id)) throw new RuleError('activities.json', id, '编号重复');
        seen.add(id);
        exactKeys(row, ['id', 'name', 'startDay', 'lastDays', 'recipeId', 'atmosphereShift', 'arrivalBias'], 'activities.json', id);
        const recipeId = text(row.recipeId, 'activities.json', id);
        if (!recipeIds.has(recipeId)) throw new RuleError('activities.json', id, '粥谱不存在');
        const shift = record(row.atmosphereShift, 'activities.json', id);
        exactKeys(shift, ['warmth', 'light'], 'activities.json', id);
        const bias = record(row.arrivalBias, 'activities.json', id);
        const arrivalBias: Record<string, number> = {};
        for (const [customerId, weight] of Object.entries(bias)) {
            if (!/^C\d{2}$/.test(customerId)) throw new RuleError('activities.json', id, '顾客编号无效');
            arrivalBias[customerId] = finiteNumber(weight, 'activities.json', id);
        }
        return {
            id, name: text(row.name, 'activities.json', id), startDay: positive(row.startDay, 'activities.json', id),
            lastDays: positive(row.lastDays, 'activities.json', id), recipeId,
            atmosphereShift: { warmth: finiteNumber(shift.warmth, 'activities.json', id), light: finiteNumber(shift.light, 'activities.json', id) },
            arrivalBias,
        };
    });
}

function parseAudio(raw: unknown): AudioCue[] {
    return uniqueRows('audio.json', raw, /^AU\d{2}$/, 13).map(row => {
        exactKeys(row, ['id', 'event', 'file'], 'audio.json', String(row.id));
        const id = String(row.id);
        const file = text(row.file, 'audio.json', id);
        if (!file.startsWith(id)) throw new RuleError('audio.json', id, '文件名必须以音效 ID 开头');
        return { id, event: text(row.event, 'audio.json', id), file };
    });
}

function uniqueRows(file: string, raw: unknown, pattern: RegExp, count: number): Array<Record<string, unknown>> {
    const rows = asArray(raw, file).map(item => record(item, file, ''));
    const ids = rows.map(row => {
        if (typeof row.id !== 'string' || !pattern.test(row.id)) throw new RuleError(file, String(row.id ?? ''), 'ID 无效');
        return row.id;
    });
    if (new Set(ids).size !== ids.length) throw new RuleError(file, ids.find((id, index) => ids.indexOf(id) !== index) || '', 'ID 重复');
    if (ids.length !== count) throw new RuleError(file, '', `数量必须是 ${count}`);
    return rows;
}

function usesOf(raw: unknown, file: string, id: string, known: Set<string>): IngredientUse[] {
    const rows = asArray(raw, file);
    if (!rows.length) throw new RuleError(file, id, '至少需要一种食材');
    return rows.map(item => {
        const row = record(item, file, id);
        exactKeys(row, ['id', 'count'], file, id);
        if (typeof row.id !== 'string' || !known.has(row.id)) throw new RuleError(file, id, `食材不存在：${String(row.id)}`);
        return { id: row.id, count: positive(row.count, file, id) };
    });
}

function addsOf(raw: unknown, file: string, id: string, owned: Set<string>): AddPoint[] {
    return asArray(raw, file).map(item => {
        const row = record(item, file, id);
        exactKeys(row, ['id', 'atDoneness'], file, id);
        if (typeof row.id !== 'string' || !owned.has(row.id)) throw new RuleError(file, id, `加料不在用料里：${String(row.id)}`);
        const atDoneness = unitRate(row.atDoneness, file, id);
        return { id: row.id, atDoneness };
    });
}

function asArray(raw: unknown, file: string): unknown[] {
    if (!Array.isArray(raw)) throw new RuleError(file, '', '必须是数组');
    return raw;
}
function record(raw: unknown, file: string, id: string): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RuleError(file, id, '必须是对象');
    return raw as Record<string, unknown>;
}
function exactKeys(row: Record<string, unknown>, keys: readonly string[], file: string, id: string): void {
    for (const key of keys) if (!(key in row)) throw new RuleError(file, id, `缺少字段 ${key}`);
    for (const key of Object.keys(row)) if (!keys.includes(key)) throw new RuleError(file, id, `多余字段 ${key}`);
}
function finiteNumber(value: unknown, file: string, id: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RuleError(file, id, '必须是有限数字');
    return value;
}
function nonNegative(value: unknown, file: string, id: string): number {
    const number = finiteNumber(value, file, id);
    if (number < 0 || !Number.isInteger(number)) throw new RuleError(file, id, '必须是大于等于 0 的整数');
    return number;
}
function positive(value: unknown, file: string, id: string): number {
    const number = nonNegative(value, file, id);
    if (number < 1) throw new RuleError(file, id, '必须是正整数');
    return number;
}
function unitRate(value: unknown, file: string, id: string): number {
    const number = finiteNumber(value, file, id);
    if (number <= 0 || number > 1) throw new RuleError(file, id, '必须在 0 和 1 之间');
    return number;
}
function care(value: unknown, file: string, id: string): number {
    const number = finiteNumber(value, file, id);
    if (number < 0 || number > 1) throw new RuleError(file, id, '在意程度必须在 0 到 1');
    return number;
}
function dayNumber(value: unknown, file: string, id: string): number {
    const day = positive(value, file, id);
    if (day > 7) throw new RuleError(file, id, '天数必须在 1 到 7');
    return day;
}
function text(value: unknown, file: string, id: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new RuleError(file, id, '文本不能为空');
    return value;
}
function texts(value: unknown, file: string, id: string, allowEmpty: boolean): string[] {
    if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some(item => typeof item !== 'string' || !item.trim())) {
        throw new RuleError(file, id, '文本列表无效');
    }
    return value as string[];
}
