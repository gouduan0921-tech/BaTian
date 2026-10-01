import { FixedClock } from '../simulation/FixedClock';
import { BowlKind, Catalog, HeatName } from './Catalog';
import type { StoveSave } from './DeskSave';
import { FreshTier, freshSteps, Pantry } from './Pantry';
import { CookResult, PotBoard, PotPhase, PotSim, Season } from './PotSim';
import { quoteDish, ServedDish } from './Score';

export interface PotReadout {
    index: number;
    potId: string;
    recipeId: string;
    recipeName: string;
    phase: PotPhase;
    heat: HeatName;
    doneness: number;
    scorch: number;
    stir: number;
    result: CookResult | '';
    season: Season | '';
    pendingAdd: string;
    pendingAt: number;
    soup: string;
    plateLeft: number;
    label: string;
    warn: boolean;
    scorchHot: boolean;
    focused: boolean;
}

export function heatWord(heat: HeatName): string {
    if (heat === 'low') return '文火';
    if (heat === 'high') return '武火';
    return '中火';
}

/** 文字结果和颜色一起出现，避免只靠汤色区分。 */
export function potLabel(pot: PotSim, warnAt: number): string {
    if (pot.phase === 'empty') return '空锅';
    if (pot.phase === 'prep') return '备料';
    if (pot.phase === 'washing') return '洗锅';
    if (pot.phase === 'burnt') return '糊底';
    if (pot.phase === 'plated') return resultWord(pot.result);
    const hot = pot.scorch >= 0.7;
    if (pot.phase === 'window') return hot ? '可以出餐 · 快糊了' : '可以出餐';
    if (hot) return '熬煮 · 快糊了';
    if (pot.stir < warnAt) return '熬煮 · 该搅拌';
    return '熬煮';
}

/** 熬煮和出餐窗口用粥谱色。刚好、夹生、过火、糊底和洗锅盖住它。 */
export function visibleSoup(phase: PotPhase, label: string, soup: string): string {
    if (label === '刚好' || label === '夹生' || label === '过火' || label === '糊底') return '';
    if (phase === 'burnt' || phase === 'washing') return '';
    if (phase !== 'cooking' && phase !== 'window') return '';
    return /^#[0-9A-Fa-f]{6}$/.test(soup) ? soup : '';
}

export function seasonWord(season: Season | ''): string {
    if (season === 'salty') return '咸香';
    if (season === 'sweet') return '清甜';
    if (season === 'plain') return '原味';
    return '未调味';
}

export function resultWord(result: CookResult | ''): string {
    if (result === 'perfect') return '刚好';
    if (result === 'raw') return '夹生';
    if (result === 'over') return '过火';
    if (result === 'burnt') return '糊底';
    return '已盛碗';
}

/** 灰盒炭火和备料的操作入口。下锅会扣库存，界面不自己判断能不能煮。 */
export class StoveDesk {
    readonly board: PotBoard;
    readonly pantry: Pantry;
    readonly committedTier: Array<FreshTier | ''>;
    readonly bowls: BowlKind[];
    nightService = false;
    private readonly served: ServedDish[] = [];
    readonly purse: { amount: number };
    owingRent = false;
    private readonly clock: FixedClock;
    focusIndex = 0;
    lastMessage = '';
    private extraPrepSlots = 0;
    private extraBuyKinds = 0;

    constructor(private readonly catalog: Catalog, count = 2, purse?: { amount: number }) {
        this.board = new PotBoard(catalog, count);
        this.pantry = new Pantry(catalog);
        this.purse = purse ?? { amount: catalog.balance.session.initialWallet };
        this.committedTier = Array.from({ length: count }, () => '');
        this.bowls = Array.from({ length: count }, () => 'coarse');
        this.clock = new FixedClock(catalog.balance.session.fixedStepMs, dt => {
            this.board.step(dt);
            this.pantry.tick(dt);
            this.pantry.passServiceSeconds(dt);
        }, catalog.balance.session.catchUpSteps);
    }

    get wallet(): number { return this.purse.amount; }

    applyUpgradeEffects(prepSlots: number, buyKinds: number): void {
        this.extraPrepSlots = Math.max(0, prepSlots);
        this.extraBuyKinds = Math.max(0, buyKinds);
    }

    ingredientSpendToday(): number {
        return this.pantry.capture().bought.reduce((sum, row) =>
            sum + row.count * (this.catalog.ingredient(row.id)?.buyPrice ?? 0), 0);
    }

    set wallet(amount: number) { this.purse.amount = Math.max(0, amount); }

    kindLimit(): number {
        const session = this.catalog.balance.session;
        return this.owingRent ? session.debtBuyKinds : session.initialBuyKinds + this.extraBuyKinds;
    }

