import { _decorator, Component, Label } from 'cc';
import { GameContext } from '../view/GameContext';
import { UiButton } from './UiButton';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

/** 食客短篇（预制体 ui/StoryPanel，文档 16）。一句一句点，跳过也照样发奖励（奖励在结算时已发）。 */
@ccclass('StoryPanel')
export class StoryPanel extends Component {
    @property(Label) speaker: Label | null = null;
    @property(Label) line: Label | null = null;
    @property(Label) reward: Label | null = null;
    @property(UiButton) nextButton: UiButton | null = null;
    @property(UiButton) skipButton: UiButton | null = null;

    private ctx: GameContext | null = null;
    private index = 0;
    private storyId = '';

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.nextButton?.bind(() => this.next());
        this.skipButton?.bind(() => ctx.close('story'));
    }

    refresh(): void {
        const ctx = this.ctx!;
        const story = ctx.flow.dayReport?.story;
        if (!story) { ctx.close('story'); return; }
        if (story.id !== this.storyId) { this.storyId = story.id; this.index = 0; }
        const who = ctx.config.customer.get(story.customerId)?.name ?? '';
        setText(this.speaker, who);
        const last = this.index >= story.lines.length - 1;
        setText(this.line, story.lines[Math.min(this.index, story.lines.length - 1)]);
        setText(this.reward, last ? ctx.flow.dayReport?.rewardText ?? '' : '');
        this.nextButton?.setText(last ? '收下' : '接着听');
        if (this.skipButton) this.skipButton.node.active = !last;
    }

    private next(): void {
        const story = this.ctx!.flow.dayReport?.story;
        if (!story) return;
        if (this.index >= story.lines.length - 1) { this.ctx!.close('story'); return; }
        this.index++;
        this.refresh();
    }
}
