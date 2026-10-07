import { GameConfig, MilestoneCfg, MilestoneType } from '../core/Config';

/**
 * 小店手账（文档 30 §4）：27 页里程碑。打烊时评估，新达成的发铜钱并记进存档。
 * 数值全部来自存档里已有的累计，不额外改规则。
 */
export interface ProfileStats {
    perfectTotal: number;
    servedTotal: number;
    bestDayIncome: number;
    fullGoalDays: number;
    requestsDone: number;
    chaptersDone: number;
}

export function emptyStats(): ProfileStats {
    return { perfectTotal: 0, servedTotal: 0, bestDayIncome: 0, fullGoalDays: 0, requestsDone: 0, chaptersDone: 0 };
}

/** 计算条件用到的事实（由 Progress 按当前存档拼出来）。 */
export interface MilestoneFacts {
    stats: ProfileStats;
    recipesLit: number;
    masterCount: number;
    daysCompleted: number;
    storiesHeard: number;
    favorMax: number;
    keptRecipes: number;
    stylesUnlocked: number;
    decorOwned: number;
}

export function milestoneValue(type: MilestoneType, f: MilestoneFacts): number {
    switch (type) {
        case 'perfectTotal': return f.stats.perfectTotal;
        case 'servedTotal': return f.stats.servedTotal;
        case 'bestDayIncome': return f.stats.bestDayIncome;
        case 'fullGoalDays': return f.stats.fullGoalDays;
        case 'requestsDone': return f.stats.requestsDone;
        case 'chaptersDone': return f.stats.chaptersDone;
        case 'recipesLit': return f.recipesLit;
        case 'masterCount': return f.masterCount;
        case 'daysCompleted': return f.daysCompleted;
        case 'storiesHeard': return f.storiesHeard;
        case 'favorMax': return f.favorMax;
        case 'keptRecipes': return f.keptRecipes;
        case 'stylesUnlocked': return f.stylesUnlocked;
        case 'decorOwned': return f.decorOwned;
    }
    return 0;
}

/** 还没记、但已经满足条件的页（按表内顺序）。 */
export function newMilestones(config: GameConfig, done: string[], facts: MilestoneFacts): MilestoneCfg[] {
    return config.milestones.filter(m => !done.includes(m.id) && milestoneValue(m.condition.type, facts) >= m.condition.min);
}
