import { GameConfig } from '../core/Config';

/**
 * 厨艺熟练（文档 10 §4）：每道粥单独记分，按 balance.skill.tiers 的阈值分「入门 / 顺手 / 拿手」。
 * 这里只把分数翻成玩家看得懂的档位与一句话效果，不改任何规则数值。
 */
export const SKILL_NAMES = ['入门', '顺手', '拿手'];

/** 每一档的效果，一句话说清，不写公式（文档 10 §7）。 */
export const SKILL_EFFECT = ['', '搅拌提醒会早一点响', '加料的时机更宽松'];

export interface SkillInfo {
    tier: number;
    name: string;
    points: number;
    /** 当前档起点 */
    floor: number;
    /** 下一档门槛；已到最高档为 null */
    next: number | null;
    /** 当前档内的进度 0–1（最高档恒为 1） */
    progress: number;
}

export function skillInfo(config: GameConfig, points: number): SkillInfo {
    const tiers = config.balance.skill.tiers;
    const p = Math.max(0, points);
    const tier = tiers.filter(t => p >= t.min).length;
    const floor = tier === 0 ? 0 : tiers[tier - 1].min;
    const next = tier < tiers.length ? tiers[tier].min : null;
    return {
        tier, name: SKILL_NAMES[Math.min(tier, SKILL_NAMES.length - 1)], points: p, floor, next,
        progress: next === null ? 1 : Math.max(0, Math.min(1, (p - floor) / (next - floor))),
    };
}

/** 熟练从 before 变到 after 时跨过的档（只算往上走）；没跨档返回 null。 */
export function skillTierUp(config: GameConfig, before: number, after: number): number | null {
    const a = skillInfo(config, before).tier;
    const b = skillInfo(config, after).tier;
    return b > a ? b : null;
}

/** 打烊页一行：某道粥今天的熟练变化。 */
export interface SkillChange {
    recipeId: string;
    before: number;
    after: number;
}
