import { GameConfig } from '../core/Config';
import { FixedClock } from '../simulation/FixedClock';
import { SeededRng } from '../simulation/SeededRng';
import { DayReport, MorningReport, newProfile, Progress } from '../rules/Progress';
import { Shift, ShiftEvent } from '../rules/Shift';
import { defaultSettings, GameSettings, SAVE_FORMAT, SaveFile, SaveStore } from '../save/SaveModel';

/**
 * 一局游戏的流程状态机（文档 02 §1.2、12 §2）：
 * title → morning（进货 / 装修，不计时）→ shift（预处理 90 秒 → 营业 → 打烊收尾）→ report → morning …
 * 纯逻辑，不引用 cc；视图层通过 listener 与只读属性驱动画面。
 */
export type FlowMode = 'title' | 'morning' | 'shift' | 'report' | 'practice';

export interface FlowListener {
    onMode?(mode: FlowMode): void;
    onShiftEvent?(e: ShiftEvent): void;
    onSaved?(message: string | null): void;
}

export class GameFlow {
    mode: FlowMode = 'title';
    progress: Progress | null = null;
    shift: Shift | null = null;
    rng: SeededRng | null = null;
    settings: GameSettings = defaultSettings();
    morningReport: MorningReport | null = null;
    dayReport: DayReport | null = null;
    loadWarning = '';
    paused = false;
    private readonly clock: FixedClock;
    private saveTimer = 0;
    private serial = 0;
    private readonly listeners: FlowListener[] = [];

    constructor(readonly config: GameConfig, readonly store: SaveStore) {
        const s = config.balance.session;
        this.clock = new FixedClock(s.fixedStepMs / 1000, s.catchUpSteps);
    }

    listen(l: FlowListener): void { this.listeners.push(l); }

    private emitMode(): void { for (const l of this.listeners) l.onMode?.(this.mode); }
    private setMode(m: FlowMode): void { this.mode = m; this.emitMode(); }

    /** 读档。返回是否有可继续的档。 */
    boot(): boolean {
        const got = this.store.load();
        this.loadWarning = got.warning;
        if (!got.file) return false;
        const f = got.file;
        this.settings = { ...defaultSettings(), ...f.settings };
        this.progress = new Progress(this.config, f.profile);
        this.rng = new SeededRng(f.profile.rng.seed, f.rngStep);
        this.serial = f.serial;
        if (f.shift) {
            this.shift = new Shift(this.config, f.shift, this.progress.pantry, this.rng);
        }
        return true;
    }

    get hasSave(): boolean { return !!this.progress; }

    newGame(seed = Date.now()): void {
        this.store.unblock();
        this.progress = new Progress(this.config, newProfile(this.config, seed));
        this.rng = new SeededRng(this.progress.state.rng.seed);
        this.shift = null;
        this.serial = 0;
        this.beginMorning();
    }

    continueGame(): void {
        if (!this.progress) return;
        if (this.shift && this.shift.phase !== 'done') { this.paused = false; this.setMode('shift'); return; }
        this.beginMorning();
    }

    beginMorning(): void {
        if (!this.progress) return;
        this.morningReport = this.progress.morning();
        this.dayReport = null;
        this.setMode('morning');
        this.save();
    }

    /** 点「开始备料」：生成当日客流，进入 90 秒预处理。 */
    startPrep(): void {
        if (!this.progress || !this.rng) return;
        this.shift = this.progress.startShift(this.rng);
        this.clock.reset();
        this.saveTimer = 0;
        this.setMode('shift');
        this.save();
    }

    startPractice(recipeId: string): void {
        if (!this.progress) return;
        this.shift = this.progress.startPractice(recipeId, new SeededRng(Date.now() >>> 0));
        this.clock.reset();
        this.setMode('practice');
    }

    endPractice(): void {
        if (!this.progress || !this.shift || this.mode !== 'practice') return;
        this.progress.applyPractice(this.shift);
        this.shift = null;
        this.save();
        this.setMode(this.progress.state.morningDone ? 'morning' : 'title');
    }

    /** 每帧调用。 */
    tick(dt: number): void {
        const sh = this.shift;
        if (!sh || this.paused || (this.mode !== 'shift' && this.mode !== 'practice')) return;
        const steps = this.clock.feed(dt);
        const stepSec = this.config.balance.session.fixedStepMs / 1000;
        for (let i = 0; i < steps; i++) {
            sh.step(stepSec);
            for (const e of sh.drainEvents()) for (const l of this.listeners) l.onShiftEvent?.(e);
            if (sh.phase === 'done') break;
        }
        if (this.mode === 'practice') return;
        if (sh.phase === 'done') { this.closeDay(); return; }
        this.saveTimer += dt;
        if (this.saveTimer >= this.config.balance.session.autosaveSeconds) { this.saveTimer = 0; this.save(); }
    }

    /** 指令执行后立刻把拒绝原因等事件发出去（不必等下一步）。 */
    flushEvents(): void {
        if (!this.shift) return;
        for (const e of this.shift.drainEvents()) for (const l of this.listeners) l.onShiftEvent?.(e);
    }

    private closeDay(): void {
        if (!this.progress || !this.shift) return;
        this.dayReport = this.progress.closeDay(this.shift);
        this.shift = null;
        this.setMode('report');
        this.save();
    }

    /** 日结看完：进入次日清晨。 */
    nextDay(): void { this.beginMorning(); }

    toTitle(): void {
        this.save();
        this.setMode('title');
    }

    save(): string | null {
        if (!this.progress || !this.rng || this.mode === 'practice') return null;
        this.progress.state.rng.step = this.rng.step;
        const file: SaveFile = {
            format: SAVE_FORMAT, version: this.config.balance.version, serial: this.serial,
            profile: this.progress.state, shift: this.shift && this.shift.phase !== 'done' ? this.shift.state : null,
            rngStep: this.rng.step, settings: this.settings,
        };
        const msg = this.store.write(file);
        if (!msg) this.serial = file.serial;
        for (const l of this.listeners) l.onSaved?.(msg);
        return msg;
    }
}
