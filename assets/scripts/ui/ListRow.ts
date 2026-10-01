import { _decorator, Component, Label } from 'cc';
import { RoundRect } from './RoundRect';
import { UiButton } from './UiButton';
import { setText } from './UiKit';

const { ccclass, property } = _decorator;

/**
 * 通用列表行（预制体 ui/parts/ListRow）：标题、说明、右侧信息，外加主按钮和副按钮。
 * 进货行、升级行、装修行都用它，差别只在填什么字。
 */
@ccclass('ListRow')
export class ListRow extends Component {
    @property(Label) title: Label | null = null;
    @property(Label) detail: Label | null = null;
    @property(Label) info: Label | null = null;
    @property(RoundRect) swatch: RoundRect | null = null;
    @property(UiButton) primary: UiButton | null = null;
    @property(UiButton) secondary: UiButton | null = null;

    fill(title: string, detail: string, info: string): this {
        setText(this.title, title);
        setText(this.detail, detail);
        setText(this.info, info);
        return this;
    }

    actions(primary: { text: string; enabled?: boolean; fn: () => void } | null, secondary?: { text: string; enabled?: boolean; fn: () => void } | null): this {
        for (const [btn, spec] of [[this.primary, primary], [this.secondary, secondary ?? null]] as const) {
            if (!btn) continue;
            btn.node.active = !!spec;
            if (spec) btn.setText(spec.text).setEnabled(spec.enabled !== false).bind(spec.fn);
        }
        return this;
    }
}
