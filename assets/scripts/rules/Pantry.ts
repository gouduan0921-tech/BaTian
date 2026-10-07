import { GameConfig, Ingredient } from '../core/Config';

/**
 * 库存与新鲜度（文档 06、04 §8）。
 * 同一食材不同批次分开记，消耗与预处理都先用最旧的一批。
 */
export interface Batch {
    uid: number;
    id: string;
    /** 未处理份数 */
    raw: number;
    /** 已预处理、当日可下锅的份数 */
    ready: number;
    hoursLeft: number;
}

export interface PantryState {
    batches: Batch[];
    nextUid: number;
}

/** 0 当日 / 1 过夜 / 2 三日 / 3 过期 */
export type FreshTier = 0 | 1 | 2 | 3;
export const FRESH_WORDS = ['当日', '过夜', '三日', '过期'];

export function freshTier(ing: Ingredient, hoursLeft: number): FreshTier {
    if (hoursLeft <= 1e-9) return 3;
    const r = hoursLeft / ing.freshHours;
    if (r > 2 / 3 + 1e-9) return 0;
    if (r > 1 / 3 + 1e-9) return 1;
    return 2;
}

export function shelfClass(ing: Ingredient): string {
    return ing.freshHours <= 24 ? '生鲜' : ing.freshHours <= 48 ? '半耐存' : '耐存';
}

export class Pantry {
    constructor(readonly config: GameConfig, readonly state: PantryState = { batches: [], nextUid: 1 }) {}

    private ing(id: string): Ingredient {
        const ing = this.config.ingredient.get(id);
        if (!ing) throw new Error(`未知食材 ${id}`);
        return ing;
    }

    private live(id: string): Batch[] {
        return this.state.batches
            .filter(b => b.id === id && b.hoursLeft > 1e-9)
            .sort((a, b) => a.hoursLeft - b.hoursLeft);
    }

    /** 不需要预处理的食材，未处理即可用。 */
    needsPrep(id: string): boolean { return this.ing(id).prep !== 'none'; }

    add(id: string, count: number, hoursLeft = this.ing(id).freshHours): void {
        if (count <= 0) return;
        const same = this.state.batches.find(b => b.id === id && Math.abs(b.hoursLeft - hoursLeft) < 1e-6);
        if (same) { same.raw += count; return; }
        this.state.batches.push({ uid: this.state.nextUid++, id, raw: count, ready: 0, hoursLeft });
    }

    total(id: string): number { return this.live(id).reduce((s, b) => s + b.raw + b.ready, 0); }
    rawCount(id: string): number { return this.live(id).reduce((s, b) => s + b.raw, 0); }

    /** 立即可下锅/加入的份数。 */
    usable(id: string): number {
        return this.needsPrep(id) ? this.live(id).reduce((s, b) => s + b.ready, 0) : this.rawCount(id);
    }

    /** 最旧一份可用食材的新鲜度档。没有时返回 3。 */
    usableTier(id: string): FreshTier {
        const prep = this.needsPrep(id);
        const b = this.live(id).find(x => (prep ? x.ready : x.raw) > 0);
        return b ? freshTier(this.ing(id), b.hoursLeft) : 3;
    }

    /** 最好（最新）的一批的档，给菜单显示。 */
    bestTier(id: string): FreshTier {
        const l = this.live(id);
        return l.length ? freshTier(this.ing(id), l[l.length - 1].hoursLeft) : 3;
    }

    /** 取一份未处理的去预处理，返回批次 uid。 */
    takeForPrep(id: string): number | null {
        const b = this.live(id).find(x => x.raw > 0);
        if (!b) return null;
        b.raw--;
        return b.uid;
    }

    finishPrep(uid: number): void {
        const b = this.state.batches.find(x => x.uid === uid);
        if (b) b.ready++;
    }

    cancelPrep(uid: number): void {
        const b = this.state.batches.find(x => x.uid === uid);
        if (b) b.raw++;
    }

    /** 消耗一份可用食材，返回其新鲜度档；没有则返回 null。 */
    consume(id: string): FreshTier | null {
        const prep = this.needsPrep(id);
        const b = this.live(id).find(x => (prep ? x.ready : x.raw) > 0);
        if (!b) return null;
        if (prep) b.ready--; else b.raw--;
        return freshTier(this.ing(id), b.hoursLeft);
    }

    /** 游戏时钟推进。 */
    age(hours: number): void {
        for (const b of this.state.batches) b.hoursLeft = Math.max(0, b.hoursLeft - hours);
    }

    /** 打烊：预处理结果退回未处理，食材本身不损失。 */
    closeDay(): void {
        for (const b of this.state.batches) { b.raw += b.ready; b.ready = 0; }
    }

    /** 过夜后会过期的食材（日结提示用）。 */
    expiringAfter(hours: number): Array<{ id: string; count: number }> {
        const out = new Map<string, number>();
        for (const b of this.state.batches) {
            if (b.raw + b.ready > 0 && b.hoursLeft - hours <= 1e-9) out.set(b.id, (out.get(b.id) ?? 0) + b.raw + b.ready);
        }
        return Array.from(out).map(([id, count]) => ({ id, count }));
    }

    /** 清晨移除过期批次，返回被移除的份数。 */
    removeExpired(): Array<{ id: string; count: number }> {
        const removed = new Map<string, number>();
        this.state.batches = this.state.batches.filter(b => {
            const n = b.raw + b.ready;
            if (b.hoursLeft > 1e-9 && n > 0) return true;
            if (n > 0) removed.set(b.id, (removed.get(b.id) ?? 0) + n);
            return false;
        });
        return Array.from(removed).map(([id, count]) => ({ id, count }));
    }
}
