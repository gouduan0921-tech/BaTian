import { _decorator, Color, Component, Label, Node, Prefab, UITransform, Vec3 } from 'cc';
import { baseIngredients, Heat, Recipe } from '../core/Config';
import { nextAdd, PotState } from '../rules/Pot';
import { Shift } from '../rules/Shift';
import {
    CUSTOMER_LINE, CUSTOMER_LOOK, GameContext, HEAT_WORD, RESULT_WORD, SEASON_WORD,
} from '../view/GameContext';
import { OrderRow } from './OrderRow';
import { PassSlot } from './PassSlot';
import { PotPin } from './PotPin';
import { RoundRect } from './RoundRect';
import { UiBar } from './UiBar';
import { UiButton } from './UiButton';
import { bigNum, fmtTime, PALETTE, setActive, setText, syncList } from './UiKit';

const { ccclass, property } = _decorator;

const ACTION_WORD: Record<string, string> = { stir: '搅一搅', prep: '处理', plate: '盛碗', deliver: '送过去', wipe: '擦桌子' };
const WAVE_WORD: Record<string, string> = { morning: '清晨', forenoon: '上午', lunch: '午市', evening: '傍晚' };
const WAVE_LINE: Record<string, string> = {
    morning: '赶早的人来了，米香刚起', forenoon: '街上松快，慢慢熬', lunch: '午市人多，看紧锅', evening: '街坊来，粥正香',
};
const DONE_FILL = new Color(0xd2, 0xae, 0x72, 255);
const OPEN_DOT = new Color(0x5c, 0x94, 0x75, 255);
const SHUT_DOT = new Color(0xb4, 0x8a, 0x5a, 255);

export interface PotHint { text: string; needs: boolean; urgent: boolean }

/** 一口锅当前该做什么（锅牌、焦点卡、熬粥特写共用一套话）。 */
export function potHint(sh: Shift, i: number, ingredientName: (id: string) => string): PotHint {
    const st = sh.state;
    const pot = st.pots[i];
    const r = sh.recipe(pot.recipeId);
    if (pot.phase === 'washing') return { text: `洗锅中，还要 ${Math.ceil(pot.washLeft)} 秒`, needs: false, urgent: false };
    if (pot.phase === 'empty') return { text: st.phase === 'prep' ? '开门后才能下锅' : '空锅，挑一道粥下锅', needs: false, urgent: false };
    if (!r) return { text: '', needs: false, urgent: false };
    if (pot.phase === 'burnt') return { text: '糊了，倒掉洗锅', needs: true, urgent: true };
    if (pot.scorch > 0.7) return { text: '快糊了，搅一搅或关小火', needs: true, urgent: true };
    if (pot.phase === 'over') return { text: '过火了，赶紧盛', needs: true, urgent: true };
    if (pot.phase === 'window') {
        return pot.seasoning ? { text: '刚刚好，可以盛碗了', needs: true, urgent: false }
            : { text: `刚刚好，先调${SEASON_WORD[r.seasoning]}再盛`, needs: true, urgent: false };
    }
    const next = nextAdd(pot, r);
    if (next && pot.doneness >= next.atDoneness - sh.addTolerance(r.id)) return { text: `该加${ingredientName(next.id)}了`, needs: true, urgent: false };
    if (pot.stir < sh.warnLine(r.id)) return { text: '粥变稠了，该搅一搅', needs: true, urgent: false };
    if (next) return { text: `米粒开花，等着下${ingredientName(next.id)}`, needs: false, urgent: false };
    return { text: '慢慢熬，汤色到了再盛', needs: false, urgent: false };
}

/**
 * 营业界面（预制体 ui/HudView，设计稿「营业主画面」「熬粥特写」）。
 * 五个位置各司其职：左上店名、上方日子与铜钱、左边工具、锅上木牌、右边订单与出餐台；
 * 左下是正在照看的锅。切到熬粥特写时，下方换成这口锅的火候、搅拌、加料与盛碗。
 * 所有节点都在预制体里摆好，这里只填数据和绑回调。
 */
