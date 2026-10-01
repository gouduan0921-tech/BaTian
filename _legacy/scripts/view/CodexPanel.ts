import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('CodexPanel')
export class CodexPanel extends Component {
    @property(Label) summary: Label | null = null;
    @property([Label]) recipes: Label[] = [];
    @property([Label]) customers: Label[] = [];
    @property(Node) closeButton: Node | null = null;

    private onClose: (() => void) | null = null;
    private wired = false;

    bind(onClose: () => void): void {
        this.onClose = onClose;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.closeButton?.on(Node.EventType.TOUCH_END, () => this.onClose?.(), this);
    }
}
