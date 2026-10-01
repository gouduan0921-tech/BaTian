import { Catalog, Customer, Recipe } from './Catalog';
import { CookResult, Season } from './PotSim';

export interface DishScore { score: number; pay: number; tip: number }

/** 交给经营的一碗。评分在送达时再按客人偏好重算。 */
export interface ServedDish {
    potId: string;
    recipeId: string;
    result: CookResult;
    season: Season;
    missingAdds: number;
    mistimes: number;
    freshSteps: number;
    appearance: number;
}

/** 顾客预期秒。有熬煮中加料时另加 8 秒，不加在火候上。 */
export function expectedSeconds(catalog: Catalog, recipe: Recipe): number {
    const session = catalog.balance.session;
    const extra = recipe.adds.length > 0 ? session.addPatienceSeconds : 0;
    return session.dishPrepSeconds + extra + recipe.cookSeconds + session.serveSeconds + session.plateSeconds;
}

export function patienceSeconds(catalog: Catalog, recipe: Recipe, customer: Customer): number {
    return catalog.balance.session.basePatience + expectedSeconds(catalog, recipe) + customer.patienceBonus;
}

/** 原味对上咸香或浓，视为文档里的「要咸」。 */
export function seasonClashes(season: Season, acceptedTags: readonly string[]): boolean {
    if (season === 'plain') return acceptedTags.some(tag => tag === '咸香' || tag === '浓');
    if (season === 'salty') return acceptedTags.includes('清甜');
    return acceptedTags.some(tag => tag === '咸香' || tag === '浓');
}

export function scoreDish(catalog: Catalog, input: {
    recipe: Recipe; result: CookResult; freshSteps: number; missingAdds: number; mistimes: number;
    seasonClash: boolean; atmosphere?: number; appearance?: number;
}): DishScore {
    const scoreRules = catalog.balance.score;
    const modifier = input.result === 'perfect' ? scoreRules.perfect : input.result === 'over' ? scoreRules.over : input.result === 'raw' ? scoreRules.raw : scoreRules.burnt;
    const mistimes = Math.min(input.mistimes, scoreRules.mistimeCap);
    const score = scoreRules.base + modifier
        + scoreRules.freshStep * input.freshSteps * input.recipe.freshPenalty
        + scoreRules.missing * input.missingAdds
        + scoreRules.mistime * mistimes
        + (input.seasonClash ? scoreRules.seasonMismatch : 0)
        + (input.appearance ?? 0);
    const rawPay = Math.round(input.recipe.price * score / 100);
    const floor = input.result === 'burnt' ? Math.ceil(input.recipe.cost / 2) : input.recipe.cost;
    const pay = Math.max(floor, rawPay);
    const atmosphere = Math.min(100, Math.max(0, input.atmosphere ?? 0)) / 100;
    const tip = input.result === 'burnt' || score < scoreRules.tipMinScore ? 0 : Math.round(input.recipe.price * scoreRules.tipRate * (1 + 0.5 * atmosphere));
    return { score, pay, tip };
}

export function quoteDish(catalog: Catalog, dish: ServedDish, acceptedTags: readonly string[] = [], atmosphere = 0): DishScore {
    const recipe = catalog.recipe(dish.recipeId);
    if (!recipe) return { score: 0, pay: 0, tip: 0 };
    return scoreDish(catalog, {
        recipe, result: dish.result, freshSteps: dish.freshSteps, missingAdds: dish.missingAdds,
        mistimes: dish.mistimes, seasonClash: seasonClashes(dish.season, acceptedTags),
        atmosphere, appearance: dish.appearance,
    });
}
