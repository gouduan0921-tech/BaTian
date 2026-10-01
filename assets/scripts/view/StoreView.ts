import { _decorator, Camera, Component, geometry, instantiate, MeshRenderer, Node, Prefab, Vec3 } from 'cc';
import { GameConfig } from '../core/Config';
import { Progress } from '../rules/Progress';
import { Shift } from '../rules/Shift';
import { DecorSlotView } from './DecorSlotView';
import { CUSTOMER_TINT } from './GameContext';
import { GuestView } from './GuestView';
import { PotView } from './PotView';
import { ModelSlot } from './ModelSlot';

const { ccclass, property } = _decorator;

export type StorePick = { kind: 'pot'; index: number } | { kind: 'seat'; index: number };

/**
 * 整间铺子的 3D 表现（预制体 stage/Store，文档 14、15）。
 * 锅、座位、门口、装修槽位都是预制体里摆好的锚点；脚本只根据规则状态开关与移动。
 */
@ccclass('StoreView')
export class StoreView extends Component {
    @property(Camera) camera: Camera | null = null;
    @property([PotView]) pots: PotView[] = [];
    @property([Node]) seatAnchors: Node[] = [];
    @property([Node]) seatProps: Node[] = [];
    @property([Node]) dirtyBowls: Node[] = [];
    @property(Node) doorAnchor: Node | null = null;
    @property(Node) exitAnchor: Node | null = null;
    @property(Node) guestRoot: Node | null = null;
    @property(Prefab) guestPrefab: Prefab | null = null;
    @property([DecorSlotView]) slots: DecorSlotView[] = [];
    @property([Node]) passBowls: Node[] = [];

    private readonly guests = new Map<string, GuestView>();
    private readonly pool: GuestView[] = [];
    private readonly tmp = new Vec3();

    /** 每帧调用；shift 为空时只画装修与空锅。 */
    render(config: GameConfig, progress: Progress | null, shift: Shift | null, dt: number): void {
        const bal = config.balance;
        const potCount = shift ? shift.state.pots.length : progress?.pots ?? 1;
        this.pots.forEach((view, i) => {
            const pot = shift ? shift.state.pots[i] ?? null : null;
            const owned = i < potCount;
            view.render(bal, owned ? pot ?? emptyVisual(i) : null, pot ? shift!.recipe(pot.recipeId) : null,
                !!shift && shift.state.focus === i, shift ? shift.warnLine(pot?.recipeId ?? null) : bal.stir.warn, dt);
        });

        const seats = shift ? shift.state.setup.seats : progress?.seats ?? 2;
        this.seatProps.forEach((n, i) => { n.active = i < seats; });
        this.dirtyBowls.forEach((n, i) => { n.active = !!shift && !!shift.state.dirty[i]; });
        this.passBowls.forEach((n, i) => { n.active = !!shift && i < shift.state.pass.length; });
        const bowlId = shift?.state.setup.tableware ?? progress?.state.tableware ?? 'D10';
        for (const n of this.passBowls) n.getComponent(ModelSlot)?.showVariant(bowlId);
        for (const n of this.dirtyBowls) n.getComponentInChildren(ModelSlot)?.showVariant(bowlId);

        const placement = shift?.state.setup.placement ?? progress?.state.placement;
        if (placement) for (const s of this.slots) s.show(placement[s.slotId as keyof typeof placement]?.main ?? null, placement[s.slotId as keyof typeof placement]?.smalls ?? []);
        const hallMain = placement?.hall?.main;
        this.seatProps.forEach(n => {
            const table = n.getChildByName('TableArt');
            if (table) table.active = !hallMain;
        });
        const hall = this.slots.find(s => s.slotId === 'hall');
        for (const v of hall?.mains?.children ?? []) {
            for (const n of v.children) {
                const m = /^DecorTable(\d)$/.exec(n.name);
                if (m) n.active = Number(m[1]) < seats;
            }
        }
        const windowSlot = this.slots.find(s => s.slotId === 'window');
        for (const v of windowSlot?.mains?.children ?? []) {
            for (const n of v.children) {
                const m = /^(?:Lamp|BrassLamp)(\d)$/.exec(n.name);
                if (m) n.active = Number(m[1]) * 2 < seats;
            }
        }

        this.renderGuests(shift);
    }

