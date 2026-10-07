import { _decorator, Color, Component, Label, Node, UIOpacity, UITransform } from 'cc';
import { RoundRect } from './RoundRect';
import { UiBar } from './UiBar';
import { setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

const TONE: Record<string, Color> = {
    order: new Color(0x2f, 0x4a, 0x45, 255),
    good: new Color(0x32, 0x6b, 0x5b, 255),
    warn: new Color(0xa0, 0x74, 0x30, 255),
    bad: new Color(0x97, 0x4b, 0x32, 255),
};
const CALM = new Color(0x5f, 0x8f, 0x6a, 255);
const HURRY = new Color(0xc2, 0x8a, 0x3c, 255);
const LATE = new Color(0xa8, 0x4f, 0x36, 255);

/**
 * 客人头顶的小气泡（预制体 ui/parts/GuestBubble）：
 * - 点了粥、还在等：写粥名，下面一条耐心条，由绿转铜转砖红；
 * - 送达、离开时：换成一句反应（「好吃！」「等不及了……」），稍微弹一下。
 * 位置由 HudView 每帧按客人头顶的世界坐标换算。
 */
@ccclass('GuestBubble')
export class GuestBubble extends Component {
    @property(RoundRect) plate: RoundRect | null = null;
    @property(Label) text: Label | null = null;
    @property(UiBar) patience: UiBar | null = null;
    @property(Node) tail: Node | null = null;

    private key = '';
    private popT = 1;

    /** patience 为 null 表示反应气泡（不画耐心条）。 */
    render(key: string, text: string, tone: 'order' | 'good' | 'warn' | 'bad', patience: number | null, reduceMotion: boolean): void {
        if (key !== this.key) { this.key = key; this.popT = reduceMotion ? 1 : 0; }
        setText(this.text, text);
        if (this.text) this.text.color = TONE[tone];
        const hasBar = patience !== null;
        setActive(this.patience?.node, hasBar);
        if (hasBar) {
            const p = Math.max(0, Math.min(1, patience!));
            this.patience!.set(p, p > 0.5 ? CALM : p > 0.25 ? HURRY : LATE);
        }
        const w = Math.max(76, Math.min(170, 28 + (this.text?.string.length ?? 2) * 17));
        const t = this.plate?.getComponent(UITransform);
        if (t && Math.abs(t.width - w) > 1) { t.width = w; this.plate!.draw(); }
        const bar = this.patience?.getComponent(UITransform);
        if (bar && Math.abs(bar.width - (w - 24)) > 1) bar.width = w - 24;
        if (this.text) this.text.node.setPosition(0, hasBar ? 6 : 0, 0);
        this.plate?.setStroke(TONE[tone], tone === 'order' ? 1 : 2);
    }

    update(dt: number): void {
        if (this.popT >= 1) return;
        this.popT = Math.min(1, this.popT + dt / 0.22);
        const k = this.popT;
        const s = k < 0.6 ? 0.6 + 0.6 * (k / 0.6) : 1.2 - 0.2 * ((k - 0.6) / 0.4);
        this.node.setScale(s, s, 1);
        const op = this.getComponent(UIOpacity);
        if (op) op.opacity = Math.round(255 * Math.min(1, k * 2));
    }
}
