import { _decorator, Component, Graphics, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface PlayHudHandlers {
    onMenu: () => void;
    onOrder: (index: number) => void;
    onQuick: () => void;
    onPrep: (index: number) => void;
    onRecipe: (index: number) => void;
    onAdd: () => void;
    onStir: () => void;
    onServe: () => void;
    onDeliver: () => void;
    onBurner: (station: 'BURNER_A' | 'BURNER_B') => void;
    onHeat: (heat: 'low' | 'mid' | 'high') => void;
    onDump: () => void;
    onPriority: () => void;
    onSeason: (season: 'plain' | 'salty' | 'sweet') => void;
    onBowl: (bowl: 'coarse' | 'glaze' | 'night') => void;
    onRecipePage: () => void;
}

@ccclass('PlayHud')
export class PlayHud extends Component {
    @property(Label) header: Label | null = null;
    @property(Label) potWarn: Label | null = null;
    @property(Label) serviceTitle: Label | null = null;
    @property(Label) hint: Label | null = null;
    @property(Label) stationState: Label | null = null;
    @property(Label) prepStock: Label | null = null;
    @property(Label) status: Label | null = null;
    @property(Label) nextStep: Label | null = null;
    @property(Label) dayProgress: Label | null = null;
    @property(Label) cookMeterLabel: Label | null = null;
    @property(Label) recipeGuide: Label | null = null;
    @property(Label) quickLabel: Label | null = null;
    @property(Node) quickButton: Node | null = null;
    @property(Node) prepRoot: Node | null = null;
    @property(Node) serviceRoot: Node | null = null;
    @property(Node) cookMeter: Node | null = null;
    @property(Graphics) cookMeterGraphics: Graphics | null = null;
    @property([Node]) orderRows: Node[] = [];
    @property([Label]) orderLabels: Label[] = [];
    @property([Graphics]) orderRowGraphics: Graphics[] = [];
    @property([Graphics]) orderBars: Graphics[] = [];
    @property([Node]) markers: Node[] = [];
    @property([Label]) markerLabels: Label[] = [];
    @property([Node]) prepButtons: Node[] = [];
    @property([Node]) recipeButtons: Node[] = [];
    @property([Label]) recipeLabels: Label[] = [];
    @property([Node]) blockers: Node[] = [];
    @property(Node) addButton: Node | null = null;
    @property(Node) stirButton: Node | null = null;
    @property(Node) serveButton: Node | null = null;
    @property(Node) deliverButton: Node | null = null;
    @property(Node) burnerAButton: Node | null = null;
    @property(Node) burnerBButton: Node | null = null;
    @property(Node) lowButton: Node | null = null;
    @property(Node) midButton: Node | null = null;
    @property(Node) highButton: Node | null = null;
    @property(Node) dumpButton: Node | null = null;
    @property(Node) priorityButton: Node | null = null;
    @property(Node) plainButton: Node | null = null;
    @property(Node) saltyButton: Node | null = null;
    @property(Node) sweetButton: Node | null = null;
    @property(Node) coarseButton: Node | null = null;
    @property(Node) glazeButton: Node | null = null;
    @property(Node) nightButton: Node | null = null;
    @property(Node) pageButton: Node | null = null;
    @property(Node) menuButton: Node | null = null;

    private handlers: PlayHudHandlers | null = null;
    private wired = false;

    bind(handlers: PlayHudHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.tap(this.menuButton, () => this.handlers?.onMenu());
        this.tap(this.quickButton, () => this.handlers?.onQuick());
        this.orderRows.forEach((row, index) => this.tap(row, () => this.handlers?.onOrder(index)));
        this.prepButtons.forEach((button, index) => this.tap(button, () => this.handlers?.onPrep(index)));
        this.recipeButtons.forEach((button, index) => this.tap(button, () => this.handlers?.onRecipe(index)));
        this.tap(this.addButton, () => this.handlers?.onAdd());
        this.tap(this.stirButton, () => this.handlers?.onStir());
        this.tap(this.serveButton, () => this.handlers?.onServe());
        this.tap(this.deliverButton, () => this.handlers?.onDeliver());
        this.tap(this.burnerAButton, () => this.handlers?.onBurner('BURNER_A'));
        this.tap(this.burnerBButton, () => this.handlers?.onBurner('BURNER_B'));
        this.tap(this.lowButton, () => this.handlers?.onHeat('low'));
        this.tap(this.midButton, () => this.handlers?.onHeat('mid'));
        this.tap(this.highButton, () => this.handlers?.onHeat('high'));
        this.tap(this.dumpButton, () => this.handlers?.onDump());
        this.tap(this.priorityButton, () => this.handlers?.onPriority());
        this.tap(this.plainButton, () => this.handlers?.onSeason('plain'));
        this.tap(this.saltyButton, () => this.handlers?.onSeason('salty'));
        this.tap(this.sweetButton, () => this.handlers?.onSeason('sweet'));
        this.tap(this.coarseButton, () => this.handlers?.onBowl('coarse'));
        this.tap(this.glazeButton, () => this.handlers?.onBowl('glaze'));
        this.tap(this.nightButton, () => this.handlers?.onBowl('night'));
        this.tap(this.pageButton, () => this.handlers?.onRecipePage());
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }
}
