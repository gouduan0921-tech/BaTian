import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface RecipePrepHandlers {
    onBuy: (index: number) => void;
    onClose: () => void;
}

@ccclass('RecipePrepPanel')
export class RecipePrepPanel extends Component {
    @property(Label) summary: Label | null = null;
    @property([Node]) slots: Node[] = [];
    @property([Label]) slotLabels: Label[] = [];
    @property(Node) closeButton: Node | null = null;

    private handlers: RecipePrepHandlers | null = null;
    private wired = false;

    bind(handlers: RecipePrepHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.slots.forEach((slot, index) => slot.on(Node.EventType.TOUCH_END, () => this.handlers?.onBuy(index), this));
        this.closeButton?.on(Node.EventType.TOUCH_END, () => this.handlers?.onClose(), this);
    }
}
