import { _decorator, CCString, Component, instantiate, Material, MeshRenderer, Node, Prefab, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Blender 导出时的发光强度（KHR_materials_emissive_strength）Cocos 不认，导入后发光只有 1 倍，
 * 炭火、灯泡、纸灯在暗处显得发闷。这里按材质名补回来；每个共享材质只调一次。
 */
const GLOW_BOOST: Record<string, number> = {
    BT2_CoalEmber: 2.2,
    BT2_WarmBulb: 4.5,
    BT2_WarmStrip: 3.2,
    BT2_RicePaper: 1.35,
    BT2_WhitePaper: 1.25,
    BT2_LetterGold: 2.4,
    BT2_MorningGlass: 1.6,
};
const boosted = new WeakSet<Material>();

function boostGlow(root: Node): void {
    for (const r of root.getComponentsInChildren(MeshRenderer)) {
        // Imported GLBs default to no casting. All solid props need contact and self shadows.
        r.shadowCastingMode = 1;
        r.receiveShadow = 1;
        for (const m of r.sharedMaterials) {
            const k = m ? GLOW_BOOST[m.name] : undefined;
            if (!m || !k || boosted.has(m)) continue;
            boosted.add(m);
            m.setProperty('emissiveScale', new Vec3(k, k, k));
        }
    }
}

/**
 * 在此节点下挂一个 Blender 导出的模型（glb 场景预制体）。
 * 模型有了正式版本时只改这里的引用；占位节点 placeholder 在模型加载后隐藏（文档 20 §6：灰盒与正式件并存）。
 */
@ccclass('ModelSlot')
export class ModelSlot extends Component {
    @property(Prefab) model: Prefab | null = null;
    @property(Node) placeholder: Node | null = null;
    @property(Vec3) offset: Vec3 = new Vec3();
    @property(Vec3) scale: Vec3 = new Vec3(1, 1, 1);
    /** 模型里要隐藏的子节点名（例如整体场景模型里被正式陈设取代的部件） */
    @property({ type: [CCString] }) hide: string[] = [];
    @property({ type: [CCString] }) variantIds: string[] = [];
    @property([Prefab]) variants: Prefab[] = [];

    private instance: Node | null = null;
    private readonly instances = new Map<string, Node>();
    private variant = '__default';

    onLoad(): void {
        if (!this.model || this.instance) return;
        this.instance = instantiate(this.model);
        this.instance.setPosition(this.offset);
        this.instance.setScale(this.scale);
        this.instance.parent = this.node;
        boostGlow(this.instance);
        this.instances.set('__default', this.instance);
        if (this.placeholder) this.placeholder.active = false;
        for (const name of this.hide) {
            const n = findDeep(this.instance, name);
            if (n) n.active = false;
        }
    }

    /** 餐具按当日选碗切换，已经用过的模型继续复用。 */
    showVariant(id: string): void {
        const i = this.variantIds.indexOf(id);
        const prefab = i >= 0 ? this.variants[i] : this.model;
        const key = i >= 0 && prefab ? id : '__default';
        if (!prefab || key === this.variant) return;
        if (this.instance) this.instance.active = false;
        let next = this.instances.get(key);
        if (!next) {
            next = instantiate(prefab);
            next.setPosition(this.offset);
            next.setScale(this.scale);
            next.parent = this.node;
            boostGlow(next);
            this.instances.set(key, next);
        }
        next.active = true;
        this.instance = next;
        this.variant = key;
        if (this.placeholder) this.placeholder.active = false;
    }
}

function findDeep(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const c of root.children) {
        const hit = findDeep(c, name);
        if (hit) return hit;
    }
    return null;
}
