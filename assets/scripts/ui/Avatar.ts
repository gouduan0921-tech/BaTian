import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 订单上的街坊小头像（设计稿 .avatar）：圆底、身子、脸、头发，可选眼镜/帽子。
 * 全部用 Graphics 画，颜色按客人类型由 OrderRow 设置。
 */
@ccclass('Avatar')
@requireComponent(Graphics)
@executeInEditMode
export class Avatar extends Component {
    @property(Color) back: Color = new Color(0xaf, 0xc2, 0xae, 255);
    @property(Color) body: Color = new Color(0x6e, 0x80, 0x6b, 255);
    @property(Color) hair: Color = new Color(0x53, 0x46, 0x3a, 255);
    @property(Color) skin: Color = new Color(0xe4, 0xb9, 0x92, 255);
    @property glasses = false;
    @property cap = false;

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.draw, this);
        this.draw();
    }

    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.draw, this);
    }

    set(look: { back: Color; body: Color; hair: Color; glasses?: boolean; cap?: boolean }): void {
        this.back = look.back; this.body = look.body; this.hair = look.hair;
        this.glasses = !!look.glasses; this.cap = !!look.cap;
        this.draw();
    }

    draw(): void {
        const g = this.getComponent(Graphics);
        const t = this.getComponent(UITransform);
        if (!g || !t) return;
        g.clear();
        const d = Math.min(t.width, t.height);
        const r = d / 2;
        const cx = t.width * (0.5 - t.anchorX);
        const cy = t.height * (0.5 - t.anchorY);
        const u = d / 40;
        // 外圈
        g.fillColor = new Color(0xd9, 0xc6, 0xa4, 255);
        g.circle(cx, cy, r); g.fill();
        g.fillColor = this.back;
        g.circle(cx, cy, r - 2 * u); g.fill();
        // 身子（在圆内的一块半圆顶）
        g.fillColor = this.body;
        g.moveTo(cx - 12 * u, cy - 17 * u);
        g.lineTo(cx - 12 * u, cy - 9 * u);
        g.bezierCurveTo(cx - 12 * u, cy - 3 * u, cx + 12 * u, cy - 3 * u, cx + 12 * u, cy - 9 * u);
        g.lineTo(cx + 12 * u, cy - 17 * u);
        g.close(); g.fill();
        // 脸
        g.fillColor = this.skin;
        g.ellipse(cx, cy + 3 * u, 8 * u, 8.5 * u); g.fill();
        // 头发
        g.fillColor = this.hair;
        g.moveTo(cx - 9 * u, cy + 4 * u);
        g.bezierCurveTo(cx - 10 * u, cy + 15 * u, cx + 10 * u, cy + 15 * u, cx + 9 * u, cy + 4 * u);
        g.bezierCurveTo(cx + 4 * u, cy + 8 * u, cx - 4 * u, cy + 8 * u, cx - 9 * u, cy + 4 * u);
        g.close(); g.fill();
        if (this.cap) {
            g.fillColor = new Color(0x2f, 0x2b, 0x33, 255);
            g.roundRect(cx - 10 * u, cy + 8 * u, 20 * u, 4 * u, 2 * u); g.fill();
            g.roundRect(cx - 2 * u, cy + 7 * u, 14 * u, 2.4 * u, 1.2 * u); g.fill();
        }
        if (this.glasses) {
            g.strokeColor = new Color(0x6f, 0x67, 0x56, 255);
            g.lineWidth = Math.max(1, 1.2 * u);
            g.roundRect(cx - 7.5 * u, cy + 1 * u, 6 * u, 4 * u, 1 * u); g.stroke();
            g.roundRect(cx + 1.5 * u, cy + 1 * u, 6 * u, 4 * u, 1 * u); g.stroke();
        }
    }
}
