import { GameConfig, Recipe } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';
import type { ShiftState } from './Shift';

/**
 * 每日小目标（文档 08 §8）。第 2 日起，每天清晨给三件「今天顺手做到」的小事，打烊结算时按完成发铜钱，三件全做到再加一笔满贯。
 *
 * - 目标只看当日营业记录，不改任何熬煮、评分、客流规则；
 * - 用存档种子和日子单独生成，不消耗主随机数，客流可重现性不受影响；
 * - 清晨菜单、营业中的小签、打烊账单看到的是同一份目标。
 */
export type GoalType = 'serve' | 'perfect' | 'noWalk' | 'recipe' | 'tips' | 'atmosphere';

export interface Goal {
    id: string;
    type: GoalType;
    target: number;
    recipeId?: string;
    reward: number;
}

export interface GoalStatus {
    goal: Goal;
    /** 当前进度（与 target 同单位） */
    value: number;
    done: boolean;
    /** 已经不可能完成（如有人等不及走了） */
    failed: boolean;
}

/** 当日小目标。传入当日可做的粥谱、预计客流与是否有装修。 */
export function dailyGoals(config: GameConfig, seed: number, day: number, recipes: Recipe[], expectedGuests: number, hasDecor: boolean): Goal[] {
    const g = config.balance.goals;
    if (day < g.startDay || !recipes.length) return [];
    const rng = new SeededRng((seed ^ Math.imul(day, 0x9e3779b1)) >>> 0);
    const serveN = Math.max(3, Math.round(expectedGuests * g.serveShare));
    const perfectN = Math.min(g.perfectCap, Math.round(g.perfectBase + g.perfectPerDay * day));
    const tipsN = g.tipsBase + g.tipsPerDay * day;
    // 指定粥优先挑最近开放的，让新粥有人去熬
    const newest = [...recipes].sort((a, b) => b.unlockDay - a.unlockDay);
    const pick = newest[Math.min(newest.length - 1, rng.int(Math.min(3, newest.length)))];
    const pool: Goal[] = [
        { id: 'serve', type: 'serve', target: serveN, reward: g.reward },
        { id: 'perfect', type: 'perfect', target: perfectN, reward: g.rewardHard },
        { id: 'noWalk', type: 'noWalk', target: 0, reward: g.rewardHard },
        { id: `recipe-${pick.id}`, type: 'recipe', target: 1, recipeId: pick.id, reward: g.reward },
        { id: 'tips', type: 'tips', target: tipsN, reward: g.reward },
    ];
    if (hasDecor) pool.push({ id: 'atmosphere', type: 'atmosphere', target: g.atmosphereMin, reward: g.reward });
    // 一件「多做」+ 一件「做好」+ 一件随机，避免三件同类
    const out: Goal[] = [];
    const take = (ids: GoalType[]) => {
        const left = pool.filter(x => ids.includes(x.type) && !out.includes(x));
        if (left.length) out.push(left[rng.int(left.length)]);
    };
    take(['serve', 'tips']);
    take(['perfect', 'noWalk']);
    while (out.length < Math.min(g.count, pool.length)) {
        const left = pool.filter(x => !out.includes(x) && !(x.type === 'serve' && out.some(o => o.type === 'tips')) && !(x.type === 'tips' && out.some(o => o.type === 'serve')));
        if (!left.length) break;
        out.push(left[rng.int(left.length)]);
    }
    return out;
}

/** 按当日营业状态算进度；closed 为 true 表示已打烊（「不让人等走」此时才算完成）。 */
export function goalStatus(goal: Goal, st: ShiftState, dayAtmosphere: number, closed: boolean): GoalStatus {
    const perfects = () => Object.entries(st.served).filter(([k]) => k.split('|')[2] === 'perfect').reduce((n, [, v]) => n + v, 0);
    const recipeServed = (id: string) => Object.entries(st.served).filter(([k]) => k.split('|')[1] === id).reduce((n, [, v]) => n + v, 0);
    let value = 0;
    let done = false;
    let failed = false;
    switch (goal.type) {
        case 'serve': value = st.ledger.served; done = value >= goal.target; break;
        case 'perfect': value = perfects(); done = value >= goal.target; break;
        case 'tips': value = st.ledger.tips; done = value >= goal.target; break;
        case 'recipe': value = recipeServed(goal.recipeId ?? ''); done = value >= 1; break;
        case 'atmosphere': value = Math.round(dayAtmosphere); done = closed && value >= goal.target; break;
        case 'noWalk':
            value = st.ledger.reasons['impatient'] ?? 0;
            failed = value > 0;
            done = closed && !failed && st.ledger.served > 0;
            break;
    }
    return { goal, value, done, failed };
}

/** 给玩家看的一句话。 */
export function goalText(goal: Goal, recipeName: (id: string) => string): string {
    switch (goal.type) {
        case 'serve': return `卖出 ${goal.target} 碗粥`;
        case 'perfect': return `熬出 ${goal.target} 碗「刚好」`;
        case 'noWalk': return '没有一位客人等不及走掉';
        case 'recipe': return `卖出一碗${recipeName(goal.recipeId ?? '')}`;
        case 'tips': return `收到 ${goal.target} 文小费`;
        case 'atmosphere': return `全天氛围不低于 ${goal.target}`;
    }
    return '';
}

/** 进度短句，如「4/6」。 */
export function goalProgressText(s: GoalStatus): string {
    const g = s.goal;
    if (g.type === 'noWalk') return s.failed ? '有人走了' : s.done ? '做到了' : '守住中';
    if (g.type === 'atmosphere') return `${s.value}/${g.target}`;
    if (g.type === 'recipe') return s.done ? '卖出了' : '还没卖';
    return `${Math.min(s.value, g.target)}/${g.target}`;
}
