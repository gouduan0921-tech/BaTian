import { _decorator, Component, Label, Node, Prefab } from 'cc';
import { ATMO_PARTS, Decor, SlotId, SLOTS } from '../core/Config';
import { GameContext, SLOT_WORD } from '../view/GameContext';
import { ListRow } from './ListRow';
import { UiButton } from './UiButton';
import { hexColor, setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

const PART_WORD: Record<string, string> = { warmth: '暖度', clean: '整洁', aroma: '香气', light: '光色', crowd: '人气' };
const STYLE_COLOR: Record<string, string> = { 'warm-wood': '#C98B55', 'night-blue': '#35466A', 'morning-white': '#D9D4C8', common: '#9A8A7A' };
type Tab = SlotId | 'tableware';

/**
 * 装修（预制体 ui/DecorPanel，文档 09）。五个槽位 + 餐具一页。
 * 营业中打开会暂停接待，锅照常熬；餐具页营业中只读。
 */
@ccclass('DecorPanel')
export class DecorPanel extends Component {
    @property(Label) header: Label | null = null;
    @property(Label) atmosphere: Label | null = null;
    @property(Node) tabList: Node | null = null;
    @property(Node) itemList: Node | null = null;
    @property(Prefab) tabPrefab: Prefab | null = null;
    @property(Prefab) rowPrefab: Prefab | null = null;
    @property(UiButton) closeButton: UiButton | null = null;

    private ctx: GameContext | null = null;
    private tab: Tab = 'window';

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.closeButton?.bind(() => ctx.close('decor'));
    }

    private get inService(): boolean {
        const sh = this.ctx?.flow.shift;
        return !!sh && this.ctx!.flow.mode === 'shift' && sh.phase !== 'prep';
    }

    refresh(): void {
        const ctx = this.ctx!;
        const p = ctx.flow.progress;
        if (!p) return;
        const cfg = ctx.config;
        setText(this.header, `装修 · 铜钱 ${p.state.wallet}${this.inService ? '    （锅还在熬，接待已暂停）' : ''}`);

        const st = p.staticAtmosphere();
        const w = cfg.atmosphere.weights;
        const total = ATMO_PARTS.reduce((s, k) => s + Math.max(0, Math.min(100, st.parts[k])) * w[k], 0);
        const parts = ATMO_PARTS.filter(k => k !== 'crowd').map(k => `${PART_WORD[k]} ${Math.round(st.parts[k])}`).join('  ');
        setText(this.atmosphere, `静态氛围 ${Math.round(total)}    ${parts}${st.mixed ? '\n颜色有点杂：同时用了三种风格，光色 −5' : ''}\n营业时还会加上正在熬的锅（香气）和坐着的客人（人气）。`);

        const tabs: Tab[] = [...SLOTS, 'tableware'];
        const tbtn = syncList(this.tabList, this.tabPrefab, tabs.length, UiButton);
        tabs.forEach((t, i) => tbtn[i].setText(t === 'tableware' ? '餐具' : SLOT_WORD[t]).setSelected(t === this.tab)
            .bind(() => { this.tab = t; this.refresh(); }));

        const items = cfg.decor.filter(d => this.tab === 'tableware' ? d.kind === 'tableware' : d.slot === this.tab)
            .sort((a, b) => (a.kind === b.kind ? a.price - b.price : a.kind === 'main' ? -1 : 1));
        const rows = syncList(this.itemList, this.rowPrefab, items.length, ListRow);
        items.forEach((d, i) => this.fillRow(rows[i], d));
    }

    private fillRow(row: ListRow, d: Decor): void {
        const ctx = this.ctx!;
        const p = ctx.flow.progress!;
        const cfg = ctx.config;
        const owned = p.state.ownedDecor.includes(d.id);
        const placed = p.isPlaced(d.id);
        const style = d.style === 'common' ? '通用' : cfg.styles.find(s => s.id === d.style)!.name;
        let effect: string;
        if (d.kind === 'tableware') {
            const l = d.look!;
            effect = !l.bonus ? '没有外观加分' : l.wave ? `傍晚 +${l.bonus}，其他时段 +${l.otherWave}` : `${l.tags.join('、')}的粥 +${l.bonus}`;
        } else {
            effect = (Object.entries(d.atmosphere) as Array<[string, number]>).filter(([, v]) => v).map(([k, v]) => `${PART_WORD[k]} +${v}`).join('  ');
        }
        const kind = d.kind === 'main' ? '主件' : d.kind === 'small' ? '小物' : '餐具';
        const info = owned ? (placed ? '使用中' : '在仓库') : d.price > 0 ? `${d.price} 铜` : '故事获得';
        row.swatch?.setColor(hexColor(STYLE_COLOR[d.style]));
        const lockTableware = d.kind === 'tableware' && this.inService;
        let primary: { text: string; enabled?: boolean; fn: () => void } | null;
        if (!owned) {
            const bad = p.canBuyDecor(d);
            primary = d.price > 0 ? { text: bad && bad !== '铜钱不够' ? bad : '买下', enabled: !bad, fn: () => this.act(() => p.buyDecor(d.id) ?? p.place(d.id)) } : null;
        } else if (placed) {
            primary = d.kind === 'tableware' ? null : { text: '卸下', fn: () => this.act(() => { p.unplace(d.id); return null; }) };
        } else {
            primary = { text: d.kind === 'tableware' ? '换用' : '摆上', enabled: !lockTableware, fn: () => this.act(() => p.place(d.id)) };
        }
        row.fill(`${d.name}（${style}${kind}）`, effect, info).actions(primary, null);
    }

    private act(fn: () => string | null): void {
        const ctx = this.ctx!;
        if (ctx.check(fn())) {
            const sh = ctx.flow.shift;
            const p = ctx.flow.progress!;
            // 营业中改装修立即生效；餐具只在营业前生效
            if (sh) {
                sh.state.setup.placement = JSON.parse(JSON.stringify(p.state.placement));
                if (sh.phase === 'prep') sh.state.setup.tableware = p.state.tableware;
            }
            ctx.flow.save();
        }
        ctx.refresh();
    }
}
