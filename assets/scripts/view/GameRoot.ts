import {
    _decorator, Camera, Color, Component, DirectionalLight, EventKeyboard, EventTouch, input, Input, instantiate, JsonAsset, KeyCode, Label, Node,
    Prefab, Quat, resources, SphereLight, sys, Vec3, Vec4,
} from 'cc';
import { CONFIG_FILES, ConfigError, GameConfig, parseConfig } from '../core/Config';
import { FlowMode, GameFlow } from '../gameplay/GameFlow';
import { nextAdd } from '../rules/Pot';
import { ShiftEvent } from '../rules/Shift';
import { KeyValueStore, SaveStore } from '../save/SaveModel';
import { SoundBoard } from '../audio/SoundBoard';
import { HudView } from '../ui/HudView';
import { MorningPanel } from '../ui/MorningPanel';
import { PracticePanel } from '../ui/PracticePanel';
import { ReportPanel } from '../ui/ReportPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StoryPanel } from '../ui/StoryPanel';
import { TitlePanel } from '../ui/TitlePanel';
import { GameContext, LightPreset, PanelId, ViewMode } from './GameContext';
import { StoreView } from './StoreView';

const { ccclass, property } = _decorator;

interface PanelComp extends Component { setup(ctx: GameContext): void; refresh(): void }

/**
 * 场景入口（挂在 Store.scene 的 GameRoot 节点上）。
 * 读规则表 → 读档 → 按流程模式切换各面板预制体；3D 铺子由 StoreView 预制体表现。
 * 所有界面都是预制体实例，本脚本只做装配与路由，不在代码里拼 UI。
 */
@ccclass('GameRoot')
export class GameRoot extends Component implements GameContext {
    @property(Node) uiRoot: Node | null = null;
    @property(Node) worldTouch: Node | null = null;
    @property(Node) worldRoot: Node | null = null;
    @property(Camera) mainCamera: Camera | null = null;
    @property(Prefab) storePrefab: Prefab | null = null;
    @property(StoreView) store: StoreView | null = null;
    @property(SoundBoard) sound: SoundBoard | null = null;
    @property(Label) bootLabel: Label | null = null;
    @property(Prefab) titlePrefab: Prefab | null = null;
    @property(Prefab) morningPrefab: Prefab | null = null;
    @property(Prefab) hudPrefab: Prefab | null = null;
    @property(Prefab) reportPrefab: Prefab | null = null;
    @property(Prefab) decorPrefab: Prefab | null = null;
    @property(Prefab) storyPrefab: Prefab | null = null;
    @property(Prefab) settingsPrefab: Prefab | null = null;
    @property(Prefab) practicePrefab: Prefab | null = null;
    @property(Prefab) recipesPrefab: Prefab | null = null;
    @property(Prefab) lightPrefab: Prefab | null = null;
    @property(Prefab) chapterPrefab: Prefab | null = null;
    @property(DirectionalLight) mainLight: DirectionalLight | null = null;

    config!: GameConfig;
    flow!: GameFlow;
    private readonly panels = new Map<PanelId, PanelComp>();
    private readonly overlays = new Set<PanelId>();
    private ready = false;
    private hud: HudView | null = null;
    private readonly baseFont = new Map<Label, number>();
    view: ViewMode = 'shop';
    private readonly shopPos = new Vec3();
    private readonly shopRot = new Quat();
    private readonly camPos = new Vec3();
    private readonly camRot = new Quat();
    private readonly tmpPos = new Vec3();
    private readonly tmpLook = new Vec3();

    // ───────────── 启动 ─────────────

    start(): void {
        this.mountStore();
        this.say('正在读规则表…');
        const raw: Record<string, unknown> = {};
        let left = CONFIG_FILES.length;
        let failed = '';
        for (const f of CONFIG_FILES) {
            resources.load(`data/rules/${f}`, JsonAsset, (err, asset) => {
                if (err || !asset) failed ||= `${f}.json 读取失败：${err?.message ?? '空文件'}`;
                else raw[f] = asset.json;
                if (--left === 0) this.boot(raw, failed);
            });
        }
    }

    /** 铺子的 3D 表现来自 stage/Store 预制体；场景里只放相机、灯和这个挂点。 */
    private mountStore(): void {
        if (this.store || !this.storePrefab) return;
        const node = instantiate(this.storePrefab);
        node.parent = this.worldRoot ?? this.node;
        this.store = node.getComponent(StoreView);
        if (this.store && this.mainCamera) this.store.camera = this.mainCamera;
        if (this.mainCamera) {
            this.mainCamera.node.getPosition(this.shopPos);
            this.mainCamera.node.getRotation(this.shopRot);
        }
    }