@ccclass('HudView')
export class HudView extends Component {
    // 顶部
    @property(Label) dayNumber: Label | null = null;
    @property(Label) dayTitle: Label | null = null;
    @property(Label) daySub: Label | null = null;
    @property(RoundRect) openDot: RoundRect | null = null;
    @property(Label) walletLabel: Label | null = null;
    @property(Label) walletToday: Label | null = null;
    // 左侧工具
    @property(Node) tools: Node | null = null;
    @property(UiButton) shopTool: UiButton | null = null;
    @property(UiButton) bookTool: UiButton | null = null;
    @property(UiButton) decorTool: UiButton | null = null;
    @property(UiButton) menuTool: UiButton | null = null;
    @property(UiButton) backButton: UiButton | null = null;
    // 锅牌
    @property(Node) pinRoot: Node | null = null;
    @property(Prefab) pinPrefab: Prefab | null = null;
    // 提示条与浮字
    @property(Node) hint: Node | null = null;
    @property(Label) hintLabel: Label | null = null;
    @property(UiBar) actionBar: UiBar | null = null;
    @property(UiButton) cancelButton: UiButton | null = null;
    @property(Node) toast: Node | null = null;
    @property(Label) toastLabel: Label | null = null;
    @property(Node) shopNote: Node | null = null;
    // 订单
    @property(Node) ordersPanel: Node | null = null;
    @property(Label) ordersCount: Label | null = null;
    @property(Node) orderList: Node | null = null;
    @property(Prefab) orderRowPrefab: Prefab | null = null;
    @property(Node) ordersEmpty: Node | null = null;
    @property(Label) ordersFoot: Label | null = null;
    // 出餐台
    @property(Node) passPanel: Node | null = null;
    @property(Node) passList: Node | null = null;
    @property(Prefab) passSlotPrefab: Prefab | null = null;
    @property(UiButton) endButton: UiButton | null = null;
    // 正在照看（店铺视角左下）
    @property(Node) focusCard: Node | null = null;
    @property(Label) focusEyebrow: Label | null = null;
    @property(Label) focusTitle: Label | null = null;
    @property(UiButton) lookButton: UiButton | null = null;
    @property(Label) focusStatus: Label | null = null;
    @property(Label) focusQuality: Label | null = null;
    @property(UiBar) focusBar: UiBar | null = null;
    @property(Label) focusMid: Label | null = null;
    @property(Node) focusActions: Node | null = null;
    @property(UiButton) focusPrimary: UiButton | null = null;
    @property(UiButton) focusSecondary: UiButton | null = null;
    @property(Node) focusRecipes: Node | null = null;
    // 熬粥特写（下方操作卡）
    @property(Node) cookPanel: Node | null = null;
    @property(Label) cookTitle: Label | null = null;
    @property(Label) cookRight: Label | null = null;
    @property(Label) cookStatus: Label | null = null;
    @property(Label) cookPercent: Label | null = null;
    @property(UiBar) cookBar: UiBar | null = null;
    @property(Label) cookMid: Label | null = null;
    @property(UiBar) stirBar: UiBar | null = null;
    @property(UiBar) scorchBar: UiBar | null = null;
    @property(Node) cookRow: Node | null = null;
    @property(UiButton) lowButton: UiButton | null = null;
    @property(UiButton) midButton: UiButton | null = null;
    @property(UiButton) highButton: UiButton | null = null;
    @property(UiButton) stirButton: UiButton | null = null;
    @property(UiButton) addButton: UiButton | null = null;
    @property(UiButton) plateButton: UiButton | null = null;
    @property(Node) seasonRow: Node | null = null;
    @property(UiButton) plainButton: UiButton | null = null;
    @property(UiButton) savoryButton: UiButton | null = null;
    @property(UiButton) sweetButton: UiButton | null = null;
    @property(UiButton) dumpButton: UiButton | null = null;
    @property(Node) cookRecipes: Node | null = null;
    @property(Label) cookTip: Label | null = null;
    @property(Prefab) buttonPrefab: Prefab | null = null;
    // 备料与擦桌
    @property(Node) prepCard: Node | null = null;
    @property(Label) prepLabel: Label | null = null;
    @property(Node) prepList: Node | null = null;
    @property(Node) wipeList: Node | null = null;