    buy(id: string): { ok: boolean; message: string } {
        const item = this.catalog.ingredient(id);
        if (!item) return this.keep({ ok: false, message: `食材表没有 ${id}` });
        if (this.wallet < item.buyPrice) return this.keep({ ok: false, message: '铜钱不足' });
        const result = this.pantry.purchase(id, 1, this.kindLimit());
        if (!result.ok) return this.keep({ ok: false, message: result.message });
        this.wallet -= result.cost;
        return this.keep({ ok: true, message: `${result.message}，余${this.wallet}铜钱` });
    }

    prep(id = ''): { ok: boolean; message: string } {
        const target = id || this.pantry.summary().find(row => row.tier !== 'expired' && row.ready < row.total && row.prepping === 0)?.id || '';
        if (!target) return this.keep({ ok: false, message: '没有待处理的食材' });
        const result = this.pantry.startPrep(target, this.catalog.balance.session.initialPrepSlots + this.extraPrepSlots);
        return this.keep({ ok: result.ok, message: result.message });
    }

    cancelPrep(id = ''): { ok: boolean; message: string } {
        const target = id || this.pantry.summary().find(row => row.prepping > 0)?.id || '';
        if (!target) return this.keep({ ok: false, message: '没有进行中的预处理' });
        const result = this.pantry.cancelPrep(target);
        return this.keep({ ok: result.ok, message: result.message });
    }

    stockText(): string {
        const head = `备料铜钱 ${this.wallet} · ${this.owingRent ? '欠租，' : ''}今日可买 ${this.kindLimit()} 种`;
        const rows = this.pantry.summary();
        if (!rows.length) return `${head}\n没有食材。白粥要先买米，再点处理。`;
        const body = rows.map(row => {
            const state = row.tier === 'expired' ? '过期不可下锅' : row.prepping ? `处理中 ${Math.ceil(row.prepLeft)} 秒` : row.ready === row.total ? '可下锅' : row.ready ? `可下锅 ${row.ready}` : '待处理';
            return `${row.name} ${row.total}${row.unit} ${tierWord(row.tier)} ${state}`;
        }).join('  ');
        return `${head}\n${body}`;
    }

    focus(index: number): void {
        this.board.setFocus(index);
        this.focusIndex = this.board.focus;
    }

    beginFocused(recipeId: string): { ok: boolean; message: string } {
        const recipe = this.catalog.recipe(recipeId);
        if (!recipe) return this.keep({ ok: false, message: `没有粥谱 ${recipeId}` });
        const pot = this.board.pots[this.focusIndex];
        if (pot.phase !== 'empty') return this.keep({ ok: false, message: `${pot.potId} 还不能下新单` });
        const stock = this.pantry.commit(recipe);
        if (!stock.ok) return this.keep({ ok: false, message: stock.message });
        const started = pot.begin(recipeId);
        if (!started.ok) return this.keep(started);
        this.committedTier[this.focusIndex] = stock.tier;
        return this.keep({ ok: true, message: `${recipe.name}已下锅` });
    }

    setHeat(heat: HeatName): { ok: boolean; message: string } {
        return this.keep(this.board.pots[this.focusIndex].setHeat(heat));
    }

    stir(): { ok: boolean; message: string } {
        return this.keep(this.board.pots[this.focusIndex].pressStir());
    }

    addNext(): { ok: boolean; message: string } {
        const pot = this.board.pots[this.focusIndex];
        const recipe = pot.recipe;
        if (!recipe) return this.keep({ ok: false, message: '空锅不能加料' });
        const next = recipe.adds.find(item => !pot.added.includes(item.id));
        if (!next) return this.keep({ ok: false, message: recipe.adds.length ? '配料已加完' : '这道粥不用加料' });
        return this.keep(pot.addIngredient(next.id));
    }

    season(season: Season): { ok: boolean; message: string } {
        const result = this.board.pots[this.focusIndex].chooseSeason(season);
        if (!result.ok) return this.keep(result);
        return this.keep({ ok: true, message: `已调成${seasonWord(season)}` });
    }

    chooseBowl(kind: BowlKind): { ok: boolean; message: string } {
        const pot = this.board.pots[this.focusIndex];
        if (pot.phase !== 'window' && pot.phase !== 'plated') return this.keep({ ok: false, message: '出餐窗口或摆盘时才能选碗' });
        if (pot.plateReady()) return this.keep({ ok: false, message: '这碗已经交出去了' });
        this.bowls[this.focusIndex] = kind;
        const name = kind === 'glaze' ? '暖釉碗' : kind === 'night' ? '深蓝盏' : '粗瓷碗';
        return this.keep({ ok: true, message: `用${name}` });
    }

    serve(): { ok: boolean; message: string; result: CookResult | '' } {
        const index = this.focusIndex;
        const pot = this.board.pots[index];
        const outcome = pot.serve();
        if (outcome.ok && outcome.result === 'burnt') {
            this.handoff(index);
            return this.keep({ ...outcome, message: `${this.lastMessage}，锅要洗` });
        }
        return this.keep(outcome);
    }