    private renderGuests(shift: Shift | null): void {
        const st = shift?.state;
        const live = new Set<string>();
        if (st) {
            let q = 0;
            for (const g of Object.values(st.guests)) {
                if (g.state === 'left') continue;
                live.add(g.id);
                let v = this.guests.get(g.id);
                if (!v) {
                    v = this.spawn() ?? undefined;
                    if (!v) continue;
                    v.setup(g.id, g.customerId, CUSTOMER_TINT[g.customerId] ?? '#888888', this.doorAnchor?.worldPosition ?? Vec3.ZERO);
                    this.guests.set(g.id, v);
                }
                if (g.state === 'door') {
                    const idx = st.queue.indexOf(g.id);
                    const door = this.doorAnchor?.worldPosition ?? Vec3.ZERO;
                    v.walkTo(this.tmp.set(door.x + 0.7 * Math.max(0, idx < 0 ? q++ : idx), door.y, door.z + 0.6));
                } else if (g.state === 'seated' && this.seatAnchors[g.seat]) {
                    v.walkTo(this.seatAnchors[g.seat].worldPosition);
                    v.setBowl(g.served);
                    v.bowl?.getComponent(ModelSlot)?.showVariant(st.setup.tableware);
                }
            }
        }
        for (const [id, v] of this.guests) {
            if (live.has(id)) continue;
            if (!v.leaving) {
                v.leaving = true;
                v.setBowl(false);
                v.walkTo(this.exitAnchor?.worldPosition ?? this.doorAnchor?.worldPosition ?? Vec3.ZERO);
            } else if (v.arrived || !st) {
                this.guests.delete(id);
                v.node.active = false;
                this.pool.push(v);
            }
        }
    }

    private spawn(): GuestView | null {
        const reuse = this.pool.pop();
        if (reuse) { reuse.node.active = true; return reuse; }
        if (!this.guestPrefab || !this.guestRoot) return null;
        const node = instantiate(this.guestPrefab);
        node.parent = this.guestRoot;
        return node.getComponent(GuestView);
    }

    /** 屏幕坐标拾取锅或脏桌（射线对包围盒，不依赖物理）。 */
    pick(x: number, y: number): StorePick | null {
        if (!this.camera) return null;
        const ray = this.camera.screenPointToRay(x, y);
        let best: StorePick | null = null;
        let bestDist = Infinity;
        const test = (r: MeshRenderer | null | undefined, pick: StorePick) => {
            const aabb = r?.model?.worldBounds;
            if (!aabb || !r!.node.activeInHierarchy) return;
            const d = geometry.intersect.rayAABB(ray, aabb);
            if (d > 0 && d < bestDist) { bestDist = d; best = pick; }
        };
        this.pots.forEach((p, i) => {
            // 独立于灰盒显示状态，正式锅和未解锁锅都能点中。
            const pos = p.node.worldPosition;
            const scale = p.node.worldScale;
            const bounds = new geometry.AABB(pos.x, pos.y - 0.04 * scale.y, pos.z,
                0.61 * scale.x, 0.38 * scale.y, 0.55 * scale.z);
            const d = geometry.intersect.rayAABB(ray, bounds);
            if (d > 0 && d < bestDist) { bestDist = d; best = { kind: 'pot', index: i }; }
        });
        this.dirtyBowls.forEach((n, i) => {
            for (const r of n.getComponentsInChildren(MeshRenderer)) test(r, { kind: 'seat', index: i });
        });
        return best;
    }
}

function emptyVisual(index: number) {
    return {
        index, phase: 'empty' as const, recipeId: null, heat: 'mid' as const, simmer: 0, stir: 1, doneness: 0, scorch: 0, added: [],
        seasoning: null, baseFresh: 0, addFresh: 0, washLeft: 0, sinceStir: 0, locked: false, stirWarned: false, scorchCooldown: 0, windowAnnounced: false,
    };
}
