import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 圆角色块：界面底板、按钮、进度条共用（设计稿「炭火暖木，青瓷小铺」）。
 * 除了填色与描边，还可以画：
 *  - edge：底部实体厚边（按钮/瓷片的厚度，设计稿 3–6px）；
 *  - shadow：柔和外阴影（多层半透明叠出来）；
 *  - sheen：上半部分的一层亮釉，让面看起来「顶部略亮、底部略深」。
 * 编辑器里实时绘制，可以直接在预制体上调。
 */
@ccclass('RoundRect')
@requireComponent(Graphics)
@executeInEditMode
export class RoundRect extends Component {
    @property(Color) fill: Color = new Color(245, 236, 215, 255);
    @property radius = 10;
    @property(Color) stroke: Color = new Color(60, 53, 41, 255);
    @property strokeWidth = 0;
    /** 底边厚度（像素） */
    @property edge = 0;
    @property(Color) edgeColor: Color = new Color(180, 160, 132, 255);
    /** 外阴影向下的偏移，0 为不画 */
    @property shadow = 0;
    @property(Color) shadowColor: Color = new Color(7, 22, 24, 60);
    /** 顶部亮釉透明度 0–255，0 为不画 */
    @property sheen = 0;

    /** 按下时面板下沉的像素（由 UiButton 控制） */
    private sink = 0;

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.draw, this);
        this.node.on(Node.EventType.ANCHOR_CHANGED, this.draw, this);
        this.draw();
    }

    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.draw, this);
        this.node.off(Node.EventType.ANCHOR_CHANGED, this.draw, this);
    }

    setColor(c: Color): void {
        if (this.fill.equals(c)) return;
        this.fill = c.clone();
        this.draw();
    }

    setStroke(c: Color, width?: number): void {
        this.stroke = c.clone();
        if (width !== undefined) this.strokeWidth = width;
        this.draw();
    }

    setEdgeColor(c: Color): void {
        if (this.edgeColor.equals(c)) return;
        this.edgeColor = c.clone();
        this.draw();
    }

    setSink(px: number): void {
        if (this.sink === px) return;
        this.sink = px;
        this.draw();
    }

    draw(): void {
        const g = this.getComponent(Graphics);
        const t = this.getComponent(UITransform);
        if (!g || !t) return;
        const w = t.width;
        const h = t.height;
        g.clear();
        if (w <= 0 || h <= 0) return;
        const x = -w * t.anchorX;
        const y = -h * t.anchorY;
        const r = Math.max(0, Math.min(this.radius, w / 2, h / 2));
        const edge = Math.max(0, this.edge - this.sink);
        const top = y - this.sink;

        if (this.shadow > 0 && this.shadowColor.a > 0) {
            const layers = 4;
            for (let i = layers; i >= 1; i--) {
                const grow = i * 2.2;
                const c = this.shadowColor.clone();
                c.a = Math.round(this.shadowColor.a / layers);
                g.fillColor = c;
                g.roundRect(x - grow, y - this.edge - this.shadow - grow * 0.6, w + grow * 2, h + grow * 1.2, r + grow);
                g.fill();
            }
        }
        if (edge > 0) {
            g.fillColor = this.edgeColor;
            g.roundRect(x, top - edge, w, h, r);
            g.fill();
        }
        g.fillColor = this.fill;
        g.roundRect(x, top, w, h, r);
        g.fill();
        if (this.sheen > 0) {
            const c = new Color(255, 252, 240, this.sheen);
            g.fillColor = c;
            const sh = h * 0.5;
            g.roundRect(x + 1, top + h - sh - 1, w - 2, sh, Math.max(0, r - 1));
            g.fill();
        }
        if (this.strokeWidth > 0) {
            g.lineWidth = this.strokeWidth;
            g.strokeColor = this.stroke;
            g.roundRect(x, top, w, h, r);
            g.stroke();
        }
    }
}