    // ───────────── 视角（店铺 / 熬粥特写） ─────────────

    setView(view: ViewMode): void {
        if (this.view === view) return;
        this.view = view;
        this.hud?.refresh();
    }

    /** 每帧把镜头推向目标：店铺全景，或焦点锅的近景（设计稿「熬粥特写」）。 */
    private driveCamera(dt: number): void {
        const cam = this.mainCamera?.node;
        if (!cam) return;
        const sh = this.flow.shift;
        const live = (this.flow.mode === 'shift' || this.flow.mode === 'practice') && !!sh;
        if (!live && this.view !== 'shop') this.view = 'shop';
        if (this.view === 'cook' && live && this.store) {
            const pot = this.store.pots[sh!.state.focus]?.node;
            if (pot) {
                // 锅口上方斜看进锅里；看点压低一些，让锅落在下方操作卡的上面
                pot.getWorldPosition(this.tmpLook);
                this.tmpLook.y += 0.46;
                this.tmpPos.set(this.tmpLook.x - 0.35, this.tmpLook.y + 2.25, this.tmpLook.z + 1.65);
                this.tmpLook.x += 0.15;
                this.tmpLook.y -= 0.5;
                this.tmpLook.z -= 0.05;
                const dir = new Vec3();
                Vec3.subtract(dir, this.tmpLook, this.tmpPos).normalize();
                Quat.fromViewUp(this.camRot, dir.negative(), Vec3.UP);
                this.camPos.set(this.tmpPos);
            }
        } else {
            this.camPos.set(this.shopPos);
            this.camRot.set(this.shopRot);
        }
        const k = this.flow.settings.reduceMotion ? 1 : 1 - Math.exp(-dt * 5);
        const p = cam.position.clone();
        Vec3.lerp(p, p, this.camPos, k);
        const q = cam.rotation.clone();
        Quat.slerp(q, q, this.camRot, k);
        cam.setPosition(p);
        cam.setRotation(q);
    }

    // ───────────── 小店的光 ─────────────

