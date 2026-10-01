import { _decorator, Color, Component, Label, Node, Prefab } from 'cc';
import { atmosphereWords } from '../rules/Atmosphere';
import { GameContext, INGREDIENT_TINT, REASON_WORD, RESULT_WORD } from '../view/GameContext';
import { saveShareCard } from './ShareCard';
import { ListRow } from './ListRow';
import { UiButton } from './UiButton';
import { UiIcon } from './UiIcon';
import { setActive, setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

const EFFECT_WORD: Record<string, (v: number) => string> = {
    pots: v => `锅位 +${v}`, seats: v => `座位 +${v}`, prepSlots: v => `备料位 +${v}`,
    buySlots: v => `每日进货 +${v} 种`, holdScoreSeconds: v => `出餐台保温 +${v} 秒`,
};
const STAR_ON = new Color(0xd4, 0xaa, 0x5b, 255);
const STAR_OFF = new Color(0xd9, 0xcb, 0xae, 255);

/**
 * 打烊账单（预制体 ui/ReportPanel，设计稿「打烊账单」）：像一张收在柜台的暖色纸笺。
 * 先看卖了多少，再看收入、小费、进货、租金与结余；右边一张小笺写明日可以添置的东西。
 */
@ccclass('ReportPanel')
export class ReportPanel extends Component {
    @property(Label) eyebrow: Label | null = null;
    @property(Label) title: Label | null = null;
    @property(Label) intro: Label | null = null;
    @property([UiIcon]) stars: UiIcon[] = [];
    @property(Node) rows: Node | null = null;
    @property(Prefab) billRowPrefab: Prefab | null = null;
    @property(Label) totalLabel: Label | null = null;
    @property(Label) totalValue: Label | null = null;
    @property(Label) footnote: Label | null = null;
    @property(Node) upgradeList: Node | null = null;
    @property(Prefab) rowPrefab: Prefab | null = null;
    @property(Label) upgradeEmpty: Label | null = null;
    @property(UiButton) nextButton: UiButton | null = null;
    @property(UiButton) decorButton: UiButton | null = null;
    @property(UiButton) storyButton: UiButton | null = null;
    @property(UiButton) titleButton: UiButton | null = null;
    @property(UiButton) shareButton: UiButton | null = null;

    private ctx: GameContext | null = null;

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        this.nextButton?.bind(() => ctx.flow.nextDay());
        this.decorButton?.bind(() => ctx.open('decor'));
        this.storyButton?.bind(() => ctx.open('story'));
        this.titleButton?.bind(() => ctx.flow.toTitle());
        this.shareButton?.bind(() => this.share());
    }

    /** 「留下这张」：今日的粥分享卡（文档 24），不含钱包数字。 */
    private share(): void {
        const ctx = this.ctx!;
        const rep = ctx.flow.dayReport;
        if (!rep) return;
        const l = rep.ledger;
        const r = l.best ? ctx.config.recipe.get(l.best.recipeId) : null;
        saveShareCard({
            shopName: '粥霸天', day: l.day, recipeName: r?.name ?? '', served: l.served,
            resultWord: l.best ? (RESULT_WORD[l.best.result ?? ''] ?? `${l.best.score} 分`) : '还没开张',
            soupColor: r?.color ?? '#F3E2C4', garnish: (r?.adds ?? []).map(a => INGREDIENT_TINT[a.id] ?? '#7FA36A'),
            atmosphere: atmosphereWords(l.atmosphere),
        }).then(err => ctx.toast(err ?? '已保存「今日的粥」'));
    }

    refresh(): void {
        const ctx = this.ctx!;
        const rep = ctx.flow.dayReport;
        const p = ctx.flow.progress;
        if (!rep || !p) return;
        const cfg = ctx.config;
        const l = rep.ledger;
        setText(this.eyebrow, `第 ${l.day} 日 · 打烊账单`);
        const lost = Object.entries(l.reasons).filter(([k, v]) => k !== 'served' && v > 0);
        setText(this.title, l.served === 0 ? '今天的锅，明天再热' : lost.length ? '烟火收进一碗粥' : '一个都没让空着走');
        setText(this.intro, lost.length ? `离开：${lost.map(([k, v]) => `${REASON_WORD[k] ?? k} ${v}`).join('、')}` : `${atmosphereWords(l.atmosphere)}`);

        // 星：卖出比例 + 最好的一碗
        const total = l.served + lost.reduce((s, [, v]) => s + v, 0);
        const ratio = total ? l.served / total : 0;
        const starN = l.served === 0 ? 0 : 1 + (ratio >= 0.7 ? 1 : 0) + ((l.best?.score ?? 0) >= 100 && ratio >= 0.85 ? 1 : 0);
        this.stars.forEach((s, i) => s.setColor(i < starN ? STAR_ON : STAR_OFF, i < starN ? STAR_ON : new Color(0, 0, 0, 0)));

        const start = l.walletAfter - l.revenue - l.tips + l.rent + l.debtPaid;
        const rentDue = l.day >= cfg.balance.session.rentStartsOnDay;
        const lines: Array<[string, string]> = [
            ['开门时的铜钱', String(start)],
            [`卖出 ${l.served} 碗粥`, `+ ${l.revenue}`],
            ['街坊的小费', `+ ${l.tips}`],
            ['清晨进货 · 开门前已付', l.purchases ? String(l.purchases) : '0'],
            [rentDue ? '打烊租金' : '打烊租金 · 第 3 日起交', rentDue ? `− ${l.rent}` : '0'],
        ];
        if (l.debtPaid) lines.push(['还上欠租', `− ${l.debtPaid}`]);
        if (p.state.debt) lines.push(['还欠着的租', String(p.state.debt)]);
        if (l.best) lines.push(['最好的一碗', `${cfg.recipe.get(l.best.recipeId)!.name} ${l.best.score} 分`]);
        const rows = syncList(this.rows, this.billRowPrefab, lines.length, ListRow);
        lines.forEach(([a, b], i) => rows[i].fill(a, '', b).actions(null, null));
        setText(this.totalLabel, '结余');
        setText(this.totalValue, String(l.walletAfter));

        const notes: string[] = [];
        if (rep.expiring.length) notes.push(`明早会过期：${rep.expiring.map(e => `${cfg.ingredient.get(e.id)!.name}×${e.count}`).join('、')}`);
        if (rep.newRecipes.length) notes.push(`粥谱点亮：${rep.newRecipes.map(id => cfg.recipe.get(id)!.name).join('、')}`);
        for (const s of rep.unlockedStyles) notes.push(`新风格可买：${cfg.styles.find(x => x.id === s)!.name}`);
        if (rep.regularJoins) notes.push('街坊常来，明天起会有一位常客。');
        if (rep.rescueTomorrow) notes.push('手头紧，明早街坊会送点米来。');
        if (rep.rewardText) notes.push(rep.rewardText);
        setText(this.footnote, notes.join('\n'));

        const ups = cfg.upgrades.filter(u => p.upgradeStatus(u) !== 'owned');
        setActive(this.upgradeEmpty?.node, !ups.length);
        const urows = syncList(this.upgradeList, this.rowPrefab, ups.length, ListRow);
        ups.forEach((u, i) => {
            const st = p.upgradeStatus(u);
            const eff = Object.entries(u.effect).map(([k, v]) => EFFECT_WORD[k]?.(v) ?? k).join('，');
            const info = st === 'days' ? `还差 ${u.requiredCompletedDays - p.state.completedDays} 天` : st === 'requires' ? '先买前一口锅' : `${u.price} 铜`;
            urows[i].fill(u.name, `${eff} · 明日生效`, info).actions(
                { text: '买下', enabled: st === 'ok', fn: () => { ctx.check(p.buyUpgrade(u.id)); ctx.flow.save(); ctx.refresh(); } }, null);
        });
        setActive(this.storyButton?.node, !!rep.story);
    }
}