    private ctx: GameContext | null = null;
    private toastLeft = 0;
    private readonly tmp = new Vec3();
    private readonly ui = new Vec3();

    setup(ctx: GameContext): void {
        this.ctx = ctx;
        const heat = (h: Heat) => () => this.cmd(sh => sh.setHeat(sh.state.focus, h));
        this.lowButton?.bind(heat('low'));
        this.midButton?.bind(heat('mid'));
        this.highButton?.bind(heat('high'));
        this.stirButton?.bind(() => this.cmd(sh => sh.stir(sh.state.focus)));
        this.focusSecondary?.bind(() => this.cmd(sh => {
            const p = sh.state.pots[sh.state.focus];
            return p.phase === 'burnt' ? sh.dump(sh.state.focus) : sh.stir(sh.state.focus);
        }));
        this.plateButton?.bind(() => this.cmd(sh => sh.plate(sh.state.focus)));
        this.dumpButton?.bind(() => this.cmd(sh => sh.dump(sh.state.focus)));
        this.plainButton?.bind(() => this.cmd(sh => sh.season(sh.state.focus, 'plain')));
        this.savoryButton?.bind(() => this.cmd(sh => sh.season(sh.state.focus, 'savory')));
        this.sweetButton?.bind(() => this.cmd(sh => sh.season(sh.state.focus, 'sweet')));
        this.cancelButton?.bind(() => this.shift?.cancelAction());
        this.lookButton?.bind(() => ctx.setView('cook'));
        this.backButton?.bind(() => ctx.setView('shop'));
        this.shopTool?.bind(() => ctx.setView('shop'));
        this.bookTool?.bind(() => ctx.open('recipes'));
        this.decorTool?.bind(() => ctx.open('light'));
        this.menuTool?.bind(() => ctx.open('settings'));
        this.endButton?.bind(() => {
            const sh = this.shift;
            if (!sh) return;
            if (ctx.flow.mode === 'practice') { ctx.flow.endPractice(); return; }
            if (sh.phase === 'prep') sh.open();
            else if (sh.phase === 'closing') sh.endClosing();
            else ctx.toast('还在营业。打烊后再看账。');
        });
    }

    private get shift(): Shift | null { return this.ctx?.flow.shift ?? null; }

    private ingName = (id: string): string => this.ctx?.config.ingredient.get(id)?.name ?? id;

    private cmd(fn: (sh: Shift) => string | null): void {
        const sh = this.shift;
        if (!sh || !this.ctx) return;
        this.ctx.check(fn(sh));
        this.ctx.flow.flushEvents();
    }

    showToast(text: string): void {
        setText(this.toastLabel, text);
        setActive(this.toast, true);
        this.toastLeft = 2.4;
    }

    update(dt: number): void {
        if (this.toastLeft > 0) {
            this.toastLeft -= dt;
            if (this.toastLeft <= 0) setActive(this.toast, false);
        }
        this.refresh();
    }

    refresh(): void {
        const ctx = this.ctx;
        const sh = this.shift;
        if (!ctx || !sh) return;
        const st = sh.state;
        const practice = st.setup.practice;
        const cook = ctx.view === 'cook';

        this.renderTop(sh);
        setActive(this.tools, !cook);
        setActive(this.backButton?.node, cook);
        this.shopTool?.setSelected(!cook);
        setActive(this.shopNote, !cook);
        setActive(this.focusCard, !cook);
        setActive(this.cookPanel, cook);
        setActive(this.pinRoot, !cook);

        if (cook) this.renderCook(sh); else this.renderFocus(sh);
        this.renderPins(sh, !cook);
        this.renderOrders(sh);
        this.renderPass(sh);
        this.renderPrep(sh, cook);
        this.renderHint(sh, cook);

        // 右下：开门 / 打烊看看账 / 结束练习
        const end = practice ? ['结束练习', 'back'] : st.phase === 'prep' ? ['开门迎客', 'door'] : st.phase === 'closing' ? ['打烊看看账', 'moon'] : ['打烊看看账', 'moon'];
        this.endButton?.setText(end[0]).setIcon(end[1]);
        this.endButton?.setEnabled(practice || st.phase !== 'service');
    }

