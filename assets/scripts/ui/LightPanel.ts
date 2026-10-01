import { _decorator, Component, Label } from 'cc';
import { GameContext, LightPreset } from '../view/GameContext';
import { UiButton } from './UiButton';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

const CHOICES: Array<{ id: LightPreset; style: string; name: string; sub: string }> = [
    { id: 'warm', style: 'warm-wood', name: '暖木', sub: '纸灯 · 亲切暖黄' },
    { id: 'night', style: 'night-blue', name: '夜蓝', sub: '铜灯 · 安静夜色' },
    { id: 'morning', style: 'morning-white', name: '晨白', sub: '晨光 · 清透米白' },
];

/**
 * 小店的光（预制体 ui/LightPanel，设计稿「布置与灯光」）。三种光色只换气氛，不扣铜钱；
 * 跟着装修风格的开放条件走。底部可以进入完整的装修。
 */
@ccclass('LightPanel')
export class LightPanel extends Component {
    @property(UiButton) warmButton: UiButton | null = null;
    @property(UiButton) nightButton: UiButton | null = null;
    @property(UiButton) morningButton: UiButton | null = null;
    @property(Label) foot: Label | null = null;
    @property(UiButton) decorButton: UiButton | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    private get buttons(): Array<UiButton | null> { return [this.warmButton, this.nightButton, this.morningButton]; }

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        CHOICES.forEach((c, i) => this.buttons[i]?.bind(() => this.pick(c.id, c.style)));
        this.closeButton?.bind(() => ctx.close('light'));
        this.decorButton?.bind(() => { ctx.close('light'); ctx.open('decor'); });
    }

    private unlocked(style: string): boolean {
        return this.ctx!.flow.progress?.styleUnlocked(style) ?? style === 'warm-wood';
    }

    private pick(id: LightPreset, style: string): void {
        const ctx = this.ctx!;
        if (!this.unlocked(style)) { ctx.toast('这种光色还没开放'); return; }
        ctx.flow.settings.light = id;
        ctx.applySettings();
        ctx.flow.save();
        this.refresh();
    }

    refresh(): void {
        const ctx = this.ctx!;
        const cur = ctx.flow.settings.light ?? 'warm';
        const cfg = ctx.config;
        CHOICES.forEach((c, i) => {
            const b = this.buttons[i];
            if (!b) return;
            const open = this.unlocked(c.style);
            let sub = c.sub;
            if (!open) {
                const u = cfg.styles.find(s => s.id === c.style)?.unlock;
                sub = u?.type === 'completedDays' ? `开张满 ${u.value} 天开放` : u?.type === 'story' ? '听完熟客的故事开放' : '还没开放';
            }
            b.setText(c.name, sub).setSelected(cur === c.id).setEnabled(open);
        });
        const inService = !!ctx.flow.shift && ctx.flow.mode === 'shift';
        setText(this.foot, `换光色不扣铜钱。${inService ? '营业中进装修会暂停接待，锅照样在熬。' : '摆件和桌椅在「装修」里添置。'}`);
    }
}
