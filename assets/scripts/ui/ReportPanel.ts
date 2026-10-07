import { chapterLine, requestText } from './LongTermText';
import { _decorator, Color, Component, Label, Node, Prefab } from 'cc';
import { atmosphereWords } from '../rules/Atmosphere';
import { goalText } from '../rules/Goals';
import { SKILL_EFFECT, skillInfo } from '../rules/Skill';
import { SkillRow } from './SkillRow';
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
    /** 中间一栏「粥谱熟练」（文档 10 §7：今日账、可购买、粥谱熟练三列） */
    @property(Node) skillList: Node | null = null;
    @property(Prefab) skillRowPrefab: Prefab | null = null;
    @property(Label) skillEmpty: Label | null = null;
    @property(Label) skillNote: Label | null = null;
    /** 右栏下方：请托、手账、章节进度（文档 30） */
    @property(Label) longNote: Label | null = null;

    private ctx: GameContext | null = null;
    private lastUpgradeClick = -Infinity;

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

        const start = l.walletAfter - l.revenue - l.tips - (rep.goalReward ?? 0) - (rep.bonus ?? 0) + l.rent + l.debtPaid + l.purchases;
        const rentDue = l.day >= cfg.balance.session.rentStartsOnDay;
        const lines: Array<[string, string]> = [
            ['进货前的铜钱', String(start)],
            ['清晨进货', `− ${l.purchases}`],
            [`卖出 ${l.served} 碗粥`, `+ ${l.revenue}`],
            ['街坊的小费', `+ ${l.tips}`],
            ...(rep.goals.length ? [[`今日小目标 · 做到 ${rep.goals.filter(g => g.done).length}/${rep.goals.length}`, `+ ${rep.goalReward}`] as [string, string]] : []),
            // 请托、章节、手账发的钱合成一行，明细写在下面的备注里（文档 30）
            ...(rep.bonus ? [[[rep.request?.done ? '请托' : '', rep.chapter?.season?.reward ? '章节' : '', rep.milestones?.length ? '手账' : ''].filter(Boolean).join(' · ') || '奖励', `+ ${rep.bonus}`] as [string, string]] : []),
            [rentDue ? '打烊租金' : '打烊租金 · 第 3 日起交', rentDue ? `− ${l.rent}` : '0'],
        ];
        if (l.debtPaid) lines.push(['还上欠租', `− ${l.debtPaid}`]);
        if (p.state.debt) lines.push(['还欠着的租', String(p.state.debt)]);
        // 最好与最差的一碗并成一行；最差的只在比最好那碗差时写（文档 12 §6）
        if (l.best) {
            const worst = l.worst && l.worst.score < l.best.score ? `　最差 ${cfg.recipe.get(l.worst.recipeId)!.name} ${l.worst.score}` : '';
            lines.push([worst ? '最好 / 最差的一碗' : '最好的一碗', `${cfg.recipe.get(l.best.recipeId)!.name} ${l.best.score}${worst}`]);
        }
        const rows = syncList(this.rows, this.billRowPrefab, lines.length, ListRow);
        lines.forEach(([a, b], i) => rows[i].fill(a, '', b).actions(null, null));
        setText(this.totalLabel, '结余');
        setText(this.totalValue, String(l.walletAfter));

        const notes: string[] = [];
        const name = (id: string) => cfg.recipe.get(id)?.name ?? id;
        if (rep.goals.length) notes.push(rep.goals.map(g => `${g.done ? '✓' : '✗'} ${goalText(g.goal, name)}`).join('　'));
        if (rep.expiring.length) notes.push(`明早会过期：${rep.expiring.map(e => `${cfg.ingredient.get(e.id)!.name}×${e.count}`).join('、')}`);
        if (rep.newRecipes.length) notes.push(`粥谱点亮：${rep.newRecipes.map(id => cfg.recipe.get(id)!.name).join('、')}`);
        for (const s of rep.unlockedStyles) notes.push(`新风格可买：${cfg.styles.find(x => x.id === s)!.name}`);
        if (rep.regularJoins) notes.push('街坊常来，明天起会有一位常客。');
        if (rep.rescueTomorrow) notes.push('手头紧，明早街坊会送点米来。');
        if (rep.rewardText) notes.push(rep.rewardText);
        const spentAfterClose = l.walletAfter - p.state.wallet;
        if (spentAfterClose > 0) notes.push(`打烊后添置花了 ${spentAfterClose} 铜，手中还剩 ${p.state.wallet} 铜。上面的结余保留打烊时的数。`);
        // 长线（文档 30）：写在右栏下方
        const long: string[] = [];
        if (rep.request) long.push(rep.request.done
            ? `请托做到了：${requestText(cfg, rep.request.state)}，+${rep.request.state.reward}，好感 +1`
            : `请托没做到：${requestText(cfg, rep.request.state)}（送到 ${rep.request.served}/${rep.request.state.count}），不扣钱`);
        if (rep.nextRequest) long.push(`明天的请托：${requestText(cfg, rep.nextRequest)}，做到给 ${rep.nextRequest.reward} 铜`);
        if (rep.milestones?.length) long.push(`手账新记：${rep.milestones.map(m => m.name).join('、')}（+${rep.milestones.reduce((n, m) => n + m.reward, 0)}）`);
        if (!rep.chapter?.season && p.chapter(l.day)) long.push(chapterLine(cfg, p, l.day));
        setText(this.longNote, long.join('\n'));
        setText(this.footnote, notes.join('\n'));

        // 买得起、差钱的排前面，最多列 5 项，给下方的长线备注留位置
        const order = { ok: 0, money: 1, requires: 2, days: 3, owned: 4 };
        const ups = cfg.upgrades.filter(u => p.upgradeStatus(u) !== 'owned')
            .sort((a, b) => order[p.upgradeStatus(a)] - order[p.upgradeStatus(b)]).slice(0, 5);
        setActive(this.upgradeEmpty?.node, !ups.length);
        const urows = syncList(this.upgradeList, this.rowPrefab, ups.length, ListRow);
        ups.forEach((u, i) => {
            const st = p.upgradeStatus(u);
            const eff = Object.entries(u.effect).map(([k, v]) => EFFECT_WORD[k]?.(v) ?? k).join('，');
            const info = st === 'days' ? `还差 ${u.requiredCompletedDays - p.state.completedDays} 天` : st === 'requires' ? '先买前一口锅' : `${u.price} 铜`;
            // 铺面变大房租跟着涨（文档 04 §6）：写在效果后面，买之前就知道
            const s = cfg.balance.session;
            const rentUp = (u.effect.pots ?? 0) * (s.rentPerPot ?? 0) + (u.effect.seats ?? 0) * (s.rentPerSeat ?? 0);
            urows[i].fill(u.name, `${eff}${rentUp ? `，房租 +${rentUp}` : ''} · 明日生效`, info).actions(
                { text: '买下', enabled: st === 'ok', fn: () => {
                    // 购买后列表会换行，挡住同一位置的第二次点击，避免误买下一项。
                    const now = Date.now();
                    if (now - this.lastUpgradeClick < 1500) return;
                    this.lastUpgradeClick = now;
                    ctx.check(p.buyUpgrade(u.id)); ctx.flow.save(); ctx.refresh();
                } }, null);
        });
        setActive(this.storyButton?.node, !!rep.story);
        this.renderSkill();
    }

    /** 粥谱熟练：今天动过的粥，按变化多少排；升档的放最前面并写效果。 */
    private renderSkill(): void {
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const rep = ctx.flow.dayReport!;
        const items = (rep.skill ?? [])
            .map(c => ({ c, a: skillInfo(cfg, c.before), b: skillInfo(cfg, c.after) }))
            .sort((x, y) => (y.b.tier - y.a.tier) - (x.b.tier - x.a.tier) || (y.c.after - y.c.before) - (x.c.after - x.c.before));
        const rows = syncList(this.skillList, this.skillRowPrefab, Math.min(items.length, 7), SkillRow);
        items.slice(0, 7).forEach((it, i) => {
            const r = cfg.recipe.get(it.c.recipeId);
            const label = it.b.next !== null ? `${it.b.name} ${it.b.points}/${it.b.next}` : it.b.name;
            rows[i].render(r?.name ?? it.c.recipeId, it.b.tier > it.a.tier ? it.b.name : label, it.b.progress, it.c.after - it.c.before,
                it.b.tier > it.a.tier, it.b.next === null);
        });
        setActive(this.skillEmpty?.node, !items.length);
        const ups = items.filter(it => it.b.tier > it.a.tier);
        setText(this.skillNote, ups.length
            ? ups.map(it => `${cfg.recipe.get(it.c.recipeId)?.name}「${it.b.name}」：${SKILL_EFFECT[it.b.tier]}`).join('\n')
            : '刚好出餐越多越熟练。顺手后搅拌提醒早一点，拿手后加料时机更宽松。');
    }
}
