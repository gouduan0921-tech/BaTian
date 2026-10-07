import { ChapterCfg, ChapterGoalCfg, GameConfig, Season } from '../core/Config';

/**
 * 四时章节（文档 30 §2）：第 startDay 日起每 length 日一章，按 chapters.json 的顺序轮转；
 * 轮完一遍算一年，下一年目标数与奖励 × (1 + yearScale × 年数)。
 * 只算「今天属于哪一章」和目标文字，不碰随机数，不改熬煮与评分。
 */
export interface ChapterRun {
    cfg: ChapterCfg;
    /** 从第二章起数的序号（0 = 第一个四时章节） */
    index: number;
    year: number;
    startDay: number;
    endDay: number;
    /** 带年份的名称，如「白露 · 秋粥」「白露 · 秋粥 · 第 2 年」 */
    name: string;
    goals: ChapterGoalCfg[];
    /** 每做到一个目标发的铜钱 */
    reward: number;
}

/** 某一章的累计进度（存进存档）。 */
export interface ChapterProgress {
    /** 章 id + 年份，如 CH2-0 */
    key: string;
    startDay: number;
    served: Record<string, number>;
    perfect: number;
    requests: number;
    fullGoalDays: number;
    calmDays: number;
}

export function chapterAt(config: GameConfig, day: number): ChapterRun | null {
    const c = config.balance.chapters;
    if (day < c.startDay || !config.chapters.length) return null;
    const index = Math.floor((day - c.startDay) / c.length);
    const n = config.chapters.length;
    const cfg = config.chapters[index % n];
    const year = Math.floor(index / n);
    const k = 1 + c.yearScale * year;
    const startDay = c.startDay + index * c.length;
    return {
        cfg, index, year, startDay, endDay: startDay + c.length - 1,
        name: year > 0 ? `${cfg.name} · 第 ${year + 1} 年` : cfg.name,
        goals: cfg.goals.map(g => ({ ...g, count: Math.round(g.count * k) })),
        reward: Math.round(cfg.reward * k),
    };
}

export function chapterKey(run: ChapterRun): string { return `${run.cfg.id}-${run.year}`; }

/** 当天的季节；第一章（开张七日）没有季节。 */
export function seasonAt(config: GameConfig, day: number): Season | null {
    return chapterAt(config, day)?.cfg.season ?? null;
}

export function newChapterProgress(run: ChapterRun): ChapterProgress {
    return { key: chapterKey(run), startDay: run.startDay, served: {}, perfect: 0, requests: 0, fullGoalDays: 0, calmDays: 0 };
}

export function chapterGoalValue(goal: ChapterGoalCfg, p: ChapterProgress | null): number {
    if (!p) return 0;
    switch (goal.type) {
        case 'served': return p.served[goal.recipeId ?? ''] ?? 0;
        case 'perfect': return p.perfect;
        case 'requests': return p.requests;
        case 'fullGoalDays': return p.fullGoalDays;
        case 'calmDays': return p.calmDays;
    }
    return 0;
}

export function chapterGoalText(goal: ChapterGoalCfg, recipeName: (id: string) => string): string {
    switch (goal.type) {
        case 'served': return `卖出 ${goal.count} 碗${recipeName(goal.recipeId ?? '')}`;
        case 'perfect': return `本章熬出 ${goal.count} 碗「刚好」`;
        case 'requests': return `完成 ${goal.count} 件街坊请托`;
        case 'fullGoalDays': return `${goal.count} 天小目标全做到`;
        case 'calmDays': return `${goal.count} 天没有客人等不及走掉`;
    }
    return '';
}
