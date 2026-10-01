import { _decorator, Button, Color, Component, Label, Node, UIOpacity, Vec3 } from 'cc';
import { RoundRect } from './RoundRect';
import { UiIcon } from './UiIcon';
import { setText, setTint } from './UiKit';

const { ccclass, property } = _decorator;

/**
 * 通用按钮（预制体 ui/parts/UiButton 及各种按钮变体）。节点上同时有 cc.Button。
 * 外观（青釉主按钮 / 木按钮 / 瓷按钮 / 工具瓷片 / 安静按钮）全部在预制体里配好，
 * 脚本只负责换字、换图标、选中态、禁用态、点击下压（设计稿：按下约 3px）。
 */
@ccclass('UiButton')
export class UiButton extends Component {
    @property(Label) label: Label | null = null;
    @property(Label) subLabel: Label | null = null;
    @property(RoundRect) background: RoundRect | null = null;
    @property(UiIcon) icon: UiIcon | null = null;
    @property(Color) normalColor: Color = new Color(245, 236, 215, 255);
    @property(Color) selectedColor: Color = new Color(0x52, 0x8c, 0x71, 255);
    @property(Color) disabledColor: Color = new Color(0, 0, 0, 0);
    @property(Color) normalEdge: Color = new Color(0xa5, 0x8a, 0x66, 255);
    @property(Color) selectedEdge: Color = new Color(0x24, 0x42, 0x37, 255);
    @property(Color) normalText: Color = new Color(0x69, 0x53, 0x38, 255);
    @property(Color) selectedText: Color = new Color(0xf5, 0xe6, 0xc5, 255);
    /** 按下时下沉的像素 */
    @property pressDepth = 3;

    private handler: (() => void) | null = null;
    private selected = false;
    private enabledState = true;
    private pressed = false;
    private readonly rest = new Map<Node, Vec3>();

    onLoad(): void {
        this.node.on(Button.EventType.CLICK, this.onClick, this);
        this.node.on(Node.EventType.TOUCH_START, this.onDown, this);
        this.node.on(Node.EventType.TOUCH_END, this.onUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onUp, this);
    }

    onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
        this.node.off(Node.EventType.TOUCH_START, this.onDown, this);
        this.node.off(Node.EventType.TOUCH_END, this.onUp, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onUp, this);
    }

    private onClick(): void {
        if (this.enabledState) this.handler?.();
    }

    private onDown(): void {
        if (!this.enabledState || this.pressed) return;
        this.pressed = true;
        const d = Math.min(this.pressDepth, this.background?.edge ?? 0) || this.pressDepth;
        this.background?.setSink(d);
        for (const c of this.node.children) {
            this.rest.set(c, c.position.clone());
            c.setPosition(c.position.x, c.position.y - d, c.position.z);
        }
    }

    private onUp(): void {
        if (!this.pressed) return;
        this.pressed = false;
        this.background?.setSink(0);
        for (const [c, p] of this.rest) if (c.isValid) c.setPosition(p);
        this.rest.clear();
    }

    bind(fn: () => void): this {
        this.handler = fn;
        return this;
    }

    setText(text: string, sub?: string): this {
        setText(this.label, text);
        if (this.subLabel) {
            setText(this.subLabel, sub ?? '');
            this.subLabel.node.active = !!sub;
        }
        return this;
    }

    setIcon(name: string): this {
        this.icon?.setIcon(name);
        return this;
    }

    setEnabled(on: boolean): this {
        if (this.enabledState === on) return this;
        this.enabledState = on;
        const btn = this.getComponent(Button);
        if (btn) btn.interactable = on;
        if (!on) this.onUp();
        this.repaint();
        return this;
    }

    get enabledNow(): boolean { return this.enabledState; }

    setSelected(on: boolean): this {
        if (this.selected === on) return this;
        this.selected = on;
        this.repaint();
        return this;
    }

    setColor(color: Color): this {
        this.normalColor = color.clone();
        this.repaint();
        return this;
    }

    start(): void { this.repaint(); }

    private repaint(): void {
        const fill = !this.enabledState && this.disabledColor.a > 0 ? this.disabledColor : this.selected ? this.selectedColor : this.normalColor;
        setTint(this.background, fill);
        this.background?.setEdgeColor(this.selected ? this.selectedEdge : this.normalEdge);
        const text = this.selected ? this.selectedText : this.normalText;
        if (this.label && !this.label.color.equals(text)) this.label.color = text;
        this.icon?.setColor(text);
        const op = this.getComponent(UIOpacity);
        if (op) op.opacity = this.enabledState ? 255 : 128;
    }
}
