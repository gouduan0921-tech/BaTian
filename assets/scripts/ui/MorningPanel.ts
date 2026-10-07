import { chapterLine, requestText } from './LongTermText';
import { _decorator, Component, Label, Node, Prefab } from 'cc';
import { goalText } from '../rules/Goals';
import { FRESH_WORDS, shelfClass } from '../rules/Pantry';
import { GameContext, SEASON_WORD } from '../view/GameContext';
import { ListRow } from './ListRow';
import { UiButton } from './UiButton';
import { setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

/**
 * 清晨·菜单（预制体 ui/MorningPanel）：进货、看今日能做什么，然后「开始备料」。不计时（文档 04 §1.1）。
 */
@ccclass('MorningPanel')
export class MorningPanel extends Component {
    @property(Label) header: Label | null = null;
    @property(Label) notice: Label | null = null;
    @property(Label) goals: Label | null = null;
    @property(Node) ingredientList: Node | null = null;
    @property(Node) recipeList: Node | null = null;
    @property(Prefab) rowPrefab: Prefab | null = null;
    @property(UiButton) startButton: UiButton | null = null;
    @property(UiButton) decorButton: UiButton | null = null;
    @property(UiButton) practiceButton: UiButton | null = null;
    @property(UiButton) titleButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.startButton?.bind(() => ctx.flow.startPrep());
        this.decorButton?.bind(() => ctx.open('decor'));
        this.practiceButton?.bind(() => ctx.open('practice'));
        this.titleButton?.bind(() => ctx.flow.toTitle());
    }

    refresh(): void {
        const ctx = this.ctx!;
        const p = ctx.flow.progress;
        if (!p) return;
        const cfg = ctx.config;
        const debt = p.state.debt > 0 ? ` · 欠租 ${p.state.debt}` : '';
        const run = p.chapter();
        setText(this.header, `第 ${p.day} 日 · 清晨${run ? ` · ${run.name}` : ''}    铜钱 ${p.state.wallet}${debt}    今天还能进 ${Math.max(0, p.kindsLeft())} 种`);

        const notes: string[] = [];
        const m = ctx.flow.morningReport;
        if (m?.removed.length) notes.push(`过期扔掉：${m.removed.map(r => `${cfg.ingredient.get(r.id)!.name}×${r.count}`).join('、')}`);
        if (m?.rescueRice) notes.push(`隔壁街坊送来 ${m.rescueRice} 份大米。`);
        if (p.day === 1) notes.push('先买米，点「开始备料」后有 90 秒淘洗切配的时间。');
        // 四时章节与街坊请托（文档 30）
        if (run && p.day === run.startDay) notes.push(run.cfg.intro);
        const req = p.state.request;
        if (req && req.day === p.day) notes.push(`今天的请托：${requestText(cfg, req)}，做到给 ${req.reward} 铜。记得把食材买齐。`);
        if (run) notes.push(chapterLine(cfg, p));
        setText(this.notice, notes.join('\n'));
        const goals = p.todayGoals();
        const name = (id: string) => cfg.recipe.get(id)?.name ?? id;
        setText(this.goals, goals.length
            ? `今日小目标：${goals.map(g => `${goalText(g, name)}（+${g.reward}）`).join('　')}　全做到再 +${cfg.balance.goals.bonusAll}`
            : '');

        const recipes = p.unlockedRecipes().sort((a, b) => (a.id === p.state.pinnedRecipe ? -1 : b.id === p.state.pinnedRecipe ? 1 : 0));
        const needed = new Set<string>();
        for (const r of recipes) for (const i of r.ingredients) needed.add(i.id);
        const ings = cfg.ingredients.filter(i => needed.has(i.id));
        const rows = syncList(this.ingredientList, this.rowPrefab, ings.length, ListRow);
        ings.forEach((ing, idx) => {
            const held = p.pantry.total(ing.id);
            const tier = held ? FRESH_WORDS[p.pantry.bestTier(ing.id)] : '';
            const bought = p.state.boughtToday[ing.id] ?? 0;
            rows[idx]
                .fill(`${ing.name}  ${ing.buyPrice} 铜`, `${shelfClass(ing)} · 今日已进 ${bought}/${p.dailyCap(ing.id)}`, held ? `持有 ${held}（${tier}）` : '无')
                .actions(
                    { text: '+1', enabled: !p.canBuy(ing.id, 1), fn: () => { ctx.check(p.buy(ing.id, 1)); ctx.refresh(); } },
                    { text: '+4', enabled: !p.canBuy(ing.id, 4), fn: () => { ctx.check(p.buy(ing.id, 4)); ctx.refresh(); } },
                );
        });

        const rrows = syncList(this.recipeList, this.rowPrefab, recipes.length, ListRow);
        recipes.forEach((r, idx) => {
            const miss = p.missingBase(r);
            const adds = r.adds.map(a => cfg.ingredient.get(a.id)!.name);
            const lacksAdd = r.adds.filter(a => p.pantry.total(a.id) < 1).map(a => cfg.ingredient.get(a.id)!.name);
            const status = miss.length ? `缺 ${miss.join('、')}` : lacksAdd.length ? `缺配料 ${lacksAdd.join('、')}` : '可做';
            const tag = r.season ? (p.kept.includes(r.id) ? '［收进粥谱］' : '［时令］') : '';
            rrows[idx]
                .fill(`${p.state.pinnedRecipe === r.id ? '★ ' : ''}${tag}${r.name}  ${r.price} 铜`, `${SEASON_WORD[r.seasoning]} · 熬 ${r.cookSeconds} 秒${adds.length ? ` · 加 ${adds.join('、')}` : ''}`, status)
                .actions(null, (p.state.pinPending || p.state.pinnedRecipe) && p.state.codex.recipes.includes(r.id) && p.state.pinnedRecipe !== r.id
                    ? { text: '钉在顶上', fn: () => { p.state.pinnedRecipe = r.id; p.state.pinPending = false; ctx.refresh(); } }
                    : null);
        });
        this.practiceButton?.setEnabled(p.state.codex.recipes.length > 0);
        this.startButton?.setEnabled(true).setText('开始备料', recipes.some(r => !p.missingBase(r).length) ? '' : '今天没有能卖的粥');
    }
}
