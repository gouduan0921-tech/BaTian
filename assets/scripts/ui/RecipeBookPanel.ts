import { chapterLine, requestText } from './LongTermText';
import { MilestoneTile } from './MilestoneTile';
import { milestoneValue } from '../rules/Milestones';
import { _decorator, Component, Label, Node, Prefab } from 'cc';
import { CUSTOMER_LINE, CUSTOMER_LOOK, GameContext, HEAT_WORD, INGREDIENT_TINT, SEASON_WORD } from '../view/GameContext';
import { GuestTile } from './GuestTile';
import { RecipeTile } from './RecipeTile';
import { skillInfo } from '../rules/Skill';
import { UiButton } from './UiButton';
import { hexColor, setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

/** 小店粥谱（预制体 ui/RecipeBookPanel，设计稿「粥谱」）：已开放的粥写价格与特点，后面的写开放日。 */
@ccclass('RecipeBookPanel')
export class RecipeBookPanel extends Component {
    @property(Label) title: Label | null = null;
    @property(Label) intro: Label | null = null;
    @property(UiButton) recipesTab: UiButton | null = null;
    @property(UiButton) guestsTab: UiButton | null = null;
    @property(UiButton) notebookTab: UiButton | null = null;
    @property(Node) notebookGrid: Node | null = null;
    @property(Prefab) milestoneTilePrefab: Prefab | null = null;
    @property(Node) guestGrid: Node | null = null;
    @property(Prefab) guestTilePrefab: Prefab | null = null;
    @property(Node) grid: Node | null = null;
    @property(Prefab) tilePrefab: Prefab | null = null;
    @property(Label) foot: Label | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;
    private page: 'recipes' | 'guests' | 'notebook' = 'recipes';

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.closeButton?.bind(() => ctx.close('recipes'));
        this.recipesTab?.bind(() => { this.page = 'recipes'; this.refresh(); });
        this.guestsTab?.bind(() => { this.page = 'guests'; this.refresh(); });
        this.notebookTab?.bind(() => { this.page = 'notebook'; this.refresh(); });
    }

    refresh(): void {
        this.recipesTab?.setSelected(this.page === 'recipes');
        this.guestsTab?.setSelected(this.page === 'guests');
        this.notebookTab?.setSelected(this.page === 'notebook');
        if (this.grid) this.grid.active = this.page === 'recipes';
        if (this.guestGrid) this.guestGrid.active = this.page === 'guests';
        if (this.notebookGrid) this.notebookGrid.active = this.page === 'notebook';
        if (this.page === 'guests') { this.refreshGuests(); return; }
        if (this.page === 'notebook') { this.refreshNotebook(); return; }
        setText(this.title, '小店粥谱');
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const p = ctx.flow.progress;
        const day = p?.day ?? 1;
        const lit = new Set(p?.state.codex.recipes ?? []);
        const fresh = cfg.recipes.filter(r => r.unlockDay === day).map(r => r.name);
        const open = cfg.recipes.filter(r => r.unlockDay <= day).length;
        setText(this.intro, `第 ${day} 日，开放 ${open} 道粥。${fresh.length ? `今天新添${fresh.join('、')}。` : '熬到「刚好」的粥会在粥谱里点亮。'}`);
        const tiles = syncList(this.grid, this.tilePrefab, cfg.recipes.length, RecipeTile);
        const run = p?.chapter(day) ?? null;
        cfg.recipes.forEach((r, i) => {
            // 时令粥：不在季又没收进粥谱时灰着，写哪个节气开放（文档 30 §2.2）
            const kept = !!p?.kept.includes(r.id);
            const seasonal = !!r.season;
            const offSeason = seasonal && !kept && run?.cfg.season !== r.season;
            const locked = r.unlockDay > day || offSeason;
            const when = seasonal ? cfg.chapters.find(c => c.season === r.season)?.name ?? '' : '';
            const adds = r.adds.map(a => cfg.ingredient.get(a.id)?.name ?? a.id);
            const detail = offSeason ? `${when}时开放\n两目标做到即收进粥谱` : locked ? `第 ${r.unlockDay} 日开放`
                : `${SEASON_WORD[r.seasoning]} · ${HEAT_WORD[r.heatHint]}${adds.length ? `\n加${adds.join('、')}` : '\n米香清淡'}`;
            const garnish = r.adds.map(a => hexColor(INGREDIENT_TINT[a.id] ?? '#7FA36A'));
            // 熟练：档位 + 离下一档还差多少（入门 3/8、顺手 12/20、拿手）
            const sk = skillInfo(cfg, p?.state.proficiency[r.id] ?? 0);
            const mark = locked ? (seasonal ? '时令' : '') : `${lit.has(r.id) ? '★ ' : ''}${seasonal ? (kept ? '常年 · ' : '时令 · ') : ''}${sk.name}${sk.next !== null ? ` ${sk.points}/${sk.next}` : ''}`;
            tiles[i].render(r.name, detail, locked ? '' : `${r.price} 铜钱`, hexColor(r.color), garnish, locked, mark, r.unlockDay === day);
        });
        setText(this.foot, '★ 熬到过刚好。刚好出餐越多越熟练：顺手后搅拌提醒早一点，拿手后加料时机更宽松。');
    }

    /** 小店手账（文档 30 §4）：上面一行本章进度，下面 27 页里程碑。 */
    private refreshNotebook(): void {
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const p = ctx.flow.progress;
        if (!p) return;
        const done = new Set(p.state.milestones ?? []);
        const facts = p.milestoneFacts();
        setText(this.title, '小店手账');
        const chapter = chapterLine(cfg, p);
        const req = p.state.request;
        setText(this.intro, `记了 ${done.size} / ${cfg.milestones.length} 页。${chapter || '第 8 日起每七天一个节气，每章一道时令粥。'}${req ? `　请托：${requestText(cfg, req)}（第 ${req.day} 日）` : ''}`);
        const tiles = syncList(this.notebookGrid, this.milestoneTilePrefab, cfg.milestones.length, MilestoneTile);
        cfg.milestones.forEach((m, i) => {
            const v = milestoneValue(m.condition.type, facts);
            const ok = done.has(m.id);
            tiles[i].render(m.name, ok ? `${m.desc} · +${m.reward}` : `${m.desc}　${Math.min(v, m.condition.min)}/${m.condition.min}`, ok);
        });
        setText(this.foot, '每记一页，打烊时给一点铜钱。');
    }

    /** 街坊图鉴：见过的客人、口味、好感（只有记好感的常客才有）、短篇听了没有。 */
    private refreshGuests(): void {
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const p = ctx.flow.progress;
        const seen = new Set(p?.state.codex.customers ?? []);
        const heard = new Set(p?.state.codex.stories ?? []);
        setText(this.title, '街坊们');
        setText(this.intro, `见过 ${seen.size} / ${cfg.customers.length} 位客人。常客的好感攒够了，打烊后会讲自己的故事。`);
        const tiles = syncList(this.guestGrid, this.guestTilePrefab, cfg.customers.length, GuestTile);
        cfg.customers.forEach((c, i) => {
            const met = seen.has(c.id);
            const tastes = c.acceptedTags.length ? `爱吃${c.acceptedTags.join('、')}` : '什么都吃一点';
            const stories = cfg.stories.filter(s => s.customerId === c.id);
            const story = !met ? (c.unlockFavor ? '跟街坊熟了才会来' : `第 ${c.unlockDay} 日起会来`)
                : stories.length ? (stories.every(s => heard.has(s.id)) ? '故事听过了' : '还有故事没讲') : CUSTOMER_LINE[c.id] ?? '';
            tiles[i].render(met, c.name, CUSTOMER_LOOK[c.id] ?? CUSTOMER_LOOK.C01, met ? tastes : '',
                c.tracksFavor ? (p?.state.favor[c.id] ?? 0) : null, cfg.balance.favor.max, story);
        });
        setText(this.foot, '好感来自刚好又合口味的粥；铺子越暖，每碗多攒一点。');
    }
}
