import { _decorator, Component, MeshRenderer, Node, Quat, Vec3 } from 'cc';
import { hexColor } from '../ui/UiKit';

const { ccclass, property } = _decorator;

/**
 * 一位客人（预制体 stage/Guest）。沿直线走向目标点，不做寻路（文档 08 §7）。
 * 衣服颜色按原型区分，低饱和，不抢粥的颜色（文档 14 §5）。
 */
@ccclass('GuestView')
export class GuestView extends Component {
    @property(Node) body: Node | null = null;
    @property([MeshRenderer]) tintRenderers: MeshRenderer[] = [];
    @property(Node) bowl: Node | null = null;
    @property(Node) critHat: Node | null = null;
    @property speed = 1.6;

    guestId = '';
    leaving = false;
    private readonly target = new Vec3();
    private readonly tmp = new Vec3();
    private bob = 0;
    private tint = '';

    setup(guestId: string, customerId: string, tint: string, from: Vec3): void {
        this.guestId = guestId;
        this.leaving = false;
        this.node.setWorldPosition(from);
        this.target.set(from);
        if (this.critHat) this.critHat.active = customerId === 'C07';
        if (this.tint !== tint) {
            this.tint = tint;
            const c = hexColor(tint);
            for (const r of this.clothRenderers()) r.getMaterialInstance(0)?.setProperty('mainColor', c);
        }
        this.setBowl(false);
    }

    /** 预制体里指定的上色网格；用 Blender 模型时自动找名字含 Cloth 的材质（MAT_C02_Cloth）。 */
    private clothRenderers(): MeshRenderer[] {
        const found = (this.body?.getComponentsInChildren(MeshRenderer) ?? [])
            .filter(r => r.node.activeInHierarchy && /cloth/i.test(r.sharedMaterials[0]?.name ?? ''));
        return found.length ? found : this.tintRenderers;
    }

    walkTo(pos: Vec3): void { this.target.set(pos); }

    setBowl(on: boolean): void { if (this.bowl && this.bowl.active !== on) this.bowl.active = on; }

    get arrived(): boolean { return Vec3.distance(this.node.worldPosition, this.target) < 0.05; }

    update(dt: number): void {
        const pos = this.node.worldPosition;
        Vec3.subtract(this.tmp, this.target, pos);
        this.tmp.y = 0;
        const dist = this.tmp.length();
        if (dist > 0.02) {
            const step = Math.min(dist, this.speed * dt);
            this.tmp.normalize();
            const next = new Vec3(pos.x + this.tmp.x * step, pos.y, pos.z + this.tmp.z * step);
            this.node.setWorldPosition(next);
            const yaw = Math.atan2(this.tmp.x, this.tmp.z) * 180 / Math.PI;
            const q = new Quat();
            Quat.fromEuler(q, 0, yaw, 0);
            this.node.setWorldRotation(q);
            this.bob += dt * 10;
            if (this.body) this.body.setPosition(0, Math.abs(Math.sin(this.bob)) * 0.03, 0);
        } else if (this.body) {
            this.body.setPosition(0, 0, 0);
        }
    }
}

