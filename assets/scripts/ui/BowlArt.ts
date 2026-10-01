import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 一只瓷碗（粥谱、出餐台用，设计稿 .food-bowl）：碗身、碗口、粥面颜色和几点配料。
 * 用 Graphics 画；粥面颜色取粥谱表里的 color。
 */
@ccclass('BowlArt')
@requireComponent(Graphics)
@executeInEditMode
export class BowlArt extends Component {
    @property(Color) soup: Color = new Color(0xf4, 0xe1, 0xb7, 255);
    @property([Color]) garnish: Color[] = [];
    @property locked = false;
    @property empty = false;

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.draw, this);
        this.draw();
    }

    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.draw, this);
    }

    set(soup: Color, garnish: Color[], locked = false, empty = false): void {
        this.soup = soup.clone();
        this.garnish = garnish.map(c => c.clone());
        this.locked = locked;
        this.empty = empty;
        this.draw();
    }

    draw(): void {
        const g = this.getComponent(Graphics);
        const t = this.getComponent(UITransform);
        if (!g || !t) return;
        g.clear();
        const w = t.width;
        const h = t.height;
        const cx = w * (0.5 - t.anchorX);
        const cy = h * (0.5 - t.anchorY);
        const rw = w * 0.48;
        const rimY = cy + h * 0.16;
        const rh = h * 0.2;
        const fade = (c: Color) => (this.locked ? new Color(0xbb, 0xb0, 0x9a, 255) : c);
        // 影子
        g.fillColor = new Color(0x70, 0x5a, 0x43, 50);
        g.ellipse(cx, cy - h * 0.42, rw * 0.7, h * 0.08); g.fill();
        // 碗身
        g.fillColor = this.locked ? new Color(0xd8, 0xd0, 0xbc, 255) : new Color(0xf3, 0xe8, 0xcf, 255);
        g.moveTo(cx - rw, rimY);
        g.bezierCurveTo(cx - rw, cy - h * 0.38, cx + rw, cy - h * 0.38, cx + rw, rimY);
        g.close(); g.fill();
        g.fillColor = new Color(0xca, 0xbb, 0x96, this.locked ? 60 : 110);
        g.moveTo(cx + rw * 0.2, rimY);
        g.bezierCurveTo(cx + rw * 0.5, cy - h * 0.3, cx + rw, cy - h * 0.1, cx + rw, rimY);
        g.close(); g.fill();
        // 碗口
        g.fillColor = new Color(0xef, 0xe7, 0xd2, 255);
        g.ellipse(cx, rimY, rw, rh); g.fill();
        if (this.empty) {
            g.fillColor = new Color(0xd9, 0xcc, 0xae, 255);
            g.ellipse(cx, rimY, rw * 0.86, rh * 0.72); g.fill();
            return;
        }
        g.fillColor = fade(this.soup);
        g.ellipse(cx, rimY, rw * 0.86, rh * 0.72); g.fill();
        if (this.locked) return;
        const spots = [[-0.35, 0.05], [0.2, -0.25], [0.4, 0.2], [-0.05, 0.3], [-0.15, -0.3]];
        this.garnish.forEach((c, i) => {
            const [sx, sy] = spots[i % spots.length];
            g.fillColor = c;
            g.ellipse(cx + sx * rw, rimY + sy * rh, rw * 0.12, rh * 0.16); g.fill();
        });
    }
}
