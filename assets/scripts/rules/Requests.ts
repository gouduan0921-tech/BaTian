import { Customer, GameConfig, Recipe, Season, WaveId, WAVES } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';

/**
 * 街坊请托（文档 30 §3）：熟客在打烊时预订明天的粥。
 * 用存档种子和日子单独开一路随机数，不消耗主随机数，客流可重现性不受影响。
 */
export interface RequestState {
    id: string;
    /** 约定的那一天 */
    day: number;
    customerId: string;
    recipeId: string;
    count: number;
    wave: WaveId;
    reward: number;
}

export interface RequestInput {
    /** 明天是第几日 */
    day: number;
    seed: number;
    /** 见过的客人 */
    seen: string[];
    favor: Record<string, number>;
    /** 明天会来的客人原型 */
    unlockedCustomers: string[];
    /** 明天开放、且清晨能买齐食材的粥 */
    recipes: Recipe[];
    season: Season | null;
}

function tasteMatch(c: Customer, r: Recipe): boolean {
    return c.acceptedTags.length > 0 && r.tags.some(t => c.acceptedTags.includes(t));
}

/** 生成明天的请托；条件不满足或这晚没抽中时返回 null。 */
export function makeRequest(config: GameConfig, input: RequestInput): RequestState | null {
    const q = config.balance.requests;
    if (input.day - 1 < q.startDay || !input.recipes.length) return null;
    const rng = new SeededRng((input.seed ^ Math.imul(input.day, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
    if (!rng.chance(q.chance)) return null;
    const pool = config.customers.filter(c => c.tracksFavor && input.seen.includes(c.id) && input.unlockedCustomers.includes(c.id)
        && (input.favor[c.id] ?? 0) >= q.minFavor);
    const who = rng.weighted(pool, c => 1 + (input.favor[c.id] ?? 0));
    if (!who) return null;
    const recipe = rng.weighted(input.recipes, r =>
        (r.season && r.season === input.season ? 4 : 0) + (tasteMatch(who, r) ? 3 : 0) + 1);
    if (!recipe) return null;
    const wave = WAVES.reduce((best, w) => (who.waveWeights[w] > who.waveWeights[best] ? w : best), WAVES[0]);
    const count = input.day >= q.lateFromDay ? q.countLate : q.countEarly;
    return {
        id: `Q${input.day}`, day: input.day, customerId: who.id, recipeId: recipe.id, count, wave,
        reward: Math.round(recipe.price * count * q.rewardRate),
    };
}
