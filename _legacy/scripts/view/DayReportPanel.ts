import { _decorator, Component, Graphics, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface DayReportHandlers {
    onUpgradeShop: () => void;
    onNextDay: () => void;
    onDecor: () => void;
    onShare: () => void;
    onBuyUpgrade: (index: number) => void;
    onCloseUpgradeShop: () => void;
}

@ccclass('DayReportPanel')
export class DayReportPanel extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Label) summary: Label | null = null;
    @property(Label) upgradeList: Label | null = null;
    @property(Label) nextUnlock: Label | null = null;
    @property(Label) nextDayLabel: Label | null = null;
    @property(Node) upgradeShop: Node | null = null;
    @property([Node]) upgradeSlots: Node[] = [];
    @property([Label]) upgradeLabels: Label[] = [];
    @property(Node) upgradeShopButton: Node | null = null;
    @property(Node) nextDayButton: Node | null = null;
    @property(Node) decorButton: Node | null = null;
    @property(Node) shareButton: Node | null = null;
    @property(Node) closeUpgradeButton: Node | null = null;

    private handlers: DayReportHandlers | null = null;
    private wired = false;

    bind(handlers: DayReportHandlers): void {
        this.handlers = handlers;
    }

    graphicsAt(index: number): Graphics | null {
        return this.upgradeSlots[index]?.getComponent(Graphics) || null;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.tap(this.upgradeShopButton, () => this.handlers?.onUpgradeShop());
        this.tap(this.nextDayButton, () => this.handlers?.onNextDay());
        this.tap(this.decorButton, () => this.handlers?.onDecor());
        this.tap(this.shareButton, () => this.handlers?.onShare());
        this.tap(this.closeUpgradeButton, () => this.handlers?.onCloseUpgradeShop());
        this.upgradeSlots.forEach((slot, index) => slot.on(Node.EventType.TOUCH_END, () => this.handlers?.onBuyUpgrade(index), this));
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }
}
