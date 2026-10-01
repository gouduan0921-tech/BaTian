/**
 * 可存档的带种子随机数（mulberry32）。
 * 存档只记 seed 与 step，读档时按 step 重放即可回到同一位置，保证到达顺序可重现（文档 19 §6）。
 */
export class SeededRng {
    private state: number;
    private count = 0;

    constructor(readonly seed: number, step = 0) {
        this.state = seed >>> 0;
        for (let i = 0; i < step; i++) this.next();
    }

    get step(): number { return this.count; }

    /** [0, 1) */
    next(): number {
        this.count++;
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(n: number): number { return Math.floor(this.next() * n); }

    chance(p: number): boolean { return this.next() < p; }

    /** 按权重挑一项；全部权重为 0 时返回 null。 */
    weighted<T>(items: readonly T[], weight: (item: T) => number): T | null {
        let total = 0;
        for (const it of items) total += Math.max(0, weight(it));
        if (total <= 0) return null;
        let roll = this.next() * total;
        for (const it of items) {
            roll -= Math.max(0, weight(it));
            if (roll < 0) return it;
        }
        return items[items.length - 1];
    }
}
