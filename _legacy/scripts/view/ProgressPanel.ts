import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface ProgressPanelHandlers {
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
}

@ccclass('ProgressPanel')
export class ProgressPanel extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Label) summary: Label | null = null;
    @property([Label]) rows: Label[] = [];
    @property(Node) prevButton: Node | null = null;
    @property(Node) nextButton: Node | null = null;
    @property(Node) closeButton: Node | null = null;

    private handlers: ProgressPanelHandlers | null = null;
    private wired = false;

    bind(handlers: ProgressPanelHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.tap(this.prevButton, () => this.handlers?.onPrev());
        this.tap(this.nextButton, () => this.handlers?.onNext());
        this.tap(this.closeButton, () => this.handlers?.onClose());
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }
}
