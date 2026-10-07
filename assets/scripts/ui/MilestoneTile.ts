import { _decorator, Color, Component, Label, Node } from 'cc';
import { RoundRect } from './RoundRect';
import { setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

const DONE_FILL = new Color(0xf4, 0xe8, 0xcd, 255);
const TODO_FILL = new Color(0xe8, 0xdc, 0xc2, 255);
const DONE_STROKE = new Color(0xb5, 0x4a, 0x35, 255);
const TODO_STROKE = new Color(0xcd, 0xbb, 0x97, 255);

/** 小店手账的一页（预制体 ui/parts/MilestoneTile，文档 30 §4）：名称、条件与进度，记下的盖一枚红章。 */
@ccclass('MilestoneTile')
export class MilestoneTile extends Component {
    @property(RoundRect) card: RoundRect | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) line: Label | null = null;
    @property(Node) stamp: Node | null = null;

    render(name: string, line: string, done: boolean): void {
        setText(this.title, name);
        setText(this.line, line);
        this.card?.setColor(done ? DONE_FILL : TODO_FILL);
        this.card?.setStroke(done ? DONE_STROKE : TODO_STROKE, done ? 2 : 1);
        setActive(this.stamp, done);
    }
}
