import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

export interface MenuPanelHandlers {
    onNewDay: () => void;
    onCodex: () => void;
    onPause: () => void;
    onOverview: () => void;
    onStory: () => void;
    onReplay: () => void;
    onSkip: () => void;
    onExport: () => void;
    onImport: () => void;
    onProgress: () => void;
    onSettings: () => void;
    onPractice: () => void;
    onClose: () => void;
}

@ccclass('MenuPanel')
export class MenuPanel extends Component {
    @property(Node) newDayButton: Node | null = null;
    @property(Node) codexButton: Node | null = null;
    @property(Node) pauseButton: Node | null = null;
    @property(Node) overviewButton: Node | null = null;
    @property(Node) storyButton: Node | null = null;
    @property(Node) replayButton: Node | null = null;
    @property(Node) skipButton: Node | null = null;
    @property(Node) exportButton: Node | null = null;
    @property(Node) importButton: Node | null = null;
    @property(Node) progressButton: Node | null = null;
    @property(Node) settingsButton: Node | null = null;
    @property(Node) practiceButton: Node | null = null;
    @property(Node) closeButton: Node | null = null;

    private handlers: MenuPanelHandlers | null = null;
    private wired = false;

    bind(handlers: MenuPanelHandlers): void {
        this.handlers = handlers;
    }

    onEnable(): void {
        if (this.wired) return;
        this.wired = true;
        this.tap(this.newDayButton, () => this.handlers?.onNewDay());
        this.tap(this.codexButton, () => this.handlers?.onCodex());
        this.tap(this.pauseButton, () => this.handlers?.onPause());
        this.tap(this.overviewButton, () => this.handlers?.onOverview());
        this.tap(this.storyButton, () => this.handlers?.onStory());
        this.tap(this.replayButton, () => this.handlers?.onReplay());
        this.tap(this.skipButton, () => this.handlers?.onSkip());
        this.tap(this.exportButton, () => this.handlers?.onExport());
        this.tap(this.importButton, () => this.handlers?.onImport());
        this.tap(this.progressButton, () => this.handlers?.onProgress());
        this.tap(this.settingsButton, () => this.handlers?.onSettings());
        this.tap(this.practiceButton, () => this.handlers?.onPractice());
        this.tap(this.closeButton, () => this.handlers?.onClose());
    }

    private tap(node: Node | null, action: () => void): void {
        node?.on(Node.EventType.TOUCH_END, action, this);
    }
}