    private renderTop(sh: Shift): void {
        const ctx = this.ctx!;
        const st = sh.state;
        const practice = st.setup.practice;
        setText(this.dayNumber, practice ? '练' : bigNum(st.setup.day));
        const when = practice ? '练习' : st.phase === 'prep' ? '清晨' : st.phase === 'service' ? WAVE_WORD[sh.wave] ?? '营业' : '打烊';
        setText(this.dayTitle, practice ? '练手 · 不计铜钱' : `第 ${st.setup.day} 日 · ${when}`);
        const left = practice ? '' : `  ${fmtTime(sh.phaseLeft)}`;
        const line = practice ? '慢慢来，熬糊了也不要紧' : st.phase === 'prep' ? '先把米洗好，再开门' : st.phase === 'service'
            ? (sh.state.receptionPaused ? '布置中，暂停接待' : WAVE_LINE[sh.wave] ?? '') : '把最后几碗送完';
        setText(this.daySub, `${line}${left}`);
        this.openDot?.setColor(st.phase === 'service' ? OPEN_DOT : SHUT_DOT);
        const wallet = ctx.flow.progress?.state.wallet ?? 0;
        const today = st.ledger.revenue + st.ledger.tips;
        setText(this.walletLabel, practice ? '—' : String(wallet));
        setText(this.walletToday, practice ? '练习' : today ? `今日 +${today}` : '铜钱');
    }

    private renderPins(sh: Shift, visible: boolean): void {
        const ctx = this.ctx!;
        const st = sh.state;
        const pins = syncList(this.pinRoot, this.pinPrefab, visible ? st.pots.length : 0, PotPin);
        if (!visible) return;
        const store = ctx.store;
        const cam = store?.camera;
        const rootT = this.pinRoot?.getComponent(UITransform);
        st.pots.forEach((p, i) => {
            const pin = pins[i];
            if (!pin) return;
            const anchor = store?.pots[i]?.node;
            if (!cam || !anchor || !rootT) { pin.node.active = false; return; }
            anchor.getWorldPosition(this.tmp);
            this.tmp.y += 0.55;
            cam.convertToUINode(this.tmp, this.pinRoot!, this.ui);
            // 木牌底下的小圆点落在锅口上；相邻的锅牌一高一低错开
            const crowded = st.pots.length >= 3;
            pin.node.setPosition(this.ui.x, this.ui.y + 54 + (crowded && i % 2 === 0 ? 30 : 0), 0);
            const r = sh.recipe(p.recipeId);
            const h = potHint(sh, i, this.ingName);
            const empty = p.phase === 'empty';
            pin.render(i, r?.name ?? (p.phase === 'washing' ? '洗锅' : '空锅'), empty ? (st.phase === 'prep' ? '开门后下锅' : '点我下锅') : h.text, h.needs, h.urgent, i === st.focus,
                () => { sh.setFocus(i); ctx.setView('cook'); }, crowded && !h.needs && i !== st.focus);
        });
    }

