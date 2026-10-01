import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface DecorPanelHandlers {
    onBuy: (index: number) => void;
    onClose: () => void;
}

@ccclass('DecorPanelView')
export class DecorPanelView extends Component {
    @property(Label) summary: Label | null = null;
    @property([Node]) slots: Node[] = [];
    @property([Label]) slotLabels: Label[] = [];
    @property(Node) closeButton: Node | null = null;

    private handlers: DecorPanelHandlers | null = null;
    private wired = false;

    bind(handlers: DecorPanelHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.slots.forEach((slot, index) => slot.on(Node.EventType.TOUCH_END, () => this.handlers?.onBuy(index), this));
        this.closeButton?.on(Node.EventType.TOUCH_END, () => this.handlers?.onClose(), this);
    }
}
