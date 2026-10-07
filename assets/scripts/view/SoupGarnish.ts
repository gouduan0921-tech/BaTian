import { Color, instantiate, Material, Mesh, MeshRenderer, Node, Prefab, primitives, utils } from 'cc';

/** 配料的形状和份量；同一种食材合为一个网格，四锅时也不逐粒产生绘制开销。 */
const FOOD: Record<string, { color: string; count: number; shape: 'box' | 'round' | 'shrimp'; size: [number, number, number] }> = {
    I02: { color: '#DBAF45', count: 64, shape: 'round', size: [.009, .005, .009] },
    I03: { color: '#B28A75', count: 12, shape: 'box', size: [.052, .009, .020] },
    I04: { color: '#40372F', count: 8, shape: 'round', size: [.052, .019, .044] },
    I05: { color: '#EE9D29', count: 9, shape: 'box', size: [.052, .022, .047] },
    I06: { color: '#408147', count: 15, shape: 'round', size: [.051, .006, .022] },
    I07: { color: '#ED8763', count: 5, shape: 'shrimp', size: [.020, .014, .018] },
    I08: { color: '#FFF1DC', count: 7, shape: 'round', size: [.087, .011, .043] },
    I09: { color: '#81503B', count: 10, shape: 'box', size: [.059, .014, .036] },
    I10: { color: '#852F32', count: 28, shape: 'round', size: [.021, .011, .032] },
    I11: { color: '#272520', count: 90, shape: 'round', size: [.007, .004, .011] },
    I12: { color: '#F5DCAB', count: 23, shape: 'box', size: [.087, .006, .008] },
};
const assets = new Map<string, { mesh: Mesh; material: Material }>();

function foodAsset(id: string): { mesh: Mesh; material: Material } {
    const cached = assets.get(id);
    if (cached) return cached;
    const food = FOOD[id];
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    const round = primitives.sphere(.5, { segments: 8 });
    const box = primitives.box();
    const append = (x: number, z: number, a: number, size: [number, number, number], cube: boolean) => {
        const geo = cube ? box : round;
        const base = positions.length / 3, c = Math.cos(a), s = Math.sin(a);
        for (let k = 0; k < geo.positions.length; k += 3) {
            const px = geo.positions[k] * size[0], py = geo.positions[k + 1] * size[1], pz = geo.positions[k + 2] * size[2];
            positions.push(x + px * c - pz * s, .005 + py, z + px * s + pz * c);
            const nx = geo.normals![k] / size[0], ny = geo.normals![k + 1] / size[1], nz = geo.normals![k + 2] / size[2];
            const length = Math.hypot(nx, ny, nz) || 1;
            normals.push((nx * c - nz * s) / length, ny / length, (nx * s + nz * c) / length);
        }
        for (const index of geo.indices!) indices.push(base + index);
    };
    const seed = Number(id.slice(1));
    for (let i = 0; i < food.count; i++) {
        const a = i * 2.399963 + seed * .43;
        const radius = .275 * Math.sqrt((i + .5) / food.count);
        const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
        const angle = a + Math.sin(i * 1.7) * .7;
        if (food.shape === 'shrimp') {
            // 一只虾用七个渐细的节围成弧，而不是通用方块。
            for (let j = 0; j < 7; j++) {
                const arc = -.9 + j * .34, size = 1 - j * .065;
                append(x + Math.cos(angle + arc) * .034, z + Math.sin(angle + arc) * .034, angle + arc,
                    [food.size[0] * size, food.size[1] * size, food.size[2] * size], false);
            }
        } else append(x, z, angle, food.size, food.shape === 'box');
    }
    const mesh = utils.createMesh({ positions, normals, indices });
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    const hex = Number.parseInt(food.color.slice(1), 16);
    material.setProperty('mainColor', new Color(hex >> 16, (hex >> 8) & 255, hex & 255));
    material.setProperty('roughness', .76);
    const value = { mesh, material };
    assets.set(id, value);
    return value;
}

/** 只显示实际已入锅的食材；缺料不会出现假配料。时令专用模型继续沿用。 */
export class SoupGarnish {
    private readonly groups = new Map<string, Node>();
    private readonly root: Node;
    constructor(parent: Node, detailedFood: Prefab | null = null) {
        this.root = detailedFood ? instantiate(detailedFood) : new Node('RecipeFoodShapes');
        this.root.layer = parent.layer;
        this.root.parent = parent;
        const visit = (node: Node): void => {
            node.layer = parent.layer;
            if (FOOD[node.name]) {
                this.groups.set(node.name, node);
                node.active = false;
            }
            for (const renderer of node.getComponents(MeshRenderer)) {
                renderer.shadowCastingMode = 0;
                renderer.receiveShadow = 1;
            }
            for (const child of node.children) visit(child);
        };
        visit(this.root);
    }
    render(ids: string[], active: boolean, level: number): void {
        this.root.active = active;
        if (!active) return;
        this.root.setPosition(0, level + .006, 0);
        for (const id of ids) {
            if (!FOOD[id] || this.groups.has(id)) continue;
            const node = new Node(id);
            node.layer = this.root.layer;
            node.parent = this.root;
            const renderer = node.addComponent(MeshRenderer);
            const asset = foodAsset(id);
            renderer.mesh = asset.mesh;
            renderer.setMaterial(asset.material, 0);
            renderer.shadowCastingMode = 0;
            renderer.receiveShadow = 1;
            this.groups.set(id, node);
        }
        for (const [id, node] of this.groups) node.active = ids.includes(id);
    }
}
