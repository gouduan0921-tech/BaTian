import { _decorator, Color, Component, Label } from 'cc';
import { UiBar } from './UiBar';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

const UP = new Color(0x32, 0x6b, 0x5b, 255);
const GAIN = new Color(0x7e, 0x6b, 0x4d, 255);
const LOSS = new Color(0x97, 0x4b, 0x32, 255);
const BAR = new Color(0xc5, 0x96, 0x51, 255);
const BAR_TOP = new Color(0x5f, 0x8f, 0x6a, 255);

/**
 * 打烊页「粥谱熟练」的一行（预制体 ui/parts/SkillRow，文档 10 §7）：
 * 粥名、档位（入门 / 顺手 / 拿手）、档内进度条、今天的变化；升档时整行写成「练到顺手了」。
 */
@ccclass('SkillRow')
export class SkillRow extends Component {
    @property(Label) title: Label | null = null;
    @property(Label) tier: Label | null = null;
    @property(Label) delta: Label | null = null;
    @property(UiBar) bar: UiBar | null = null;

    render(name: string, tier: string, progress: number, delta: number, tierUp: boolean, top: boolean): void {
        setText(this.title, name);
        setText(this.tier, tierUp ? `练到${tier}了` : tier);
        if (this.tier) this.tier.color = tierUp ? UP : GAIN;
        setText(this.delta, delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0');
        if (this.delta) this.delta.color = delta < 0 ? LOSS : tierUp ? UP : GAIN;
        this.bar?.set(progress, top ? BAR_TOP : BAR);
    }
}
