import {
    _decorator, Camera, Canvas, Color, Component, director, EventKeyboard, EventMouse, Graphics, input, Input,
    JsonAsset, KeyCode, Label, Layers, Node, Prefab, instantiate, ResolutionPolicy, resources,
    screen, UITransform, Vec3, view,
} from 'cc';
import { DEBUG } from 'cc/env';
import { Balance, parseBalance } from '../core/Balance';
import { activeActivity, Catalog, parseCatalog } from '../rules/Catalog';
import { DeskSave, parseDesk } from '../rules/DeskSave';
import { upgradeOfferLine } from '../rules/UpgradeOffer';
import { heatWord, PotReadout, seasonWord, StoveDesk } from '../rules/StoveDesk';
import { CookResult, PotSim } from '../rules/PotSim';
import { atmosphereWords, chapterCloseLine, planForDay, ServiceDay, ServiceOrder, waveWord } from '../rules/ServiceDay';
import { readDebugOverrides } from '../debug/DebugOverrides';
import { PlaySession } from '../gameplay/PlaySession';
import { pickStation, Station } from '../input/StationRay';
import { SaveService, memoryDb, openIndexedDb } from '../save/SaveService';
import { emptySave, parseSaveText, SaveFile } from '../save/SaveDocument';
import { LiveAudio } from '../audio/LiveAudio';
import { CodexPanel } from './CodexPanel';
import { DayReportPanel } from './DayReportPanel';
import { DecorPanelView } from './DecorPanelView';
import { MenuPanel } from './MenuPanel';
import { PracticePanel } from './PracticePanel';
import { PlayHud } from './PlayHud';
import { ProgressPanel } from './ProgressPanel';
import { RecipePrepPanel } from './RecipePrepPanel';
import { SettingsPanel } from './SettingsPanel';
import { ShopPanel } from './ShopPanel';
import { downloadSharePicture } from './ShareCard';
import { BURNER_FOCUS, StoreStage } from './StoreStage';
import { StoryPanel } from './StoryPanel';
import { defaultLocalSettings, loadLocalSettings, LocalSettings, saveLocalSettings, VOLUME_WORDS } from '../audio/LocalSettings';
import { Campaign } from '../core/Campaign';
import { Order, ShiftModel } from '../simulation/ShiftModel';

const { ccclass } = _decorator;
const RECIPE_PAGES = [
    ['R01', 'R02', 'R03', 'R04', 'R07'],
    ['R05', 'R06', 'R08', 'R09', 'R10'],
    ['R11', 'R12'],
];
@ccclass('GameEntry')
export class GameEntry extends Component {
    private balance: Balance | null = null;
    private catalog: Catalog | null = null;
    private stove: StoveDesk | null = null;
    private service: ServiceDay | null = null;
    private serviceTitle: Label | null = null;
    private selectedServiceOrder = '';
    private dayReported = false;
    private prepStock: Label | null = null;
    private potWarn: Label | null = null;
    private readonly uiBlockers: Node[] = [];
    private saves: SaveService | null = null;
    private session: PlaySession | null = null;
    private camera: Camera | null = null;
    private status: Label | null = null;
    private header: Label | null = null;
    private hint: Label | null = null;
    private stationState: Label | null = null;
    private nextStep: Label | null = null;
    private dayProgress: Label | null = null;
    private cookMeterNode: Node | null = null;
    private cookMeter: Graphics | null = null;
    private cookMeterLabel: Label | null = null;
    private recipeGuide: Label | null = null;
    private quickCookButton: Node | null = null;
    private quickCookLabel: Label | null = null;
    private orderLabels: Label[] = [];
    private orderRows: Graphics[] = [];
    private orderBars: Graphics[] = [];
    private store: StoreStage | null = null;
    private readonly heardShop = new Set<string>();
    private specialPanel: Node | null = null;
    private specialTitle: Label | null = null;
    private specialProgress: Label | null = null;
    private specialButtons: Node[] = [];
    private specialButtonLabels: Label[] = [];
    private endPanel: Node | null = null;
    private reportTitle: Label | null = null;
    private endSummary: Label | null = null;
    private nextUnlock: Label | null = null;
    private upgradeList: Label | null = null;
    private upgradeButtons: Node[] = [];
    private upgradeButtonLabels: Label[] = [];
    private saveNotice = '';
    private paused = false;
    private saveBlocked = false;
    private saveSeconds = 0;
    private saveSerial = 0;
    private completedDays = 0;
    private lessonFirst = 0;
    private lessonSecond = false;
    private lessonReplay = false;
    private saveChain: Promise<void> = Promise.resolve();
    private readonly ownedUpgrades = new Set<string>();
    private readonly storyDays = new Map<string, number>();
    private readonly seenRecipes = new Set<string>();
    private readonly skillPoints = new Map<string, number>();
    private readonly seenCustomers = new Set<string>();
    private readonly dayResults = new Map<number, { arrived: number; served: number; revenue: number; featuredServed: boolean }>();
    private readonly ownedDecor = new Set<string>();
    private activeLight = '';
    private readonly liveAudio = new LiveAudio();
    private stationMarkers: Array<{ node: Node; label: Label }> = [];
    private selectedOrder = '';
    private selectedStation: Station | '' = '';
    private uiRoot: Node | null = null;
    private prepControls: Node | null = null;
    private serviceControls: Node | null = null;
    private settingsPanel: Node | null = null;
    private settingsView: SettingsPanel | null = null;
    private localSettings: LocalSettings = defaultLocalSettings();
    private textScale = 1;
    private readonly baseFonts = new Map<Label, number>();
    private readonly recipeButtons: Array<{ id: string; node: Node; label: Label; graphics: Graphics; width: number }> = [];
    private recipePage = 0;
    private shopPanel: Node | null = null;
    private recipePrepPanel: Node | null = null;
    private recipePrepSummary: Label | null = null;
    private readonly recipePrepButtons: Array<{ id: string; label: Label }> = [];
    private recipePrepWasPaused = false;
    private decorPanel: Node | null = null;
    private decorWasPaused = false;
    private decorSummary: Label | null = null;
    private readonly decorButtons: Array<{ id: string; label: Label }> = [];
    private shopWasPaused = false;
    private upgradeShopPanel: Node | null = null;
    private readonly upgradeShopButtons: Array<{ id: string; label: Label; graphics: Graphics }> = [];
    private menuPanel: Node | null = null;
    private progressPanel: Node | null = null;
    private progressTitle: Label | null = null;
    private progressSummary: Label | null = null;
    private readonly progressRows: Label[] = [];
    private progressPage = 0;
    private progressPrev: Node | null = null;
    private progressNext: Node | null = null;
    private storyPanel: Node | null = null;
    private storySummary: Label | null = null;
    private readonly storyRows: Label[] = [];
    private codexPanel: Node | null = null;
    private practicePanel: Node | null = null;
    private practiceReadout: Label | null = null;
    private practiceMessage: Label | null = null;
    private readonly practiceRecipeButtons: Label[] = [];
    private practicePage = 0;
    private practicePot: PotSim | null = null;
    private practiceWasPaused = false;
    private codexSummary: Label | null = null;
    private readonly codexRecipeRows: Label[] = [];
    private readonly codexCustomerRows: Label[] = [];
    private menuWasPaused = false;
    private reportNext: Node | null = null;
    private reportNextLabel: Label | null = null;
    private orientationNotice: HTMLDivElement | null = null;

    private get model() { return this.session?.model ?? null; }
    private get campaign() { return this.session?.campaign ?? null; }

    start(): void {
        resources.loadDir('data/rules', JsonAsset, (ruleError, ruleAssets) => {
            if (ruleError || !ruleAssets?.length) {
                this.showFatal(`读取规则失败：${ruleError?.message || '规则目录不存在'}`);
                return;
            }
            const files: Record<string, unknown> = {};
            for (const asset of ruleAssets) files[`${asset.name}.json`] = asset.json;
            try { this.catalog = parseCatalog(files); }
            catch (cause) { this.showFatal(cause instanceof Error ? cause.message : String(cause)); return; }
            resources.load('data/balance', JsonAsset, (error, asset) => {
                if (error || !asset) { this.showFatal(`读取营业数据失败：${error?.message || '资源不存在'}`); return; }
                void this.boot(asset.json);
            });
        });
    }

    private async boot(raw: unknown): Promise<void> {
        try {
            const balance = parseBalance(raw);
            this.balance = balance;
            const db = await openIndexedDb().catch(() => memoryDb());
            this.saves = new SaveService(db);
            const loaded = await this.saves.load(balance);
            if (loaded.warning) this.saveNotice = loaded.warning;
            if (loaded.blocked) this.saveBlocked = true;
            if (!this.catalog) throw new Error('规则表还没有读入');
            this.liveAudio.load(this.catalog.audio);
            const resumed = this.saveBlocked ? null : this.resumeDesk(loaded.file);
            if (resumed) {
                this.completedDays = resumed.completedDays;
                this.lessonFirst = resumed.lessons.first;
                this.lessonSecond = resumed.lessons.second;
                this.lessonReplay = resumed.lessons.replay;
                this.ownedUpgrades.clear();
                for (const id of resumed.upgrades) this.ownedUpgrades.add(id);
                this.storyDays.clear();
                for (const [id, day] of Object.entries(resumed.storyDays || {})) this.storyDays.set(id, day);
                this.skillPoints.clear();
                for (const [id, points] of Object.entries(resumed.skills || {})) this.skillPoints.set(id, points);
                this.seenRecipes.clear();
                this.seenCustomers.clear();
                for (const id of resumed.codex?.recipes || []) if ((this.skillPoints.get(id) || 0) >= 2) this.seenRecipes.add(id);
                for (const id of resumed.codex?.customers || []) this.seenCustomers.add(id);
                this.dayResults.clear();
                for (const row of resumed.dayResults || []) this.dayResults.set(row.day, { arrived: row.arrived, served: row.served, revenue: row.revenue, featuredServed: row.featuredServed === true });
                this.ownedDecor.clear();
                for (const id of resumed.decor?.owned || []) this.ownedDecor.add(id);
                this.activeLight = resumed.decor?.activeLight || '';
                this.saveSerial = loaded.file?.serial || 0;
                const purse = { amount: resumed.wallet };
                this.stove = StoveDesk.restore(this.catalog, resumed.stove, purse);
                this.applyStoveUpgrades();
                this.service = ServiceDay.restore(this.catalog, resumed.service, purse, (id) => this.canCook(id, resumed.service.day), () => this.emptyHeats(), () => this.stove!.ingredientSpendToday(), this.upgradeEffect('holdScoreSeconds'), this.shopLevel());
                this.paused = true;
                this.dayReported = !!this.service.report;
                this.recordDayResult();
                this.saveNotice = '上次营业已恢复并暂停。打开「菜单」可继续。';
            } else {
                const debug = readDebugOverrides(location.search, DEBUG);
                this.stove = new StoveDesk(this.catalog, this.potCount());
                this.service = this.openDay(debug.day || 1, debug.seed || 1);
            }
            this.buildScene();
            this.buildUi();
            await this.mountHud();
            await this.mountSettingsPanel();
            await this.mountPages();
            this.installOrientationNotice();
            this.watchContext();
            this.refresh();
            this.say(this.saveNotice || `第${this.service.day}日。备料时可开门。今天卖白粥和皮蛋瘦肉粥。`);
            input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
            input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
            document.addEventListener('visibilitychange', this.onVisibilityChange);
            window.addEventListener('blur', this.onBlur);
        } catch (cause) { this.showFatal(cause instanceof Error ? cause.message : String(cause)); }
    }

    update(dt: number): void {
        if (!this.stove || !this.service) return;
        if (this.practicePanel?.active && this.practicePot) {
            this.practicePot.step(Math.min(Math.max(dt, 0), 0.05));
            this.paintPractice();
        }
        const paused = this.paused;
        this.service.advance(dt, paused);
        const plated = this.stove?.advance(dt, paused) ?? [];
        let newVisitor = false;
        for (const order of this.service.orders) {
            if (!this.seenCustomers.has(order.customerId)) { this.seenCustomers.add(order.customerId); newVisitor = true; }
        }
        if (newVisitor) {
            this.persistDesk();
            this.liveAudio.play('shop:sit');
        }
        for (const order of this.service.orders) {
            if ((order.reason === 'impatient' || order.reason === 'sold-out' || order.reason === 'no-seat') && !this.heardShop.has(order.orderId)) {
                this.heardShop.add(order.orderId);
                this.liveAudio.play('shop:leave');
            }
        }
        if (plated.length) this.say(plated[plated.length - 1]);
        let dish = this.stove?.takeServed();
        while (dish) {
            if (this.service?.offer(dish.potId, dish)) this.say(`${dish.potId} 可以送达`);
            else this.say(`${this.catalog?.recipe(dish.recipeId)?.name || '这碗粥'}盛好了，但客人已离开，未计入订单`);
            dish = this.stove?.takeServed();
        }
        this.store?.tick(dt);
        if (this.service?.report && this.stove && !this.dayReported) {
            this.dayReported = true;
            this.completedDays = Math.max(this.completedDays, Math.min(7, this.service.day));
            this.recordDayResult();
            this.stove.owingRent = this.service.report.owingRent;
            const stories = this.catalog?.stories.filter(story => !this.storyDays.has(story.id) && this.service!.storyReady(story)) || [];
            for (const story of stories) {
                this.storyDays.set(story.id, this.service.day);
                if (story.reward) this.ownedDecor.add(story.reward);
            }
            if (stories.length) this.showStore();
            this.liveAudio.play('shop:close');
            this.say(stories.length ? `新熟客故事 ${stories.length} 段，打开菜单查看。` : this.service.reportText().replace(/\n/g, ' '));
            this.persistDesk();
        } else if (!paused && this.service.phase !== 'closed') {
            this.saveSeconds += Math.min(Math.max(dt, 0), 1);
            if (this.saveSeconds >= 30) {
                this.saveSeconds = 0;
                this.persistDesk();
            }
        }
        this.refresh();
    }

    onDestroy(): void {
        this.persistDesk();
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('resize', this.updateOrientationNotice);
        this.orientationNotice?.remove();
        this.orientationNotice = null;
    }

