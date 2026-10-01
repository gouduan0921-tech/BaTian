import { _decorator, Component, Label, Node, Prefab } from 'cc';
import { GameContext } from '../view/GameContext';
import { ListRow } from './ListRow';
import { UiButton } from './UiButton';
import { setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

/** 练习选粥（预制体 ui/PracticePanel，文档 10 §4）：图鉴里点亮过的粥，单锅无客人，只能练到「顺手」。 */
@ccclass('PracticePanel')
export class PracticePanel extends Component {
    @property(Label) header: Label | null = null;
    @property(Node) list: Node | null = null;
    @property(Prefab) rowPrefab: Prefab | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.closeButton?.bind(() => ctx.close('practice'));
    }

    refresh(): void {
        const ctx = this.ctx!;
        const p = ctx.flow.progress;
        if (!p) return;
        const cap = ctx.config.balance.skill.practiceCap;
        setText(this.header, `练习 · 不耗食材、不得铜钱，熟练最多练到 ${cap}（顺手）`);
        const ids = p.state.codex.recipes;
        const rows = syncList(this.list, this.rowPrefab, ids.length, ListRow);
        ids.forEach((id, i) => {
            const r = ctx.config.recipe.get(id)!;
            const pts = p.state.proficiency[id] ?? 0;
            rows[i].fill(r.name, `熬 ${r.cookSeconds} 秒 · ${r.adds.length} 次加料`, `熟练 ${pts}`)
                .actions({ text: '练这道', fn: () => { ctx.close('practice'); ctx.flow.startPractice(id); } }, null);
        });
    }
}
