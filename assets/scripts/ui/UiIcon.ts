import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 线描图标（设计稿用的 24×24 简笔图标），用 Graphics 画，不需要贴图，断网也能显示。
 * 在预制体上选 icon 名称即可；脚本里可 setIcon / setColor。
 */
type Op = (string | number)[];
interface Shape { ops: Op[]; fill?: boolean; stroke?: boolean }

const S = (ops: Op[], fill = false, stroke = true): Shape => ({ ops, fill, stroke });

const ICONS: Record<string, Shape[]> = {
    bowl: [
        S([['M', 3, 11], ['L', 21, 11], ['C', 21, 16.5, 17, 20, 12, 20], ['C', 7, 20, 3, 16.5, 3, 11], ['Z']], true),
        S([['M', 9, 20.5], ['L', 15, 20.5]]),
        S([['M', 8.5, 3], ['C', 7.5, 4.5, 9.5, 5.5, 8.5, 7.5]]),
        S([['M', 12, 2.5], ['C', 11, 4, 13, 5, 12, 7.5]]),
        S([['M', 15.5, 3], ['C', 14.5, 4.5, 16.5, 5.5, 15.5, 7.5]]),
    ],
    shop: [
        S([['M', 3, 11], ['L', 12, 4], ['L', 21, 11]]),
        S([['M', 5, 9.5], ['L', 5, 20], ['L', 19, 20], ['L', 19, 9.5]]),
        S([['M', 10, 20], ['L', 10, 14.5], ['L', 14, 14.5], ['L', 14, 20]]),
    ],
    book: [
        S([['M', 3, 5], ['C', 6, 4, 9, 4.2, 12, 6], ['L', 12, 20], ['C', 9, 18.2, 6, 18, 3, 19], ['Z']], true),
        S([['M', 21, 5], ['C', 18, 4, 15, 4.2, 12, 6], ['L', 12, 20], ['C', 15, 18.2, 18, 18, 21, 19], ['Z']], true),
    ],
    lamp: [
        S([['M', 9, 3], ['L', 15, 3]]),
        S([['M', 12, 3], ['L', 12, 5]]),
        S([['M', 8, 5], ['L', 16, 5], ['L', 18, 15], ['L', 6, 15], ['Z']], true),
        S([['M', 12, 15], ['L', 12, 19]]),
        S([['M', 10, 19.5], ['L', 14, 19.5]]),
    ],
    menu: [
        S([['M', 5, 7], ['L', 19, 7]]), S([['M', 5, 12], ['L', 19, 12]]), S([['M', 5, 17], ['L', 19, 17]]),
    ],
    leaf: [
        S([['M', 5, 19], ['C', 5, 10, 11, 5, 20, 4], ['C', 19.5, 13, 15, 19, 5, 19], ['Z']], true),
        S([['M', 5, 19], ['L', 13, 11]]),
    ],
    spoon: [
        S([['O', 16, 8, 4]], true),
        S([['M', 13, 11], ['L', 5, 19]]),
    ],
    moon: [
        S([['M', 15, 4], ['C', 9, 4, 5, 8, 5, 13], ['C', 5, 18, 9, 21, 14, 21], ['C', 17, 21, 19, 20, 20, 18],
            ['C', 15, 18, 11, 15, 11, 10], ['C', 11, 7, 13, 5, 15, 4], ['Z']], true),
    ],
    sun: [
        S([['O', 12, 12, 4]], true),
        S([['M', 12, 2.5], ['L', 12, 4.5]]), S([['M', 12, 19.5], ['L', 12, 21.5]]),
        S([['M', 2.5, 12], ['L', 4.5, 12]]), S([['M', 19.5, 12], ['L', 21.5, 12]]),
        S([['M', 5.3, 5.3], ['L', 6.7, 6.7]]), S([['M', 17.3, 17.3], ['L', 18.7, 18.7]]),
        S([['M', 5.3, 18.7], ['L', 6.7, 17.3]]), S([['M', 17.3, 6.7], ['L', 18.7, 5.3]]),
    ],
    coin: [
        S([['O', 12, 12, 9]], true),
        S([['R', 9.5, 9.5, 5, 5, 0.5]]),
    ],
    flame: [
        S([['M', 12, 3], ['C', 15, 7, 18, 10, 18, 14], ['C', 18, 18, 15, 21, 12, 21], ['C', 9, 21, 6, 18, 6, 14],
            ['C', 6, 11, 8, 9, 9, 7], ['C', 10, 9, 11, 10, 12, 10], ['C', 12, 7, 12, 5, 12, 3], ['Z']], true),
    ],
    back: [S([['M', 19, 12], ['L', 5, 12]]), S([['M', 11, 6], ['L', 5, 12], ['L', 11, 18]])],
    close: [S([['M', 6, 6], ['L', 18, 18]]), S([['M', 18, 6], ['L', 6, 18]])],
    image: [
        S([['R', 3, 5, 18, 14, 2]]),
        S([['O', 9, 10, 1.6]], true),
        S([['M', 21, 16], ['L', 15, 11], ['L', 5, 19]]),
    ],
    heart: [
        S([['M', 12, 20], ['C', 5, 15, 3, 12, 3, 8.5], ['C', 3, 6, 5, 4, 7.5, 4], ['C', 9.5, 4, 11, 5, 12, 7],
            ['C', 13, 5, 14.5, 4, 16.5, 4], ['C', 19, 4, 21, 6, 21, 8.5], ['C', 21, 12, 19, 15, 12, 20], ['Z']], true),
    ],
    star: [
        S([['M', 12, 2.5], ['L', 14.8, 8.6], ['L', 21.5, 9.3], ['L', 16.5, 13.8], ['L', 17.9, 20.4], ['L', 12, 17],
            ['L', 6.1, 20.4], ['L', 7.5, 13.8], ['L', 2.5, 9.3], ['L', 9.2, 8.6], ['Z']], true),
    ],
    arrow: [S([['M', 7, 17], ['L', 17, 7]]), S([['M', 9, 7], ['L', 17, 7], ['L', 17, 15]])],
    plus: [S([['M', 12, 5], ['L', 12, 19]]), S([['M', 5, 12], ['L', 19, 12]])],
    check: [S([['M', 5, 12.5], ['L', 10, 17], ['L', 19, 7]])],
    broom: [
        S([['M', 17, 3], ['L', 11, 12]]),
        S([['M', 7, 11], ['L', 14, 14], ['L', 11, 21], ['L', 4, 18], ['Z']], true),
    ],
    knife: [
        S([['M', 4, 20], ['L', 9, 15]]),
        S([['M', 9, 15], ['L', 19, 4], ['C', 21, 7, 19, 12, 12, 16], ['Z']], true),
    ],
    door: [
        S([['R', 6, 3, 12, 18, 1]], true),
        S([['O', 15, 12, 0.8]]),
    ],
    gear: [
        S([['O', 12, 12, 3]]),
        S([['O', 12, 12, 7.5]], true),
    ],
    pot: [
        S([['M', 4, 9], ['L', 20, 9], ['L', 19, 17], ['C', 18.5, 19, 17, 20, 15, 20], ['L', 9, 20], ['C', 7, 20, 5.5, 19, 5, 17], ['Z']], true),
        S([['M', 2, 10], ['L', 4, 10]]), S([['M', 20, 10], ['L', 22, 10]]),
        S([['M', 9, 6], ['C', 8, 5, 10, 4, 9, 3]]), S([['M', 14, 6], ['C', 13, 5, 15, 4, 14, 3]]),
    ],
};

