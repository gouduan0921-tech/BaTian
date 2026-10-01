/**
 * 固定步长时钟（文档 03 §6、19 §3）。渲染帧只喂累积时间，单帧最多追 maxSteps 步，避免死亡螺旋。
 */
export class FixedClock {
    private acc = 0;

    constructor(readonly stepSeconds = 0.05, readonly maxSteps = 4) {}

    /** 返回本帧应推进的步数。 */
    feed(dt: number): number {
        if (!(dt > 0)) return 0;
        this.acc += dt;
        let steps = Math.floor(this.acc / this.stepSeconds + 1e-9);
        if (steps > this.maxSteps) {
            steps = this.maxSteps;
            this.acc = 0;
        } else {
            this.acc -= steps * this.stepSeconds;
        }
        return steps;
    }

    reset(): void { this.acc = 0; }
}