    private onVisibilityChange = () => { if (document.hidden) this.pauseForFocus(); };
    private onBlur = () => this.pauseForFocus();
    private updateOrientationNotice = () => {
        if (this.orientationNotice) this.orientationNotice.style.display = window.innerHeight > window.innerWidth ? 'flex' : 'none';
    };

    private installOrientationNotice(): void {
        if (this.orientationNotice) return;
        const notice = document.createElement('div');
        notice.id = 'batian-orientation-notice';
        notice.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:32px;box-sizing:border-box;background:#241c17;color:#f8ecd9;text-align:center;font-family:system-ui,-apple-system,sans-serif;';
        const title = document.createElement('div');
        title.textContent = '请横屏游玩《粥霸天》';
        title.style.cssText = 'font-size:26px;font-weight:700;line-height:1.4;';
        const detail = document.createElement('div');
        detail.textContent = '旋转手机或扩大窗口，即可看见完整店铺。';
        detail.style.cssText = 'font-size:16px;line-height:1.6;color:#dac7ad;';
        notice.append(title, detail);
        document.body.appendChild(notice);
        this.orientationNotice = notice;
        window.addEventListener('resize', this.updateOrientationNotice);
        this.updateOrientationNotice();
    }
    private pauseForFocus() {
        if (!this.service) return;
        this.persistDesk();
        if (!this.paused && this.service.phase !== 'closed') {
            this.paused = true; this.stove?.resetClock(); this.say('页面失焦，已暂停。打开「菜单」可继续。');
        }
    }

    private resumeDesk(file: SaveFile | null): DeskSave | null {
        if (!file || file.desk == null) return null;
        const parsed = parseDesk(file.desk, this.catalog!);
        if (parsed.ok === false) {
            this.saveBlocked = true;
            this.saveNotice = `${parsed.message}。已停止自动保存，没有覆盖原档。`;
            return null;
        }
        return parsed.desk;
    }

    private emptyHeats(): Array<'low' | 'mid' | 'high'> {
        return this.stove?.readouts().filter(read => read.phase === 'empty').map(read => read.heat) ?? [];
    }

    private canCook(id: string, day = this.service?.day || 1): boolean {
        const recipe = this.catalog?.recipe(id);
        return !!recipe && recipe.unlockDay <= day && !!this.stove?.pantry.canCommit(recipe);
    }

    private captureDesk(): DeskSave | null {
        if (!this.stove || !this.service) return null;
        if (this.service.report) this.completedDays = Math.max(this.completedDays, Math.min(7, this.service.day));
        this.recordDayResult();
        return {
            wallet: this.service.wallet,
            completedDays: this.completedDays,
            upgrades: Array.from(this.ownedUpgrades),
            storyDays: Array.from(this.storyDays).reduce<Record<string, number>>((days, [id, day]) => { days[id] = day; return days; }, {}),
            decor: { owned: Array.from(this.ownedDecor), activeLight: this.activeLight },
            codex: { recipes: Array.from(this.seenRecipes), customers: Array.from(this.seenCustomers) },
            skills: Array.from(this.skillPoints).reduce<Record<string, number>>((all, [id, points]) => { all[id] = points; return all; }, {}),
            dayResults: Array.from(this.dayResults, ([day, result]) => ({ day, ...result })),
            lessons: { first: this.lessonFirst, second: this.lessonSecond, replay: this.lessonReplay },
            stove: this.stove.capture(),
            service: this.service.capture(),
        };
    }

    private persistDesk(): void {
        if (this.saveBlocked || !this.saves || !this.balance || !this.catalog || !this.stove || !this.service) return;
        const saves = this.saves;
        const balance = this.balance;
        const catalog = this.catalog;
        this.saveChain = this.saveChain.then(async () => {
            if (this.saveBlocked) return;
            const raw = this.captureDesk();
            if (!raw) return;
            const parsed = parseDesk(raw, catalog);
            if (parsed.ok === false) { this.saveNotice = parsed.message; this.say(parsed.message); return; }
            const file = emptySave(balance);
            file.wallet = parsed.desk.wallet;
            file.completedDays = parsed.desk.completedDays;
            file.upgrades = parsed.desk.upgrades;
            file.serial = this.saveSerial + 1;
            const rng = parsed.desk.service.rng;
            file.rng = { seed: rng.seed <= 0xffffffff ? rng.seed : 1, step: Math.min(rng.step, 1_000_000_000) };
            file.desk = parsed.desk;
            const result = await saves.write(file, balance);
            if (!result.ok) { this.saveNotice = result.message; this.say(result.message); return; }
            this.saveSerial = file.serial;
        }).catch(() => undefined);
    }

    private buildScene(): void {
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
        this.store = new StoreStage(this.node);
        const cameraNode = director.getScene()?.getChildByName('Main Camera');
        this.camera = cameraNode?.getComponent(Camera) || null;
        if (this.camera) {
            this.camera.node.setPosition(new Vec3(8, 9, 11));
            this.camera.node.lookAt(new Vec3(0, 0.7, 0));
            this.camera.fov = 42;
            this.camera.clearColor = new Color(35, 32, 31);
        }
    }

    private rememberFont(label: Label, size: number): void {
        this.baseFonts.set(label, size);
        label.fontSize = Math.round(size * this.textScale);
        label.lineHeight = Math.round((size + 7) * this.textScale);
    }

    private applyTextScale(): void {
        this.textScale = this.localSettings.largeText ? 1.35 : 1;
        for (const [label, size] of this.baseFonts) this.rememberFont(label, size);
        this.settingsView?.applyTextScale(this.textScale);
    }

    private buildUi(): void {
        this.localSettings = loadLocalSettings(localStorage);
        this.liveAudio.apply(this.localSettings);
        this.textScale = this.localSettings.largeText ? 1.35 : 1;
        this.uiRoot = new Node('Canvas'); this.uiRoot.parent = this.node; this.uiRoot.layer = Layers.Enum.UI_2D;
        this.uiRoot.addComponent(UITransform).setContentSize(1280, 720);
        const canvasComponent = this.uiRoot.addComponent(Canvas);
        const uiCameraNode = new Node('UICamera'); uiCameraNode.parent = this.uiRoot;
        const uiCamera = uiCameraNode.addComponent(Camera);
        uiCamera.projection = Camera.ProjectionType.ORTHO;
        uiCamera.visibility = Layers.Enum.UI_2D;
        uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        uiCamera.priority = 10;
        canvasComponent.cameraComponent = uiCamera;
    }

    private mountHud(): Promise<void> {
        return new Promise(resolve => {
            resources.load('ui/PlayHud', Prefab, (error, prefab) => {
                if (error || !prefab || !this.uiRoot) {
                    this.say(`操作界面预制体还没就绪：${error?.message || '缺少 ui/PlayHud'}`);
                    resolve();
                    return;
                }
                const node = instantiate(prefab);
                const view = node.getComponent(PlayHud);
                view?.bind({
                    onMenu: () => this.toggleMenu(),
                    onOrder: index => this.selectServiceOrder(index),
                    onQuick: () => this.actOnSelectedOrder(),
                    onPrep: index => this.pressPrep(index),
                    onRecipe: index => this.stoveAct(() => this.cookRecipe(this.recipeButtons[index].id)),
                    onAdd: () => this.stoveAct(() => this.stove!.addNext()),
                    onStir: () => this.stoveAct(() => {
                        const stirred = this.stove!.stir();
                        if (stirred.ok) this.liveAudio.play('pot:stir');
                        return stirred;
                    }),
                    onServe: () => this.stoveAct(() => {
                        const phase = this.stove!.readouts()[this.stove!.focusIndex]?.phase;
                        const recipeId = this.stove!.board.pots[this.stove!.focusIndex]?.recipeId;
                        const served = this.stove!.serve();
                        if (served.ok && phase === 'window') {
                            this.markServedFromWindow();
                            this.liveAudio.play('pot:window');
                        }
                        if (served.ok && served.result && recipeId) this.recordCookResult(recipeId, served.result);
                        return served;
                    }),
                    onDeliver: () => this.deliverService(),
                    onBurner: station => this.focusStation(station),
                    onHeat: heat => this.stoveAct(() => {
                        const result = this.stove!.setHeat(heat);
                        if (result.ok && heat === 'mid') this.markMidHeat();
                        return result;
                    }),
                    onDump: () => this.stoveAct(() => {
                        const pot = this.stove!.board.pots[this.stove!.focusIndex];
                        const recipeId = pot?.recipeId;
                        const result = this.stove!.dump();
                        if (result.ok && recipeId) this.recordCookResult(recipeId, 'burnt');
                        return result;
                    }),
                    onPriority: () => this.focusPriorityPot(),
                    onSeason: season => this.stoveAct(() => this.stove!.season(season)),
                    onBowl: bowl => this.stoveAct(() => this.stove!.chooseBowl(bowl)),
                    onRecipePage: () => this.changeRecipePage(),
                });
                node.parent = this.uiRoot;
                this.trackFonts(node);
                this.header = view?.header || null;
                this.potWarn = view?.potWarn || null;
                this.serviceTitle = view?.serviceTitle || null;
                this.hint = view?.hint || null;
                this.stationState = view?.stationState || null;
                this.prepStock = view?.prepStock || null;
                this.status = view?.status || null;
                this.nextStep = view?.nextStep || null;
                this.dayProgress = view?.dayProgress || null;
                this.cookMeterLabel = view?.cookMeterLabel || null;
                this.recipeGuide = view?.recipeGuide || null;
                this.quickCookLabel = view?.quickLabel || null;
                this.quickCookButton = view?.quickButton || null;
                this.prepControls = view?.prepRoot || null;
                this.serviceControls = view?.serviceRoot || null;
                this.cookMeterNode = view?.cookMeter || null;
                this.cookMeter = view?.cookMeterGraphics || null;
                for (const row of view?.orderRowGraphics || []) this.orderRows.push(row);
                for (const label of view?.orderLabels || []) this.orderLabels.push(label);
                for (const bar of view?.orderBars || []) this.orderBars.push(bar);
                view?.markers.forEach((marker, index) => {
                    const text = view.markerLabels[index];
                    if (text) this.stationMarkers.push({ node: marker, label: text });
                });
                RECIPE_PAGES[0].forEach((id, index) => {
                    const slot = view?.recipeButtons[index];
                    const label = view?.recipeLabels[index];
                    const graphics = slot?.getComponent(Graphics);
                    if (slot && label && graphics) this.recipeButtons.push({ id, node: slot, label, graphics, width: 96 });
                });
                for (const blocker of view?.blockers || []) this.shield(blocker);
                resolve();
            });
        });
    }

    private selectServiceOrder(index: number): void {
        const live = this.service?.orders.filter(item => item.state === 'queued' || item.state === 'cooking' || item.state === 'ready')[index];
        if (!live) return;
        this.selectedServiceOrder = live.orderId;
        if (live.potId) this.focusOrderPot(live);
        this.refresh();
    }

    private pressPrep(index: number): void {
        const buys = ['I01', 'I03', 'I04', 'I06', 'I12', '', '', 'I02', 'I05'];
        if (index <= 4 || index === 7 || index === 8) {
            const id = buys[index];
            this.stoveAct(() => this.stove!.buy(id));
            return;
        }
        if (index === 5) this.stoveAct(() => {
            const prepared = this.stove!.prep();
            if (prepared.ok) this.liveAudio.play('shop:wipe');
            return prepared;
        });
        else if (index === 6) this.stoveAct(() => this.stove!.cancelPrep());
        else if (index === 9) this.openShopCatalog();
        else if (index === 10) this.openDecorPanel();
        else if (index === 11) this.openService();
        else if (index === 12) this.openRecipePrep();
        else if (index === 13) this.stoveAct(() => this.prepAvailable());
    }

    private mountSettingsPanel(): Promise<void> {
        return new Promise(resolve => {
            resources.load('ui/SettingsPanel', Prefab, (error, prefab) => {
                if (error || !prefab || !this.uiRoot) {
                    this.say(`设置页预制体还没就绪：${error?.message || '缺少 ui/SettingsPanel'}`);
                    resolve();
                    return;
                }
                const node = instantiate(prefab);
                node.parent = this.uiRoot;
                node.active = false;
                this.settingsPanel = this.shield(node);
                this.settingsView = node.getComponent(SettingsPanel);
                this.settingsView?.bind({
                    onVolume: (key, title) => this.cycleVolume(key, title),
                    onTextSize: () => this.toggleTextSize(),
                    onClose: () => this.closeSettings(),
                });
                this.settingsView?.paint(this.localSettings);
                this.settingsView?.applyTextScale(this.textScale);
                resolve();
            });
        });
    }

    private mountPages(): Promise<void> {
        const pages: Array<[string, (node: Node) => void]> = [
            ['ui/ShopPanel', node => this.attachShop(node)],
            ['ui/RecipePrepPanel', node => this.attachRecipePrep(node)],
            ['ui/DecorPanel', node => this.attachDecor(node)],
            ['ui/MenuPanel', node => this.attachMenu(node)],
            ['ui/ProgressPanel', node => this.attachProgress(node)],
            ['ui/StoryPanel', node => this.attachStory(node)],
            ['ui/CodexPanel', node => this.attachCodex(node)],
            ['ui/PracticePanel', node => this.attachPractice(node)],
            ['ui/DayReportPanel', node => this.attachDayReport(node)],
        ];
        return Promise.all(pages.map(([path, attach]) => this.mountPage(path, attach))).then(() => undefined);
    }

    private mountPage(path: string, attach: (node: Node) => void): Promise<void> {
        return new Promise(resolve => {
            resources.load(path, Prefab, (error, prefab) => {
                if (error || !prefab || !this.uiRoot) {
                    this.say(`${path} 预制体还没就绪：${error?.message || '资源不存在'}`);
                    resolve();
                    return;
                }
                const node = instantiate(prefab);
                node.active = false;
                node.parent = this.uiRoot;
                this.trackFonts(node);
                this.shield(node);
                attach(node);
                resolve();
            });
        });
    }

    private trackFonts(node: Node): void {
        const label = node.getComponent(Label);
        if (label && !this.baseFonts.has(label)) this.rememberFont(label, label.fontSize);
        for (const child of node.children) this.trackFonts(child);
    }