export const ICON_NAMES = Object.keys(ICONS);

@ccclass('UiIcon')
@requireComponent(Graphics)
@executeInEditMode
export class UiIcon extends Component {
    @property icon = 'bowl';
    @property(Color) color: Color = new Color(105, 83, 56, 255);
    /** 闭合形状的填充色；alpha 为 0 时只描线 */
    @property(Color) fillColor: Color = new Color(0, 0, 0, 0);
    /** 线宽，按 24 格的视框计 */
    @property lineWidth = 1.6;

    onEnable(): void {
        this.node.on(Node.EventType.SIZE_CHANGED, this.draw, this);
        this.draw();
    }

    onDisable(): void {
        this.node.off(Node.EventType.SIZE_CHANGED, this.draw, this);
    }

    setIcon(name: string): this {
        if (this.icon !== name) { this.icon = name; this.draw(); }
        return this;
    }

    setColor(c: Color, fill?: Color): this {
        if (this.color.equals(c) && (!fill || this.fillColor.equals(fill))) return this;
        this.color = c.clone();
        if (fill) this.fillColor = fill.clone();
        this.draw();
        return this;
    }

    draw(): void {
        const g = this.getComponent(Graphics);
        const t = this.getComponent(UITransform);
        if (!g || !t) return;
        g.clear();
        const shapes = ICONS[this.icon];
        if (!shapes) return;
        const k = Math.min(t.width, t.height) / 24;
        const ox = -t.width * t.anchorX + (t.width - 24 * k) / 2;
        const oy = t.height * (1 - t.anchorY) - (t.height - 24 * k) / 2;
        const X = (u: number) => ox + u * k;
        const Y = (v: number) => oy - v * k;
        g.lineWidth = Math.max(1, this.lineWidth * k);
        g.lineCap = Graphics.LineCap.ROUND;
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.strokeColor = this.color;
        g.fillColor = this.fillColor;
        const doFill = this.fillColor.a > 0;
        for (const s of shapes) {
            for (const op of s.ops) {
                const n = op.slice(1) as number[];
                switch (op[0]) {
                    case 'M': g.moveTo(X(n[0]), Y(n[1])); break;
                    case 'L': g.lineTo(X(n[0]), Y(n[1])); break;
                    case 'C': g.bezierCurveTo(X(n[0]), Y(n[1]), X(n[2]), Y(n[3]), X(n[4]), Y(n[5])); break;
                    case 'Z': g.close(); break;
                    case 'O': g.circle(X(n[0]), Y(n[1]), n[2] * k); break;
                    case 'R': g.roundRect(X(n[0]), Y(n[1] + n[3]), n[2] * k, n[3] * k, n[4] * k); break;
                    default: break;
                }
            }
            if (s.fill && doFill) g.fill();
            if (s.stroke) g.stroke();
        }
    }
}
