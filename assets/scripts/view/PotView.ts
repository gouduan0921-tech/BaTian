import { _decorator, Color, Component, Material, MeshRenderer, Node, Prefab, primitives, renderer, SphereLight, utils, Vec3, Vec4 } from 'cc';
import { SteamPuffs } from './SteamPuffs';
import { SoupGarnish } from './SoupGarnish';
import { Tint } from './Tint';
import { Balance, Recipe } from '../core/Config';
import { PotState } from '../rules/Pot';
import { hexColor } from '../ui/UiKit';

const { ccclass, property } = _decorator;

// 粥面贴图本身是米白带暖，这里的颜色乘在贴图上：生米水偏灰，熬开后接近贴图原色
const RAW = new Color(0xe2, 0xe0, 0xd8, 255);
const CONGEE = new Color(0xff, 0xf9, 0xee, 255);
const BURNT = new Color(0x4a, 0x2e, 0x22, 255);
const RING_WARN = new Color(0xe3, 0x9b, 0x3a, 255);
const RING_SCORCH = new Color(0x8c, 0x4a, 0x32, 255);
const FLAME_SCALE = { low: 0.45, mid: 0.8, high: 1.25 };
/** 炉口炭火的亮度：没在熬时只是暗红余烬，火越大越亮，再叠一点不规则的跳动 */
const EMBER_GLOW = { idle: 0.28, low: 0.6, mid: 0.95, high: 1.4 };
const STEAM_RATE = { low: 5, mid: 10, high: 16 };
const STEAM_CLEAN = new Color(255, 250, 240, 95);
const STEAM_BURNT = new Color(165, 156, 143, 70);

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
    /** 时令食材的正式配料模型（子节点按食材 id 命名：I13 山药桂花、I14 腊肉、I15 荠菜、I16 绿豆） */
    @property(Node) seasonGarnish: Node | null = null;
    @property(Prefab) detailedFood: Prefab | null = null;

    private flicker = 0;
    private lastColor = new Color();
    private soupFinishRecipe = '';
    private readonly grainColor = new Color();
    private readonly grainTint = new Color();
    private lastRing = new Color();
    private readonly tmp = new Vec3();
    private foodShapes: SoupGarnish | null = null;
    private embers: renderer.MaterialInstance[] = [];
    private emberSearch = 0;
    private emberLevel = EMBER_GLOW.idle;
    private ringMat: renderer.MaterialInstance | null = null;
    private ringT = 0;
    private readonly glow = new Vec3();
    private emberLight: SphereLight | null = null;
    private bubbles: Node[] = [];
    private bubbleMaterial: Material | null = null;
    private flameMaterial: Material | null = null;
    private readonly surfaceUv = new Vec4(2, 2, 0, 0);
    private surfaceTime = 0;
    private detailReady = false;

    private prepareDetails(): void {
        if (this.detailReady || !this.soupRenderer) return;
        this.detailReady = true;
        const mesh = utils.createMesh(primitives.sphere(0.5, { segments: 10 }));
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-standard' });
        mat.setProperty('mainColor', CONGEE);
        mat.setProperty('roughness', 0.8);
        this.bubbleMaterial = mat;
        for (let i = 0; i < 8; i++) {
            const n = new Node(`SimmerBubble${i}`);
            n.layer = this.node.layer;
            n.parent = this.node;
            const r = n.addComponent(MeshRenderer);
            r.mesh = mesh;
            r.setMaterial(mat, 0);
            r.shadowCastingMode = 0;
            r.receiveShadow = 0;
            n.active = false;
            this.bubbles.push(n);
        }
        const fire = new Material();
        fire.initialize({ effectName: 'builtin-unlit' });
        const fireColor = new Color(235, 126, 43);
        fire.setProperty('mainColor', fireColor);
        this.flameMaterial = fire;
        for (const r of this.flame?.getComponentsInChildren(MeshRenderer) ?? []) {
            r.setMaterial(fire, 0);
            r.node.getComponent(Tint)?.apply(fireColor);
            r.shadowCastingMode = 0;
        }
        const n = new Node('EmberLight');
        n.layer = this.node.layer;
        n.parent = this.node;
        n.setPosition(0, -0.24, 0.50);
        const l = n.addComponent(SphereLight);
        l.color = new Color(255, 143, 61);
        l.range = 1.25;
        l.size = 0.16;
        l.enabled = false;
        this.emberLight = l;
    }

    private renderSurface(pot: PotState | null, active: boolean, dt: number): void {
        this.prepareDetails();
        const heat = pot?.heat ?? 'mid';
        this.surfaceTime += Math.min(dt, 0.05) * ({ low: 0.65, mid: 1, high: 1.7 }[heat]);
        const strength = active ? Math.max(0.1, pot!.simmer) : 0;
        const level = this.soup?.position.y ?? 0.3;
        this.bubbles.forEach((n, i) => {
            const cycle = (this.surfaceTime * (0.55 + i * 0.07) + i * 0.37) % 1;
            n.active = active && pot?.phase !== 'burnt' && cycle < 0.72;
            if (!n.active) return;
            const a = i * 2.39996 + Math.sin(this.surfaceTime * 0.3 + i) * 0.1;
            const radius = 0.08 + (i % 3) * 0.085;
            const swell = Math.sin(cycle / 0.72 * Math.PI);
            const size = (0.021 + (i % 3) * 0.01) * swell * Math.min(1, strength + 0.25);
            n.setPosition(Math.cos(a) * radius, level + 0.005 + swell * 0.005, Math.sin(a) * radius);
            n.setScale(size, size * 0.42, size);
        });
        if (active) {
            this.surfaceUv.z = Math.sin(this.surfaceTime * 0.17) * 0.018;
            this.surfaceUv.w = Math.cos(this.surfaceTime * 0.13) * 0.012;
            this.soupRenderer?.getMaterialInstance(0)?.setProperty('tilingOffset', this.surfaceUv);
            if (this.addedGarnish) this.addedGarnish.setPosition(0, level + 0.011 + Math.sin(this.surfaceTime * 2) * 0.0015, 0);
        }
        if (this.emberLight) {
            this.emberLight.enabled = active;
            this.emberLight.luminance = ({ low: 0.02, mid: 0.045, high: 0.08 }[heat])
                * (1 + Math.sin(this.surfaceTime * 11) * 0.08);
        }
    }

    render(balance: Balance, pot: PotState | null, recipe: Recipe | null, focus: boolean, warnLine: number, dt: number): void {
        const owned = !!pot;
        if (this.lockedCover) this.lockedCover.active = !owned;
        if (this.body) this.body.active = owned;
        if (this.focusMark) this.focusMark.active = owned && focus;
        const active = !!pot && (pot.phase === 'cooking' || pot.phase === 'window' || pot.phase === 'over' || pot.phase === 'burnt');
        this.renderEmbers(active ? pot!.heat : null, dt);
        this.renderSurface(pot, active, dt);
        if (this.soup) this.soup.active = active;
        if (this.riceGrains) this.riceGrains.active = active;
        // The charcoal model carries textured glowing fissures; the old orange spheres
        // look like plastic flames and obscure the dark coal in the stove mouth.
        if (this.flame) this.flame.active = false;
        // 时令食材用专门的配料模型：加料下锅后出现；作为底料的（绿豆）从开火起就在粥面上
        const seasonal: string[] = [];
        if (this.seasonGarnish) {
            if (active && pot) {
                const ids = pot.added.map(x => x.id);
                if (recipe) for (const ing of recipe.ingredients) if (!recipe.adds.some(x => x.id === ing.id)) ids.push(ing.id);
                for (const id of ids) if (!seasonal.includes(id) && this.seasonGarnish.getChildByName(id)) seasonal.push(id);
            }
            for (const c of this.seasonGarnish.children) if (c.active !== seasonal.includes(c.name)) c.active = seasonal.includes(c.name);
        }
        // 配料有独立形状：底料从开火起出现，分段加料成功后才出现。
        if (!this.foodShapes) this.foodShapes = new SoupGarnish(this.node, this.detailedFood);
        const ingredientIds = active && pot && recipe
            ? [...recipe.ingredients.filter(x => !recipe.adds.some(a => a.id === x.id)).map(x => x.id), ...pot.added.map(x => x.id)] : [];
        this.foodShapes.render(ingredientIds.filter(id => !seasonal.includes(id)), active, this.soup?.position.y ?? .3);
        if (this.addedGarnish) this.addedGarnish.active = false;
        if (!pot || !active || !recipe) {
            this.setSteam(0);
            if (this.ring) this.ring.active = false;
            return;
        }
        // 火焰：高度随火候，带一点闪动
        this.flicker += dt * 9;
        const s = FLAME_SCALE[pot.heat] * (1 + Math.sin(this.flicker) * 0.06 + Math.sin(this.flicker * 2.3) * 0.04);
        this.flame?.setScale(this.tmp.set(1, s, 1));

        // 汤色：夹生偏灰白，接近窗口混向目标色，过火加深；糊底只在锅沿
        // 大多数粥混入米白；黑芝麻保留深色，避免被冲成灰白。
        const target = new Color();
        Color.lerp(target, hexColor(recipe.color), CONGEE, recipe.id === 'R08' ? .03 : .55);
        const t = Math.min(1, pot.doneness / balance.gates.serveMin);
        const c = new Color();
        Color.lerp(c, RAW, target, t);
        if (pot.doneness > balance.gates.serveMax) Color.lerp(c, c, BURNT, Math.min(0.5, (pot.doneness - balance.gates.serveMax) * 2));
        this.paint(this.soupRenderer, c, this.lastColor);
        if (this.soupFinishRecipe !== recipe.id) {
            this.soupFinishRecipe = recipe.id;
            const material = this.soupRenderer?.getMaterialInstance(0);
            material?.setProperty('roughness', recipe.id === 'R08' ? .78 : .38);
            material?.setProperty('normalStrength', recipe.id === 'R08' ? .18 : .65);
        }
        this.bubbleMaterial?.setProperty('mainColor', c);
        // Visible grains pick up some broth color instead of floating as white dots.
        if (!this.grainColor.equals(c)) {
            this.grainColor.set(c);
            Color.lerp(this.grainTint, c, CONGEE, recipe.id === 'R08' ? .08 : .65);
            for (const renderer of this.riceGrains?.getComponentsInChildren(MeshRenderer) ?? []) {
                for (let i = 0; i < renderer.sharedMaterials.length; i++) {
                    renderer.getMaterialInstance(i)?.setProperty('mainColor', this.grainTint);
                }
            }
        }

        // 蒸汽：火候基线 × simmer；糊了变稀
        const rate = STEAM_RATE[pot.heat] * Math.max(0.2, pot.simmer) * (pot.phase === 'burnt' ? 0.3 : 1);
        this.setSteam(rate, pot.phase === 'burnt');

        // 锅沿圈：搅拌低于警告线亮暖色，焦糊高于 0.7 变焦色
        const scorch = pot.scorch > 0.7 || pot.phase === 'burnt';
        const warn = pot.stir < warnLine;
        if (this.ring) this.ring.active = scorch || warn;
        if (scorch || warn) {
            const mat = this.ringMaterial();
            const c = scorch ? RING_SCORCH : RING_WARN;
            if (mat && !this.lastRing.equals(c)) {
                this.lastRing.set(c);
                mat.setProperty('mainColor', c);
            }
            // 呼吸：该搅时慢慢明暗，快糊了跳得更急
            this.ringT += dt * (scorch ? 7 : 3.2);
            const k = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.ringT));
            mat?.setProperty('emissiveScale', this.glow.set(k * 1.6, k * 1.6, k * 1.6));
        }
    }

    /** 一圈光点共用一份材质实例，换色和呼吸只改一次。 */
    private ringMaterial(): renderer.MaterialInstance | null {
        if (this.ringMat || !this.ring) return this.ringMat;
        const rs = this.ring.getComponentsInChildren(MeshRenderer);
        if (!rs.length) return null;
        this.ringMat = rs[0].getMaterialInstance(0);
        if (this.ringMat) for (const r of rs.slice(1)) r.setMaterialInstance(this.ringMat, 0);
        return this.ringMat;
    }

    /** 炉口的炭（正式炭炉模型里材质名 BT2_CoalEmber）：每口锅单独一份实例，按火候明暗跳动。 */
    private renderEmbers(heat: string | null, dt: number): void {
        if (!this.embers.length) {
            this.emberSearch -= dt;
            if (this.emberSearch > 0) return;
            this.emberSearch = 1;
            for (const r of this.node.getComponentsInChildren(MeshRenderer)) {
                r.sharedMaterials.forEach((m: Material | null, i: number) => {
                    if (m && m.name === 'BT2_CoalEmber') {
                        const inst = r.getMaterialInstance(i);
                        if (inst) this.embers.push(inst);
                    }
                });
            }
            if (!this.embers.length) return;
        }
        const target = heat ? EMBER_GLOW[heat as 'low' | 'mid' | 'high'] ?? EMBER_GLOW.mid : EMBER_GLOW.idle;
        this.emberLevel += (target - this.emberLevel) * Math.min(1, dt * 2);
        const k = this.emberLevel * (1 + Math.sin(this.flicker * 1.7) * 0.1 + Math.sin(this.flicker * 4.3 + 1) * 0.06);
        if (!heat) this.flicker += dt * 3;
        this.glow.set(k, k * 0.92, k * 0.85);
        for (const m of this.embers) m.setProperty('emissiveScale', this.glow);
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

    onDestroy(): void { this.bubbleMaterial?.destroy(); this.flameMaterial?.destroy(); }
}