    /** 店铺视角左下的「正在照看」卡。 */
    private renderFocus(sh: Shift): void {
        const ctx = this.ctx!;
        const st = sh.state;
        const pot = st.pots[st.focus];
        const r = sh.recipe(pot.recipeId);
        const g = ctx.config.balance.gates;
        const h = potHint(sh, st.focus, this.ingName);
        setText(this.focusEyebrow, `正在照看 · ${bigNum(st.focus + 1)}号锅${st.pots.length > 1 ? '   Tab 换锅' : ''}`);
        setText(this.focusTitle, r?.name ?? (pot.phase === 'washing' ? '洗锅中' : '空锅'));
        setText(this.focusStatus, h.text);
        if (this.focusStatus) this.focusStatus.color = h.urgent ? PALETTE.burnt : PALETTE.ink;
        const cooking = isCooking(pot);
        setActive(this.focusBar?.node, cooking);
        setActive(this.focusActions, cooking);
        setActive(this.focusRecipes, pot.phase === 'empty');
        setText(this.focusQuality, r ? `${SEASON_WORD[r.seasoning]} · ${HEAT_WORD[pot.heat]}` : '');
        if (pot.phase === 'empty') { this.fillRecipeButtons(sh, this.focusRecipes, 4); return; }
        if (!cooking || !r) return;
        this.paintDoneness(this.focusBar, this.focusMid, pot, r, g.serveMin, g.serveMax);
        const next = nextAdd(pot, r);
        const p = this.focusPrimary!;
        if (pot.phase === 'burnt') {
            p.setText('糊着上桌').setIcon('bowl').setEnabled(!sh.busy).bind(() => this.cmd(s => s.plate(s.state.focus)));
            this.focusSecondary?.setText('倒掉').setIcon('close').setEnabled(true);
            return;
        }
        this.focusSecondary?.setText('搅一搅').setIcon('spoon').setEnabled(!sh.busy);
        if ((pot.phase === 'window' || pot.phase === 'over') && !pot.seasoning) {
            p.setText('去调味').setIcon('leaf').setEnabled(true).bind(() => ctx.setView('cook'));
        } else if (next && pot.phase === 'cooking') {
            // 未到加料点时按钮变暗但保留名称（设计稿「不可操作」）
            const usable = st.setup.practice || sh.pantry.usable(next.id) > 0;
            const near = pot.doneness >= next.atDoneness - sh.addTolerance(r.id);
            p.setText(`加入${this.ingName(next.id)}`).setIcon('leaf').setEnabled(usable && near)
                .bind(() => this.cmd(s => s.addIngredient(s.state.focus, next.id)));
        } else {
            p.setText('盛碗').setIcon('bowl').setEnabled(!sh.busy && pot.phase !== 'cooking' && st.pass.length < ctx.config.balance.session.passCapacity)
                .bind(() => this.cmd(s => s.plate(s.state.focus)));
        }
    }

    private renderCook(sh: Shift): void {
        const ctx = this.ctx!;
        const cfg = ctx.config;
        const st = sh.state;
        const pot = st.pots[st.focus];
        const r = sh.recipe(pot.recipeId);
        const g = cfg.balance.gates;
        const h = potHint(sh, st.focus, this.ingName);
        setText(this.cookTitle, r?.name ?? (pot.phase === 'washing' ? '洗锅中' : '空锅 · 挑一道粥'));
        setText(this.cookRight, `${bigNum(st.focus + 1)}号锅${r ? ` · ${SEASON_WORD[r.seasoning]}` : ''}`);
        setText(this.cookStatus, h.text);
        if (this.cookStatus) this.cookStatus.color = h.urgent ? PALETTE.burnt : PALETTE.ink;
        const cooking = isCooking(pot);
        setActive(this.cookBar?.node, cooking);
        setActive(this.cookRow, cooking);
        setActive(this.stirBar?.node, cooking);
        setActive(this.scorchBar?.node, cooking);
        setActive(this.cookRecipes, pot.phase === 'empty');
        setText(this.cookPercent, cooking ? `${Math.round(pot.doneness * 100)}%` : '');
        if (pot.phase === 'empty') {
            this.fillRecipeButtons(sh, this.cookRecipes);
            setText(this.cookTip, st.phase === 'prep' ? '开门迎客后才能下锅。' : '挑一道街坊在等的粥，下锅慢慢熬。');
            return;
        }
        if (!cooking || !r) { setText(this.cookTip, ''); return; }
        this.paintDoneness(this.cookBar, this.cookMid, pot, r, g.serveMin, g.serveMax);
        const warn = sh.warnLine(r.id);
        this.stirBar?.set(pot.stir, pot.stir < warn ? PALETTE.warn : PALETTE.good, pot.stir < warn ? '该搅了' : '搅得匀');
        this.scorchBar?.set(pot.scorch / g.burn, pot.scorch > 0.7 ? PALETTE.burnt : PALETTE.warn, pot.scorch > 0.7 ? '快糊了' : '锅底');
        this.lowButton?.setSelected(pot.heat === 'low');
        this.midButton?.setSelected(pot.heat === 'mid');
        this.highButton?.setSelected(pot.heat === 'high');
        const live = pot.phase !== 'burnt';
        this.stirButton?.setEnabled(live && !sh.busy);
        // 加料按钮：下一样该加的；没有了就隐藏
        const next = live ? nextAdd(pot, r) : null;
        const seasonNow = (pot.phase === 'window' || pot.phase === 'over') && !pot.seasoning;
        setActive(this.seasonRow, seasonNow);
        setActive(this.addButton?.node, !!next && !seasonNow);
        if (next && this.addButton) {
            const usable = st.setup.practice || sh.pantry.usable(next.id) > 0;
            const near = pot.doneness >= next.atDoneness - sh.addTolerance(r.id);
            this.addButton.setText(`加入${this.ingName(next.id)}`).setEnabled(usable && near).setSelected(near)
                .bind(() => this.cmd(s => s.addIngredient(s.state.focus, next.id)));
        }
        this.plateButton?.setText(pot.phase === 'burnt' ? '糊着上桌' : '盛碗')
            .setEnabled(!sh.busy && st.pass.length < cfg.balance.session.passCapacity && (pot.phase !== 'cooking' || st.setup.practice));
        setActive(this.dumpButton?.node, pot.phase === 'burnt' || pot.phase === 'over');
        const tip = pot.phase === 'cooking' ? (next ? `熟度到 ${Math.round(next.atDoneness * 100)}% 左右加${this.ingName(next.id)}，太早太晚都会扣分。` : '汤色进了绿色区间就能盛碗。')
            : pot.phase === 'window' ? (pot.seasoning ? `已调${SEASON_WORD[pot.seasoning]}。趁现在盛碗。` : `这碗要${SEASON_WORD[r.seasoning]}，调好味再盛。`)
            : pot.phase === 'over' ? '过火了，越晚越差，赶紧盛出来。' : '糊了：可以糊着上桌（不到半价），或者倒掉洗锅。';
        setText(this.cookTip, tip);
    }

