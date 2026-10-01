import { _decorator, Color, Component, Label, Node } from 'cc';
import { BowlArt } from './BowlArt';
import { RoundRect } from './RoundRect';
import { UiButton } from './UiButton';
import { UiIcon } from './UiIcon';
import { hexColor, setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

const EMPTY = new Color(0x7f, 0x5c, 0x3d, 255);
const FILLED = new Color(0xa8, 0x7a, 0x4b, 255);

/** 出餐台的一个木托盘（预制体 ui/parts/PassSlot，设计稿 .pass-slot）。有碗时点它送给最着急的同粥客人。 */
@ccclass('PassSlot')
export class PassSlot extends Component {
    @property(UiButton) button: UiButton | null = null;
    @property(RoundRect) tray: RoundRect | null = null;
    @property(UiIcon) emptyIcon: UiIcon | null = null;
    @property(BowlArt) bowl: BowlArt | null = null;
    @property(Node) badge: Node | null = null;
    @property(Label) dish: Label | null = null;

    showEmpty(): void {
        this.button?.bind(() => {}).setEnabled(false);
        this.tray?.setColor(EMPTY);
        setActive(this.emptyIcon?.node, true);
        setActive(this.bowl?.node, false);
        setActive(this.badge, false);
        setText(this.dish, '');
    }

    render(dish: string, color: string, result: string, score: number, cooling: boolean, hasTaker: boolean, onClick: () => void): void {
        this.button?.bind(onClick).setEnabled(true);
        this.tray?.setColor(FILLED);
        setActive(this.emptyIcon?.node, false);
        setActive(this.bowl?.node, true);
        this.bowl?.set(hexColor(color), [], false, false);
        setActive(this.badge, hasTaker);
        setText(this.dish, cooling ? `凉了 ${score}` : `${result} ${score}`);
    }
}
