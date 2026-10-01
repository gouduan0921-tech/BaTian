import { GameConfig, Story, StoryCondition } from '../core/Config';

/** 短篇条件判定（文档 11 §5、16）。 */

export interface StoryFacts {
    favor: Record<string, number>;
    /** 历史送达：键 `客人|粥|结果|波次` → 次数 */
    served: Record<string, number>;
    /** 最近几个营业日（含今天），每日一组 `客人|粥|结果` */
    recentDays: string[][];
    dayAtmosphere: number;
    codexCount: number;
    seen: string[];
}

function servedMatch(config: GameConfig, c: Extract<StoryCondition, { type: 'served' }>, served: Record<string, number>): boolean {
    for (const key of Object.keys(served)) {
        if (!served[key]) continue;
        const [cid, rid, result, wave] = key.split('|');
        if (cid !== c.customerId) continue;
        if (c.recipeId && rid !== c.recipeId) continue;
        if (c.result && result !== c.result) continue;
        if (c.wave && wave !== c.wave) continue;
        if (c.tag && !(config.recipe.get(rid)?.tags ?? []).includes(c.tag)) continue;
        return true;
    }
    return false;
}

export function conditionMet(config: GameConfig, c: StoryCondition, f: StoryFacts): boolean {
    switch (c.type) {
        case 'favor': return (f.favor[c.customerId] ?? 0) >= c.min;
        case 'served': return servedMatch(config, c, f.served);
        case 'streak': {
            if (f.recentDays.length < c.days) return false;
            return f.recentDays.slice(-c.days).every(day => day.some(k => {
                const [cid, rid, result] = k.split('|');
                return cid === c.customerId && c.recipeIds.includes(rid) && result === c.result;
            }));
        }
        case 'dayAtmosphere': return f.dayAtmosphere >= c.min;
        case 'codex': return f.codexCount >= c.min;
        default: return false;
    }
}

export function eligibleStories(config: GameConfig, f: StoryFacts, exclude: string[]): Story[] {
    return config.stories
        .filter(s => !f.seen.includes(s.id) && !exclude.includes(s.id))
        .filter(s => s.conditions.every(c => conditionMet(config, c, f)))
        .sort((a, b) => a.id.localeCompare(b.id));
}