    private paintDoneness(bar: UiBar | null, mid: Label | null, pot: PotState, r: Recipe, lo: number, hi: number): void {
        if (!bar) return;
        bar.set(pot.doneness, pot.phase === 'over' || pot.phase === 'burnt' ? PALETTE.burnt : DONE_FILL);
        bar.band(lo, hi);
        bar.mark(pot.doneness);
        if (mid) {
            const w = bar.node.getComponent(UITransform)?.width ?? 0;
            mid.node.setPosition(bar.node.position.x + w * ((lo + hi) / 2 - 0.5), mid.node.position.y);
        }
        void r;
    }

    private fillRecipeButtons(sh: Shift, list: Node | null, cap = 99): void {
        const cfg = this.ctx!.config;
        const st = sh.state;
        const waitingFor = (id: string) => sh.waitingOrders.filter(o => o.recipeId === id).length;
        // 位置有限时，先放街坊在等的粥
        const recipes = st.setup.recipes.map(id => cfg.recipe.get(id)!)
            .map((r, i) => ({ r, i, w: waitingFor(r.id) }))
            .sort((a, b) => (cap < st.setup.recipes.length ? b.w - a.w : 0) || a.i - b.i)
            .slice(0, cap).map(x => x.r);
        const btns = syncList(list, this.buttonPrefab, recipes.length, UiButton);
        recipes.forEach((rc, i) => {
            const miss = baseIngredients(rc).filter(b => !st.setup.practice && sh.pantry.usable(b.id) < b.count);
            const waiting = sh.waitingOrders.filter(o => o.recipeId === rc.id).length;
            const sub = miss.length
                ? miss.map(b => `${this.ingName(b.id)}${sh.pantry.total(b.id) ? '未处理' : '缺'}`).join(' ')
                : `${HEAT_WORD[rc.heatHint]}${waiting ? ` · ${waiting} 人在等` : ''}`;
            btns[i].setText(rc.name, sub).setEnabled(!miss.length && st.phase !== 'prep').setSelected(waiting > 0)
                .bind(() => this.cmd(s => s.startCooking(st.focus, rc.id)));
        });
    }

