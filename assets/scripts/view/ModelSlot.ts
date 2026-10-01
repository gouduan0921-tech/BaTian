import { _decorator, CCString, Component, instantiate, Node, Prefab, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

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
