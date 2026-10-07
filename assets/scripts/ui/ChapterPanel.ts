import { chapterGoalText } from '../rules/Chapters';
import { _decorator, Color, Component, Label, Node, Prefab } from 'cc';
import { GameContext } from '../view/GameContext';
import { ListRow } from './ListRow';
import { UiButton } from './UiButton';
import { UiIcon } from './UiIcon';
import { bigNum, setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

const ON = new Color(0xd4, 0xaa, 0x5b, 255);
const OFF = new Color(0xd9, 0xcb, 0xae, 255);

/**
 * 七日章节收束（预制体 ui/ChapterPanel，文档 02、11）。第 7 日打烊后出现一次：
 * 七天的流水、第 7 日食评有没有吃到刚好的招牌粥、粥谱与短篇进度，然后告诉玩家第 8 日起是自由经营。
 */
@ccclass('ChapterPanel')
export class ChapterPanel extends Component {
    @property(Label) eyebrow: Label | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) intro: Label | null = null;
    @property(Node) dayList: Node | null = null;
    @property(Prefab) rowPrefab: Prefab | null = null;
    @property(UiIcon) seal: UiIcon | null = null;
    @property(Label) signature: Label | null = null;
    @property(Label) stats: Label | null = null;
    @property(Label) endless: Label | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.closeButton?.bind(() => ctx.close('chapter'));
    }

    refresh(): void {
        const ctx = this.ctx!;
        const ch = ctx.flow.dayReport?.chapter;
        if (!ch) { ctx.close('chapter'); return; }
        if (ch.season) { this.renderSeason(); return; }
        setText(this.eyebrow, '第 一 章 · 七 日 开 张');
        const sig = ch.signature;
        setText(this.title, sig === 'perfect' ? '一碗招牌，立住了铺子' : sig === 'served' ? '招牌端上了桌' : '七天，小铺开起来了');
        setText(this.intro, `七天卖出 ${ch.totalServed} 碗，营收 ${ch.totalRevenue}，小费 ${ch.totalTips}。`);
        const rows = syncList(this.dayList, this.rowPrefab, ch.days.length, ListRow);
        ch.days.forEach((d, i) => {
            const best = d.best ? `${ctx.config.recipe.get(d.best.recipeId)?.name ?? ''} ${d.best.score}` : '—';
            rows[i].fill(`第${bigNum(d.day)}日 · 卖出 ${d.served} 碗 · 最好 ${best}`, '', `+ ${d.revenue + d.tips}`).actions(null, null);
        });
        this.seal?.setColor(sig === 'perfect' ? ON : OFF, sig === 'perfect' ? ON : new Color(0, 0, 0, 0));
        setText(this.signature, sig === 'perfect' ? '食评吃到了刚好的招牌粥。'
            : sig === 'served' ? '食评吃到了招牌粥，火候差一点。明天还能再熬。'
                : ch.criticRejected ? '食评嫌铺子冷清，没坐下。添几件陈设、点上灯，把氛围提到 40 以上再请他来。'
                    : ch.criticCame ? '食评来过，没等到招牌粥。糊了也不锁篇章，明天再熬。' : '这回没等到食评。招牌粥留在菜单里，随时可以熬。');
        setText(this.stats, `粥谱点亮 ${ch.recipesLit} / ${ctx.config.recipes.length}    听过的故事 ${ch.storiesHeard} / ${ctx.config.stories.length}`);
        setText(this.endless, '第 8 日起每七天一个节气：每章一道时令粥和两个目标，做到了时令粥就收进粥谱。');
    }

    /** 四时章节的章末回顾（文档 30 §2.3）。 */
    private renderSeason(): void {
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const ch = ctx.flow.dayReport!.chapter!;
        const se = ch.season!;
        const rname = (id: string) => cfg.recipe.get(id)?.name ?? id;
        const all = se.goals.every(g => g.done);
        setText(this.eyebrow, `第 ${se.number} 章 · 四 时`);
        setText(this.title, se.kept ? `${se.name}：${rname(se.recipeId)}收进粥谱` : all ? `${se.name}，又熬好了一季` : `${se.name}过去了`);
        setText(this.intro, `这一章卖出 ${ch.totalServed} 碗，营收 ${ch.totalRevenue}，小费 ${ch.totalTips}。章节奖励 +${se.reward}。`);
        const rows = syncList(this.dayList, this.rowPrefab, ch.days.length, ListRow);
        ch.days.forEach((d, i) => {
            const best = d.best ? `${rname(d.best.recipeId)} ${d.best.score}` : '—';
            rows[i].fill(`第${bigNum(d.day)}日 · 卖出 ${d.served} 碗 · 最好 ${best}`, '', `+ ${d.revenue + d.tips}`).actions(null, null);
        });
        this.seal?.setColor(all ? ON : OFF, all ? ON : new Color(0, 0, 0, 0));
        setText(this.signature, se.goals.map(g => `${g.done ? '✓' : '✗'} ${chapterGoalText(g.goal, rname)}（${Math.min(g.value, g.goal.count)}/${g.goal.count}）`).join('\n'));
        const r = cfg.recipe.get(se.recipeId);
        const ing = r?.ingredients.map(i => cfg.ingredient.get(i.id)).find(i => i?.season)?.name ?? '';
        setText(this.stats, se.kept ? `${rname(se.recipeId)}从此常年开放，${ing}也常年能买。`
            : se.alreadyKept ? '这道时令粥早已收进粥谱。'
                : '两个目标没有都做到。明年这个节气还能再争取。');
        setText(this.endless, se.next ? `下一章：${se.next.name} · 时令粥「${rname(se.next.recipeId)}」` : '');
    }
}