    private renderPass(sh: Shift): void {
        const cfg = this.ctx!.config;
        const st = sh.state;
        const cap = cfg.balance.session.passCapacity;
        const slots = syncList(this.passList, this.passSlotPrefab, Math.max(cap, st.pass.length), PassSlot);
        slots.forEach((slot, i) => {
            const b = st.pass[i];
            if (!b) { slot.showEmpty(); return; }
            const r = cfg.recipe.get(b.recipeId)!;
            const cooling = b.held > cfg.balance.score.coolStartSeconds + st.setup.holdBonus;
            const hasTaker = sh.waitingOrders.some(o => o.recipeId === b.recipeId);
            slot.render(r.name, r.color, RESULT_WORD[b.quality.result], sh.bowlScore(b), cooling, hasTaker, () => {
                if (st.setup.practice) { sh.discardBowl(b.id); return; }
                this.cmd(s => s.deliverBest(b.id));
            });
        });
    }

    private renderOrders(sh: Shift): void {
        const cfg = this.ctx!.config;
        const st = sh.state;
        const orders = [...sh.waitingOrders].sort((a, b) => a.patienceLeft - b.patienceLeft).slice(0, 4);
        setText(this.ordersCount, String(sh.waitingOrders.length).padStart(2, '0'));
        setActive(this.ordersEmpty, !orders.length);
        const rows = syncList(this.orderList, this.orderRowPrefab, orders.length, OrderRow);
        // 正在熬的锅按开锅顺序对应等待最久的同粥订单，只作提示
        const cooking = new Map<string, number>();
        for (const p of st.pots) if (p.recipeId && p.phase !== 'washing') cooking.set(p.recipeId, (cooking.get(p.recipeId) ?? 0) + 1);
        const seen = new Map<string, number>();
        orders.forEach((o, i) => {
            const g = st.guests[o.guestId];
            const c = cfg.customer.get(g.customerId)!;
            const r = cfg.recipe.get(o.recipeId)!;
            const bowl = st.pass.find(b => b.recipeId === o.recipeId);
            const n = seen.get(o.recipeId) ?? 0;
            seen.set(o.recipeId, n + 1);
            const tag = bowl ? '可以送了' : n < (cooking.get(o.recipeId) ?? 0) ? '在做' : '';
            rows[i].render(c.name, CUSTOMER_LOOK[c.id] ?? CUSTOMER_LOOK.C01, `${r.name} · ${SEASON_WORD[r.seasoning]}`,
                `“${CUSTOMER_LINE[c.id] ?? '来一碗。'}”`, o.patienceLeft, o.patienceMax, tag, !!bowl,
                () => {
                    if (bowl) { this.cmd(s => s.deliver(bowl.id, o.id)); return; }
                    // 没有现成的碗：找正在熬这道粥的锅，没有就找空锅
                    const pi = st.pots.findIndex(p => p.recipeId === o.recipeId);
                    const ei = st.pots.findIndex(p => p.phase === 'empty');
                    const target = pi >= 0 ? pi : ei;
                    if (target >= 0) { sh.setFocus(target); this.ctx!.setView('cook'); }
                });
        });
        // 「好粥值得等一会儿」跟在最后一张单子下面
        const foot = this.ordersFoot?.node.parent;
        if (foot) { foot.active = orders.length > 0; foot.setPosition(foot.position.x, -34 - orders.length * 92 - 8); }
        const waitingLong = sh.waitingOrders.some(o => o.patienceLeft < 15);
        setText(this.ordersFoot, waitingLong ? '有人等急了，先送最着急的' : '好粥值得等一会儿');
    }

