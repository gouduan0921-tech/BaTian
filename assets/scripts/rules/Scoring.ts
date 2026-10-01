import { Balance, Customer, Decor, Recipe, WaveId } from '../core/Config';
import { CookResult } from './Pot';

/** 评分、实收、小费、耐心（文档 04 §3、§5）。 */

export function expectedSeconds(balance: Balance, recipe: Recipe): number {
    const a = balance.actions;
    return balance.demand.expectPrep + (recipe.adds.length ? balance.demand.expectAdd : 0) + recipe.cookSeconds + a.serve + a.plate;
}

export function patienceFor(balance: Balance, recipe: Recipe, customer: Customer): number {
    return balance.demand.basePatience + expectedSeconds(balance, recipe) + customer.patienceBonus;
}

/** 盛碗时锁定的一碗粥的评分要素。 */
export interface BowlQuality {
    result: CookResult;
    /** 用到的食材里最差的新鲜度档（0–2） */
    freshTier: number;
    missing: number;
    mistimed: number;
    seasoningOk: boolean;
    /** 餐具外观分（已按粥和波次算好） */
    look: number;
}

export function scoreParts(balance: Balance, recipe: Recipe, q: BowlQuality): { score: number; lines: Array<[string, number]> } {
    const s = balance.score;
    const lines: Array<[string, number]> = [['基础', s.base]];
    const res = { perfect: s.perfect, over: s.over, raw: s.raw, burnt: s.burnt }[q.result];
    lines.push([{ perfect: '刚好', over: '过火', raw: '夹生', burnt: '糊底' }[q.result], res]);
    if (q.freshTier > 0) lines.push(['新鲜度', s.freshStep * q.freshTier * recipe.freshPenalty]);
    if (q.missing) lines.push(['缺料', s.missing * q.missing]);
    if (q.mistimed) lines.push(['加料时机', s.mistime * Math.min(q.mistimed, s.mistimeCap)]);
    if (!q.seasoningOk) lines.push(['调味', s.seasonMismatch]);
    if (q.look) lines.push(['餐具', q.look]);
    const raw = lines.reduce((sum, [, v]) => sum + v, 0);
    return { score: Math.max(0, Math.min(s.max, raw)), lines };
}

/** 出餐台停留造成的变凉扣分（负数或 0）。 */
export function coolingPenalty(balance: Balance, heldSeconds: number, holdBonus: number): number {
    const s = balance.score;
    const start = s.coolStartSeconds + holdBonus;
    if (heldSeconds <= start) return 0;
    const steps = Math.floor((heldSeconds - start) / s.coolStepSeconds);
    return Math.max(s.coolCap, steps * s.coolStep);
}

export function lookBonus(tableware: Decor | undefined, recipe: Recipe, wave: WaveId): number {
    const look = tableware?.look;
    if (!look || !look.bonus) return 0;
    if (look.wave) return look.wave === wave ? look.bonus : look.otherWave;
    return look.tags.some(t => recipe.tags.includes(t)) ? look.bonus : 0;
}

export interface Settlement { revenue: number; tip: number; score: number }

/**
 * 送达结算。
 * tPrime：对这位客人生效的氛围强度 t × (0.5 + atmosphereCare)；atmosphere 为当时总氛围。
 */
export function settle(balance: Balance, recipe: Recipe, customer: Customer, result: CookResult, score: number,
    tPrime: number, atmosphere: number): Settlement {
    const s = balance.score;
    const floor = result === 'burnt' ? Math.ceil(recipe.cost / 2) : recipe.cost;
    let revenue = Math.max(floor, Math.round(recipe.price * score / 100));
    const picky = customer.qualityCare >= s.pickyQualityCare && (result === 'raw' || result === 'burnt');
    if (picky) revenue = floor;
    let tip = 0;
    if (result !== 'burnt' && score >= s.tipMinScore) {
        tip = recipe.price * s.tipRate * (0.5 + customer.qualityCare) * (1 + 0.5 * tPrime);
        const signature = customer.id === 'C07' && recipe.tags.includes('招牌') && result === 'perfect' && atmosphere >= s.signatureAtmosphere;
        if (signature) tip *= s.signatureTipScale;
        tip = Math.round(tip);
    }
    return { revenue, tip, score };
}

export function seasoningMatches(recipe: Recipe, chosen: string | null): boolean {
    return (chosen ?? 'plain') === recipe.seasoning;
}