    private applyLight(preset: LightPreset): void {
        const P = {
            warm: { sun: '#FFE0B4', lux: 14000, sky: [0.95, 0.80, 0.62], skyLux: 8000, lamp: '#FFBE74', lampLum: 520, clear: '#172D2E' },
            night: { sun: '#9DB4D6', lux: 6000, sky: [0.50, 0.62, 0.78], skyLux: 4200, lamp: '#FFB060', lampLum: 640, clear: '#0E1D24' },
            morning: { sun: '#FFF7EA', lux: 21000, sky: [0.92, 0.94, 0.93], skyLux: 12000, lamp: '#FFE9CC', lampLum: 220, clear: '#5E7E7C' },
        }[preset] ?? null;
        if (!P) return;
        const hex = (h: string) => { const v = parseInt(h.slice(1), 16); return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, 255); };
        if (this.mainLight) {
            this.mainLight.color = hex(P.sun);
            this.mainLight.illuminance = P.lux;
        }
        try {
            const amb = this.node.scene.globals.ambient;
            amb.skyIllum = P.skyLux;
            (amb as unknown as { skyColor: Vec4 }).skyColor = new Vec4(P.sky[0], P.sky[1], P.sky[2], 1);
        } catch { /* 环境光接口随版本不同，失败时只换主光 */ }
        if (this.mainCamera) this.mainCamera.clearColor = hex(P.clear);
        for (const l of this.store?.node.getComponentsInChildren(SphereLight) ?? []) {
            l.color = hex(P.lamp);
            l.luminance = P.lampLum;
        }
    }

    private boot(raw: Record<string, unknown>, failed: string): void {
        if (failed) { this.say(failed); return; }
        try {
            this.config = parseConfig(raw);
        } catch (e) {
            // 文档 05 §14：校验失败阻止进入铺子，并指出文件名和 id
            this.say(e instanceof ConfigError ? `规则表有错，无法开店：\n${e.message}` : `规则表读取异常：${(e as Error).message}`);
            return;
        }
        const kv: KeyValueStore = {
            get: k => { try { return sys.localStorage.getItem(k); } catch { return null; } },
            set: (k, v) => { sys.localStorage.setItem(k, v); },
        };
        this.flow = new GameFlow(this.config, new SaveStore(kv, this.config));
        this.flow.listen({
            onMode: m => this.onMode(m),
            onShiftEvent: e => this.onShiftEvent(e),
            onSaved: msg => { if (msg) this.toast(`没有存档：${msg}`); },
        });
        this.sound?.init(this.config.audio);
        this.flow.boot();
        this.applySettings();
        this.say('');
        this.ready = true;
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
        this.worldTouch?.on(Node.EventType.TOUCH_END, this.onWorldTouch, this);
        this.onMode('title');
    }

    onDestroy(): void {
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
        if (this.ready) this.flow.save();
    }

    private say(text: string): void {
        if (!this.bootLabel) return;
        this.bootLabel.string = text;
        this.bootLabel.node.active = !!text;
    }

    // ───────────── 面板路由 ─────────────

    private prefabFor(id: PanelId): Prefab | null {
        return ({
            title: this.titlePrefab, morning: this.morningPrefab, hud: this.hudPrefab, report: this.reportPrefab,
            decor: this.decorPrefab, story: this.storyPrefab, settings: this.settingsPrefab, practice: this.practicePrefab,
            recipes: this.recipesPrefab, light: this.lightPrefab, chapter: this.chapterPrefab,
        } as Record<PanelId, Prefab | null>)[id];
    }

    private panel(id: PanelId): PanelComp | null {
        let p = this.panels.get(id);
        if (p) return p;
        const prefab = this.prefabFor(id);
        if (!prefab || !this.uiRoot) { this.toast(`缺少界面预制体：${id}`); return null; }
        const node = instantiate(prefab);
        node.parent = this.uiRoot;
        p = node.components.find(c => typeof (c as unknown as PanelComp).setup === 'function') as PanelComp | undefined;
        if (!p) { node.destroy(); this.toast(`界面预制体缺少脚本：${id}`); return null; }
        p.setup(this);
        this.panels.set(id, p);
        if (id === 'hud') this.hud = p as unknown as HudView;
        this.scaleFonts(node);
        return p;
    }

    private show(id: PanelId, on: boolean): void {
        const p = on ? this.panel(id) : this.panels.get(id);
        if (!p) return;
        p.node.active = on;
        if (on) { p.node.setSiblingIndex(this.uiRoot!.children.length - 1); p.refresh(); }
    }

    private onMode(mode: FlowMode): void {
        this.view = 'shop';
        const base: Record<FlowMode, PanelId> = { title: 'title', morning: 'morning', shift: 'hud', practice: 'hud', report: 'report' };
        for (const id of ['title', 'morning', 'hud', 'report'] as PanelId[]) this.show(id, id === base[mode]);
        for (const id of [...this.overlays]) this.close(id);
        // 章节回顾在下，短篇在上：先听故事，关掉后看到七日回顾
        if (mode === 'report' && this.flow.dayReport?.chapter) this.open('chapter');
        if (mode === 'report' && this.flow.dayReport?.story) this.open('story');
        if (mode === 'report' && (this.flow.progress?.state.completedDays ?? 0) >= 3 && !this.flow.settings.tutorialDone) {
            this.flow.settings.tutorialDone = true;
        }
        this.sound?.setMusic(mode === 'shift' || mode === 'practice' ? 'service' : mode === 'title' ? null : 'prep');
        if (mode === 'shift' && this.flow.shift?.phase === 'service') this.play('shop:open');
    }

    open(id: PanelId): void {
        this.overlays.add(id);
        this.show(id, true);
        const sh = this.flow.shift;
        if (id === 'settings' && this.flow.mode === 'shift') this.flow.paused = true;
        if (id === 'decor' && sh && this.flow.mode === 'shift') sh.setReceptionPaused(true);
    }

    close(id: PanelId): void {
        this.overlays.delete(id);
        this.show(id, false);
        if (id === 'settings') this.flow.paused = false;
        if (id === 'decor') this.flow.shift?.setReceptionPaused(false);
        this.refresh();
    }

    refresh(): void {
        for (const [id, p] of this.panels) if (p.node.active && id !== 'hud') p.refresh();
    }

    toast(text: string): void {
        if (this.hud && this.hud.node.active) this.hud.showToast(text);
        else {
            this.say(text);
            this.scheduleOnce(() => this.say(''), 2);
        }
    }

    check(result: string | null): boolean {
        if (result) { this.toast(result); return false; }
        return true;
    }

    play(event: string): void { this.sound?.play(event); }

    applySettings(): void {
        this.sound?.apply(this.flow.settings);
        this.applyLight(this.flow.settings.light ?? 'warm');
        for (const p of this.panels.values()) this.scaleFonts(p.node);
    }

    private scaleFonts(root: Node): void {
        const k = this.flow?.settings.textSize === 'large' ? 1.18 : 1;
        for (const l of root.getComponentsInChildren(Label)) {
            if (!this.baseFont.has(l)) this.baseFont.set(l, l.fontSize);
            const base = this.baseFont.get(l)!;
            l.fontSize = Math.round(base * k);
            l.lineHeight = Math.round(l.fontSize * 1.25);
        }
    }

    // ───────────── 每帧 ─────────────

    update(dt: number): void {
        if (!this.ready) return;
        this.flow.tick(dt);
        const sh = this.flow.mode === 'shift' || this.flow.mode === 'practice' ? this.flow.shift : null;
        this.store?.render(this.config, this.flow.progress, sh, dt);
        this.driveCamera(dt);
        const focus = sh?.state.pots[sh.state.focus];
        this.sound?.setPotLoop(focus && focus.phase !== 'empty' && focus.phase !== 'washing' && !this.flow.paused ? focus.heat : null);
    }

    private onShiftEvent(e: ShiftEvent): void {
        switch (e.type) {
            case 'pot:window': this.play('pot:window'); break;
            case 'pot:scorch': this.play('pot:scorch'); break;
            case 'pot:burnt': this.play('pot:scorch'); this.toast(`${e.pot + 1} 号锅糊了`); break;
            case 'pot:washed': this.play('pot:wash'); break;
            case 'stir': this.play('pot:stir'); break;
            case 'guest:sit': this.play('shop:sit'); break;
            case 'guest:leave': if (e.reason !== 'served' && e.reason !== 'closed') this.play('shop:leave'); break;
            case 'delivered': this.play('shop:coin'); this.toast(`${e.score} 分 · +${e.revenue}${e.tip ? ` 小费 ${e.tip}` : ''}`); break;
            case 'wiped': this.play('shop:wipe'); break;
            case 'phase':
                if (e.phase === 'service') { this.play('shop:open'); this.sound?.setMusic('service'); }
                if (e.phase === 'closing') { this.play('shop:close'); this.toast('打烊了，把最后几单送完'); }
                break;
            case 'reject': this.toast(e.reason); break;
            default: break;
        }
    }

    // ───────────── 输入（文档 22 §3） ─────────────

    private onWorldTouch(e: EventTouch): void {
        const sh = this.flow.shift;
        if (!sh || !this.store) return;
        const loc = e.getLocation();
        const hit = this.store.pick(loc.x, loc.y);
        if (!hit) return;
        if (hit.kind === 'pot' && hit.index < sh.state.pots.length) {
            // 再点一次正在照看的锅就凑近看
            if (sh.state.focus === hit.index) this.setView('cook');
            sh.setFocus(hit.index);
        }
        if (hit.kind === 'seat') this.check(sh.wipe(hit.index));
    }

    private onKey(e: EventKeyboard): void {
        const sh = this.flow.shift;
        if (!sh || (this.flow.mode !== 'shift' && this.flow.mode !== 'practice') || this.overlays.size) return;
        const f = sh.state.focus;
        const pot = sh.state.pots[f];
        switch (e.keyCode) {
            case KeyCode.DIGIT_1: this.check(sh.setHeat(f, 'low')); break;
            case KeyCode.DIGIT_2: this.check(sh.setHeat(f, 'mid')); break;
            case KeyCode.DIGIT_3: this.check(sh.setHeat(f, 'high')); break;
            case KeyCode.SPACE: this.check(sh.stir(f)); break;
            case KeyCode.TAB: sh.setFocus((f + 1) % sh.state.pots.length); break;
            case KeyCode.KEY_F: {
                const next = nextAdd(pot, sh.recipe(pot.recipeId));
                if (next) this.check(sh.addIngredient(f, next.id));
                break;
            }
            case KeyCode.KEY_E: this.check(sh.plate(f)); break;
            case KeyCode.KEY_D: if (sh.state.pass[0]) this.check(sh.deliverBest(sh.state.pass[0].id)); break;
            case KeyCode.KEY_C: this.setView(this.view === 'cook' ? 'shop' : 'cook'); break;
            case KeyCode.ESCAPE: if (this.view === 'cook') this.setView('shop'); else this.open('settings'); break;
            default: return;
        }
        this.flow.flushEvents();
    }
}
