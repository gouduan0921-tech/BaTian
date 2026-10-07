import { GameConfig } from '../core/Config';
import { Color } from 'cc';
import { GameFlow } from '../gameplay/GameFlow';
import type { StoreView } from './StoreView';

/** 面板之间共享的上下文。面板不互相引用，只通过这里请求切换。 */
export type PanelId = 'title' | 'morning' | 'hud' | 'report' | 'decor' | 'story' | 'settings' | 'practice' | 'recipes' | 'light' | 'chapter';

/** 营业画面的两种视角：看整间店，或凑近看一口锅（设计稿「熬粥特写」）。 */
export type ViewMode = 'shop' | 'cook';
export type LightPreset = 'warm' | 'night' | 'morning';

export interface GameContext {
    readonly config: GameConfig;
    readonly flow: GameFlow;
    open(panel: PanelId): void;
    close(panel: PanelId): void;
    toast(text: string): void;
    /** 规则层拒绝原因统一走 toast；成功返回 true */
    check(result: string | null): boolean;
    refresh(): void;
    play(event: string): void;
    applySettings(): void;
    /** 当前视角；切到 cook 时镜头推到焦点锅 */
    readonly view: ViewMode;
    setView(view: ViewMode): void;
    readonly store: StoreView | null;
}

export const CUSTOMER_TINT: Record<string, string> = {
    C01: '#7C8FA6', C02: '#A87A56', C03: '#6FA3A0', C04: '#5E5A73',
    C05: '#3E4E6E', C06: '#C9A36B', C07: '#2F2B33', C08: '#8C6A4E',
};

export const SEASON_WORD: Record<string, string> = { plain: '原味', savory: '咸香', sweet: '清甜' };
export const HEAT_WORD: Record<string, string> = { low: '文火', mid: '中火', high: '武火' };
export const PHASE_WORD: Record<string, string> = {
    empty: '空锅', cooking: '熬煮中', window: '好了', over: '过火了', burnt: '糊了', washing: '洗锅中',
};
export const RESULT_WORD: Record<string, string> = { perfect: '刚好', over: '过火', raw: '夹生', burnt: '糊底' };
export const REASON_WORD: Record<string, string> = {
    served: '吃完走了', impatient: '等不及', 'no-seat': '没座位', busy: '单太多', 'sold-out': '没粥卖', rejected: '嫌冷清', closed: '打烊没送到',
};
export const SLOT_WORD: Record<string, string> = { door: '门口', hall: '堂食', counter: '柜台', kitchen: '后厨', window: '窗边' };

/** 订单头像的配色（设计稿 .avatar），按客人类型。 */
const C = (h: string) => { const v = parseInt(h.slice(1), 16); return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, 255); };
export const CUSTOMER_LOOK: Record<string, { back: Color; body: Color; hair: Color; glasses?: boolean; cap?: boolean }> = {
    C01: { back: C('#C9B79A'), body: C('#7C8FA6'), hair: C('#3A3632') },
    C02: { back: C('#AFC2AE'), body: C('#A87A56'), hair: C('#A59983'), glasses: true },
    C03: { back: C('#D6BC91'), body: C('#546E85'), hair: C('#3A3632') },
    C04: { back: C('#BFC7B4'), body: C('#5E5A73'), hair: C('#6B5B4B'), glasses: true },
    C05: { back: C('#9FB0B8'), body: C('#3E4E6E'), hair: C('#2B2622'), cap: true },
    C06: { back: C('#E0C9A6'), body: C('#C9A36B'), hair: C('#53463A') },
    C07: { back: C('#B8AFA0'), body: C('#2F2B33'), hair: C('#1F1C1A'), cap: true },
    C08: { back: C('#C8D3B8'), body: C('#8C6A4E'), hair: C('#7A6E60') },
};

/** 订单上那句口味要求（设计稿「热一点，少放盐」）。 */
export const CUSTOMER_LINE: Record<string, string> = {
    C01: '赶路呢，快一点。', C02: '老样子，咸香些。', C03: '甜一点就好。', C04: '火候要到。',
    C05: '要浓，要热乎。', C06: '孩子吃，清淡些。', C07: '招牌的拿来尝尝。', C08: '照旧，慢慢来。',
};

/** 粥面上的配料点颜色（粥谱碗、出餐碗）。 */
export const INGREDIENT_TINT: Record<string, string> = {
    I03: '#AB795F', I04: '#4A4038', I05: '#E3A04A', I06: '#6F9A52', I07: '#E58A6A', I08: '#F2E7D8',
    I09: '#8A4E3A', I10: '#9A3B34', I11: '#2E2A28', I12: '#E8D2A8',
    // 时令食材（文档 30）：山药、腊肉、荠菜、绿豆
    I13: '#EFE6D2', I14: '#A4553E', I15: '#5E8C47', I16: '#8DAE5E',
};
