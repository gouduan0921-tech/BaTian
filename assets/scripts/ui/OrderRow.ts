import { _decorator, Color, Component, Label } from 'cc';
import { Avatar } from './Avatar';
import { RoundRect } from './RoundRect';
import { UiBar } from './UiBar';
import { UiButton } from './UiButton';
import { PALETTE, setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 订单卡（预制体 ui/parts/OrderRow，设计稿 .order）：头像、姓名、粥、口味要求、耐心条、「在做」。 */
@ccclass('OrderRow')
export class OrderRow extends Component {
    @property(UiButton) button: UiButton | null = null;
    @property(Avatar) avatar: Avatar | null = null;
    @property(Label) guest: Label | null = null;
    @property(Label) dish: Label | null = null;
    @property(Label) request: Label | null = null;
    @property(Label) tag: Label | null = null;
    @property(RoundRect) outline: RoundRect | null = null;
    @property(UiBar) patience: UiBar | null = null;

    render(guestName: string, look: { back: Color; body: Color; hair: Color; glasses?: boolean; cap?: boolean }, dish: string, request: string,
        patience: number, patienceMax: number, tag: string, highlight: boolean, onClick: () => void): void {
        this.button?.bind(onClick);
        this.avatar?.set(look);
        setText(this.guest, guestName);
        setText(this.dish, dish);
        setText(this.request, request);
        const urgent = patience < 15;
        setText(this.tag, urgent ? '等急了' : tag);
        if (this.tag) this.tag.color = urgent ? PALETTE.burnt : tag === '可以送了' ? new Color(0x8f, 0x6a, 0x2d, 255) : new Color(0x41, 0x6a, 0x50, 255);
        if (this.outline) this.outline.node.active = highlight;
        const k = patience / Math.max(1, patienceMax);
        this.patience?.set(k, urgent ? PALETTE.burnt : k < 0.4 ? PALETTE.warn : PALETTE.good);
    }
}
