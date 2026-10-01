import { Catalog, HeatName, Recipe } from './Catalog';
import type { PotSave } from './DeskSave';

export type PotPhase = 'empty' | 'prep' | 'cooking' | 'window' | 'plated' | 'burnt' | 'washing';
export type CookResult = 'perfect' | 'over' | 'raw' | 'burnt';
export type Season = 'plain' | 'salty' | 'sweet';
export type PotEventType = 'cooking' | 'window' | 'stirWarn' | 'stir' | 'burnt' | 'washed';
export interface PotEvent { type: PotEventType; potId: string }
export interface ServeOutcome { ok: boolean; message: string; result: CookResult | ''; dumped: boolean }

/**
 * 一口锅的纯数据。每步由固定时钟推进，不持有场景节点。
 * 火候系数来自 balance.json，不用动画时长代替。
 */
export class PotSim {
    phase: PotPhase = 'empty';
    recipeId = '';
    heat: HeatName = 'mid';
    simmer = 0;
    stir = 1;
    doneness = 0;
    scorch = 0;
    readonly added: string[] = [];
    focus = true;
    season: Season | '' = '';
    mistimes = 0;
    result: CookResult | '' = '';
    dumped = false;
    plateLeft = 0;
    masteryPoints = 0;
    private prepLeft = 0;
    private washLeft = 0;
    private windup = 0;
    private sinceStir = 999;
    private warnLatched = false;
    private seasonLocked = false;

    constructor(readonly potId: string, private readonly catalog: Catalog) {}

    get recipe(): Recipe | undefined { return this.recipeId ? this.catalog.recipe(this.recipeId) : undefined; }

    begin(recipeId: string): { ok: boolean; message: string } {
        const recipe = this.catalog.recipe(recipeId);
        if (!recipe) return { ok: false, message: `没有粥谱 ${recipeId}` };
        if (this.phase !== 'empty') return { ok: false, message: `${this.potId} 还不能下新单` };
        this.phase = 'prep';
        this.recipeId = recipeId;
        this.heat = recipe.heatHint;
        this.simmer = 0;
        this.stir = 1;
        this.doneness = 0;
        this.scorch = 0;
        this.added.length = 0;
        this.season = '';
        this.mistimes = 0;
        this.result = '';
        this.dumped = false;
        this.plateLeft = 0;
        this.prepLeft = this.catalog.balance.session.dishPrepSeconds;
        this.washLeft = 0;
        this.windup = 0;
        this.sinceStir = 999;
        this.warnLatched = false;
        this.seasonLocked = false;
        return { ok: true, message: `${recipe.name} 开始备料` };
    }

    setHeat(heat: HeatName): { ok: boolean; message: string } {
        if (this.phase !== 'prep' && this.phase !== 'cooking' && this.phase !== 'window') return { ok: false, message: '现在不能调火' };
        this.heat = heat;
        return { ok: true, message: heat === 'low' ? '文火' : heat === 'mid' ? '中火' : '武火' };
    }

    pressStir(): { ok: boolean; message: string } {
        if (this.phase !== 'cooking' && this.phase !== 'window') return { ok: false, message: '现在不能搅拌' };
        if (this.windup > 0) return { ok: false, message: '勺子还在前摇' };
        this.windup = this.catalog.balance.stir.windupSeconds;
        return { ok: true, message: '开始搅拌' };
    }

    cancelStir(): { ok: boolean; message: string } {
        if (this.windup <= 0) return { ok: false, message: '没有进行中的搅拌' };
        this.windup = 0;
        return { ok: true, message: '取消搅拌' };
    }

    addIngredient(id: string): { ok: boolean; message: string } {
        const recipe = this.recipe;
        if (!recipe || (this.phase !== 'cooking' && this.phase !== 'window')) return { ok: false, message: '现在不能加料' };
        const point = recipe.adds.find(item => item.id === id);
        if (!point) return { ok: false, message: '这道粥不加这样' };
        if (this.added.includes(id)) return { ok: false, message: '已经加过' };
        this.added.push(id);
        const addWindow = this.masteryPoints >= 20 ? 0.10 : this.catalog.balance.score.addWindow;
        if (Math.abs(this.doneness - point.atDoneness) > addWindow) this.mistimes += 1;
        return { ok: true, message: this.mistimes ? '加料时机偏了' : '加料正好' };
    }

