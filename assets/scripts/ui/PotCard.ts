import { _decorator, Component, Label } from 'cc';
import { PotState } from '../rules/Pot';
import { UiBar } from './UiBar';
import { UiButton } from './UiButton';
import { hexColor, PALETTE, setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 顶部锅位卡片（预制体 ui/parts/PotCard）：一眼看出哪口锅在飘。点击切焦点。 */
@ccclass('PotCard')
export class PotCard extends Component {
    @property(UiButton) button: UiButton | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) status: Label | null = null;
    @property(Label) alert: Label | null = null;
    @property(UiBar) doneness: UiBar | null = null;

    render(index: number, pot: PotState, recipeName: string, phaseWord: string, color: string | null,
        focus: boolean, alert: string, onClick: () => void): void {
        this.button?.bind(onClick).setSelected(focus);
        setText(this.title, `${index + 1} 号锅${recipeName ? ` · ${recipeName}` : ''}`);
        setText(this.status, phaseWord);
        setText(this.alert, alert);
        if (this.alert) this.alert.color = alert.includes('糊') ? PALETTE.burnt : PALETTE.warn;
        const fillColor = pot.phase === 'burnt' ? PALETTE.burnt : pot.phase === 'window' ? PALETTE.good : color ? hexColor(color) : PALETTE.mute;
        this.doneness?.set(pot.phase === 'empty' || pot.phase === 'washing' ? 0 : pot.doneness / 1.0, fillColor);
    }
}