    private attachShop(node: Node): void {
        this.shopPanel = node;
        const view = node.getComponent(ShopPanel);
        view?.slots.forEach((slot, index) => {
            const item = this.catalog?.ingredients[index];
            const label = view.slotLabels[index];
            slot.active = !!item;
            if (item && label) label.string = `${item.name} ${item.buyPrice}铜`;
        });
        view?.bind({
            onBuy: index => {
                const id = this.catalog?.ingredients[index]?.id;
                if (id) this.buyFromCatalog(id);
            },
            onClose: () => this.closeShopCatalog(),
        });
    }

    private attachRecipePrep(node: Node): void {
        this.recipePrepPanel = node;
        const view = node.getComponent(RecipePrepPanel);
        this.recipePrepSummary = view?.summary || null;
        view?.slots.forEach((slot, index) => {
            const recipe = this.catalog?.recipes[index];
            const label = view.slotLabels[index];
            slot.active = !!recipe;
            if (recipe && label) {
                label.string = `${recipe.name} · 备一份`;
                this.recipePrepButtons.push({ id: recipe.id, label });
            }
        });
        view?.bind({
            onBuy: index => {
                const id = this.catalog?.recipes[index]?.id;
                if (id) this.buyRecipePack(id);
            },
            onClose: () => this.closeRecipePrep(),
        });
    }

    private attachDecor(node: Node): void {
        this.decorPanel = node;
        const view = node.getComponent(DecorPanelView);
        this.decorSummary = view?.summary || null;
        const items = this.catalog?.decor.filter(item => item.price > 0) || [];
        view?.slots.forEach((slot, index) => {
            const item = items[index];
            const label = view.slotLabels[index];
            slot.active = !!item;
            if (item && label) {
                label.string = `${item.name} ${item.price}铜`;
                this.decorButtons.push({ id: item.id, label });
            }
        });
        view?.bind({
            onBuy: index => {
                const id = items[index]?.id;
                if (id) this.buyDecor(id);
            },
            onClose: () => this.closeDecorPanel(),
        });
    }

    private attachMenu(node: Node): void {
        this.menuPanel = node;
        node.getComponent(MenuPanel)?.bind({
            onNewDay: () => this.startNewGame(),
            onCodex: () => this.openCodexPanel(),
            onPause: () => this.togglePause(),
            onOverview: () => { this.overview(); this.toggleMenu(); },
            onStory: () => this.openStoryPanel(),
            onReplay: () => this.replayLesson(),
            onSkip: () => this.skipLesson(),
            onExport: () => this.exportSave(),
            onImport: () => void this.importSave(),
            onProgress: () => this.openProgressPanel(),
            onSettings: () => this.openSettings(),
            onPractice: () => this.openPractice(),
            onClose: () => this.toggleMenu(),
        });
    }

    private attachProgress(node: Node): void {
        this.progressPanel = node;
        const view = node.getComponent(ProgressPanel);
        this.progressTitle = view?.titleLabel || null;
        this.progressSummary = view?.summary || null;
        this.progressPrev = view?.prevButton || null;
        this.progressNext = view?.nextButton || null;
        for (const row of view?.rows || []) this.progressRows.push(row);
        view?.bind({
            onPrev: () => { this.progressPage--; this.paintProgressPanel(); },
            onNext: () => { this.progressPage++; this.paintProgressPanel(); },
            onClose: () => this.closeProgressPanel(),
        });
    }

    private attachStory(node: Node): void {
        this.storyPanel = node;
        const view = node.getComponent(StoryPanel);
        this.storySummary = view?.summary || null;
        for (const row of view?.rows || []) this.storyRows.push(row);
        view?.bind(() => this.closeStoryPanel());
    }

    private attachCodex(node: Node): void {
        this.codexPanel = node;
        const view = node.getComponent(CodexPanel);
        this.codexSummary = view?.summary || null;
        for (const row of view?.recipes || []) this.codexRecipeRows.push(row);
        for (const row of view?.customers || []) this.codexCustomerRows.push(row);
        view?.bind(() => this.closeCodexPanel());
    }

    private attachPractice(node: Node): void {
        this.practicePanel = node;
        const view = node.getComponent(PracticePanel);
        this.practiceReadout = view?.readout || null;
        this.practiceMessage = view?.message || null;
        for (const label of view?.recipeLabels || []) this.practiceRecipeButtons.push(label);
        view?.bind({
            onRecipe: index => {
                const id = RECIPE_PAGES[this.practicePage][index];
                if (id) this.startPractice(id);
            },
            onHeat: heat => this.practiceAct(pot => pot.setHeat(heat)),
            onStir: () => this.practiceAct(pot => pot.pressStir()),
            onAdd: () => this.practiceAdd(),
            onSeason: season => this.practiceAct(pot => pot.chooseSeason(season)),
            onServe: () => this.practiceServe(),
            onPrev: () => { this.practicePage = (this.practicePage + RECIPE_PAGES.length - 1) % RECIPE_PAGES.length; this.paintPractice(); },
            onRetry: () => { if (this.practicePot?.recipeId) this.startPractice(this.practicePot.recipeId); },
            onNext: () => { this.practicePage = (this.practicePage + 1) % RECIPE_PAGES.length; this.paintPractice(); },
            onClose: () => this.closePractice(),
        });
    }

    private attachDayReport(node: Node): void {
        this.endPanel = node;
        const view = node.getComponent(DayReportPanel);
        this.reportTitle = view?.titleLabel || null;
        this.endSummary = view?.summary || null;
        this.upgradeList = view?.upgradeList || null;
        this.nextUnlock = view?.nextUnlock || null;
        this.reportNext = view?.nextDayButton || null;
        this.reportNextLabel = view?.nextDayLabel || null;
        this.upgradeShopPanel = view?.upgradeShop || null;
        if (this.upgradeShopPanel) this.shield(this.upgradeShopPanel);
        const upgrades = this.catalog?.upgrades || [];
        view?.upgradeSlots.forEach((slot, index) => {
            const upgrade = upgrades[index];
            const label = view.upgradeLabels[index];
            const graphics = slot.getComponent(Graphics);
            slot.active = !!upgrade;
            if (upgrade && label && graphics) {
                label.string = `${upgrade.name} ${upgrade.price}铜`;
                this.upgradeShopButtons.push({ id: upgrade.id, label, graphics });
            }
        });
        view?.bind({
            onUpgradeShop: () => this.openUpgradeShop(),
            onNextDay: () => this.nextServiceDay(),
            onDecor: () => this.openDecorPanel(),
            onShare: () => this.saveShareCard(),
            onBuyUpgrade: index => {
                const id = this.catalog?.upgrades[index]?.id;
                if (id) this.nextServiceDay(id);
            },
            onCloseUpgradeShop: () => { if (this.upgradeShopPanel) this.upgradeShopPanel.active = false; },
        });
    }

    private cycleVolume(key: 'music' | 'pot' | 'room', title: string): void {
        this.localSettings[key] = (this.localSettings[key] + 1) % VOLUME_WORDS.length;
        const word = VOLUME_WORDS[this.localSettings[key]];
        this.settingsView?.paint(this.localSettings);
        saveLocalSettings(localStorage, this.localSettings);
        this.liveAudio.apply(this.localSettings);
        this.liveAudio.cue(key);
        this.say(`${title}：${word}`);
    }

    private toggleTextSize(): void {
        this.localSettings.largeText = !this.localSettings.largeText;
        this.settingsView?.paint(this.localSettings);
        this.applyTextScale();
        saveLocalSettings(localStorage, this.localSettings);
        this.say(this.localSettings.largeText ? '文字改为大' : '文字改为标准');
    }

    private openSettings(): void {
        if (!this.settingsPanel) {
            this.say('设置页还没加载好');
            return;
        }
        if (this.menuPanel) this.menuPanel.active = false;
        this.settingsPanel.active = true;
        this.settingsPanel.setSiblingIndex(this.settingsPanel.parent!.children.length - 1);
        this.refresh();
    }

