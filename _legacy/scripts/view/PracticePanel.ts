import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface PracticePanelHandlers {
    onRecipe: (index: number) => void;
    onHeat: (heat: 'low' | 'mid' | 'high') => void;
    onStir: () => void;
    onAdd: () => void;
    onSeason: (season: 'plain' | 'salty' | 'sweet') => void;
    onServe: () => void;
    onPrev: () => void;
    onRetry: () => void;
    onNext: () => void;
    onClose: () => void;
}

@ccclass('PracticePanel')
export class PracticePanel extends Component {
    @property([Node]) recipeButtons: Node[] = [];
    @property([Label]) recipeLabels: Label[] = [];
    @property(Label) readout: Label | null = null;
    @property(Label) message: Label | null = null;
    @property(Node) closeButton: Node | null = null;
    @property(Node) lowButton: Node | null = null;
    @property(Node) midButton: Node | null = null;
    @property(Node) highButton: Node | null = null;
    @property(Node) stirButton: Node | null = null;
    @property(Node) addButton: Node | null = null;
    @property(Node) plainButton: Node | null = null;
    @property(Node) saltyButton: Node | null = null;
    @property(Node) sweetButton: Node | null = null;
    @property(Node) serveButton: Node | null = null;
    @property(Node) prevButton: Node | null = null;
    @property(Node) retryButton: Node | null = null;
    @property(Node) nextButton: Node | null = null;

    private handlers: PracticePanelHandlers | null = null;
    private wired = false;

    bind(handlers: PracticePanelHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.recipeButtons.forEach((node, index) => node.on(Node.EventType.TOUCH_END, () => this.handlers?.onRecipe(index), this));
        this.tap(this.lowButton, () => this.handlers?.onHeat('low'));
        this.tap(this.midButton, () => this.handlers?.onHeat('mid'));
        this.tap(this.highButton, () => this.handlers?.onHeat('high'));
        this.tap(this.stirButton, () => this.handlers?.onStir());
        this.tap(this.addButton, () => this.handlers?.onAdd());
        this.tap(this.plainButton, () => this.handlers?.onSeason('plain'));
        this.tap(this.saltyButton, () => this.handlers?.onSeason('salty'));
        this.tap(this.sweetButton, () => this.handlers?.onSeason('sweet'));
        this.tap(this.serveButton, () => this.handlers?.onServe());
        this.tap(this.prevButton, () => this.handlers?.onPrev());
        this.tap(this.retryButton, () => this.handlers?.onRetry());
        this.tap(this.nextButton, () => this.handlers?.onNext());
        this.tap(this.closeButton, () => this.handlers?.onClose());
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }
}