    takeServed(): ServedDish | undefined { return this.served.shift(); }

    dump(): { ok: boolean; message: string } {
        return this.keep(this.board.pots[this.focusIndex].dump());
    }

    advance(deltaSeconds: number, paused: boolean): string[] {
        if (paused) { this.clock.reset(); return []; }
        this.clock.advance(deltaSeconds);
        return this.finishPlates();
    }

    resetClock(): void { this.clock.reset(); }

    readouts(): PotReadout[] {
        return this.board.pots.map((pot, index) => ({
            index, potId: pot.potId, recipeId: pot.recipeId, recipeName: pot.recipe?.name || '', phase: pot.phase, heat: pot.heat,
            doneness: pot.doneness, scorch: pot.scorch, stir: pot.stir, result: pot.result,
            season: pot.season, pendingAdd: this.pendingName(pot), pendingAt: this.pendingPoint(pot), soup: pot.recipe?.color || '', plateLeft: pot.plateLeft,
            label: potLabel(pot, pot.stirWarnAt()),
            warn: (pot.phase === 'cooking' || pot.phase === 'window') && pot.stir < pot.stirWarnAt(),
            scorchHot: pot.scorch >= 0.7 && (pot.phase === 'cooking' || pot.phase === 'window' || pot.phase === 'burnt'),
            focused: index === this.board.focus,
        }));
    }

    private pendingName(pot: PotSim): string {
        const next = pot.recipe?.adds.find(item => !pot.added.includes(item.id));
        if (!next) return '';
        return this.catalog.ingredient(next.id)?.name || next.id;
    }

    private pendingPoint(pot: PotSim): number {
        return pot.recipe?.adds.find(item => !pot.added.includes(item.id))?.atDoneness ?? 0;
    }

    private appearanceAt(index: number): number {
        const kind = this.bowls[index];
        if (kind === 'glaze') return this.catalog.balance.bowls.glaze;
        if (kind === 'night' && this.nightService) return this.catalog.balance.bowls.night;
        return this.catalog.balance.bowls.coarse;
    }

    private handoff(index: number): void {
        const pot = this.board.pots[index];
        const recipe = pot.recipe;
        if (!recipe || !pot.result || pot.dumped) return;
        const tier = this.committedTier[index];
        const dish: ServedDish = {
            potId: pot.potId, recipeId: recipe.id, result: pot.result, season: pot.season || 'plain',
            missingAdds: pot.missingAdds(), mistimes: pot.mistimes,
            freshSteps: freshSteps(tier || 'today'), appearance: this.appearanceAt(index),
        };
        this.served.push(dish);
        const quote = quoteDish(this.catalog, dish);
        this.lastMessage = `${recipe.name}${resultWord(dish.result)}，评分 ${quote.score}，实收 ${quote.pay}，小费 ${quote.tip}`;
    }

    private finishPlates(): string[] {
        const notes: string[] = [];
        this.board.pots.forEach((pot, index) => {
            if (!pot.plateReady()) return;
            this.handoff(index);
            pot.release();
            this.committedTier[index] = '';
            this.bowls[index] = 'coarse';
            notes.push(this.lastMessage);
        });
        return notes;
    }

    private keep<T extends { message: string }>(result: T): T {
        this.lastMessage = result.message;
        return result;
    }

    capture(): StoveSave {
        return {
            focus: this.focusIndex,
            nightService: this.nightService,
            owingRent: this.owingRent,
            committedTier: [...this.committedTier],
            bowls: [...this.bowls],
            pots: this.board.pots.map(pot => pot.capture()),
            pantry: this.pantry.capture(),
            served: this.served.map(dish => ({ ...dish })),
        };
    }

    install(save: StoveSave): void {
        this.focusIndex = save.focus;
        this.board.setFocus(save.focus);
        this.nightService = save.nightService;
        this.owingRent = save.owingRent;
        save.pots.forEach((pot, index) => {
            const live = this.board.pots[index];
            live.install(pot);
            live.focus = index === save.focus;
        });
        this.committedTier.splice(0, this.committedTier.length, ...save.committedTier);
        this.bowls.splice(0, this.bowls.length, ...save.bowls);
        this.pantry.install(save.pantry);
        this.served.splice(0, this.served.length, ...save.served.map(dish => ({ ...dish })));
    }

    static restore(catalog: Catalog, save: StoveSave, purse: { amount: number }): StoveDesk {
        const desk = new StoveDesk(catalog, save.pots.length, purse);
        desk.install(save);
        return desk;
    }
}

function tierWord(tier: FreshTier): string {
    if (tier === 'today') return '当日';
    if (tier === 'overnight') return '过夜';
    if (tier === 'aged') return '放了三天';
    return '过期';
}
