import { _decorator, Color, Component, MeshRenderer, Node, Vec3 } from 'cc';
import { SteamPuffs } from './SteamPuffs';
import { Balance, Recipe } from '../core/Config';
import { PotState } from '../rules/Pot';
import { hexColor } from '../ui/UiKit';
import { INGREDIENT_TINT } from './GameContext';

const { ccclass, property } = _decorator;

const RAW = new Color(0xe4, 0xdd, 0xcf, 255);
const CONGEE = new Color(0xf6, 0xee, 0xdc, 255);
const BURNT = new Color(0x4a, 0x2e, 0x22, 255);
const RING_WARN = new Color(0xe3, 0x9b, 0x3a, 255);
const RING_SCORCH = new Color(0x8c, 0x4a, 0x32, 255);
const FLAME_SCALE = { low: 0.45, mid: 0.8, high: 1.25 };
const STEAM_RATE = { low: 8, mid: 16, high: 26 };
const STEAM_CLEAN = new Color(255, 250, 240, 30);
const STEAM_BURNT = new Color(150, 140, 130, 60);

/**
 * 一口锅的表现（预制体 stage/Pot）。只读仿真快照，不写回（文档 03 §5、15 §4）。
 * 汤色随熟度混向粥谱目标色；火焰高度跟火候；蒸汽密度 = 火候基线 × simmer；锅沿圈提示搅拌/焦糊。
 */
@ccclass('PotView')
export class PotView extends Component {
    @property(Node) body: Node | null = null;
    @property(MeshRenderer) pickRenderer: MeshRenderer | null = null;
    @property(Node) soup: Node | null = null;
    @property(MeshRenderer) soupRenderer: MeshRenderer | null = null;
    @property(Node) flame: Node | null = null;
    @property(SteamPuffs) steam: SteamPuffs | null = null;
    @property(Node) ring: Node | null = null;
    @property(MeshRenderer) ringRenderer: MeshRenderer | null = null;
    @property(Node) focusMark: Node | null = null;
    @property(Node) lockedCover: Node | null = null;
    @property(Node) addedGarnish: Node | null = null;
    @property(Node) riceGrains: Node | null = null;

    private flicker = 0;
    private lastColor = new Color();
    private lastRing = new Color();
    private readonly tmp = new Vec3();
    private garnishKey = '';

    render(balance: Balance, pot: PotState | null, recipe: Recipe | null, focus: boolean, warnLine: number, dt: number): void {
        const owned = !!pot;
        if (this.lockedCover) this.lockedCover.active = !owned;
        if (this.body) this.body.active = owned;
        if (this.focusMark) this.focusMark.active = owned && focus;
        const active = !!pot && (pot.phase === 'cooking' || pot.phase === 'window' || pot.phase === 'over' || pot.phase === 'burnt');
        if (this.soup) this.soup.active = active;
        if (this.riceGrains) this.riceGrains.active = active;
        if (this.flame) this.flame.active = active;
        if (this.addedGarnish) {
            const on = active && !!pot && pot.added.length > 0;
            this.addedGarnish.active = on;
            // 粥面上的配料：按已经下锅的食材上色（鸡丝、青菜、瘦肉……）
            const key = on ? pot!.added.map(a => a.id).join(',') : '';
            if (on && key !== this.garnishKey) {
                this.garnishKey = key;
                this.addedGarnish.children.forEach((n, i) => {
                    const id = pot!.added[i % pot!.added.length].id;
                    n.getComponent(MeshRenderer)?.getMaterialInstance(0)?.setProperty('mainColor', hexColor(INGREDIENT_TINT[id] ?? '#7FA36A'));
                });
            }
        }
        if (!pot || !active || !recipe) {
            this.setSteam(0);
            if (this.ring) this.ring.active = false;
            return;
        }
        // 火焰：高度随火候，带一点闪动
        this.flicker += dt * 9;
        const s = FLAME_SCALE[pot.heat] * (1 + Math.sin(this.flicker) * 0.06 + Math.sin(this.flicker * 2.3) * 0.04);
        this.flame!.setScale(this.tmp.set(1, s, 1));

        // 汤色：夹生偏灰白，接近窗口混向目标色，过火加深；糊底只在锅沿
        // 粥以米为主：粥谱颜色只是底色，混进一半米白，看起来才是一锅稠粥
        const target = new Color();
        Color.lerp(target, hexColor(recipe.color), CONGEE, 0.45);
        const t = Math.min(1, pot.doneness / balance.gates.serveMin);
        const c = new Color();
        Color.lerp(c, RAW, target, t);
        if (pot.doneness > balance.gates.serveMax) Color.lerp(c, c, BURNT, Math.min(0.5, (pot.doneness - balance.gates.serveMax) * 2));
        this.paint(this.soupRenderer, c, this.lastColor);

        // 蒸汽：火候基线 × simmer；糊了变稀
        const rate = STEAM_RATE[pot.heat] * Math.max(0.2, pot.simmer) * (pot.phase === 'burnt' ? 0.3 : 1);
        this.setSteam(rate, pot.phase === 'burnt');

        // 锅沿圈：搅拌低于警告线亮暖色，焦糊高于 0.7 变焦色
        const scorch = pot.scorch > 0.7 || pot.phase === 'burnt';
        const warn = pot.stir < warnLine;
        if (this.ring) this.ring.active = scorch || warn;
        if (scorch || warn) {
            const c = scorch ? RING_SCORCH : RING_WARN;
            if (!this.lastRing.equals(c)) {
                this.lastRing.set(c);
                // 一圈小珠子一起换色
                for (const r of this.ring!.getComponentsInChildren(MeshRenderer)) r.getMaterialInstance(0)?.setProperty('mainColor', c);
            }
        }
    }

    private paint(r: MeshRenderer | null, color: Color, last: Color): void {
        if (!r || last.equals(color)) return;
        last.set(color);
        const mat = r.getMaterialInstance(0);
        mat?.setProperty('mainColor', color);
    }

    private setSteam(rate: number, burnt = false): void {
        if (!this.steam) return;
        this.steam.setRate(rate);
        this.steam.setTone(burnt ? STEAM_BURNT : STEAM_CLEAN);
    }
}
