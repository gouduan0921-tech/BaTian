import { _decorator, Color, Component, Label, Node } from 'cc';
import { LocalSettings, VOLUME_WORDS } from '../audio/LocalSettings';
import { paintSurface } from './UiKit';

const { ccclass, executeInEditMode, property } = _decorator;

export interface SettingsPanelHandlers {
    onVolume: (key: 'music' | 'pot' | 'room', title: string) => void;
    onTextSize: () => void;
    onClose: () => void;
}

const INK = new Color(245, 233, 206);

@ccclass('SettingsPanel')
@executeInEditMode(true)
export class SettingsPanel extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Label) musicLabel: Label | null = null;
    @property(Label) potLabel: Label | null = null;
    @property(Label) roomLabel: Label | null = null;
    @property(Label) textSizeLabel: Label | null = null;
    @property(Node) musicButton: Node | null = null;
    @property(Node) potButton: Node | null = null;
    @property(Node) roomButton: Node | null = null;
    @property(Node) textSizeButton: Node | null = null;
    @property(Node) closeButton: Node | null = null;

    private handlers: SettingsPanelHandlers | null = null;
    private wired = false;
    private textScale = 1;
    private readonly fonts = new Map<Label, number>();

    bind(handlers: SettingsPanelHandlers): void {
        this.handlers = handlers;
    }

    paint(settings: LocalSettings): void {
        this.setText(this.musicLabel, `音乐 · ${VOLUME_WORDS[settings.music]}`);
        this.setText(this.potLabel, `锅声 · ${VOLUME_WORDS[settings.pot]}`);
        this.setText(this.roomLabel, `环境 · ${VOLUME_WORDS[settings.room]}`);
        this.setText(this.textSizeLabel, `文字 · ${settings.largeText ? '大' : '标准'}`);
    }

    applyTextScale(scale: number): void {
        this.textScale = scale;
        for (const [label, size] of this.fonts) this.style(label, size);
    }

    onEnable(): void {
        this.draw();
        this.wire();
    }

    private draw(): void {
        paintSurface(this.node, 0);
        for (const button of [this.musicButton, this.potButton, this.roomButton, this.textSizeButton]) {
            if (button) paintSurface(button, 1, 252, 1);
        }
        if (this.closeButton) paintSurface(this.closeButton, 1, 252, 2);
    }

    private wire(): void {
        if (this.wired) return;
        this.wired = true;
        this.remember(this.titleLabel, 29);
        this.remember(this.musicLabel, 22);
        this.remember(this.potLabel, 22);
        this.remember(this.roomLabel, 22);
        this.remember(this.textSizeLabel, 22);
        this.tap(this.musicButton, () => this.handlers?.onVolume('music', '音乐'));
        this.tap(this.potButton, () => this.handlers?.onVolume('pot', '锅声'));
        this.tap(this.roomButton, () => this.handlers?.onVolume('room', '环境'));
        this.tap(this.textSizeButton, () => this.handlers?.onTextSize());
        this.tap(this.closeButton, () => this.handlers?.onClose());
    }

    private remember(label: Label | null, size: number): void {
        if (!label || this.fonts.has(label)) return;
        this.fonts.set(label, size);
        this.style(label, size);
    }

    private style(label: Label, size: number): void {
        label.fontSize = Math.round(size * this.textScale);
        label.lineHeight = Math.round((size + 7) * this.textScale);
        label.color = INK;
        label.overflow = Label.Overflow.SHRINK;
    }

    private setText(label: Label | null, text: string): void {
        if (label) label.string = text;
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }

}
