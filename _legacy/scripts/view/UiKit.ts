import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';

const { ccclass, executeInEditMode, property } = _decorator;

const EDGE = new Color(193, 146, 84, 205);
const INNER_EDGE = new Color(240, 210, 153, 40);
const PANEL = new Color(35, 29, 26, 250);
const PANEL_INSET = new Color(47, 39, 33, 225);
const BUTTONS = [
    new Color(132, 82, 46, 248),
    new Color(46, 91, 82, 248),
    new Color(65, 57, 49, 242),
    new Color(168, 105, 47, 250),
];

/** 所有预制体共用的店铺木牌、纸页和按钮画法。 */
export function paintSurface(node: Node, kind: number, alpha = 252, palette = 0): void {
    const transform = node.getComponent(UITransform);
    if (!transform) return;
    const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
    const width = transform.width;
    const height = transform.height;
    if (!width || !height) return;
    const x = -width / 2;
    const y = -height / 2;
    graphics.clear();

    if (kind) {
        const ink = BUTTONS[palette] || BUTTONS[0];
        graphics.fillColor = new Color(12, 10, 9, Math.min(alpha, 170));
        graphics.roundRect(x, y - 3, width, height, 10);
        graphics.fill();
        graphics.fillColor = new Color(ink.r, ink.g, ink.b, Math.min(alpha, ink.a));
        graphics.roundRect(x, y, width, height, 10);
        graphics.fill();
        graphics.fillColor = new Color(255, 224, 173, 42);
        graphics.roundRect(x + 4, y + height - 8, width - 8, 3, 2);
        graphics.fill();
        graphics.lineWidth = 1.5;
        graphics.strokeColor = new Color(236, 194, 130, palette === 2 ? 82 : 145);
        graphics.roundRect(x + 0.75, y + 0.75, width - 1.5, height - 1.5, 10);
        graphics.stroke();
        return;
    }

    if (width < 120 && height < 55) {
        graphics.fillColor = new Color(27, 29, 27, alpha);
        graphics.roundRect(x, y, width, height, 11);
        graphics.fill();
        graphics.lineWidth = 1;
        graphics.strokeColor = new Color(205, 171, 113, 95);
        graphics.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, 11);
        graphics.stroke();
        return;
    }

    graphics.fillColor = new Color(12, 10, 9, Math.min(alpha, 160));
    graphics.roundRect(x + 3, y - 5, width, height, 18);
    graphics.fill();
    graphics.fillColor = new Color(PANEL.r, PANEL.g, PANEL.b, alpha);
    graphics.roundRect(x, y, width, height, 18);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = EDGE;
    graphics.roundRect(x + 1, y + 1, width - 2, height - 2, 17);
    graphics.stroke();
    graphics.lineWidth = 1;
    graphics.strokeColor = INNER_EDGE;
    graphics.roundRect(x + 9, y + 9, width - 18, height - 18, 12);
    graphics.stroke();

    const isPage = node.name.endsWith('Panel') || node.name === 'UpgradeShop';
    if (isPage && height >= 350) {
        graphics.fillColor = PANEL_INSET;
        graphics.roundRect(x + 12, y + height - 79, width - 24, 65, 10);
        graphics.fill();
        graphics.fillColor = new Color(210, 157, 87, 192);
        graphics.roundRect(x + 33, y + height - 82, width - 66, 2, 1);
        graphics.fill();
        graphics.fillColor = new Color(226, 174, 95, 220);
        graphics.roundRect(x + 24, y + height - 58, 4, 24, 2);
        graphics.fill();
        graphics.roundRect(x + width - 28, y + height - 58, 4, 24, 2);
        graphics.fill();
    }
}

@ccclass('UiSurface')
@executeInEditMode(true)
export class UiSurface extends Component {
    @property kind = 0;
    @property alpha = 252;
    @property palette = 0;

    onEnable(): void {
        paintSurface(this.node, this.kind, this.alpha, this.palette);
    }
}
