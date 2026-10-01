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
        setText(this.endless, '第 8 日起是自由经营：客流随铺面变大，规则不变。粥谱、常客和装修都接着攒。');
    }
}
