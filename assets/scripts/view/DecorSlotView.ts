import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 一个装修槽位（挂在 stage/Store 预制体的槽位节点上）。
 * mains 与 smalls 下的子节点以装修 id 命名（如 D01），脚本只按名字开关，模型都在预制体里摆好。
 */
@ccclass('DecorSlotView')
export class DecorSlotView extends Component {
    @property slotId = 'window';
    @property(Node) mains: Node | null = null;
    @property(Node) smalls: Node | null = null;
    @property(Node) bare: Node | null = null;

    private shown = '';

    onLoad(): void { this.show(null, []); }

    show(main: string | null, smalls: string[]): void {
        const key = `${main}|${smalls.join(',')}`;
        if (key === this.shown) return;
        this.shown = key;
        let hasMain = false;
        for (const c of this.mains?.children ?? []) {
            const on = c.name === main;
            c.active = on;
            hasMain ||= on;
        }
        if (this.bare) this.bare.active = !hasMain;
        for (const c of this.smalls?.children ?? []) c.active = smalls.includes(c.name);
    }
}