    chooseSeason(season: Season): { ok: boolean; message: string } {
        if (this.phase !== 'window') return { ok: false, message: '出餐窗口里才能调味' };
        if (this.seasonLocked) return { ok: false, message: '调味不能更改' };
        this.season = season;
        this.seasonLocked = true;
        return { ok: true, message: '已调味' };
    }

    serve(): ServeOutcome {
        if (this.phase !== 'cooking' && this.phase !== 'window' && this.phase !== 'burnt') {
            return { ok: false, message: '现在不能盛碗', result: '', dumped: false };
        }
        const gates = this.catalog.balance.gates;
        if (this.phase === 'burnt' || this.scorch >= gates.burn) this.result = 'burnt';
        else if (this.doneness < gates.serveMin) this.result = 'raw';
        else if (this.doneness > gates.serveMax) this.result = 'over';
        else this.result = 'perfect';
        if (!this.season) this.season = 'plain';
        this.seasonLocked = true;
        this.windup = 0;
        if (this.result === 'burnt') {
            this.phase = 'washing';
            this.washLeft = this.catalog.balance.session.washSeconds;
            this.plateLeft = 0;
            return { ok: true, message: '糊底上桌，锅要洗', result: 'burnt', dumped: false };
        }
        this.phase = 'plated';
        this.plateLeft = this.catalog.balance.session.plateSeconds;
        const word = this.result === 'perfect' ? '刚好' : this.result === 'raw' ? '夹生' : '过火';
        return { ok: true, message: `${word}，开始摆盘`, result: this.result, dumped: false };
    }

    plateReady(): boolean { return this.phase === 'plated' && this.plateLeft <= 0.000001; }

    /** 摆盘结束后腾锅。洗锅中的空锅不走这里。 */
    release(): boolean {
        if (!this.plateReady()) return false;
        this.phase = 'empty';
        this.recipeId = '';
        this.plateLeft = 0;
        this.result = '';
        this.season = '';
        this.added.length = 0;
        return true;
    }

    dump(): ServeOutcome {
        if (this.phase !== 'burnt') return { ok: false, message: '只有糊锅可以倒掉', result: '', dumped: false };
        this.dumped = true;
        this.result = '';
        this.windup = 0;
        this.phase = 'washing';
        this.washLeft = this.catalog.balance.session.washSeconds;
        return { ok: true, message: '倒掉了，食材不退，锅要洗', result: '', dumped: true };
    }

    missingAdds(): number {
        const recipe = this.recipe;
        if (!recipe) return 0;
        return recipe.adds.filter(item => !this.added.includes(item.id)).length;
    }

    step(dt: number): PotEvent[] {
        const events: PotEvent[] = [];
        if (this.phase === 'prep') {
            if (dt + 0.000001 < this.prepLeft) { this.prepLeft -= dt; return events; }
            dt -= this.prepLeft;
            this.prepLeft = 0;
            this.enterCooking(events);
            if (dt <= 0.000001) return events;
        }
        if (this.phase === 'washing') {
            this.washLeft = Math.max(0, this.washLeft - dt);
            if (this.washLeft <= 0.000001) this.becomeEmpty(events);
            return events;
        }
        if (this.phase === 'plated') {
            if (this.plateLeft > 0) {
                this.plateLeft -= dt;
                if (this.plateLeft <= 0.000001) this.plateLeft = 0;
            }
            return events;
        }
        if (this.phase !== 'cooking' && this.phase !== 'window') return events;
        const rules = this.catalog.balance;
        const rate = rules.heat[this.heat];
        const decay = this.focus ? rules.stir.decayFocus : rules.stir.decayBlur;
        this.simmer = Math.min(1, this.simmer + rate.simmer * dt);
        this.doneness = Math.min(1, this.doneness + rate.doneness * dt);
        this.stir = Math.max(0, this.stir - decay * dt);
        let scorchRate = rate.scorch;
        if (this.stir < rules.stir.warn) scorchRate += rules.stir.lowStirScorch;
        this.scorch = Math.min(1, this.scorch + scorchRate * dt);
        if (this.stir < this.stirWarnAt()) {
            if (!this.warnLatched) { this.warnLatched = true; events.push({ type: 'stirWarn', potId: this.potId }); }
        } else this.warnLatched = false;
        this.sinceStir += dt;
        if (this.windup > 0) {
            this.windup -= dt;
            if (this.windup <= 0.000001) { this.windup = 0; this.completeStir(events); }
        }
        if (this.scorch >= rules.gates.burn) {
            this.phase = 'burnt';
            this.windup = 0;
            events.push({ type: 'burnt', potId: this.potId });
        } else if (this.doneness >= rules.gates.serveMin && this.doneness <= rules.gates.serveMax) {
            if (this.phase !== 'window') events.push({ type: 'window', potId: this.potId });
            this.phase = 'window';
        } else if (this.phase === 'window') this.phase = 'cooking';
        return events;
    }

