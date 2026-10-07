import { _decorator, Component, Label } from 'cc';
import { GameContext } from '../view/GameContext';
import { UiButton } from './UiButton';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 设置（预制体 ui/SettingsPanel，文档 12 §9、18 §5）：三路音量、文字大小、重看教学。 */
@ccclass('SettingsPanel')
export class SettingsPanel extends Component {
    @property(Label) info: Label | null = null;
    @property(UiButton) musicButton: UiButton | null = null;
    @property(UiButton) potButton: UiButton | null = null;
    @property(UiButton) ambienceButton: UiButton | null = null;
    @property(UiButton) textButton: UiButton | null = null;
    @property(UiButton) motionButton: UiButton | null = null;
    @property(UiButton) tutorialButton: UiButton | null = null;
    @property(UiButton) titleButton: UiButton | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        const s = () => ctx.flow.settings;
        const cycle = (v: number) => (v >= 1 ? 0 : v >= 0.5 ? 1 : 0.5);
        this.musicButton?.bind(() => { s().music = cycle(s().music); this.changed(); });
        this.potButton?.bind(() => { s().pot = cycle(s().pot); this.changed(); });
        this.ambienceButton?.bind(() => { s().ambience = cycle(s().ambience); this.changed(); });
        this.textButton?.bind(() => { s().textSize = s().textSize === 'normal' ? 'large' : 'normal'; this.changed(); });
        this.motionButton?.bind(() => { s().reduceMotion = !s().reduceMotion; this.changed(); });
        this.tutorialButton?.bind(() => { s().tutorialDone = false; s().potTipDone = false; this.changed(); ctx.toast('教学提示已重新打开'); });
        this.titleButton?.bind(() => { ctx.close('settings'); ctx.flow.toTitle(); });
        this.closeButton?.bind(() => ctx.close('settings'));
    }

    private changed(): void {
        this.ctx!.applySettings();
        this.ctx!.flow.save();
        this.refresh();
    }

    refresh(): void {
        const s = this.ctx!.flow.settings;
        const word = (v: number) => (v >= 1 ? '开' : v > 0 ? '小' : '关');
        this.musicButton?.setText('音乐', word(s.music));
        this.potButton?.setText('锅声', word(s.pot));
        this.ambienceButton?.setText('街上的声音', word(s.ambience));
        this.textButton?.setText('放大重要文字', s.textSize === 'normal' ? '关' : '开');
        this.motionButton?.setText('减少动效', s.reduceMotion ? '开' : '关');
        const inShift = this.ctx!.flow.mode === 'shift';
        if (this.titleButton) this.titleButton.node.active = this.ctx!.flow.mode !== 'title';
        setText(this.info, inShift ? '打开菜单时小店暂停，锅也停着。' : '关掉锅声后，糊底和出餐窗口仍会有文字提示。');
    }
}
