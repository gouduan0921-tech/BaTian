export type ActionId = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

export interface Recipe {
    id: string; name: string; unlockDay: number; price: number; cost: number;
    cookSeconds: number; standardSeconds: number; action: ActionId;
    tags: string[]; garnishes: string[];
}

export interface Balance {
    version: string;
    session: {
        initialWallet: number; shiftSeconds: number; arrivalCutoffSeconds: number;
        maxActiveOrders: number; busyRetrySeconds: number; rescueFloor: number; fixedStepMs: number;
    };
    cooking: {
        prepSeconds: number; serveSeconds: number; garnishSeconds: number;
        perfectSeconds: number; burnSeconds: number; baseQuality: number; tipRate: number;
    };
    recipes: Recipe[];
    customers: Array<{id: string; name: string; unlockDay: number; acceptedTags: string[]; patienceBonusSeconds: number}>;
    upgrades: Array<{id: string; name: string; requiredCompletedDays: number; price: number; effect: Record<string, number | boolean>}>;
    days: Array<{day: number; arrivalIntervalSeconds: number; scheduledArrivals: number}>;
}

function numberAt(value: unknown, path: string, min = 0): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
        throw new Error(`规则数据 ${path} 必须是大于等于 ${min} 的数字`);
    }
    return value;
}

export function parseBalance(raw: unknown): Balance {
    if (!raw || typeof raw !== 'object') throw new Error('规则数据不是对象');
    const data = raw as Balance;
    if (typeof data.version !== 'string') throw new Error('规则数据缺少版本号');
    if (!data.session || !data.cooking || !Array.isArray(data.recipes) || !Array.isArray(data.customers) || !Array.isArray(data.upgrades) || !Array.isArray(data.days)) {
        throw new Error('规则数据缺少营业、菜谱、顾客或日程');
    }
    for (const key of ['initialWallet', 'shiftSeconds', 'arrivalCutoffSeconds', 'maxActiveOrders', 'busyRetrySeconds', 'rescueFloor', 'fixedStepMs'] as const) {
        numberAt(data.session[key], `session.${key}`);
    }
    if (data.session.fixedStepMs !== 50) throw new Error('固定步长必须为50毫秒');
    if (data.session.arrivalCutoffSeconds > data.session.shiftSeconds) throw new Error('来单截止时间晚于打烊');
    for (const key of ['prepSeconds', 'serveSeconds', 'garnishSeconds', 'perfectSeconds', 'burnSeconds', 'baseQuality', 'tipRate'] as const) {
        numberAt(data.cooking[key], `cooking.${key}`);
    }
    if (data.cooking.perfectSeconds >= data.cooking.burnSeconds) throw new Error('完美窗口不能晚于烧糊');
    const recipeIds = new Set<string>();
    for (const recipe of data.recipes) {
        if (!/^R\d{2}$/.test(recipe.id) || recipeIds.has(recipe.id)) throw new Error(`菜谱ID无效或重复：${recipe.id}`);
        recipeIds.add(recipe.id);
        if (!recipe.name || !['A0', 'A1', 'A2', 'A3', 'A4'].includes(recipe.action)) throw new Error(`菜谱 ${recipe.id} 名称或动作无效`);
        for (const key of ['unlockDay', 'price', 'cost', 'cookSeconds', 'standardSeconds'] as const) numberAt(recipe[key], `${recipe.id}.${key}`, 1);
        if (recipe.cost >= recipe.price || !Array.isArray(recipe.tags) || !Array.isArray(recipe.garnishes) || recipe.garnishes.length !== 2) {
            throw new Error(`菜谱 ${recipe.id} 成本、价格、标签或装饰无效`);
        }
        const expected = data.cooking.prepSeconds + (recipe.action === 'A0' ? 0 : 8) + recipe.cookSeconds + data.cooking.serveSeconds + data.cooking.garnishSeconds;
        if (recipe.standardSeconds !== expected) throw new Error(`菜谱 ${recipe.id} 标准时长不符：应为${expected}秒`);
    }
    if (recipeIds.size !== 12) throw new Error(`应有12道菜，实际${recipeIds.size}道`);
    const customerIds = new Set<string>();
    for (const customer of data.customers) {
        if (!/^C\d{2}$/.test(customer.id) || customerIds.has(customer.id)) throw new Error(`顾客ID无效或重复：${customer.id}`);
        customerIds.add(customer.id);
        numberAt(customer.patienceBonusSeconds, `${customer.id}.patienceBonusSeconds`);
        if (!Array.isArray(customer.acceptedTags) || !customer.acceptedTags.length) throw new Error(`顾客 ${customer.id} 缺少喜好`);
    }
    if (data.days.length !== 7 || data.days.some((day, index) => day.day !== index + 1 || day.arrivalIntervalSeconds <= 0 || day.scheduledArrivals <= 0)) {
        throw new Error('七日来单日程无效');
    }
    if (data.upgrades.length !== 5 || new Set(data.upgrades.map(u => u.id)).size !== 5 || data.upgrades.some(u => !/^U0[1-5]$/.test(u.id) || !u.name || u.price <= 0 || u.requiredCompletedDays < 1)) {
        throw new Error('升级数据无效');
    }
    return data;
}
