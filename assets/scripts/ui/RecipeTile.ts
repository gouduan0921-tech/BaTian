import { _decorator, Color, Component, Label, UIOpacity } from 'cc';
import { BowlArt } from './BowlArt';
import { RoundRect } from './RoundRect';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 粥谱里的一格（预制体 ui/parts/RecipeTile，设计稿 .recipe-tile）。 */
@ccclass('RecipeTile')
export class RecipeTile extends Component {
    @property(RoundRect) card: RoundRect | null = null;
    @property(BowlArt) bowl: BowlArt | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) detail: Label | null = null;
    @property(Label) price: Label | null = null;
    @property(Label) mark: Label | null = null;

    render(name: string, detail: string, price: string, soup: Color, garnish: Color[], locked: boolean, mark: string, today: boolean): void {
        setText(this.title, name);
        setText(this.detail, detail);
        setText(this.price, price);
        setText(this.mark, mark);
        this.bowl?.set(soup, garnish, locked, false);
        this.card?.setColor(today ? new Color(0xf4, 0xe8, 0xcd, 255) : new Color(0xe8, 0xdc, 0xc2, 255));
        this.card?.setStroke(today ? new Color(0xd6, 0xa7, 0x5e, 255) : new Color(0xcd, 0xbb, 0x97, 255), today ? 2 : 1);
        const op = this.getComponent(UIOpacity);
        if (op) op.opacity = locked ? 135 : 255;
    }
}
