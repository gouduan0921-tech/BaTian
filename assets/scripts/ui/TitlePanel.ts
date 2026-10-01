import { _decorator, Component, Label } from 'cc';
import { GameContext } from '../view/GameContext';
import { UiButton } from './UiButton';
import { setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 标题界面（预制体 ui/TitlePanel）。 */
@ccclass('TitlePanel')
export class TitlePanel extends Component {
    @property(Label) subtitle: Label | null = null;
    @property(Label) warning: Label | null = null;
    @property(UiButton) continueButton: UiButton | null = null;
    @property(UiButton) newButton: UiButton | null = null;
    @property(UiButton) practiceButton: UiButton | null = null;
    @property(UiButton) settingsButton: UiButton | null = null;

    private ctx: GameContext | null = null;
    private confirmNew = false;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.continueButton?.bind(() => ctx.flow.continueGame());
        this.newButton?.bind(() => this.onNew());
        this.practiceButton?.bind(() => ctx.open('practice'));
        this.settingsButton?.bind(() => ctx.open('settings'));
    }

    private onNew(): void {
        const ctx = this.ctx!;
        if (ctx.flow.hasSave && !this.confirmNew) {
            this.confirmNew = true;
            this.newButton?.setText('确认覆盖旧档？');
            return;
        }
        this.confirmNew = false;
        ctx.flow.newGame();
    }

    refresh(): void {
        const flow = this.ctx!.flow;
        const p = flow.progress;
        this.confirmNew = false;
        this.newButton?.setText(flow.hasSave ? '新的铺子' : '开张');
        setActive(this.continueButton?.node, flow.hasSave);
        if (p) this.continueButton?.setText('继续', `第 ${p.day} 日 · 铜钱 ${p.state.wallet}`);
        this.practiceButton?.setEnabled(!!p && p.state.codex.recipes.length > 0);
        setText(this.subtitle, '亲手熬粥，经营一间街边小铺');
        setText(this.warning, flow.loadWarning);
    }
}
