import { _decorator, Color, Component, Label, Node, UITransform } from 'cc';
import { RoundRect } from './RoundRect';
import { UiButton } from './UiButton';
import { bigNum, setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

const GLOW = new Color(0xe7, 0xb8, 0x65, 255);
const CALM = new Color(0xff, 0xf6, 0xdc, 255);
const WARN = new Color(0x97, 0x4b, 0x32, 255);

/**
 * 锅上方的小木牌（预制体 ui/parts/PotPin，设计稿 .pot-pin）：锅号、粥名、当前提醒。
 * 位置由 HudView 每帧按锅的世界坐标换算；需要处理时轻轻亮起，不做持续跳动。
 */
@ccclass('PotPin')
export class PotPin extends Component {
    @property(UiButton) button: UiButton | null = null;
    @property(RoundRect) plate: RoundRect | null = null;
    @property(Label) number: Label | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) hint: Label | null = null;
    @property(Node) stem: Node | null = null;

    private glowT = 0;
    private needs = false;
    private urgent = false;

    render(index: number, title: string, hint: string, needs: boolean, urgent: boolean, focus: boolean, onClick: () => void, compact = false): void {
        this.button?.bind(onClick);
        // 锅多时，不需要处理的锅只留锅号和粥名，免得木牌挤在一起
        const t = this.plate?.getComponent(UITransform);
        if (t) {
            const w = compact ? 112 : 150;
            if (t.width !== w) t.width = w;
            const left = -w / 2 + 46;
            if (this.title) this.title.node.setPosition(left, compact ? 0 : 8);
            if (this.hint) this.hint.node.setPosition(left, -10);
            const ring = this.number?.node.parent;
            if (ring) ring.setPosition(-w / 2 + 24, 0);
            const arrow = this.plate!.node.getChildByName('Arrow');
            if (arrow) arrow.setPosition(w / 2 - 14, 0);
        }
        setActive(this.hint?.node, !compact);
        setText(this.number, bigNum(index + 1));
        setText(this.title, title);
        setText(this.hint, hint);
        if (this.hint) this.hint.color = urgent ? WARN : new Color(0x7b, 0x77, 0x5e, 255);
        this.needs = needs;
        this.urgent = urgent;
        this.plate?.setStroke(focus ? new Color(0xd6, 0xa7, 0x5e, 255) : CALM, focus ? 2 : 1);
        setActive(this.stem, true);
    }

    update(dt: number): void {
        if (!this.plate) return;
        if (!this.needs) {
            this.glowT = 0;
            if (this.plate.shadowColor.a !== 70) { this.plate.shadowColor = new Color(16, 39, 41, 70); this.plate.draw(); }
            return;
        }
        // 轻微亮起：2.8 秒一次的暖光呼吸
        this.glowT = (this.glowT + dt / 2.8) % 1;
        const k = 0.5 - 0.5 * Math.cos(this.glowT * Math.PI * 2);
        const c = (this.urgent ? WARN : GLOW).clone();
        c.a = Math.round(60 + 140 * k);
        this.plate.shadowColor = c;
        this.plate.draw();
    }
}
