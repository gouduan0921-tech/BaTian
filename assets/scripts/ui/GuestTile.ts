import { _decorator, Color, Component, Label, UIOpacity } from 'cc';
import { Avatar } from './Avatar';
import { UiBar } from './UiBar';
import { PALETTE, setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 「街坊」图鉴里的一格（预制体 ui/parts/GuestTile）：头像、名字、口味、好感、故事。 */
@ccclass('GuestTile')
export class GuestTile extends Component {
    @property(Avatar) avatar: Avatar | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) detail: Label | null = null;
    @property(UiBar) favor: UiBar | null = null;
    @property(Label) favorLabel: Label | null = null;
    @property(Label) story: Label | null = null;

    render(seen: boolean, name: string, look: { back: Color; body: Color; hair: Color; glasses?: boolean; cap?: boolean },
        detail: string, favor: number | null, favorMax: number, story: string): void {
        const op = this.getComponent(UIOpacity);
        if (op) op.opacity = seen ? 255 : 150;
        setText(this.title, seen ? name : '？？？');
        setText(this.detail, detail);
        this.avatar?.set(seen ? look : { back: new Color(0xd9, 0xcc, 0xae, 255), body: new Color(0xb4, 0xa4, 0x8c, 255), hair: new Color(0xb4, 0xa4, 0x8c, 255) });
        const tracks = seen && favor !== null;
        setActive(this.favor?.node, tracks);
        setText(this.favorLabel, tracks ? `好感 ${favor} / ${favorMax}` : seen ? '路过的客人，不记好感' : '');
        if (tracks) this.favor?.set(favor! / favorMax, PALETTE.good);
        setText(this.story, story);
    }
}
