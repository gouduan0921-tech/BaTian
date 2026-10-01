/** 可保存的订单随机源。位置是已消耗次数，恢复后从同一位置继续。 */
export interface RngState { seed: number; step: number }

export class SeededRng {
    constructor(readonly seed: number, private step = 0) {
        if (!Number.isInteger(seed) || seed < 0) throw new Error('随机种子无效');
        if (!Number.isInteger(step) || step < 0) throw new Error('随机数位置无效');
    }

    get position(): number { return this.step; }

    /** [0, 1) */
    next(): number {
        let a = (this.seed + this.step) >>> 0;
        this.step++;
        a = Math.imul(a ^ (a >>> 15), a | 1);
        a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
        return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
    }

    index(length: number): number {
        if (length <= 0) throw new Error('随机范围无效');
        return Math.floor(this.next() * length);
    }

    snapshot(): RngState { return { seed: this.seed, step: this.step }; }

    static restore(state: RngState): SeededRng { return new SeededRng(state.seed, state.step); }
}
