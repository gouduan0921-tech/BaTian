import { _decorator, Color, Component, instantiate, Label, Node, Prefab, UIOpacity, Vec3 } from 'cc';
import { RoundRect } from './RoundRect';
import { setActive, setText } from './UiKit';

const { ccclass, property } = _decorator;

interface Float { node: Node; op: UIOpacity | null; t: number; life: number; from: Vec3; rise: number }

/**
 * 营业界面的手感反馈（挂在 ui/HudView 上）：
 * - 送达时铜钱「+36」从出餐台向上浮起（设计稿：送达时铜钱短暂向上浮起）；
 * - 屏幕上方盖一枚结果小章（刚好 / 过火 / 夹生 / 糊底），连续刚好时写「连着 3 碗刚好」；
 * - 钱包数字滚动到新值。
 * 只做表现，不改任何数值；「减少动效」时直接跳到结果。
 */
@ccclass('HudFx')
export class HudFx extends Component {
    @property(Node) floatRoot: Node | null = null;
    @property(Prefab) floatPrefab: Prefab | null = null;
    @property(Node) stamp: Node | null = null;
    @property(RoundRect) stampRing: RoundRect | null = null;
    @property(Label) stampTitle: Label | null = null;
    @property(Label) stampSub: Label | null = null;

    reduceMotion = false;
    private floats: Float[] = [];
    private pool: Node[] = [];
    private stampT = -1;
    private shown = -1;

    /** 在 at（floatRoot 下的坐标）处浮起一行字。 */
    float(text: string, at: Vec3, color: Color, rise = 70): void {
        if (!this.floatRoot || !this.floatPrefab) return;
        const node = this.pool.pop() ?? instantiate(this.floatPrefab);
        node.parent = this.floatRoot;
        node.active = true;
        node.setPosition(at);
        node.setScale(1, 1, 1);
        const label = node.getComponentInChildren(Label);
        if (label) { label.string = text; label.color = color; }
        const op = node.getComponent(UIOpacity);
        if (op) op.opacity = 255;
        this.floats.push({ node, op, t: 0, life: this.reduceMotion ? 0.9 : 1.4, from: at.clone(), rise: this.reduceMotion ? 0 : rise });
    }

    /** 盖一枚结果章。tone：good 青釉 / warn 铜金 / bad 砖红。 */
    showStamp(title: string, sub: string, tone: 'good' | 'warn' | 'bad'): void {
        if (!this.stamp) return;
        const col = tone === 'good' ? new Color(0x32, 0x6b, 0x5b, 255) : tone === 'warn' ? new Color(0xa0, 0x74, 0x30, 255) : new Color(0x97, 0x4b, 0x32, 255);
        setText(this.stampTitle, title);
        setText(this.stampSub, sub);
        if (this.stampTitle) this.stampTitle.color = col;
        this.stampRing?.setStroke(col, 3);
        setActive(this.stamp, true);
        this.stampT = 0;
    }

    /** 钱包显示值滚向 target；返回这一帧该显示的数。 */
    rollWallet(target: number, dt: number): number {
        if (this.shown < 0 || this.reduceMotion || Math.abs(target - this.shown) > 2000) this.shown = target;
        else if (this.shown !== target) {
            const step = Math.max(1, Math.ceil(Math.abs(target - this.shown) * Math.min(1, dt * 6)));
            this.shown += Math.sign(target - this.shown) * Math.min(step, Math.abs(target - this.shown));
        }
        return this.shown;
    }

    update(dt: number): void {
        for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.t += dt;
            const k = Math.min(1, f.t / f.life);
            const ease = 1 - (1 - k) * (1 - k);
            f.node.setPosition(f.from.x, f.from.y + f.rise * ease, 0);
            if (f.op) f.op.opacity = Math.round(255 * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4));
            if (k >= 1) {
                f.node.active = false;
                this.pool.push(f.node);
                this.floats.splice(i, 1);
            }
        }
        if (this.stamp && this.stampT >= 0) {
            this.stampT += dt;
            const t = this.stampT;
            const pop = this.reduceMotion ? 1 : t < 0.18 ? 1.35 - 0.35 * (t / 0.18) : 1;
            this.stamp.setScale(pop, pop, 1);
            const op = this.stamp.getComponent(UIOpacity);
            if (op) op.opacity = Math.round(255 * (t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.4)));
            if (t > 1.5) { this.stampT = -1; this.stamp.active = false; }
        }
    }
}