    private enterCooking(events: PotEvent[]): void {
        this.phase = 'cooking';
        events.push({ type: 'cooking', potId: this.potId });
    }

    stirWarnAt(): number {
        if (this.masteryPoints < 8) return this.catalog.balance.stir.warn;
        const decay = this.focus ? this.catalog.balance.stir.decayFocus : this.catalog.balance.stir.decayBlur;
        return Math.min(1, this.catalog.balance.stir.warn + decay * 0.5);
    }

    private completeStir(events: PotEvent[]): void {
        const stir = this.catalog.balance.stir;
        let gain = stir.gain;
        if (this.sinceStir < stir.repeatSeconds) gain *= this.sinceStir / stir.repeatSeconds;
        this.stir = Math.min(1, this.stir + gain);
        this.sinceStir = 0;
        events.push({ type: 'stir', potId: this.potId });
    }

    private becomeEmpty(events: PotEvent[]): void {
        this.phase = 'empty';
        this.recipeId = '';
        this.washLeft = 0;
        events.push({ type: 'washed', potId: this.potId });
    }

    capture(): PotSave {
        return {
            phase: this.phase, heat: this.heat, simmer: this.simmer, stir: this.stir,
            doneness: this.doneness, scorch: this.scorch, recipeId: this.recipeId, added: [...this.added],
            season: this.season, mistimes: this.mistimes, result: this.result, dumped: this.dumped,
            plateLeft: this.plateLeft, prepLeft: this.prepLeft, washLeft: this.washLeft, windup: this.windup,
            sinceStir: this.sinceStir, warnLatched: this.warnLatched, seasonLocked: this.seasonLocked,
            masteryPoints: this.masteryPoints,
        };
    }

    install(save: PotSave): void {
        this.phase = save.phase;
        this.heat = save.heat;
        this.simmer = save.simmer;
        this.stir = save.stir;
        this.doneness = save.doneness;
        this.scorch = save.scorch;
        this.recipeId = save.recipeId;
        this.added.splice(0, this.added.length, ...save.added);
        this.season = save.season;
        this.mistimes = save.mistimes;
        this.result = save.result;
        this.dumped = save.dumped;
        this.plateLeft = save.plateLeft;
        this.prepLeft = save.prepLeft;
        this.washLeft = save.washLeft;
        this.windup = save.windup;
        this.sinceStir = save.sinceStir;
        this.warnLatched = save.warnLatched;
        this.seasonLocked = save.seasonLocked;
        this.masteryPoints = save.masteryPoints || 0;
    }
}

/** 最多四口锅。切焦点不暂停其他锅。 */
export class PotBoard {
    readonly pots: PotSim[];
    focus = 0;

    constructor(catalog: Catalog, count: number) {
        if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('锅位必须是 1 到 4');
        this.pots = Array.from({ length: count }, (_, index) => new PotSim(`P${index + 1}`, catalog));
    }

    setFocus(index: number): void {
        if (index >= 0 && index < this.pots.length) this.focus = index;
    }

    step(dt: number): PotEvent[] {
        const events: PotEvent[] = [];
        this.pots.forEach((pot, index) => {
            pot.focus = index === this.focus;
            events.push(...pot.step(dt));
        });
        return events;
    }
}
