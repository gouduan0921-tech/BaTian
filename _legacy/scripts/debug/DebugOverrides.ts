/** 开发指定种子、菜谱和营业日。正式构建传入 enabled=false，入口不读取参数。 */
export interface DebugOverrides { seed?: number; recipeId?: string; day?: number }

export function readDebugOverrides(search: string, enabled: boolean): DebugOverrides {
    if (!enabled || !search) return {};
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const overrides: DebugOverrides = {};
    const seed = params.get('seed');
    const recipe = params.get('recipe');
    const day = params.get('day');
    if (seed !== null && /^\d+$/.test(seed)) overrides.seed = Number(seed);
    if (recipe && /^R\d{2}$/.test(recipe)) overrides.recipeId = recipe;
    if (day !== null && /^[1-7]$/.test(day)) overrides.day = Number(day);
    return overrides;
}
