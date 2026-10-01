import { _decorator, Color, Component, Label, Node, UITransform } from 'cc';
import { RoundRect } from './RoundRect';
import { setText, setTint } from './UiKit';

const { ccclass, property } = _decorator;

/**
 * 进度条（熟度、耐心、动作）。track 是底，fill 是左对齐的填充块；
 * window 是「刚刚好」的绿色区间（设计稿 .ready-window），marker 是当前熟度的小白条。
 */
@ccclass('UiBar')
export class UiBar extends Component {
    @property(Node) fill: Node | null = null;
    @property(RoundRect) fillRect: RoundRect | null = null;
    @property(Node) bandLow: Node | null = null;
    @property(Node) bandHigh: Node | null = null;
    @property(Node) window: Node | null = null;
    @property(Node) marker: Node | null = null;
    @property(Label) caption: Label | null = null;

    private get width(): number { return this.node.getComponent(UITransform)?.width ?? 100; }

    set(value: number, color?: Color, caption?: string): void {
        const v = Math.max(0, Math.min(1, value));
        const t = this.fill?.getComponent(UITransform);
        if (t) {
            const w = Math.max(0.001, this.width * v);
            if (Math.abs(t.width - w) > 0.2) t.width = w;
            if (this.fill) this.fill.active = v > 0.002;
        }
        if (color) setTint(this.fillRect, color);
        if (caption !== undefined) setText(this.caption, caption);
    }

    /** 标出 [lo, hi] 区间（如出餐窗口 0.72–0.88，按 0–1 比例）。 */
    band(lo: number, hi: number): void {
        const w = this.width;
        if (this.bandLow) this.bandLow.setPosition(w * lo - w / 2, this.bandLow.position.y);
        if (this.bandHigh) this.bandHigh.setPosition(w * hi - w / 2, this.bandHigh.position.y);
        if (this.window) {
            this.window.setPosition(w * lo - w / 2, this.window.position.y);
            const t = this.window.getComponent(UITransform);
            if (t && Math.abs(t.width - w * (hi - lo)) > 0.2) t.width = w * (hi - lo);
        }
    }

    mark(value: number | null): void {
        if (!this.marker) return;
        this.marker.active = value !== null;
        if (value !== null) this.marker.setPosition(this.width * Math.max(0, Math.min(1, value)) - this.width / 2, this.marker.position.y);
    }
}
