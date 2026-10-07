import { _decorator, Camera, Color, Component, Mesh, MeshRenderer, Node, primitives, Quat, renderer, utils, Vec3 } from 'cc';

const { ccclass, property } = _decorator;
interface Puff {
    node: Node; age: number; life: number; alive: boolean;
    origin: Vec3; drift: Vec3; phase: number; material: renderer.MaterialInstance | null;
}
let steamQuad: Mesh | null = null;

/** Bounded, reusable camera-facing wisps. Fire controls emission, not the game clock. */
@ccclass('SteamPuffs')
export class SteamPuffs extends Component {
    @property rise = 0.95;
    @property life = 1.9;
    @property startScale = 0.10;
    @property endScale = 0.44;
    @property(Color) tone: Color = new Color(255, 249, 237, 70);

    paused = false;
    reduceMotion = false;
    private puffs: Puff[] = [];
    private rate = 0;
    private acc = 0;
    private seed = 1;
    private camera: Camera | null = null;
    private readonly facing = new Quat();
    private readonly c = new Color();

    onLoad(): void {
        steamQuad ??= utils.createMesh(primitives.quad());
        // Different pots must not emit the same pattern in lockstep.
        this.seed = 1 + Math.round(Math.abs(this.node.parent?.position.x ?? 0) * 9173);
        this.puffs = this.node.children.map(n => {
            const r = n.getComponent(MeshRenderer);
            if (r) { r.mesh = steamQuad; r.shadowCastingMode = 0; r.receiveShadow = 0; }
            n.active = false;
            return { node: n, age: 0, life: this.life, alive: false,
                origin: new Vec3(), drift: new Vec3(), phase: 0, material: r?.getMaterialInstance(0) ?? null };
        });
    }

    faceCamera(camera: Camera | null): void { this.camera = camera; }
    setRate(perSecond: number): void { this.rate = Math.max(0, perSecond); }
    setTone(c: Color): void { this.tone.set(c); }

    private rand(): number {
        this.seed = (this.seed * 16807) % 2147483647;
        return this.seed / 2147483647;
    }

    lateUpdate(dt: number): void {
        // A resumed background tab must not spawn or fling a whole cloud in one frame.
        if (this.paused) return;
        dt = Math.min(dt, 0.05);
        this.acc += this.rate * dt;
        while (this.acc >= 1) {
            this.acc -= 1;
            const p = this.puffs.find(x => !x.alive);
            if (!p) { this.acc = 0; break; }
            p.alive = true;
            p.age = 0;
            p.life = this.life * (0.8 + this.rand() * 0.4);
            p.origin.set((this.rand() - 0.5) * 0.37, 0, (this.rand() - 0.5) * 0.25);
            p.drift.set((this.rand() - 0.5) * 0.14, 0, (this.rand() - 0.5) * 0.14);
            p.phase = this.rand() * Math.PI * 2;
            p.node.active = true;
        }
        if (this.camera) this.camera.node.getWorldRotation(this.facing);
        for (const p of this.puffs) {
            if (!p.alive) continue;
            p.age += dt;
            const k = p.age / p.life;
            if (k >= 1) { p.alive = false; p.node.active = false; continue; }
            const curl = this.reduceMotion ? 0 : Math.sin(k * 5 + p.phase) * k * 0.06;
            p.node.setPosition(p.origin.x + p.drift.x * p.age + curl,
                k * this.rise, p.origin.z + p.drift.z * p.age);
            const s = this.startScale + (this.endScale - this.startScale) * Math.sqrt(k);
            p.node.setScale(s, s * (1.5 + 0.4 * k), 1);
            if (this.camera) p.node.setWorldRotation(this.facing);
            this.c.set(this.tone.r, this.tone.g, this.tone.b,
                Math.round(this.tone.a * Math.sin(Math.PI * k) * (1 - k * 0.45)));
            p.material?.setProperty('mainColor', this.c);
        }
    }
}
