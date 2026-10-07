import { _decorator, Component, MeshRenderer, Node, Quat, Vec3, SkeletalAnimation, AnimationClip } from 'cc';
import { hexColor } from '../ui/UiKit';
import { ModelSlot } from './ModelSlot';

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
    animationsPaused = false;
    reduceMotion = false;
    leaving = false;
    private readonly target = new Vec3();
    private readonly tmp = new Vec3();
    private bob = 0;
    private tint = '';
    private seated = false;
    private limbs: Array<{ node: Node; base: Quat; sign: number; arm: boolean }> = [];
    private readonly turn = new Quat();
    private readonly pose = new Quat();
    private readonly swing = new Quat();
    private scannedAnimation: SkeletalAnimation | null = null;
    private scannedClip = '';
    private animationWasPaused = false;

    start(): void {
        const visit = (n: Node) => {
            if (/^(Leg|Arm)[LR]$/.test(n.name)) this.limbs.push({
                node: n, base: n.rotation.clone(), sign: n.name.endsWith('L') ? 1 : -1,
                arm: n.name.startsWith('Arm'),
            });
            n.children.forEach(visit);
        };
        if (this.body) visit(this.body);
        this.bindScannedAnimation();
    }

    private bindScannedAnimation(): void {
        const next = this.body?.getComponentsInChildren(SkeletalAnimation).find(a => a.node.activeInHierarchy) ?? null;
        if (next === this.scannedAnimation) return;
        this.scannedAnimation?.stop();
        this.scannedAnimation = next;
        this.scannedClip = '';
        this.animationWasPaused = false;
        this.playScannedPose('GuestIdle');
    }

    private playScannedPose(name: string): void {
        const a = this.scannedAnimation;
        if (!a || this.scannedClip === name) return;
        const clip = a.clips.find(c => c?.name === name);
        if (!clip) return;
        this.scannedClip = name;
        const state = a.getState(name);
        if (state) state.wrapMode = AnimationClip.WrapMode.Loop;
        // Seated feet must not slide through the floor during a blended hip drop.
        if (name === 'GuestSit' || name === 'GuestWalk' && this.seated) a.play(name);
        else a.crossFade(name, .12);
        if (this.reduceMotion) { a.pause(); this.animationWasPaused = true; }
    }

    setSeated(on: boolean): void { this.seated = on; }

    private animateLimbs(moving: boolean): void {
        for (const limb of this.limbs) {
            const angle = moving && !this.reduceMotion ? Math.sin(this.bob) * limb.sign * (limb.arm ? -11 : 18) : 0;
            Quat.fromEuler(this.swing, angle, 0, 0);
            Quat.multiply(this.pose, limb.base, this.swing);
            limb.node.setRotation(this.pose);
        }
    }

    setup(guestId: string, customerId: string, tint: string, from: Vec3): void {
        this.guestId = guestId;
        this.leaving = false;
        this.seated = false;
        this.node.setWorldPosition(from);
        this.target.set(from);
        const skin = ['A', 'B', 'C'][(Number(customerId.slice(1)) - 1 + 3) % 3];
        this.body?.getComponentInChildren(ModelSlot)?.showVariant(skin);
        this.bindScannedAnimation();
        this.playScannedPose('GuestIdle');
        if (this.critHat) this.critHat.active = customerId === 'C07';
        if (this.tint !== tint) {
            this.tint = tint;
            const c = hexColor(tint);
            for (const r of this.clothRenderers()) {
                const indices = r.sharedMaterials.map((m, i) => /cloth/i.test(m?.name ?? '') ? i : -1).filter(i => i >= 0);
                for (const i of indices.length ? indices : [0]) r.getMaterialInstance(i)?.setProperty('mainColor', c);
            }
        }
        this.setBowl(false);
    }

    /** 预制体里指定的上色网格；用 Blender 模型时自动找名字含 Cloth 的材质（MAT_C02_Cloth）。 */
    private clothRenderers(): MeshRenderer[] {
        const found = (this.body?.getComponentsInChildren(MeshRenderer) ?? [])
            .filter(r => r.node.activeInHierarchy && r.sharedMaterials.some(m => /cloth/i.test(m?.name ?? '')));
        return found.length ? found : this.tintRenderers;
    }

    walkTo(pos: Vec3): void { this.target.set(pos); }

    setBowl(on: boolean): void { if (this.bowl && this.bowl.active !== on) this.bowl.active = on; }

    get arrived(): boolean { return Vec3.distance(this.node.worldPosition, this.target) < 0.05; }

    update(dt: number): void {
        const pause = this.animationsPaused || this.reduceMotion;
        if (pause !== this.animationWasPaused) {
            if (pause) this.scannedAnimation?.pause(); else this.scannedAnimation?.resume();
            this.animationWasPaused = pause;
        }
        if (this.animationsPaused) return;
        dt = Math.min(dt, 0.05);
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
            Quat.fromEuler(this.turn, 0, yaw, 0);
            Quat.slerp(this.pose, this.node.worldRotation, this.turn, Math.min(1, dt * 10));
            this.node.setWorldRotation(this.pose);
            this.bob += dt * 10;
            if (this.body) this.body.setPosition(0, (this.reduceMotion ? 0 : Math.abs(Math.sin(this.bob)) * 0.018), 0);
            this.animateLimbs(true);
            this.playScannedPose('GuestWalk');
        } else if (this.body) {
            this.body.setPosition(0, 0, 0);
            this.animateLimbs(false);
            this.playScannedPose(this.seated && !this.leaving ? 'GuestSit' : 'GuestIdle');
            if (this.seated && !this.leaving) {
                Quat.fromEuler(this.turn, 0, 180, 0);
                Quat.slerp(this.pose, this.node.worldRotation, this.turn, Math.min(1, dt * 7));
                this.node.setWorldRotation(this.pose);
            }
        }
    }
}
