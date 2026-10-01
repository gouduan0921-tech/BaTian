import { Balance } from '../core/Balance';
import { Campaign } from '../core/Campaign';
import { AudioBus, AudioSettings } from '../audio/AudioBus';
import { DebugOverrides } from '../debug/DebugOverrides';
import { SaveFile, campaignSlice, emptySave } from '../save/SaveDocument';
import { FixedClock } from '../simulation/FixedClock';
import { Command, CommandResult, ShiftModel } from '../simulation/ShiftModel';
import { SimEvent } from '../simulation/Events';

type Issued = Command['type'] | 'upgrade';

/**
 * 一局的规则入口。界面只通过这里发命令。
 * 存档节奏：每 5 秒模拟时间，以及扣费、交付、升级、日结之后。
 */
export class PlaySession {
    readonly campaign: Campaign;
    model: ShiftModel;
    clock: FixedClock;
    serial: number;
    settings: AudioSettings;
    private lastSaveMark = -1;
    private readonly audio: AudioBus;
    private saveRequested = false;

    private constructor(campaign: Campaign, model: ShiftModel, serial: number, settings: AudioSettings, audio: AudioBus) {
        this.campaign = campaign;
        this.model = model;
        this.serial = serial;
        this.settings = settings;
        this.audio = audio;
        this.audio.apply(settings);
        this.clock = new FixedClock(model.balance.session.fixedStepMs, dt => this.model.tick(dt));
        this.model.subscribe(event => this.onEvent(event));
        this.lastSaveMark = Math.floor(model.elapsed / 5);
    }

    static start(balance: Balance, saved: SaveFile | null, debug: DebugOverrides = {}, audio = new AudioBus()): PlaySession {
        const file = saved || emptySave(balance);
        const campaign = new Campaign(balance, campaignSlice(file));
        if (!saved && debug.day) campaign.completedDays = debug.day - 1;
        const options = {
            seed: file.rng.seed || debug.seed || 1,
            randomOrders: debug.seed !== undefined,
            forcedRecipeId: debug.recipeId,
        };
        const model = file.shift
            ? ShiftModel.restore(balance, file.shift, campaign.upgrades)
            : campaign.createShift({ ...options, seed: debug.seed ?? options.seed });
        if (!file.shift && debug.seed !== undefined) model.randomOrders = true;
        return new PlaySession(campaign, model, file.shift ? file.serial : 0, file.settings, audio);
    }

    get audioBus(): AudioBus { return this.audio; }

    advance(deltaSeconds: number): void { this.clock.advance(deltaSeconds); }

    /** 模拟时间每跨过 5 秒，或关键事务之后，需要落盘。 */
    consumeSaveRequest(): boolean {
        const mark = Math.floor(this.model.elapsed / 5);
        const due = !this.model.ended && mark !== this.lastSaveMark;
        const requested = this.saveRequested || due;
        this.saveRequested = false;
        if (due) this.lastSaveMark = mark;
        return requested;
    }

    issue(type: Command['type'], orderId = '', slot?: number, step?: number): CommandResult {
        const command: Command = { id: `${this.model.session}:${++this.serial}`, session: this.model.session, type, orderId, slot, step };
        const result = this.model.command(command);
        if (result.ok && (type === 'start' || type === 'deliver')) this.saveRequested = true;
        if (type === 'pause') this.audio.pause();
        if (type === 'resume') this.audio.resume();
        return result;
    }

    purchase(id: string): CommandResult {
        const result = this.campaign.purchase(id);
        if (result.ok) {
            this.model.wallet = this.campaign.wallet;
            const upgrade = this.campaign.balance.upgrades.find(item => item.id === id)!;
            this.onEvent({ type: 'upgraded', id, price: upgrade.price, wallet: this.campaign.wallet });
            this.saveRequested = true;
        }
        return result;
    }

    finishIfEnded(): boolean {
        if (!this.model.ended || this.campaign.snapshot().settledSessions?.includes(this.model.session)) return false;
        try {
            this.campaign.finish(this.model);
        } catch {
            return false;
        }
        this.saveRequested = true;
        return true;
    }

    nextDay(): void {
        this.model = this.campaign.createShift({ seed: this.model.rng.seed, randomOrders: this.model.randomOrders });
        this.model.subscribe(event => this.onEvent(event));
        this.clock = new FixedClock(this.model.balance.session.fixedStepMs, dt => this.model.tick(dt));
        this.serial = 0;
        this.lastSaveMark = -1;
        this.saveRequested = true;
    }

    snapshot(): SaveFile {
        const campaign = this.campaign.snapshot();
        return {
            format: 1,
            version: this.model.balance.version,
            wallet: this.model.ended ? campaign.wallet : this.model.wallet,
            completedDays: campaign.completedDays,
            upgrades: campaign.upgrades,
            codex: campaign.codex || { recipes: [], customers: [] },
            settings: this.settings,
            shift: this.model.ended ? null : this.model.snapshot(),
            serial: this.serial,
            rng: this.model.rng.snapshot(),
            ledger: campaign.settledSessions || [],
        };
    }

    private onEvent(event: SimEvent): void {
        if (event.type === 'delivered') this.campaign.noteVisit(event.recipeId, event.customerId);
        this.audio.onSimEvent(event);
    }
}

export type { Issued };