    private renderPrep(sh: Shift, cook: boolean): void {
        const cfg = this.ctx!.config;
        const st = sh.state;
        const practice = st.setup.practice;
        const needed = new Set<string>();
        for (const id of st.setup.recipes) for (const i of cfg.recipe.get(id)!.ingredients) needed.add(i.id);
        const ings = practice ? [] : cfg.ingredients.filter(i => needed.has(i.id) && i.prep !== 'none' && sh.pantry.rawCount(i.id) > 0);
        const dirty = st.dirty.map((d, i) => (d ? i : -1)).filter(i => i >= 0);
        const jobs = st.prep.filter(Boolean);
        const show = !cook && (ings.length > 0 || dirty.length > 0 || jobs.length > 0);
        setActive(this.prepCard, show);
        if (!show) return;
        const slots = st.prep.map(j => j ? `${this.ingName(j.ingredientId)} ${Math.ceil(j.left)}秒` : '空').join('  ·  ');
        setText(this.prepLabel, `备料台  ${slots}`);
        const btns = syncList(this.prepList, this.buttonPrefab, Math.min(4, ings.length), UiButton);
        ings.slice(0, 4).forEach((ing, i) => {
            const verb = { wash: '洗', cut: '切', soak: '泡' }[ing.prep as 'wash' | 'cut' | 'soak'];
            btns[i].setText(`${verb}${ing.name}`, `生 ${sh.pantry.rawCount(ing.id)} · 好 ${sh.pantry.usable(ing.id)}`)
                .setEnabled(st.prep.some(x => !x) && (ing.prep === 'soak' || !sh.busy)).setSelected(false)
                .bind(() => this.cmd(s => s.prepIngredient(ing.id)));
        });
        const card = this.prepCard?.getComponent(UITransform);
        const h = dirty.length ? 118 : 80;
        if (card && card.height !== h) card.height = h;
        setActive(this.prepList, ings.length > 0);
        const wipes = syncList(this.wipeList, this.buttonPrefab, Math.min(3, dirty.length), UiButton);
        dirty.slice(0, 3).forEach((seat, i) => wipes[i].setText(`擦 ${seat + 1} 号桌`).setEnabled(!sh.busy).setSelected(false)
            .bind(() => this.cmd(s => s.wipe(seat))));
    }

    private renderHint(sh: Shift, cook: boolean): void {
        const ctx = this.ctx!;
        const st = sh.state;
        const a = st.action;
        setActive(this.actionBar?.node, !!a);
        setActive(this.cancelButton?.node, !!a && a.kind !== 'deliver');
        let text = '';
        if (a) {
            let what = ACTION_WORD[a.kind];
            if (a.kind === 'prep' && a.slot !== undefined) {
                const job = st.prep[a.slot];
                if (job) what = `${{ wash: '洗', cut: '切', soak: '泡' }[job.kind] ?? '处理'}${this.ingName(job.ingredientId)}`;
            }
            if (a.pot !== undefined && a.kind !== 'prep') what = `${bigNum(a.pot + 1)}号锅 · ${what}`;
            text = `${what}…`;
            this.actionBar?.set(1 - a.left / a.total, PALETTE.gold);
        } else {
            // 别的锅出状况，优先提醒（颜色之外必须有文字）
            const other = st.pots.map((_, i) => i).filter(i => i !== st.focus).map(i => ({ i, h: potHint(sh, i, this.ingName) })).find(x => x.h.needs);
            if (other) text = `${bigNum(other.i + 1)}号锅：${other.h.text}`;
            else text = this.tutorial(sh, cook);
        }
        setText(this.hintLabel, text);
        setActive(this.hint, !!text);
        if (this.hint) this.hint.setPosition(this.hint.position.x, cook ? 206 : this.prepCard?.active ? -164 : -262);
        void ctx;
    }

    private tutorial(sh: Shift, cook: boolean): string {
        const flow = this.ctx!.flow;
        const st = sh.state;
        if (st.setup.practice) return cook ? '练习不计铜钱，熬糊了也没关系。' : '点一口锅，凑近看看。';
        if (st.phase === 'prep') return '先把米洗好，再点右下角「开门迎客」。';
        if (st.phase === 'closing') return '打烊了，把最后几碗送完。';
        if (flow.settings.tutorialDone) return cook ? '' : '点一口锅，看看熬得怎么样了';
        const pot = st.pots[st.focus];
        if (pot.phase === 'empty' && !st.pass.length) return cook ? '挑一道粥下锅。' : '点锅上的木牌，凑近下锅。';
        if (st.pass.length) return '点出餐台的碗，送给等这碗的街坊。';
        if (pot.phase === 'cooking') return cook ? '盯着熟度条，到了绿色区间就盛。' : '点一口锅，看看熬得怎么样了';
        return '';
    }
}

function isCooking(pot: PotState): boolean {
    return pot.phase === 'cooking' || pot.phase === 'window' || pot.phase === 'over' || pot.phase === 'burnt';
}
