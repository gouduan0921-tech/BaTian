import { _decorator, Color, Component, MeshRenderer, Node, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

interface Puff { node: Node; age: number; life: number; alive: boolean; drift: Vec3; renderer: MeshRenderer | null }

/**
 * 锅上的蒸汽（文档 15 §4）：子节点就是一团团蒸汽，数量上限 = 子节点数（每口锅 ≤ 40）。
 * 用对象复用代替粒子系统，密度由 setRate 控制；颜色随灯光与糊底变化由 setTone 控制。
 */
@ccclass('SteamPuffs')
export class SteamPuffs extends Component {
    @property rise = 0.7;
    @property life = 1.6;
    @property startScale = 0.06;
    @property endScale = 0.22;
    @property(Color) tone: Color = new Color(255, 255, 255, 150);

    private puffs: Puff[] = [];
    private rate = 0;
    private acc = 0;
    private seed = 1;
    private readonly c = new Color();

    onLoad(): void {
        this.puffs = this.node.children.map(n => ({
            node: n, age: 0, life: this.life, alive: false, drift: new Vec3(), renderer: n.getComponent(MeshRenderer),
        }));
        for (const p of this.puffs) p.node.active = false;
    }

    setRate(perSecond: number): void { this.rate = Math.max(0, perSecond); }

    setTone(c: Color): void { this.tone = c.clone(); }

    private rand(): number {
        this.seed = (this.seed * 16807) % 2147483647;
        return this.seed / 2147483647;
    }

    update(dt: number): void {
        this.acc += this.rate * dt;
        while (this.acc >= 1) {
            this.acc -= 1;
            const p = this.puffs.find(x => !x.alive);
            if (!p) { this.acc = 0; break; }
            p.alive = true;
            p.age = 0;
            p.life = this.life * (0.75 + this.rand() * 0.5);
            p.drift.set((this.rand() - 0.5) * 0.25, 0, (this.rand() - 0.5) * 0.25);
            p.node.setPosition((this.rand() - 0.5) * 0.35, 0, (this.rand() - 0.5) * 0.2);
            p.node.active = true;
        }
        for (const p of this.puffs) {
            if (!p.alive) continue;
            p.age += dt;
            const k = p.age / p.life;
            if (k >= 1) { p.alive = false; p.node.active = false; continue; }
            const pos = p.node.position;
            p.node.setPosition(pos.x + p.drift.x * dt, k * this.rise, pos.z + p.drift.z * dt);
            const s = this.startScale + (this.endScale - this.startScale) * k;
            p.node.setScale(s, s, s);
            this.c.set(this.tone.r, this.tone.g, this.tone.b, Math.round(this.tone.a * Math.sin(Math.PI * k)));
            p.renderer?.getMaterialInstance(0)?.setProperty('mainColor', this.c);
        }
    }
}