    private closeSettings(): void {
        if (this.settingsPanel) this.settingsPanel.active = false;
        if (this.menuPanel) {
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
        this.refresh();
    }

    private openProgressPanel(): void {
        if (!this.progressPanel) return;
        if (this.menuPanel) this.menuPanel.active = false;
        this.progressPage = Math.floor(((this.service?.day || 1) - 1) / 7);
        this.progressPanel.active = true;
        this.progressPanel.setSiblingIndex(this.progressPanel.parent!.children.length - 1);
        this.paintProgressPanel();
    }

    private closeProgressPanel(): void {
        if (this.progressPanel) this.progressPanel.active = false;
        if (this.menuPanel) {
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
    }

    private paintProgressPanel(): void {
        if (!this.catalog || !this.service) return;
        const start = this.progressPage * 7 + 1;
        const end = start + 6;
        const rows = Array.from(this.dayResults).filter(([day]) => day >= start && day <= end);
        const totalStars = rows.reduce((sum, [, row]) => sum + this.starsFor(row), 0);
        const goalsMet = this.goalsMetThrough(end);
        const featuredCount = rows.filter(([, row]) => row.featuredServed).length;
        const nextMilestone = [3, 5, 7].find(count => count > goalsMet);
        const milestoneText = nextMilestone ? `下奖差 ${nextMilestone - goalsMet} 天 +${this.milestoneReward(nextMilestone)} 铜` : '阶段奖励全领';
        if (this.progressTitle) this.progressTitle.string = this.progressPage ? `续篇 · 第${this.progressPage + 1}周（第${start}—${end}日）` : '七日经营进度';
        if (this.progressSummary) this.progressSummary.string = this.dayResults.has(end) ?
            `本周称号 ${this.weekRank(end).name} · 招牌售出 ${featuredCount}/7 · 达标 ${goalsMet}/7 · 星 ${totalStars}/21` :
            `进度 ${rows.length}/7 · 招牌售出 ${featuredCount}/7 · 达标 ${goalsMet}/7 · ${milestoneText}`;
        if (this.progressPrev) this.progressPrev.active = this.progressPage > 0;
        if (this.progressNext) this.progressNext.active = this.progressPage < Math.floor((this.service.day - 1) / 7);
        this.progressRows.forEach((label, index) => {
            const day = start + index;
            const result = this.dayResults.get(day);
            const state = day < this.service!.day ? '已结束' : day === this.service!.day ? '进行中' : '待解锁';
            const names = this.catalog!.recipes.filter(recipe => recipe.unlockDay === day).map(recipe => recipe.name).join('、');
            const featured = this.featuredRecipe(day)?.name || '白粥';
            label.string = result ? `第${day}日 · ${'★'.repeat(this.starsFor(result))}${'☆'.repeat(3 - this.starsFor(result))} · 送达 ${result.served}/${result.arrived} · 营收 ${result.revenue}\n招牌 ${featured} ${result.featuredServed ? '已卖出' : '未卖出'} · 目标 ${result.served}/${this.dayGoal(day)} ${result.served >= this.dayGoal(day) ? '达成' : '未达成'} · 奖励 ${this.dayBonus(day)} 铜${this.service!.day > day ? '已领' : '待领'}` :
                `${state} · 第${day}日 · 招牌 ${featured} · 目标 ${this.dayGoal(day)} 碗 · 来客 ${planForDay(this.catalog!, day, this.shopLevel()).scheduledArrivals} 位${day <= 7 ? ` · 新菜 ${names || '暂无'}` : ''}`;
            label.color = state === '待解锁' ? new Color(158, 149, 137) : new Color(245, 233, 206);
        });
    }

    private recordDayResult(): void {
        const day = this.service?.day || 0;
        if (!this.service?.report || day < 1 || this.dayResults.has(day)) return;
        this.dayResults.set(day, {
            arrived: this.service.arrivedCount,
            served: this.service.orders.filter(order => order.reason === 'served').length,
            revenue: this.service.report.revenue,
            featuredServed: this.featuredSoldToday(),
        });
    }

    private featuredRecipe(day: number) {
        const ids = ['R01', 'R04', 'R05', 'R07', 'R09', 'R11', 'R12'];
        return this.catalog?.recipe(ids[(day - 1) % ids.length]);
    }

    private featuredSoldToday(): boolean {
        const id = this.featuredRecipe(this.service?.day || 1)?.id;
        return !!id && !!this.service?.orders.some(order => order.recipeId === id && order.reason === 'served');
    }

    private starsFor(result: { arrived: number; served: number }): number {
        if (!result.served || !result.arrived) return 0;
        const rate = result.served / result.arrived;
        return rate >= 0.75 ? 3 : rate >= 0.5 ? 2 : 1;
    }

    private dayBonus(day: number): number {
        const result = this.dayResults.get(day);
        return result ? this.starsFor(result) * 5 + this.goalBonus(day) + this.milestoneBonus(day) + (day % 7 === 0 ? this.weekRank(day).bonus : 0) : 0;
    }

    private goalBonus(day: number): number {
        const result = this.dayResults.get(day);
        return result && result.served >= this.dayGoal(day) ? 10 : 0;
    }

    private goalsMetThrough(day: number): number {
        const start = Math.floor((day - 1) / 7) * 7 + 1;
        return Array.from(this.dayResults).filter(([when, row]) => when >= start && when <= day && row.served >= this.dayGoal(when)).length;
    }

    private milestoneReward(count: number): number {
        return count === 3 ? 30 : count === 5 ? 50 : count === 7 ? 100 : 0;
    }

    private milestoneBonus(day: number): number {
        return this.goalBonus(day) ? this.milestoneReward(this.goalsMetThrough(day)) : 0;
    }

    private weekRank(day: number): { name: string; bonus: number } {
        const start = Math.floor((day - 1) / 7) * 7 + 1;
        const stars = Array.from(this.dayResults).filter(([when]) => when >= start && when <= day)
            .reduce((sum, [, row]) => sum + this.starsFor(row), 0);
        const goals = this.goalsMetThrough(day);
        if (stars >= 16 && goals >= 5) return { name: '街坊名店', bonus: 150 };
        if (stars >= 10 && goals >= 3) return { name: '口碑粥铺', bonus: 100 };
        return { name: '起步小店', bonus: 50 };
    }

    private dayGoal(day: number): number {
        const expected = this.catalog ? planForDay(this.catalog, day, this.shopLevel()).scheduledArrivals : 0;
        return Math.ceil(expected / 2);
    }

    private openStoryPanel(): void {
        if (!this.storyPanel) return;
        if (this.menuPanel) this.menuPanel.active = false;
        this.storyPanel.active = true;
        this.storyPanel.setSiblingIndex(this.storyPanel.parent!.children.length - 1);
        this.paintStoryPanel();
    }

    private closeStoryPanel(): void {
        if (this.storyPanel) this.storyPanel.active = false;
        if (this.menuPanel) {
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
    }

    private paintStoryPanel(): void {
        if (!this.catalog) return;
        if (this.storySummary) this.storySummary.string = `已遇见 ${this.storyDays.size}/${this.catalog.stories.length} 段故事`;
        this.storyRows.forEach((label, index) => {
            const story = this.catalog!.stories[index];
            if (!story) return;
            const name = this.catalog!.customer(story.customerId)?.name || '熟客';
            const day = this.storyDays.get(story.id);
            label.string = day ? `${name} · 第${day}日\n${story.lines.join(' ')}` : `${name} · 故事尚未出现`;
            label.color = day ? new Color(245, 233, 206) : new Color(158, 149, 137);
        });
    }

    private openCodexPanel(): void {
        if (!this.codexPanel) return;
        if (this.menuPanel) this.menuPanel.active = false;
        this.codexPanel.active = true;
        this.codexPanel.setSiblingIndex(this.codexPanel.parent!.children.length - 1);
        this.paintCodexPanel();
    }

    private closeCodexPanel(): void {
        if (this.codexPanel) this.codexPanel.active = false;
        if (this.menuPanel) {
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
    }

    private paintCodexPanel(): void {
        if (!this.catalog || !this.service) return;
        if (this.codexSummary) this.codexSummary.string = `刚好出餐 ${this.seenRecipes.size}/${this.catalog.recipes.length} 道 · 见过 ${this.seenCustomers.size}/${this.catalog.customers.length} 类客人`;
        this.codexRecipeRows.forEach((label, index) => {
            const recipe = this.catalog!.recipes[index];
            if (!recipe) return;
            const seen = this.seenRecipes.has(recipe.id);
            const points = this.skillPoints.get(recipe.id) || 0;
            label.string = `${seen ? '✓' : '○'} ${recipe.name} · ${seen ? this.skillLevel(points) : recipe.unlockDay > this.service!.day ? `第${recipe.unlockDay}日开放` : `待刚好出餐 · 熟练${points}`}`;
            label.color = seen ? new Color(245, 233, 206) : new Color(158, 149, 137);
        });
        this.codexCustomerRows.forEach((label, index) => {
            const customer = this.catalog!.customers[index];
            if (!customer) return;
            const seen = this.seenCustomers.has(customer.id);
            label.string = `${seen ? '✓' : '○'} ${customer.name} · ${seen ? '已遇见' : customer.unlockDay > this.service!.day ? `第${customer.unlockDay}日来店` : '尚未遇见'}`;
            label.color = seen ? new Color(245, 233, 206) : new Color(158, 149, 137);
        });
    }

    private skillLevel(points: number): string {
        return points >= 20 ? `拿手 ${points}` : points >= 8 ? `顺手 ${points}` : `入门 ${points}`;
    }

    private recordCookResult(id: string, result: CookResult, practice = false): void {
        const before = this.skillPoints.get(id) || 0;
        const delta = practice ? result === 'perfect' ? 1 : 0 : result === 'perfect' ? 2 : result === 'over' ? 1 : result === 'burnt' ? -1 : 0;
        this.skillPoints.set(id, Math.max(0, Math.min(999, before + delta)));
        if (result === 'perfect' && !practice) this.seenRecipes.add(id);
    }

    private openPractice(): void {
        if (!this.practicePanel || !this.catalog || !this.service) return;
        this.practiceWasPaused = this.paused;
        this.paused = true;
        this.stove?.resetClock();
        if (this.menuPanel) this.menuPanel.active = false;
        this.practicePanel.active = true;
        this.practicePanel.setSiblingIndex(this.practicePanel.parent!.children.length - 1);
        this.practicePage = 0;
        this.startPractice('R01');
    }

    private closePractice(): void {
        if (this.practicePanel) this.practicePanel.active = false;
        this.practicePot = null;
        this.paused = this.practiceWasPaused;
        if (this.menuPanel) {
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
        this.refresh();
    }

    private startPractice(id: string): void {
        const recipe = this.catalog?.recipe(id);
        if (!recipe || recipe.unlockDay > (this.service?.day || 1) || !this.catalog) {
            if (this.practiceMessage) this.practiceMessage.string = `这道粥第${recipe?.unlockDay || '?'}日开放`;
            return;
        }
        this.practicePot = new PotSim('练习锅', this.catalog);
        this.practicePot.masteryPoints = this.skillPoints.get(id) || 0;
        this.practicePot.begin(id);
        if (this.practiceMessage) this.practiceMessage.string = `${recipe.name}开始练习；熟度进绿色区域时调味盛碗`;
        this.paintPractice();
    }

    private practiceAct(action: (pot: PotSim) => { message: string }): void {
        if (!this.practicePanel?.active || !this.practicePot) return;
        const result = action(this.practicePot);
        if (this.practiceMessage) this.practiceMessage.string = result.message;
        this.paintPractice();
    }

    private practiceAdd(): void {
        const pot = this.practicePot;
        const next = pot?.recipe?.adds.find(item => !pot.added.includes(item.id));
        if (!pot || !next) { if (this.practiceMessage) this.practiceMessage.string = '这道粥没有待加的配料'; return; }
        this.practiceAct(current => current.addIngredient(next.id));
    }

    private practiceServe(): void {
        const pot = this.practicePot;
        if (!pot || !pot.recipeId) return;
        const result = pot.serve();
        if (result.ok && result.result) {
            this.recordCookResult(pot.recipeId, result.result, true);
            this.persistDesk();
        }
        if (this.practiceMessage) this.practiceMessage.string = result.ok ? `${result.message}；练习熟练 ${this.skillPoints.get(pot.recipeId) || 0}，可点重来` : result.message;
        this.paintPractice();
    }

    private paintPractice(): void {
        if (!this.practicePanel || !this.practiceReadout || !this.catalog) return;
        RECIPE_PAGES[this.practicePage].forEach((id, index) => {
            const label = this.practiceRecipeButtons[index];
            if (label) label.string = `${this.catalog!.recipe(id)?.name || id}${(this.catalog!.recipe(id)?.unlockDay || 1) > (this.service?.day || 1) ? ' · 未开放' : ''}`;
        });
        this.practiceRecipeButtons.forEach((label, index) => { label.node.parent!.active = !!RECIPE_PAGES[this.practicePage][index]; });
        const pot = this.practicePot;
        if (!pot) { this.practiceReadout.string = '选择菜谱开始练习'; return; }
        const next = pot.recipe?.adds.find(item => !pot.added.includes(item.id));
        const add = next ? `下一步：${this.catalog.ingredient(next.id)?.name || next.id}，熟度 ${Math.round(next.atDoneness * 100)}% 加入` : '配料已经加完';
        this.practiceReadout.string = `${pot.recipe?.name || ''} · ${pot.phase === 'window' ? '可盛碗' : pot.phase === 'burnt' ? '糊锅' : pot.phase === 'plated' ? '已盛碗' : '熬煮中'} · ${heatWord(pot.heat)}\n熟度 ${Math.round(pot.doneness * 100)}% · 焦糊 ${Math.round(pot.scorch * 100)}% · 搅拌 ${Math.round(pot.stir * 100)}%\n${add} · 熟练 ${this.skillLevel(this.skillPoints.get(pot.recipeId) || 0)}`;
    }

    private toggleMenu(): void {
        if (!this.menuPanel) return;
        if (this.menuPanel.active) {
            this.menuPanel.active = false;
            if (!this.menuWasPaused && this.service?.phase !== 'closed') this.paused = false;
        } else {
            this.menuWasPaused = this.paused;
            this.paused = true;
            this.stove?.resetClock();
            this.menuPanel.active = true;
            this.menuPanel.setSiblingIndex(this.menuPanel.parent!.children.length - 1);
        }
        this.refresh();
    }

    private issue(type: 'start' | 'burner' | 'serve' | 'special' | 'action' | 'holdStart' | 'holdEnd' | 'garnish' | 'deliver' | 'pause' | 'resume' | 'end', slot?: number, step?: number): void {
        if (!this.session) return;
        const result = this.session.issue(type, this.selectedOrder, slot, step);
        this.say(result.message);
        this.settleIfEnded();
        if (this.session.consumeSaveRequest()) void this.persist();
        this.refresh();
    }

    private say(message: string): void { if (this.status) this.status.string = message; }
    private overview(): void { if (this.camera) { this.camera.node.setPosition(new Vec3(8, 9, 11)); this.camera.node.lookAt(new Vec3(0, 0.7, 0)); } this.selectedStation = ''; this.refresh(); }

    private legacyFile(balance: Balance): SaveFile | null {
        const campaignText = localStorage.getItem('BaTian_campaign_v1');
        if (!campaignText) return null;
        try {
            const restored = new Campaign(balance, JSON.parse(campaignText));
            const file = PlaySession.start(balance, null).snapshot();
            file.shift = null;
            file.serial = 0;
            const snap = restored.snapshot();
            file.wallet = snap.wallet;
            file.completedDays = snap.completedDays;
            file.upgrades = snap.upgrades;
            file.ledger = snap.settledSessions || [];
            file.codex = snap.codex || file.codex;
            const activeText = localStorage.getItem('BaTian_active_shift_v1');
            if (activeText) {
                const active = JSON.parse(activeText) as { serial: number; shift: unknown };
                const shift = ShiftModel.restore(balance, active.shift, restored.upgrades);
                if (shift.day === restored.nextDay && Number.isInteger(active.serial) && active.serial >= 0) {
                    file.shift = shift.snapshot();
                    file.serial = active.serial;
                    file.wallet = shift.wallet;
                    file.rng = shift.rng.snapshot();
                }
            }
            localStorage.removeItem('BaTian_campaign_v1');
            localStorage.removeItem('BaTian_active_shift_v1');
            return file;
        } catch {
            return null;
        }
    }

    private async persist(): Promise<void> {
        if (!this.session || !this.saves || !this.balance) return;
        const result = await this.saves.write(this.session.snapshot(), this.balance);
        if (!result.ok) { this.saveNotice = result.message; this.say(result.message); }
    }

    private currentDeskFile(): SaveFile | null {
        if (!this.balance || !this.catalog) return null;
        const raw = this.captureDesk();
        if (!raw) return null;
        const parsed = parseDesk(raw, this.catalog);
        if (parsed.ok === false) { this.say(parsed.message); return null; }
        const file = emptySave(this.balance);
        file.wallet = parsed.desk.wallet;
        file.completedDays = parsed.desk.completedDays;
        file.upgrades = parsed.desk.upgrades;
        file.serial = this.saveSerial + 1;
        const rng = parsed.desk.service.rng;
        file.rng = { seed: rng.seed <= 0xffffffff ? rng.seed : 1, step: Math.min(rng.step, 1_000_000_000) };
        file.desk = parsed.desk;
        return file;
    }

    private exportSave(): void {
        const file = this.currentDeskFile();
        const text = this.saveBlocked ? this.saves?.exportText(null) || '' : file ? JSON.stringify(file) : '';
        if (!text) { this.say('当前没有可导出的存档'); return; }
        const blob = new Blob([text], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = 'batian-save.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.say('存档已导出。没有联网账号，不会上传。');
    }

    private importSave(): void {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json,application/json';
        picker.style.display = 'none';
        document.body.appendChild(picker);
        picker.addEventListener('change', () => {
            const file = picker.files?.[0];
            picker.remove();
            if (file) void file.text().then(text => this.importSaveText(text));
        }, { once: true });
        picker.click();
    }

    private async importSaveText(text: string): Promise<void> {
        if (!this.saves || !this.balance || !this.catalog) return;
        const checked = parseSaveText(text, this.balance);
        if (checked.ok === false) { this.say(checked.message); return; }
        if (checked.file.desk == null) { this.say('这份存档没有当前店铺进度'); return; }
        const desk = parseDesk(checked.file.desk, this.catalog);
        if (desk.ok === false) { this.say(desk.message); return; }
        await this.saveChain;
        const result = await this.saves.replace(text, this.balance);
        if (!result.ok || !result.file) { this.say(result.message); return; }
        const loaded = desk.desk;
        this.completedDays = loaded.completedDays;
        this.storyDays.clear();
        for (const [id, day] of Object.entries(loaded.storyDays || {})) this.storyDays.set(id, day);
        this.skillPoints.clear();
        for (const [id, points] of Object.entries(loaded.skills || {})) this.skillPoints.set(id, points);
        this.seenRecipes.clear();
        this.seenCustomers.clear();
        for (const id of loaded.codex?.recipes || []) if ((this.skillPoints.get(id) || 0) >= 2) this.seenRecipes.add(id);
        for (const id of loaded.codex?.customers || []) this.seenCustomers.add(id);
        this.dayResults.clear();
        for (const row of loaded.dayResults || []) this.dayResults.set(row.day, { arrived: row.arrived, served: row.served, revenue: row.revenue, featuredServed: row.featuredServed === true });
        this.ownedDecor.clear();
        for (const id of loaded.decor?.owned || []) this.ownedDecor.add(id);
        this.activeLight = loaded.decor?.activeLight || '';
        this.ownedUpgrades.clear();
        for (const id of loaded.upgrades) this.ownedUpgrades.add(id);
        const purse = { amount: loaded.wallet };
        this.stove = StoveDesk.restore(this.catalog, loaded.stove, purse);
        this.applyStoveUpgrades();
        this.service = ServiceDay.restore(this.catalog, loaded.service, purse, id => this.canCook(id, loaded.service.day), () => this.emptyHeats(), () => this.stove!.ingredientSpendToday(), this.upgradeEffect('holdScoreSeconds'), this.shopLevel());
        this.saveSerial = result.file.serial;
        this.saveBlocked = false;
        this.dayReported = !!this.service.report;
        this.recordDayResult();
        this.selectedServiceOrder = '';
        this.paused = true;
        if (this.menuPanel) this.menuPanel.active = false;
        this.say('存档已导入，游戏已暂停。打开「菜单」可继续。');
        this.refresh();
    }

    private watchContext(): void {
        const canvas = document.querySelector('canvas');
        canvas?.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            if (this.service && !this.paused && this.service.phase !== 'closed') {
                this.paused = true; this.stove?.resetClock();
            }
            this.persistDesk();
            this.say('画面中断，已暂停并保存。如果没有恢复，请刷新页面。');
        });
        canvas?.addEventListener('webglcontextrestored', () => {
            this.say(this.service ? '画面已恢复，仍处于暂停。打开「菜单」可继续。' : '画面未能恢复，请刷新页面。');
        });
    }

    private settleIfEnded(): void {
        if (!this.session?.finishIfEnded()) {
            if (this.model?.ended && this.endPanel) this.endPanel.active = true;
            return;
        }
        void this.persist();
        if (this.endPanel) this.endPanel.active = true;
    }

    private purchaseUpgrade(id: string): void {
        if (!this.session || !this.model?.ended) return;
        const result = this.session.purchase(id);
        if (result.ok) void this.persist();
        this.say(result.message); this.refresh();
    }

    private nextDay(): void {
        if (!this.session || !this.model?.ended) return;
        this.session.nextDay();
        this.selectedOrder = this.model?.orders[0]?.id || '';
        if (this.endPanel) this.endPanel.active = false;
        void this.persist();
        this.overview(); this.say(`第${this.model.day}日。先买米并处理。皮蛋要加料，窗口里调味。`);
    }

    private specialPress(index: number): void {
        const order = this.model?.orders.find(o => o.id === this.selectedOrder);
        if (!order || order.stage !== 'special') return;
        if (this.model!.recipe(order.recipeId).action === 'A2') this.issue('holdEnd');
        else this.issue('action', undefined, index);
    }

    private shield(node: Node): Node {
        this.uiBlockers.push(node);
        return node;
    }

    /** 按钮和面板挡住射线，避免点底栏时误选出餐柜台。 */
    private hitsUi(event: EventMouse): boolean {
        const point = event.getUILocation();
        const size = view.getVisibleSize();
        for (const node of this.uiBlockers) {
            if (!node.activeInHierarchy) continue;
            const transform = node.getComponent(UITransform);
            if (!transform) continue;
            let x = 0;
            let y = 0;
            let current: Node | null = node;
            while (current && current !== this.uiRoot) {
                x += current.position.x;
                y += current.position.y;
                current = current.parent;
            }
            const left = size.width / 2 + x - transform.width * transform.anchorX;
            const bottom = size.height / 2 + y - transform.height * transform.anchorY;
            if (point.x >= left && point.x <= left + transform.width && point.y >= bottom && point.y <= bottom + transform.height) return true;
        }
        return false;
    }

    private onMouseDown(event: EventMouse): void {
        if (!this.camera || this.endPanel?.active || this.specialPanel?.active || this.menuPanel?.active || this.settingsPanel?.active || this.hitsUi(event)) return;
        const point = event.getLocation();
        const ray = this.camera.screenPointToRay(point.x, point.y);
        const station = pickStation(ray.o, ray.d);
        if (station) this.focusStation(station);
    }

    private onKeyDown(event: EventKeyboard): void {
        if (this.endPanel?.active || this.specialPanel?.active || this.menuPanel?.active || this.settingsPanel?.active || this.progressPanel?.active || this.storyPanel?.active || this.codexPanel?.active || this.practicePanel?.active || this.shopPanel?.active || this.recipePrepPanel?.active || this.decorPanel?.active) return;
        if (event.keyCode === KeyCode.DIGIT_1) this.focusStation('BURNER_A');
        else if (event.keyCode === KeyCode.DIGIT_2) this.focusStation('BURNER_B');
        else if (event.keyCode === KeyCode.DIGIT_3) this.focusStation('BURNER_C');
        else if (event.keyCode === KeyCode.DIGIT_4) this.focusStation('BURNER_D');
        else if (event.keyCode === KeyCode.SPACE) this.stoveAct(() => this.stove!.stir());
    }

    private focusStation(station: Station): void {
        if (!this.camera) return;
        const potIndex = ['BURNER_A', 'BURNER_B', 'BURNER_C', 'BURNER_D'].indexOf(station);
        if (potIndex >= this.potCount()) { this.say(`炭火 ${String.fromCharCode(65 + potIndex)} 尚未解锁`); return; }
        if (this.paused && station === 'COUNTER') { this.say('请先继续营业'); return; }
        this.selectedStation = station;
        if (potIndex >= 0) {
            this.stove?.focus(potIndex);
            if (station === 'BURNER_B') this.markSecondPot();
            const read = this.stove?.readouts()[potIndex];
            this.say(read ? `看向炭火${String.fromCharCode(65 + potIndex)}：${read.recipeName || '空锅'}，${read.label}` : '已选中炭火');
        } else if (station === 'COUNTER') this.deliverService();
        else if (station === 'PREP') this.say('用下方的买米和处理');
        else this.say('盛碗后会自己摆盘');
        const potPositions = BURNER_FOCUS;
        const focus = station === 'COUNTER' ? new Vec3(0, 0.7, 1) :
            station === 'PREP' ? new Vec3(-2.5, 0.6, -1.8) :
            station === 'PLATE' ? new Vec3(2.3, 0.6, -1.8) : potPositions[potIndex];
        this.camera.node.setPosition(new Vec3(focus.x + 3.5, 4.2, focus.z + 4.7));
        this.camera.node.lookAt(focus);
        this.refresh();
    }

    private refresh(): void {
        if (!this.service || !this.header) return;
        const day = this.service;
        this.header.string = this.headerText();
        const reportLines = day.report ? day.reportText().split('\n') : null;
        if (this.serviceTitle) this.serviceTitle.string = day.report ? '营业结算' : '今日订单';
        const liveOrders = day.orders.filter(item => item.state === 'queued' || item.state === 'cooking' || item.state === 'ready');
        for (let i = 0; i < this.orderLabels.length; i++) {
            if (reportLines) {
                this.orderLabels[i].string = reportLines[i + 1] || '';
                const row = this.orderRows[i]; row.clear(); row.fillColor = new Color(54, 62, 48, 245); row.roundRect(-136, -41, 272, 82, 12); row.fill();
                const bar = this.orderBars[i]; bar.clear();
                continue;
            }
            const order = liveOrders[i];
            this.orderLabels[i].string = order ? `${order.orderId === this.selectedServiceOrder ? '▶ ' : ''}${this.serviceLine(order)}` : '空位';
            const selected = order?.orderId === this.selectedServiceOrder;
            const urgent = !!order && (order.state === 'ready' || order.patienceLeft < 15);
            const color = !order ? new Color(57, 48, 43, 245) : urgent ? new Color(96, 74, 36, 245) : selected ? new Color(54, 95, 78, 245) : new Color(72, 52, 40, 245);
            const row = this.orderRows[i]; row.clear(); row.fillColor = color; row.roundRect(-136, -41, 272, 82, 12); row.fill();
            const bar = this.orderBars[i]; bar.clear(); bar.fillColor = new Color(39, 34, 32); bar.roundRect(-124, -3.5, 248, 7, 3); bar.fill();
            if (order) {
        const progress = Math.min(1, Math.max(0, order.patienceLeft / order.patience));
                bar.fillColor = order.state === 'ready' ? new Color(221, 161, 68) : order.state === 'cooking' ? new Color(101, 157, 190) : new Color(132, 189, 135);
                bar.roundRect(-124, -3.5, Math.max(2, 248 * progress), 7, 3); bar.fill();
            }
        }
        this.showStore();
        this.refreshMarkers();
        this.refreshWarn();
        this.paintCookMeter();
        if (this.hint) {
            const featured = this.featuredRecipe(day.day)?.name || '白粥';
            const sold = day.report ? !!this.dayResults.get(day.day)?.featuredServed : this.featuredSoldToday();
            const event = activeActivity(this.catalog?.activities || [], day.day);
            this.hint.string = `${event ? event.name : '无活动'}\n招牌 ${featured} · ${sold ? '已卖出' : '待卖出'}`;
        }
        if (this.nextStep) this.nextStep.string = this.nextStepText();
        if (this.dayProgress && this.catalog) {
            const chapter = day.day <= 7 ? `七日篇 ${day.day}/7` : `续篇 第${Math.ceil(day.day / 7)}周 ${(day.day - 1) % 7 + 1}/7`;
            const expected = planForDay(this.catalog, day.day, this.shopLevel()).scheduledArrivals;
            const newRecipes = this.catalog.recipes.filter(recipe => recipe.unlockDay === day.day).map(recipe => recipe.name);
            const arrivals = day.phase === 'prep' ? `今日预计来客 ${expected} 位` : `到店 ${day.arrivedCount}/${expected}`;
            const served = day.orders.filter(order => order.reason === 'served').length;
            const target = ` · 今日目标 ${served}/${this.dayGoal(day.day)}${served >= this.dayGoal(day.day) ? ' 已达成' : ''}`;
            this.dayProgress.string = `${chapter} · ${arrivals}${target}${newRecipes.length ? ` · 新菜 ${newRecipes.join('、')}` : ''}`;
        }
        if (this.prepStock) this.prepStock.string = this.stove?.stockText() || '';
        if (this.stationState) this.stationState.string = this.stoveText();
        if (this.prepControls) this.prepControls.active = day.phase === 'prep' && !day.report;
        if (this.serviceControls) this.serviceControls.active = (day.phase === 'service' || day.phase === 'close') && !day.report;
        if (this.quickCookButton) {
            this.quickCookButton.active = (day.phase === 'service' || day.phase === 'close') && !day.report;
            const order = this.actionableOrder();
            const title = order?.state === 'ready' ? '送达选中订单' : order?.state === 'cooking' ? '查看这口锅' : '选单一键下锅';
            if (this.quickCookLabel) this.quickCookLabel.string = title;
        }
        this.paintRecipeButtons();
        this.paintRecipePrep();
        if (this.specialPanel) this.specialPanel.active = false;
        if (this.endPanel) {
            this.endPanel.active = !!day.report;
            if (day.report && !this.menuPanel?.active && !this.settingsPanel?.active && !this.progressPanel?.active && !this.storyPanel?.active && !this.codexPanel?.active && !this.decorPanel?.active)
                this.endPanel.setSiblingIndex(this.endPanel.parent!.children.length - 1);
        }
        if (day.report && this.endSummary) {
            const report = day.report;
            const closeLine = chapterCloseLine(day.day);
            this.endSummary.string = `第 ${day.day} 日 · 营业结算\n营收 ${report.revenue}    小费 ${report.tips}\n食材 ${report.ingredientCost}    ${day.rentLine()}\n离开 ${report.left} 人    结余 ${report.wallet}\n招牌 ${this.featuredRecipe(day.day)?.name || '白粥'} ${this.dayResults.get(day.day)?.featuredServed ? '已卖出' : '未卖出'} · ${report.owingRent ? '欠租' : '未欠租'}${closeLine ? `\n${closeLine}` : ''}`;
        }
        if (this.reportTitle) {
            const result = this.dayResults.get(day.day);
            const stars = result ? ` · ${'★'.repeat(this.starsFor(result))}${'☆'.repeat(3 - this.starsFor(result))}` : '';
            const goal = result ? ` · 目标${result.served >= this.dayGoal(day.day) ? '达成 +10铜' : '未达成'}` : '';
            this.reportTitle.string = day.day % 7 === 0 && day.report ?
                `${day.day === 7 ? '七日篇' : `第${day.day / 7}周`}完成 · ${this.weekRank(day.day).name}${stars}` : `今日打烊${stars}${goal}`;
        }
        if (this.reportNextLabel) this.reportNextLabel.string = day.day >= 7 ? '继续经营' : '开始下一日';
        if (this.nextUnlock && this.catalog) {
            const tomorrow = day.day + 1;
            const recipes = this.catalog.recipes.filter(recipe => recipe.unlockDay === tomorrow).map(recipe => recipe.name);
            const guests = planForDay(this.catalog, tomorrow, this.shopLevel()).scheduledArrivals;
            const newStories = Array.from(this.storyDays.values()).filter(foundDay => foundDay === day.day).length;
            const storyHint = newStories ? ` · 熟客故事 +${newStories}` : '';
            const start = Math.floor((day.day - 1) / 7) * 7 + 1;
            const totalStars = Array.from(this.dayResults).filter(([when]) => when >= start && when <= day.day)
                .reduce((sum, [, row]) => sum + this.starsFor(row), 0);
            const bonus = this.dayBonus(day.day);
            const milestone = this.milestoneBonus(day.day);
            const milestoneHint = milestone ? `（含阶段奖 ${milestone}）` : '';
            this.nextUnlock.string = !day.report ? '' : day.day % 7 === 0 ?
                `本周总评 ${totalStars}/21 星 · 达标 ${this.goalsMetThrough(day.day)} 天 · 称号奖 ${this.weekRank(day.day).bonus} 铜 · 明日合计 ${bonus} 铜${storyHint}` :
                day.day > 7 ? `明日来客 ${guests} 位 · 本周达标 ${this.goalsMetThrough(day.day)} 天 · 奖励 ${bonus} 铜${milestoneHint}${storyHint}` :
                    `明日新菜：${recipes.join('、') || '暂无'} · 来客 ${guests} 位 · 奖励 ${bonus} 铜${milestoneHint}${storyHint}`;
        }
        if (this.upgradeList) this.upgradeList.string = day.report && this.catalog ? this.upgradeLines(day.wallet) : '';
        this.paintUpgradeShop();
        this.paintDecorPanel();
        this.syncPotAudio();
    }

    private upgradeLines(wallet: number): string {
        const catalog = this.catalog;
        if (!catalog) return '';
        const lines = catalog.upgrades
            .filter(upgrade => !this.ownedUpgrades.has(upgrade.id))
            .map(upgrade => upgradeOfferLine(upgrade, this.ownedUpgrades, this.completedDays, wallet));
        return lines.length ? lines.join('\n') : '升级都已买下';
    }

    private openUpgradeShop(): void {
        if (!this.service?.report || !this.upgradeShopPanel) return;
        this.upgradeShopPanel.active = true;
        this.upgradeShopPanel.setSiblingIndex(this.upgradeShopPanel.parent!.children.length - 1);
    }

    private paintUpgradeShop(): void {
        if (!this.catalog || !this.service) return;
        const wallet = this.service.wallet;
        for (const button of this.upgradeShopButtons) {
            const upgrade = this.catalog.upgrade(button.id);
            if (!upgrade) continue;
            const previous = button.id === 'U02' ? 'U01' : button.id === 'U03' ? 'U02' : '';
            const ready = !this.ownedUpgrades.has(button.id) && (!previous || this.ownedUpgrades.has(previous))
                && this.completedDays >= upgrade.requiredCompletedDays && wallet >= upgrade.price;
            button.label.string = this.ownedUpgrades.has(button.id) ? `${upgrade.name} 已买` : upgradeOfferLine(upgrade, this.ownedUpgrades, this.completedDays, wallet);
            button.label.fontSize = 16;
            button.graphics.clear();
            button.graphics.fillColor = ready ? new Color(168, 106, 52, 245) : new Color(78, 72, 66, 210);
            button.graphics.roundRect(-137.5, -24, 275, 48, 12);
            button.graphics.fill();
        }
    }

    private headerText(): string {
        const day = this.service;
        const catalog = this.catalog;
        if (!day || !catalog) return '';
        const session = catalog.balance.session;
        const phase = day.phase === 'prep' ? '备料' : day.phase === 'service' ? waveWord(day.wave) : day.phase === 'close' ? '打烊' : '已打烊';
        const left = day.phase === 'prep' ? day.prepLeft : day.phase === 'service' ? session.shiftSeconds - day.elapsed : day.phase === 'close' ? day.closeLeft : 0;
        return `粥霸天 · 第${day.day}日   ${phase}   剩余 ${Math.max(0, Math.ceil(left))} 秒   铜钱 ${day.wallet}${this.paused ? '   已暂停' : ''}`;
    }

    private paintRecipeButtons(): void {
        const catalog = this.catalog;
        const pantry = this.stove?.pantry;
        const day = this.service?.day || 1;
        if (!catalog || !pantry) return;
        const page = RECIPE_PAGES[this.recipePage];
        for (let index = 0; index < this.recipeButtons.length; index++) {
            const button = this.recipeButtons[index];
            const id = page[index];
            button.node.active = !!id;
            if (!id) continue;
            button.id = id;
            const recipe = catalog.recipe(button.id);
            if (!recipe) continue;
            const locked = recipe.unlockDay > day;
            const gap = locked ? '' : pantry.gap(recipe);
            const hasOrder = this.service?.orders.some(order => order.state === 'queued' && order.recipeId === id) ?? false;
            const emptyPot = this.stove?.readouts()[this.stove.focusIndex]?.phase === 'empty';
            const ready = !locked && !gap && hasOrder && emptyPot;
            const badge = activeActivity(catalog.activities, day)?.recipeId === id ? '活动 ' : '';
            button.label.string = locked ? `${badge}${recipe.name}\n第${recipe.unlockDay}日` : gap ? `${badge}${recipe.name}\n${gap}` :
                !hasOrder ? `${badge}${recipe.name}\n等订单` : !emptyPot ? `${badge}${recipe.name}\n选空锅` : `${badge}${recipe.name}`;
            this.rememberFont(button.label, ready ? 18 : 15);
            button.label.color = ready ? new Color(255, 236, 204) : new Color(196, 186, 170);
            const graphics = button.graphics;
            graphics.clear();
            graphics.fillColor = ready ? new Color(168, 106, 52, 245) : new Color(78, 72, 66, 210);
            graphics.roundRect(-button.width / 2, -24, button.width, 48, 12);
            graphics.fill();
        }
    }

    private changeRecipePage(): void {
        this.recipePage = (this.recipePage + 1) % RECIPE_PAGES.length;
        this.say(`菜谱第 ${this.recipePage + 1} / ${RECIPE_PAGES.length} 页`);
        this.refresh();
    }

    private cyclePot(): void {
        if (!this.stove) return;
        const next = (this.stove.focusIndex + 1) % this.potCount();
        this.focusStation(`BURNER_${String.fromCharCode(65 + next)}` as Station);
    }

    private potPriority(read: PotReadout): number {
        if (read.phase === 'burnt') return 6;
        if (read.scorchHot) return 5;
        if (read.phase === 'window') return 4;
        if (read.pendingAdd && read.doneness >= read.pendingAt - 0.05) return 3;
        if (read.warn) return 2;
        return read.phase === 'cooking' ? 1 : 0;
    }

    private potAdvice(read: PotReadout): string {
        if (read.phase === 'burnt') return '糊锅了，倒掉并洗锅';
        if (read.scorchHot) return '快糊了，先搅拌并调文火';
        if (read.phase === 'window') return '可以调味并盛碗';
        if (read.pendingAdd && read.doneness >= read.pendingAt - 0.05) return `现在加${read.pendingAdd}`;
        if (read.warn) return '该搅拌了';
        return '正在熬煮';
    }

    private focusPriorityPot(): void {
        const reads = this.stove?.readouts() || [];
        if (!reads.length) return;
        const urgent = [...reads].sort((a, b) => this.potPriority(b) - this.potPriority(a))[0];
        if (this.potPriority(urgent) < 2) { this.cyclePot(); return; }
        if (urgent.index !== this.stove?.focusIndex) this.focusStation(`BURNER_${String.fromCharCode(65 + urgent.index)}` as Station);
        this.say(`炭火 ${String.fromCharCode(65 + urgent.index)}：${this.potAdvice(urgent)}`);
    }

    private openShopCatalog(): void {
        if (!this.shopPanel || this.service?.phase !== 'prep') return;
        this.shopWasPaused = this.paused;
        this.paused = true;
        this.stove?.resetClock();
        this.shopPanel.active = true;
        this.shopPanel.setSiblingIndex(this.shopPanel.parent!.children.length - 1);
        this.refresh();
    }

    private closeShopCatalog(): void {
        if (!this.shopPanel) return;
        this.shopPanel.active = false;
        this.paused = this.shopWasPaused;
        this.refresh();
    }

    private openRecipePrep(): void {
        if (!this.recipePrepPanel || this.service?.phase !== 'prep') return;
        this.recipePrepWasPaused = this.paused;
        this.paused = true;
        this.stove?.resetClock();
        this.recipePrepPanel.active = true;
        this.recipePrepPanel.setSiblingIndex(this.recipePrepPanel.parent!.children.length - 1);
        this.paintRecipePrep();
        this.refresh();
    }

    private closeRecipePrep(): void {
        if (!this.recipePrepPanel) return;
        this.recipePrepPanel.active = false;
        this.paused = this.recipePrepWasPaused;
        this.refresh();
    }

    private paintRecipePrep(): void {
        if (!this.catalog || !this.stove || !this.service) return;
        for (const button of this.recipePrepButtons) {
            const recipe = this.catalog.recipe(button.id);
            if (!recipe) continue;
            button.label.string = recipe.unlockDay > this.service.day ? `${recipe.name} · 第${recipe.unlockDay}日开放` :
                this.stove.pantry.canCommit(recipe) ? `${recipe.name} · 已备好` : `${recipe.name} · 备一份`;
        }
    }

    private buyRecipePack(id: string): void {
        if (!this.recipePrepPanel?.active || !this.catalog || !this.stove || !this.service) return;
        const recipe = this.catalog.recipe(id);
        if (!recipe || recipe.unlockDay > this.service.day) {
            if (this.recipePrepSummary) this.recipePrepSummary.string = `这道粥第${recipe?.unlockDay || '?'}日才开放`;
            return;
        }
        const bought: string[] = [];
        let failure = '';
        for (const need of recipe.ingredients) {
            for (let count = this.stove.pantry.held(need.id); count < need.count; count++) {
                const result = this.stove.buy(need.id);
                if (!result.ok) { failure = result.message; break; }
                bought.push(this.catalog.ingredient(need.id)?.name || need.id);
            }
            if (failure) break;
        }
        const prep = this.prepAvailable(recipe.ingredients.map(need => need.id));
        const message = failure ? `${recipe.name}：${failure}` : bought.length ? `${recipe.name}已补齐：${bought.join('、')}` : `${recipe.name}食材已有库存`;
        if (this.recipePrepSummary) this.recipePrepSummary.string = `${message}。${prep.message}`;
        this.persistDesk();
        this.refresh();
    }

    private prepAvailable(ids?: string[]): { message: string } {
        if (!this.stove) return { message: '没有待处理的食材' };
        const rows = this.stove.pantry.summary().filter(row => !ids || ids.includes(row.id));
        let started = 0;
        for (const row of rows) {
            for (let count = row.ready + row.prepping; count < row.total; count++) {
                if (!this.stove.prep(row.id).ok) break;
                started++;
            }
        }
        if (started) this.liveAudio.play('shop:wipe');
        return { message: started ? `已开始处理 ${started} 份食材` : '没有待处理的食材，或备料位已满' };
    }

    private buyFromCatalog(id: string): void {
        if (!this.shopPanel?.active || !this.stove || this.service?.phase !== 'prep') return;
        this.say(this.stove.buy(id).message);
        this.persistDesk();
        this.refresh();
    }

    private decorAtmosphere(): number {
        if (!this.catalog) return 0;
        const rules = this.catalog.atmosphere;
        const values = { ...rules.base };
        const installed = this.catalog.decor.filter(item => item.id === this.activeLight || (item.price === 0 && this.ownedDecor.has(item.id)));
        const styles = new Set(installed.map(item => item.style));
        for (const item of installed) {
            values.warmth += item.atmosphere.warmth;
            values.clean += item.atmosphere.clean;
            values.aroma += item.atmosphere.aroma;
            values.light += item.atmosphere.light;
        }
        if (styles.size > 2) values.light -= rules.mixLightPenalty;
        return Math.min(100, Math.max(0, values.warmth * rules.weights.warmth + values.clean * rules.weights.clean
            + values.aroma * rules.weights.aroma + values.light * rules.weights.light + values.crowd * rules.weights.crowd));
    }

    private openDecorPanel(): void {
        if (!this.decorPanel || !this.service || (this.service.phase !== 'prep' && !this.service.report)) return;
        this.decorWasPaused = this.paused;
        this.paused = true;
        this.stove?.resetClock();
        this.decorPanel.active = true;
        this.decorPanel.setSiblingIndex(this.decorPanel.parent!.children.length - 1);
        this.paintDecorPanel();
    }

    private closeDecorPanel(): void {
        if (this.decorPanel) this.decorPanel.active = false;
        this.paused = this.decorWasPaused;
        this.refresh();
    }

    private paintDecorPanel(): void {
        if (!this.catalog || !this.service) return;
        const style = this.catalog.decorItem(this.activeLight)?.style;
        const styleName = style === 'warm-wood' ? '暖木' : style === 'night-blue' ? '夜蓝' : style === 'morning-white' ? '晨白' : '未摆灯';
        if (this.decorSummary) this.decorSummary.string = `铜钱 ${this.service.wallet} · 氛围 ${Math.round(this.decorAtmosphere())} · ${styleName} · ${atmosphereWords(this.decorAtmosphere())}`;
        for (const button of this.decorButtons) {
            const item = this.catalog.decorItem(button.id);
            if (!item) continue;
            button.label.string = this.activeLight === item.id ? `${item.name} · 已摆放` :
                this.ownedDecor.has(item.id) ? `${item.name} · 点此摆放` : `${item.name} · ${item.price} 铜钱`;
        }
    }

    private buyDecor(id: string): void {
        if (!this.decorPanel?.active || !this.catalog || !this.service || !this.stove) return;
        const item = this.catalog.decorItem(id);
        if (!item || item.price <= 0) return;
        if (!this.ownedDecor.has(id)) {
            if (this.stove.wallet < item.price) { this.say('铜钱不够'); return; }
            this.stove.wallet -= item.price;
            this.ownedDecor.add(id);
            if (this.service.report) this.service.report.wallet = this.stove.wallet;
        }
        this.activeLight = id;
        this.service.setAtmosphere(this.decorAtmosphere());
        this.showStore();
        this.say(`${item.name}已摆好，店铺氛围 ${Math.round(this.service.atmosphereValue)}`);
        this.persistDesk();
        this.refresh();
    }

    private nextStepText(): string {
        const lesson = this.lessonLine();
        if (lesson) return lesson;
        const day = this.service;
        const stove = this.stove;
        if (!day || !stove) return '';
        if (day.report) return '今日账目已结清，查看结余后开始下一日';
        if (day.phase === 'prep') {
            const stock = stove.pantry.summary();
            const featured = this.featuredRecipe(day.day);
            if (featured && !stove.pantry.canCommit(featured)) {
                const missing = featured.ingredients.filter(need => stove.pantry.held(need.id) < need.count)
                    .map(need => this.catalog?.ingredient(need.id)?.name || need.id);
                if (missing.length) return `今日招牌 ${featured.name}：还缺 ${missing.join('、')}；点「按菜谱备料」可补齐`;
                return `今日招牌 ${featured.name}：食材还需处理，点「处理待备食材」后等完成`;
            }
            const oneRice = stove.pantry.held('I01') === 1;
            const waiting = stock.some(row => row.ready < row.total);
            if (!stock.length) return '点「按菜谱备料」选今天要卖的粥，备好后开门';
            if (oneRice) return waiting ? '只买了一份米。处理完并下锅之后，门口会挂今日售罄。' : '只买了一份米。下锅之后，门口会挂今日售罄。';
            if (waiting) return '点「处理待备食材」并等食材备好，然后开门营业';
            return '食材已备好，点开门营业';
        }
        if (day.orders.some(order => order.state === 'ready')) return '有粥可送达，点送达；收入到日结时入账';
        const reads = stove.readouts();
        const focused = reads[stove.focusIndex];
        const urgent = [...reads].sort((a, b) => this.potPriority(b) - this.potPriority(a))[0];
        if (urgent && urgent.index !== stove.focusIndex && this.potPriority(urgent) >= 2 && this.potPriority(urgent) > this.potPriority(focused))
            return `炭火 ${String.fromCharCode(65 + urgent.index)} ${this.potAdvice(urgent)}；点「待处理锅」切过去`;
        if (focused?.phase === 'window') return `炭火 ${String.fromCharCode(65 + focused.index)} 已到出餐时机，选调味后点盛碗`;
        if (focused?.phase === 'plated') return '这碗正在摆盘，完成后点送达';
        if (focused?.phase === 'cooking') {
            if (focused.scorchHot) return '锅快糊了，先搅拌并调低火候';
            if (focused.pendingAdd) {
                const target = Math.round(focused.pendingAt * 100);
                const current = Math.round(focused.doneness * 100);
                return current >= target - 5 ? `熟度 ${current}%：现在点加料，放入${focused.pendingAdd}（目标 ${target}%）` :
                    `熟度 ${current}%：到 ${target}% 时点加料，放入${focused.pendingAdd}`;
            }
            if (focused.warn) return '锅需要搅拌；留意熟度，到出餐时机再盛碗';
            return `正在熬粥，熟度 ${Math.round(focused.doneness * 100)}%；留意搅拌和出餐时机`;
        }
        if (focused?.phase === 'empty' && day.orders.some(order => order.state === 'queued')) return '有新订单，点同名粥下锅';
        if (stove.readouts().some(read => read.phase === 'window')) return '另一口锅可以出餐，先选中那口锅，再调味盛碗';
        if (stove.readouts().some(read => read.phase === 'cooking')) return '另一口锅正在熬粥，点锅查看熟度与加料时机';
        if (day.orders.some(order => order.state === 'queued')) return '有新订单，点同名粥下锅';
        return day.phase === 'close' ? '等候打烊，日结会自动出现' : '等客人进店；点订单可选择要做的粥';
    }

    private lessonLine(): string {
        const day = this.service;
        const stove = this.stove;
        if (!day || !stove) return '';
        const teaching = this.lessonReplay || day.day === 1;
        const reads = stove.readouts();
        const onStove = reads.some(read => read.phase === 'prep' || read.phase === 'cooking' || read.phase === 'window');
        const needsTimedAdd = reads.some(read => read.pendingAdd && (read.phase === 'prep' || read.phase === 'cooking' || read.phase === 'window'));
        if (teaching && this.lessonFirst === 0 && onStove && !needsTimedAdd) return '点中火。';
        if (teaching && this.lessonFirst === 1 && onStove && !needsTimedAdd) return '看熟度条，进入绿色区域后再盛碗。';
        const ready = day.orders.some(order => order.state === 'ready') || reads.some(read => read.phase === 'plated');
        if (teaching && this.lessonFirst === 2 && ready) return '送到右边那个人。';
        if (!this.lessonSecond && this.ownedUpgrades.has('U01') && this.lessonFirst >= 3) return '没看着的那口会自己变稠，记得回去搅。';
        return '';
    }

    private teachingDay(): boolean {
        return this.lessonReplay || this.service?.day === 1;
    }

    private markMidHeat(): void {
        if (this.teachingDay() && this.lessonFirst === 0) this.lessonFirst = 1;
    }

    private markServedFromWindow(): void {
        if (this.teachingDay() && this.lessonFirst === 1) this.lessonFirst = 2;
    }

    private markDelivered(): void {
        if (!this.teachingDay() || this.lessonFirst !== 2) return;
        this.lessonFirst = 3;
        this.lessonReplay = false;
    }

    private markSecondPot(): void {
        if (!this.ownedUpgrades.has('U01') || this.lessonSecond) return;
        this.lessonSecond = true;
        this.persistDesk();
    }

    private replayLesson(): void {
        this.lessonFirst = 0;
        this.lessonReplay = true;
        this.say('教学从头再看。先下一锅，再点中火。');
        if (this.menuPanel?.active) this.toggleMenu();
        else this.refresh();
        this.persistDesk();
    }

    private startNewGame(): void {
        if (this.saveBlocked || !this.saves || !this.balance || !this.catalog) {
            this.say('现在不能新开一天');
            return;
        }
        const saves = this.saves;
        const balance = this.balance;
        const catalog = this.catalog;
        this.saveChain = this.saveChain.then(async () => {
            if (this.saveBlocked) return;
            await saves.keepPrimary();
            const purse = { amount: catalog.balance.session.initialWallet };
            this.ownedUpgrades.clear();
            this.storyDays.clear();
            this.skillPoints.clear();
            this.seenRecipes.clear();
            this.seenCustomers.clear();
            this.dayResults.clear();
            this.ownedDecor.clear();
            this.activeLight = '';
            this.completedDays = 0;
            this.lessonFirst = 0;
            this.lessonSecond = false;
            this.lessonReplay = false;
            this.dayReported = false;
            this.selectedServiceOrder = '';
            this.paused = false;
            this.stove = new StoveDesk(catalog, this.potCount(), purse);
            this.applyStoveUpgrades();
            this.service = this.openDay(1, Math.max(1, Date.now()));
            if (this.menuPanel) this.menuPanel.active = false;
            this.say('新的一天。铜钱 200，一口锅。先买米并处理。');
            this.refresh();
            const raw = this.captureDesk();
            if (!raw) return;
            const parsed = parseDesk(raw, catalog);
            if (parsed.ok === false) { this.saveNotice = parsed.message; this.say(parsed.message); return; }
            const file = emptySave(balance);
            file.wallet = parsed.desk.wallet;
            file.completedDays = parsed.desk.completedDays;
            file.upgrades = parsed.desk.upgrades;
            file.serial = this.saveSerial + 1;
            const rng = parsed.desk.service.rng;
            file.rng = { seed: rng.seed <= 0xffffffff ? rng.seed : 1, step: Math.min(rng.step, 1_000_000_000) };
            file.desk = parsed.desk;
            const result = await saves.write(file, balance);
            if (!result.ok) { this.saveNotice = result.message; this.say(result.message); return; }
            this.saveSerial = file.serial;
        }).catch(() => undefined);
    }

    private skipLesson(): void {
        this.lessonFirst = 3;
        this.lessonSecond = true;
        this.lessonReplay = false;
        this.say('教学已跳过。菜单里可以重看。');
        if (this.menuPanel?.active) this.toggleMenu();
        else this.refresh();
        this.persistDesk();
    }

    private potCount(): number {
        const catalog = this.catalog;
        if (!catalog) return 1;
        let pots = catalog.balance.session.initialPots;
        for (const upgrade of catalog.upgrades) if (this.ownedUpgrades.has(upgrade.id)) pots += upgrade.effect.pots || 0;
        return Math.min(4, Math.max(1, pots));
    }

    private upgradeEffect(key: string): number {
        if (!this.catalog) return 0;
        return Array.from(this.ownedUpgrades).reduce((sum, id) =>
            sum + (this.catalog!.upgrade(id)?.effect[key] ?? 0), 0);
    }

    private applyStoveUpgrades(): void {
        this.stove?.applyUpgradeEffects(this.upgradeEffect('prepSlots'), this.upgradeEffect('buySlots'));
    }

    private openDay(day: number, seed: number, initialFavor?: Record<string, number>): ServiceDay {
        return new ServiceDay(this.catalog!, {
            day, seed, pots: this.potCount(), seats: this.catalog!.balance.session.initialSeats + this.upgradeEffect('seats'), purse: this.stove!.purse,
            canCook: (id) => this.canCook(id, day),
            emptyHeats: () => this.emptyHeats(),
            ingredientSpend: () => this.stove!.ingredientSpendToday(),
            holdScoreSeconds: this.upgradeEffect('holdScoreSeconds'),
            initialFavor,
            atmosphere: this.decorAtmosphere(),
            shopLevel: this.shopLevel(),
        });
    }

    private shopLevel(): number {
        return ['U01', 'U02', 'U03'].filter(id => this.ownedUpgrades.has(id)).length + 1;
    }

    private activityNotice(): string {
        const event = this.catalog ? activeActivity(this.catalog.activities, this.service?.day || 1) : null;
        return event ? `活动 · ${event.name}` : '今日没有活动';
    }

    private saveShareCard(): void {
        if (!this.service?.report || !this.catalog) { this.say('还没到日结'); return; }
        try {
            const day = this.service.day;
            const best = this.service.highlightDish();
            const featured = this.featuredRecipe(day);
            const dish = best?.name || featured?.name || '今天没有出餐';
            const result = best?.result || '没有出餐';
            const recipe = best ? this.catalog.recipes.find(item => item.name === best.name) : featured;
            downloadSharePicture({
                day, dish, result, close: chapterCloseLine(day),
                atmosphere: this.service.atmosphereValue,
                color: recipe?.color || '#f3e2c4',
                featured: featured?.name || '',
            });
            this.say('今日的粥已保存到本机');
        } catch {
            this.say('这张卡片没能保存，今日账目不受影响');
        }
    }

    private togglePause(): void {
        if (!this.service || this.service.phase === 'closed') { this.say('这一天已经打烊'); return; }
        this.paused = this.menuPanel?.active ? !this.menuWasPaused : !this.paused;
        if (this.menuPanel?.active) this.menuPanel.active = false;
        this.stove?.resetClock();
        this.say(this.paused ? '已暂停。打开「菜单」可继续。' : '继续营业');
        this.refresh();
    }

    private stageText(order: Order): string {
        const cooking = this.model?.balance.cooking;
        if (order.stage === 'preparing') return `备料中 ${Math.ceil(this.model!.prepSeconds - order.stageTime)}秒`;
        if (order.stage === 'special') return `特色操作 ${Math.ceil(8 - order.stageTime)}秒`;
        if (order.stage === 'cooking') return `煮制中 ${Math.ceil(this.model!.recipe(order.recipeId).cookSeconds - order.stageTime)}秒`;
        if (order.stage === 'ready') return `可盛碗！${Math.ceil((cooking?.burnSeconds || 20) - order.readyTime)}秒后烧糊`;
        if (order.stage === 'serving') return `盛碗中 ${Math.ceil((cooking?.serveSeconds || 2) - order.stageTime)}秒`;
        if (order.stage === 'garnishing') return `摆盘中 ${Math.ceil((cooking?.garnishSeconds || 4) - order.stageTime)}秒`;
        return ({ waiting: '待备料', prepared: '待下锅', tray: '可摆盘/可交付', plated: '可出餐' })[order.stage];
    }

    private stageProgress(order: Order): number {
        const cooking = this.model!.balance.cooking;
        if (order.stage === 'preparing') return Math.min(1, order.stageTime / this.model!.prepSeconds);
        if (order.stage === 'special') return Math.min(1, order.stageTime / 8);
        if (order.stage === 'cooking') return Math.min(1, order.stageTime / this.model!.recipe(order.recipeId).cookSeconds);
        if (order.stage === 'serving') return Math.min(1, order.stageTime / cooking.serveSeconds);
        if (order.stage === 'garnishing') return Math.min(1, order.stageTime / cooking.garnishSeconds);
        if (order.stage === 'ready') return Math.max(0, 1 - order.readyTime / cooking.burnSeconds);
        return Math.max(0, order.patience / order.initialPatience);
    }

    private nextAction(order: Order): string {
        if (order.stage === 'tray' && !order.specialDone) return '点摆盘台完成特色操作';
        return ({ waiting: '点备料台', preparing: '等待备料', special: '完成中间操作', prepared: '炭火改用下方白粥按钮', cooking: '等待订单短计时', ready: '订单短计时已停用', serving: '等待盛碗', tray: '点摆盘台或直接交付', garnishing: '等待摆盘', plated: '点出餐柜台' })[order.stage];
    }

    private refreshSpecial(order: Order | undefined): void {
        if (!this.specialPanel || !this.specialTitle || !this.specialProgress) return;
        this.specialPanel.active = !!order && order.stage === 'special';
        if (!order || order.stage !== 'special') return;
        const action = this.model!.recipe(order.recipeId).action;
        this.specialTitle.string = ({ A0: '', A1: '翻炒：按提示点三次', A2: '流沙：按住搅拌', A3: '双色：依次铺面', A4: '海鲜：依次排阵' })[action];
        this.specialProgress.string = action === 'A2' ? `剩余 ${Math.ceil(8 - order.stageTime)} 秒 · 已按住 ${order.heldSeconds.toFixed(1)} / 4 秒` : `剩余 ${Math.ceil(8 - order.stageTime)} 秒 · 已完成 ${[0, 1, 2].filter(i => order.actionMask & (1 << i)).length} 步`;
        const names = action === 'A1' ? ['翻炒 1', '翻炒 2', '翻炒 3'] : action === 'A3' ? ['紫薯', '芋泥', ''] : action === 'A4' ? ['虾', '贝', '鲍'] : ['按住搅拌', '', ''];
        const next = [0, 1, 2].filter(i => order.actionMask & (1 << i)).length;
        for (let i = 0; i < 3; i++) {
            this.specialButtonLabels[i].string = names[i];
            this.specialButtons[i].active = action === 'A2' ? i === 0 : action === 'A1' ? order.stageTime >= 1 + i * 2 && order.stageTime <= 2 + i * 2 && !(order.actionMask & (1 << i)) : i === next && !!names[i];
        }
    }

    private serviceLine(order: ServiceOrder): string {
        const customer = this.catalog?.customer(order.customerId);
        const recipe = this.catalog?.recipe(order.recipeId);
        const state = order.state === 'queued' ? '排队' : order.state === 'cooking' ? '熬煮中' : order.state === 'ready' ? '可送达' : order.state === 'served' ? '用餐中' : '已离开';
        const pot = this.stove?.readouts().find(read => read.potId === order.potId);
        const place = pot && order.state === 'cooking' ? ` · 炭火${String.fromCharCode(65 + pot.index)}` : '';
        const hurry = order.patienceLeft < 15 && (order.state === 'queued' || order.state === 'cooking') ? ' · 快到时' : '';
        return `${customer?.name || order.customerId} ${recipe?.name || order.recipeId}\n${state}${place} · 耐心 ${Math.ceil(order.patienceLeft)} 秒${hurry}`;
    }

    private nextServiceDay(upgradeId = ''): void {
        if (!this.service?.report || !this.catalog || !this.stove) { this.say('还没到日结'); return; }
        const upgrade = upgradeId ? this.catalog.upgrade(upgradeId) : undefined;
        if (upgradeId && !upgrade) { this.say('这项升级不存在'); return; }
        if (upgrade) {
            const previous = upgrade.id === 'U02' ? 'U01' : upgrade.id === 'U03' ? 'U02' : '';
            if (previous && !this.ownedUpgrades.has(previous)) { this.say('要先买前一口锅'); return; }
            if (this.ownedUpgrades.has(upgrade.id)) { this.say('这项升级已经买过'); return; }
            if (this.completedDays < upgrade.requiredCompletedDays) { this.say(`还要完成 ${upgrade.requiredCompletedDays - this.completedDays} 天`); return; }
            if (this.stove.wallet < upgrade.price) { this.say('铜钱不够'); return; }
            this.stove.wallet -= upgrade.price;
            this.ownedUpgrades.add(upgrade.id);
        }
        if (upgrade?.effect.pots) {
            const original = this.stove.capture();
            const expandedStove = new StoveDesk(this.catalog, this.potCount(), this.stove.purse);
            const defaults = expandedStove.capture();
            expandedStove.install({
                ...original,
                pots: [...original.pots, ...defaults.pots.slice(original.pots.length)],
                committedTier: [...original.committedTier, ...defaults.committedTier.slice(original.committedTier.length)],
                bowls: [...original.bowls, ...defaults.bowls.slice(original.bowls.length)],
            });
            this.stove = expandedStove;
        }
        this.applyStoveUpgrades();
        const tossed = this.stove.pantry.closeShop();
        const bonus = this.dayBonus(this.service.day);
        this.stove.wallet += bonus;
        const day = this.service.day + 1;
        this.service = this.openDay(day, day, { ...this.service.favor });
        this.dayReported = false;
        this.selectedServiceOrder = '';
        this.recipePage = 0;
        this.paused = false;
        if (this.upgradeShopPanel) this.upgradeShopPanel.active = false;
        const newRecipes = this.catalog.recipes.filter(recipe => recipe.unlockDay === day).map(recipe => recipe.name);
        this.say(`第${day}日。${bonus ? `上日奖励 +${bonus} 铜。` : ''}${upgrade ? `${upgrade.name}已生效。` : ''}${newRecipes.length ? `新菜：${newRecipes.join('、')}。` : ''}${tossed.length ? `隔夜丢弃${tossed.length}份食材。` : ''}可以继续备料。`);
        this.persistDesk();
        this.refresh();
    }

    private openService(): void {
        if (this.paused) { this.say('请先继续营业'); return; }
        const opened = this.service?.open();
        if (opened?.ok) this.liveAudio.play('shop:open');
        this.say(opened?.message || '现在不能开门');
        this.persistDesk();
        this.refresh();
    }

    private deliverService(): void {
        if (this.paused) { this.say('请先继续营业'); return; }
        const ready = this.service?.orders.find(order => order.orderId === this.selectedServiceOrder && order.state === 'ready')
            || this.service?.orders.find(order => order.state === 'ready');
        const result = ready && this.service ? this.service.deliver(ready.orderId) : null;
        if (result?.ok) { this.markDelivered(); this.liveAudio.play('shop:coin'); }
        this.say(result ? result.message : '没有可送达的单');
        this.persistDesk();
        this.refresh();
    }

    private cookRecipe(id: string): { message: string } {
        const recipe = this.catalog?.recipe(id);
        if (!recipe || recipe.unlockDay > (this.service?.day || 1)) return { message: '今天的菜单还没有这道粥' };
        if (!this.service || (this.service.phase !== 'service' && this.service.phase !== 'close')) return { message: '开门后按订单下锅' };
        const chosen = this.service.orders.find(order => order.orderId === this.selectedServiceOrder && order.state === 'queued' && order.recipeId === id);
        const order = chosen || this.service.orders.find(item => item.state === 'queued' && item.recipeId === id);
        if (!order) return { message: `还没有客人点${recipe.name}，不要提前下锅` };
        const started = this.stove!.beginFocused(id);
        if (!started.ok) return started;
        this.stove!.board.pots[this.stove!.focusIndex].masteryPoints = this.skillPoints.get(id) || 0;
        const pot = this.stove!.readouts()[this.stove!.focusIndex];
        const bound = this.service.assign(order.orderId, pot.potId);
        return { message: `${started.message}。${bound.message}` };
    }

    private cookSelectedOrder(): { message: string } {
        const day = this.service;
        const stove = this.stove;
        if (!day || !stove) return { message: '现在不能下锅' };
        const selected = day.orders.find(order => order.orderId === this.selectedServiceOrder && order.state === 'queued');
        const order = selected || day.orders.find(item => item.state === 'queued');
        if (!order) return { message: '没有待做的订单' };
        const reads = stove.readouts();
        const empty = reads[stove.focusIndex]?.phase === 'empty' ? reads[stove.focusIndex] : reads.find(read => read.phase === 'empty');
        if (!empty) return { message: '锅都在用，等一口锅空出来再下单' };
        this.selectedServiceOrder = order.orderId;
        if (stove.focusIndex !== empty.index) this.focusStation(`BURNER_${String.fromCharCode(65 + empty.index)}` as Station);
        return this.cookRecipe(order.recipeId);
    }

    private actionableOrder(): ServiceOrder | undefined {
        const orders = this.service?.orders || [];
        return orders.find(order => order.orderId === this.selectedServiceOrder && (order.state === 'queued' || order.state === 'cooking' || order.state === 'ready'))
            || orders.find(order => order.state === 'ready')
            || orders.find(order => order.state === 'queued')
            || orders.find(order => order.state === 'cooking');
    }

    private focusOrderPot(order: ServiceOrder): void {
        const read = this.stove?.readouts().find(pot => pot.potId === order.potId);
        if (read) this.focusStation(`BURNER_${String.fromCharCode(65 + read.index)}` as Station);
    }

    private actOnSelectedOrder(): void {
        const order = this.actionableOrder();
        if (!order) { this.say('目前没有待处理的订单'); return; }
        this.selectedServiceOrder = order.orderId;
        if (order.state === 'queued') this.stoveAct(() => this.cookSelectedOrder());
        else if (order.state === 'ready') this.deliverService();
        else this.focusOrderPot(order);
        this.refresh();
    }

    private stoveAct(run: () => { message: string }): void {
        if (!this.stove || this.paused || this.service?.phase === 'closed') {
            this.say(this.paused ? '请先继续营业' : '现在不能操作火候');
            return;
        }
        this.say(run().message);
        this.persistDesk();
        this.refresh();
    }

    private stoveText(): string {
        const reads = this.stove?.readouts() ?? [];
        if (!reads.length) return '火候未接通';
        return reads.map(read => this.readoutLine(read)).join('\n');
    }

    private readoutLine(read: PotReadout): string {
        const which = `${read.focused ? '▶ ' : ''}炭火 ${String.fromCharCode(65 + read.index)}`;
        if (read.phase === 'empty') return `${which} 空锅`;
        const adding = (read.phase === 'cooking' || read.phase === 'window') && read.pendingAdd ? ` 待加${read.pendingAdd}@${Math.round(read.pendingAt * 100)}%` : '';
        const taste = read.phase === 'window' ? ` ${seasonWord(read.season)}` : '';
        const plating = read.phase === 'plated' && read.plateLeft > 0 ? ` 摆盘${Math.ceil(read.plateLeft)}秒` : '';
        return `${which} ${read.recipeName} ${heatWord(read.heat)} ${read.label}${adding}${taste}${plating} 熟${Math.round(read.doneness * 100)} 焦${Math.round(read.scorch * 100)} 搅${Math.round(read.stir * 100)}`;
    }

    private refreshWarn(): void {
        if (!this.potWarn) return;
        const notes = (this.stove?.readouts() ?? []).map(read => {
            const name = `炭火 ${String.fromCharCode(65 + read.index)}`;
            if (read.phase === 'burnt' || read.label === '糊底') return `${name} 糊了`;
            if (read.scorchHot || read.label.includes('快糊了')) return `${name} 快糊了`;
            if (read.phase === 'window') return `${name} 可盛碗`;
            if (read.pendingAdd && read.doneness >= read.pendingAt - 0.05) return `${name} 该加${read.pendingAdd}`;
            if (read.warn || read.label.includes('该搅拌')) return `${name} 该搅拌`;
            return '';
        }).filter(text => text);
        const frame = screen.windowSize;
        const narrow = frame.width > 0 && frame.height > frame.width;
        this.potWarn.string = notes.join('   ') || (narrow ? '窗口偏窄，锅的警告写在这一行' : '');
    }

    private paintCookMeter(): void {
        const day = this.service;
        const read = this.stove?.readouts()[this.stove.focusIndex];
        const visible = !!day && !day.report && (day.phase === 'service' || day.phase === 'close') &&
            !!read && (read.phase === 'prep' || read.phase === 'cooking' || read.phase === 'window') &&
            !this.menuPanel?.active && !this.progressPanel?.active && !this.settingsPanel?.active && !this.storyPanel?.active && !this.codexPanel?.active;
        if (this.cookMeterNode) this.cookMeterNode.active = visible;
        if (this.cookMeterLabel) this.cookMeterLabel.node.active = visible;
        if (this.recipeGuide) this.recipeGuide.node.active = visible;
        if (!visible || !read || !this.cookMeter || !this.cookMeterLabel || !this.catalog) return;
        const meter = this.cookMeter;
        const width = 420;
        meter.clear();
        meter.fillColor = new Color(48, 39, 34, 225);
        meter.roundRect(-width / 2, -5, width, 10, 5);
        meter.fill();
        meter.fillColor = read.scorchHot ? new Color(204, 80, 65) : read.phase === 'window' ? new Color(121, 191, 126) : new Color(223, 162, 86);
        meter.roundRect(-width / 2, -5, Math.max(2, width * read.doneness), 10, 5);
        meter.fill();
        const mark = (value: number, color: Color): void => {
            meter.fillColor = color;
            meter.rect(-width / 2 + width * value - 2, -9, 4, 18);
            meter.fill();
        };
        mark(this.catalog.balance.gates.serveMin, new Color(121, 191, 126));
        mark(this.catalog.balance.gates.serveMax, new Color(121, 191, 126));
        if (read.pendingAdd) mark(read.pendingAt, new Color(252, 220, 121));
        const add = read.pendingAdd ? ` · ${read.pendingAdd} ${Math.round(read.pendingAt * 100)}% 加料` : '';
        this.cookMeterLabel.string = `炭火 ${String.fromCharCode(65 + read.index)} 熟度 ${Math.round(read.doneness * 100)}%${add} · 绿色区可盛碗`;
        const recipe = this.stove?.board.pots[read.index]?.recipe;
        const order = day?.orders.find(item => item.potId === read.potId && item.state === 'cooking');
        const tags = order ? this.catalog.customer(order.customerId)?.acceptedTags || [] : [];
        const flavor = tags.some(tag => tag === '咸香' || tag === '浓') ? '咸香' : tags.includes('清甜') ? '清甜' : '原味';
        const steps = recipe?.adds.map(step => `${this.catalog!.ingredient(step.id)?.name || step.id}${Math.round(step.atDoneness * 100)}%${this.stove!.board.pots[read.index].added.includes(step.id) ? '✓' : ''}`).join(' → ') || '无需加料';
        if (this.recipeGuide) this.recipeGuide.string = `${recipe?.name || '当前粥'} · ${this.skillLevel(this.skillPoints.get(recipe?.id || '') || 0)} · 建议${heatWord(recipe?.heatHint || 'mid')} · ${steps} · 客人偏好${flavor}`;
    }

    private showStore(): void {
        if (!this.store || !this.service) return;
        this.store.show({
            potCount: this.potCount(),
            day: this.service.day,
            seated: this.service.seatedCount,
            lightId: this.activeLight,
            style: this.catalog?.decorItem(this.activeLight)?.style || '',
            ownedDecor: this.ownedDecor,
            reads: this.stove?.readouts() ?? [],
        });
    }

    private syncPotAudio(): void {
        this.liveAudio.follow(this.paused, this.service?.phase || '', !!this.service?.report, this.stove?.readouts() ?? []);
    }

    private refreshEndPanel(): void {
        if (!this.endPanel?.active || !this.campaign || !this.model || !this.endSummary) return;
        this.endSummary.string = `第${this.model.day}日结算\n交付 ${this.model.delivered} 单 · 失单 ${this.model.missed} 单 · 金币 ${this.campaign.wallet}`;
        for (let i = 0; i < this.campaign.balance.upgrades.length; i++) {
            const upgrade = this.campaign.balance.upgrades[i];
            const unlocked = this.campaign.completedDays >= upgrade.requiredCompletedDays;
            this.upgradeButtons[i].active = unlocked && !this.campaign.upgrades.has(upgrade.id);
            this.upgradeButtonLabels[i].string = `${upgrade.name} · ${upgrade.price}金币`;
        }
    }

    private refreshMarkers(): void {
        for (let i = 0; i < this.stationMarkers.length; i++) {
            const marker = this.stationMarkers[i];
            marker.node.active = !this.selectedStation;
            if (i === 2) marker.label.string = this.potCount() > 1 ? '炭火 B' : '未开炉';
        }
    }

    private showFatal(message: string): void {
        console.error(`[粥霸天] ${message}`);
        if (!this.uiRoot) this.buildUi();
        if (!this.status && this.uiRoot) {
            const node = new Node('FatalStatus');
            node.parent = this.uiRoot;
            node.layer = Layers.Enum.UI_2D;
            node.setPosition(0, 0, 0);
            node.addComponent(UITransform).setContentSize(900, 160);
            const label = node.addComponent(Label);
            label.fontSize = 28;
            label.lineHeight = 36;
            label.color = new Color(245, 233, 206);
            label.overflow = Label.Overflow.SHRINK;
            this.status = label;
        }
        this.say(`无法开局：${message}`);
    }
}
