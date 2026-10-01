/** 固定步长。单帧最多追 4 步，多出来的时间丢掉，避免卡顿之后死循环追帧。 */
export class FixedClock {
    private pendingMs = 0;
    constructor(private readonly stepMs: number, private readonly onStep: (seconds: number) => void, private readonly maxSteps = 4) {}

    advance(deltaSeconds: number): void {
        const capMs = this.stepMs * this.maxSteps;
        this.pendingMs += Math.min(Math.max(deltaSeconds, 0), capMs / 1000) * 1000;
        let steps = 0;
        while (this.pendingMs + 0.000001 >= this.stepMs && steps < this.maxSteps) {
            this.pendingMs -= this.stepMs;
            if (this.pendingMs < 0 && this.pendingMs > -0.0001) this.pendingMs = 0;
            steps += 1;
            this.onStep(this.stepMs / 1000);
        }
        if (this.pendingMs + 0.000001 >= this.stepMs) this.pendingMs %= this.stepMs;
    }

    reset(): void { this.pendingMs = 0; }
}
