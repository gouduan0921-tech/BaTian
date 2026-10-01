import { Color, Material, MeshRenderer, Node, Prefab, instantiate, primitives, resources, utils, Vec3 } from 'cc';
import { PotReadout, visibleSoup } from '../rules/StoveDesk';

/** 与工位射线同一套落点。模型加载后灰盒让位，坐标不改。 */
export const BURNER_FOCUS = [
    new Vec3(-0.7, 0.6, -1.8),
    new Vec3(0.6, 0.6, -1.8),
    new Vec3(-0.7, 0.6, -0.65),
    new Vec3(0.6, 0.6, -0.65),
];
const POT_MOUTH = [
    new Vec3(-0.7, 1.28, -1.8),
    new Vec3(0.6, 1.28, -1.8),
    new Vec3(-0.7, 1.28, -0.65),
    new Vec3(0.6, 1.28, -0.65),
];
const STEAM_ANCHOR = [
    new Vec3(-0.7, 1.62, -1.8),
    new Vec3(0.6, 1.62, -1.8),
    new Vec3(-0.7, 1.62, -0.65),
    new Vec3(0.6, 1.62, -0.65),
];
const EXTRA_POTS = [{ letter: 'C', x: -0.7, z: -0.65 }, { letter: 'D', x: 0.6, z: -0.65 }];

export interface StoreFrame {
    potCount: number;
    day: number;
    seated: number;
    lightId: string;
    style: string;
    ownedDecor: ReadonlySet<string>;
    reads: readonly PotReadout[];
}

/**
 * 店铺画面。先摆灰盒，Blender 预制体到了就关掉对应方块。
 * 锅的解锁、汤色、蒸汽和快糊圈都由当班状态刷新。
 */
export class StoreStage {
    private readonly shells: Node[] = [];
    private readonly potLights: MeshRenderer[] = [];
    private readonly potRings: MeshRenderer[] = [];
    private steamPuffs: Node[][] = [];
    private readonly garnishes: Node[][] = [];
    private readonly placeholders: Node[] = [];
    private readonly guestBoxes: Node[] = [];
    private readonly guestModels: Node[] = [];
    private readonly sampleBowls: Array<{ node: Node; unlockDay: number }> = [];
    private readonly potFood = new Map<string, Node>();
    private readonly extraPotGroups: Node[] = [];
    private burnerCover: Node | null = null;
    private burnerPot: Node | null = null;
    private lamp: Node | null = null;
    private copper: Node | null = null;
    private windowLight: Node | null = null;
    private jar: Node | null = null;
    private scallion: Node | null = null;
    private glaze: Node | null = null;
    private nightCup: Node | null = null;
    private floor: MeshRenderer | null = null;
    private wall: MeshRenderer | null = null;
    private sign: MeshRenderer | null = null;
    private frame: StoreFrame | null = null;
    private steamTime = 0;
    private interior: Node | null = null;
    private paintedStyle = '';

    constructor(parent: Node) {
        const root = new Node('Store_Stage');
        root.parent = parent;
        this.buildGraybox(root);
        this.loadModels(root);
    }

    tick(dt: number): void {
        this.steamTime += Math.min(Math.max(dt, 0), 0.05);
        if (this.frame) this.paintSteam(this.frame.reads);
    }

    show(frame: StoreFrame): void {
        this.frame = frame;
        const open = frame.potCount > 1;
        if (this.burnerCover) this.burnerCover.active = !open;
        if (this.burnerPot) this.burnerPot.active = open;
        if (this.potLights[1]) this.potLights[1].node.active = open;
        if (!open && this.potRings[1]) this.potRings[1].node.active = false;
        this.extraPotGroups.forEach((group, index) => { group.active = frame.potCount > index + 2; });
        for (const sample of this.sampleBowls) sample.node.active = frame.day >= sample.unlockDay;
        this.paintGuests(frame.seated);
        this.paintDecor(frame);
        this.paintPots(frame.reads);
    }

    private buildGraybox(root: Node): void {
        const wood = new Color(118, 80, 56);
        const dark = new Color(33, 29, 26);
        const plaster = new Color(233, 222, 198);
        const green = new Color(33, 77, 69);
        const coal = new Color(212, 106, 53);
        const bowl = new Color(36, 41, 38);
        const floor = this.block(root, 'ENV_Floor', new Vec3(0, -0.14, 0), new Vec3(8, 0.25, 6), plaster);
        const wall = this.block(root, 'ENV_BackWall', new Vec3(0, 1.4, -2.9), new Vec3(8, 2.8, 0.18), dark);
        const splash = this.block(root, 'ENV_SplashTile', new Vec3(0, 0.48, -2.78), new Vec3(8, 0.9, 0.08), green);
        const sign = this.block(root, 'ENV_Sign', new Vec3(0, 2.75, -2.65), new Vec3(5.8, 0.45, 0.18), wood);
        this.shells.push(floor, wall, splash, sign);
        this.floor = floor.getComponent(MeshRenderer);
        this.wall = wall.getComponent(MeshRenderer);
        this.sign = sign.getComponent(MeshRenderer);
        this.block(root, 'STATION_PREP', new Vec3(-2.5, 0.43, -1.8), new Vec3(1.2, 0.85, 0.9), wood);
        this.block(root, 'STATION_BURNER_A', new Vec3(-0.7, 0.36, -1.8), new Vec3(0.9, 0.7, 0.9), plaster);
        this.block(root, 'STATION_BURNER_A_Coal', new Vec3(-0.7, 0.41, -1.3), new Vec3(0.55, 0.18, 0.08), coal);
        this.placeholders.push(this.block(root, 'PROP_Pot_A', new Vec3(-0.7, 0.85, -1.8), new Vec3(0.76, 0.34, 0.76), bowl, true));
        this.potLights.push(this.disc(root, 'STATE_Pot_A', POT_MOUTH[0], dark));
        this.potRings.push(this.ring(root, 'WARN_Pot_A', new Vec3(-0.7, 1.04, -1.8), coal));
        this.garnishes.push(this.garnish(root, 'GARNISH_A', POT_MOUTH[0]));
        this.burnerCover = this.block(root, 'STATION_BURNER_B_Covered', new Vec3(0.6, 0.38, -1.8), new Vec3(0.9, 0.76, 0.9), green);
        this.burnerPot = this.block(root, 'PROP_Pot_B', new Vec3(0.6, 0.85, -1.8), new Vec3(0.76, 0.34, 0.76), bowl, true);
        this.placeholders.push(this.burnerPot);
        this.potLights.push(this.disc(root, 'STATE_Pot_B', POT_MOUTH[1], dark));
        this.potRings.push(this.ring(root, 'WARN_Pot_B', new Vec3(0.6, 1.04, -1.8), coal));
        this.garnishes.push(this.garnish(root, 'GARNISH_B', POT_MOUTH[1]));
        this.steamPuffs = [
            this.steam(root, 'FX_Steam_A', STEAM_ANCHOR[0]),
            this.steam(root, 'FX_Steam_B', STEAM_ANCHOR[1]),
        ];
        for (const pot of EXTRA_POTS) {
            const group = new Node(`BURNER_${pot.letter}`);
            group.parent = root;
            this.extraPotGroups.push(group);
            this.block(group, `STATION_BURNER_${pot.letter}`, new Vec3(pot.x, 0.36, pot.z), new Vec3(0.82, 0.7, 0.82), plaster);
            this.block(group, `STATION_BURNER_${pot.letter}_Coal`, new Vec3(pot.x, 0.41, pot.z + 0.44), new Vec3(0.5, 0.18, 0.08), coal);
            this.placeholders.push(this.block(group, `PROP_Pot_${pot.letter}`, new Vec3(pot.x, 0.85, pot.z), new Vec3(0.68, 0.34, 0.68), bowl, true));
            const mouth = POT_MOUTH[this.potLights.length];
            this.potLights.push(this.disc(group, `STATE_Pot_${pot.letter}`, mouth, dark));
            this.potRings.push(this.ring(group, `WARN_Pot_${pot.letter}`, new Vec3(pot.x, 1.04, pot.z), coal));
            this.steamPuffs.push(this.steam(group, `FX_Steam_${pot.letter}`, STEAM_ANCHOR[this.garnishes.length]));
            this.garnishes.push(this.garnish(group, `GARNISH_${pot.letter}`, mouth));
            group.active = false;
        }
        this.block(root, 'STATION_PLATE', new Vec3(2.3, 0.43, -1.8), new Vec3(1.2, 0.85, 0.9), wood);
        this.block(root, 'STATION_COUNTER', new Vec3(0, 0.43, 1), new Vec3(4.5, 0.85, 0.8), wood);
        this.jar = this.block(root, 'DECOR_Counter_Jar', new Vec3(0.5, 0.95, 0.92), new Vec3(0.18, 0.32, 0.18), green, true);
        this.scallion = this.block(root, 'DECOR_Scallion', new Vec3(-3.05, 1.2, -2.55), new Vec3(0.1, 0.42, 0.1), new Color(86, 140, 72), true);
        this.glaze = this.block(root, 'DECOR_Glaze_Bowl', new Vec3(-0.55, 0.96, 0.95), new Vec3(0.28, 0.1, 0.28), new Color(214, 142, 72), true);
        this.nightCup = this.block(root, 'DECOR_Night_Cup', new Vec3(1.2, 0.99, 0.95), new Vec3(0.12, 0.18, 0.12), new Color(28, 48, 82), true);
        this.copper = this.block(root, 'DECOR_Copper_Lamp', new Vec3(2.75, 1.75, -1.9), new Vec3(0.2, 0.42, 0.2), coal, true);
        this.windowLight = this.block(root, 'DECOR_Morning_Window', new Vec3(-3.25, 1.65, -2.78), new Vec3(0.8, 1.2, 0.08), plaster);
        for (let i = 0; i < 3; i++) {
            this.block(root, `TRAY_${i + 1}`, new Vec3((i - 1) * 1.4, 0.08, 0), new Vec3(0.65, 0.12, 0.45), bowl);
            this.guestBoxes.push(this.block(root, `CUSTOMER_${i + 1}`, new Vec3((i - 1) * 1.8, 0.75, 2), new Vec3(0.5, 1.5, 0.4), i === 0 ? coal : green));
        }
        this.paintDecor({ potCount: 1, day: 1, seated: 0, lightId: '', style: '', ownedDecor: new Set(), reads: [] });
    }

    private loadModels(root: Node): void {
        const add = (asset: string, name: string, at: Vec3, onReady?: (node: Node) => void) => {
            resources.load(`models/${asset}/${asset}`, Prefab, (error, prefab) => {
                if (error || !prefab || !root.isValid) {
                    console.warn(`[粥霸天] 模型未加载，保留灰盒：${asset}`, error);
                    return;
                }
                const model = instantiate(prefab);
                model.name = name;
                model.parent = root;
                model.setPosition(at);
                onReady?.(model);
                if (this.frame) this.show(this.frame);
            });
        };
        add('PROP_Common_Pot_A', 'Blender_Pot_A', new Vec3(-0.7, 0.67, -1.8), () => { this.placeholders[0].active = false; });
        add('PROP_Common_Pot_A', 'Blender_Pot_B', new Vec3(0.6, 0.67, -1.8), node => {
            this.placeholders[1].active = false;
            this.burnerPot = node;
        });
        EXTRA_POTS.forEach((pot, index) => {
            add('PROP_Common_Pot_A', `Blender_Pot_${pot.letter}`, new Vec3(pot.x, 0.67, pot.z), node => {
                node.parent = this.extraPotGroups[index];
                this.placeholders[2 + index].active = false;
            });
        });
        add('PROP_WarmWood_Lamp_Paper', 'Blender_Lamp', new Vec3(-2.95, 0.88, 0.35), node => { this.lamp = node; });
        add('ENV_Store_Interior_A', 'Blender_Store_Interior', new Vec3(0, 0, 0), node => {
            this.interior = node;
            for (const shell of this.shells) shell.active = false;
        });
        for (const [id, x, unlockDay] of [['R01', -0.85, 1], ['R04', 0, 2], ['R07', 0.85, 4]] as const) {
            const at = new Vec3(x, 0.94, 1);
            const ready = (node: Node) => this.sampleBowls.push({ node, unlockDay });
            add('PROP_Common_Bowl_A', `Sample_Bowl_${id}`, at, ready);
            add(`FOOD_Congee_${id}`, `Sample_Food_${id}`, at, ready);
            add(`FOOD_Congee_${id}`, `PotFood_${id}`, new Vec3(0, -8, 0), node => {
                node.setScale(0.42, 0.42, 0.42);
                node.active = false;
                this.potFood.set(id, node);
            });
        }
        for (let i = 0; i < 3; i++) {
            add('CHAR_C02_A', `Blender_Customer_${i + 1}`, new Vec3((i - 1) * 1.8, 0, 2), node => {
                node.setScale(new Vec3(0.8, 0.8, 0.8));
                this.guestBoxes[i].active = false;
                this.guestModels[i] = node;
            });
        }
    }

    private paintGuests(seated: number): void {
        const count = Math.min(3, Math.max(0, seated));
        this.guestBoxes.forEach((node, index) => { if (node.active || !this.guestModels[index]) node.active = index < count && !this.guestModels[index]; });
        this.guestModels.forEach((node, index) => { if (node) node.active = index < count; });
    }

    private paintDecor(frame: StoreFrame): void {
        if (this.lamp) this.lamp.active = frame.lightId === 'D01';
        if (this.copper) this.copper.active = frame.lightId === 'D02';
        if (this.windowLight) this.windowLight.active = frame.lightId === 'D03';
        if (this.jar) this.jar.active = frame.ownedDecor.has('D12');
        if (this.scallion) this.scallion.active = frame.style === 'warm-wood' || frame.ownedDecor.has('D11');
        if (this.glaze) this.glaze.active = frame.style === 'warm-wood' || frame.style === 'morning-white' || frame.ownedDecor.has('D13');
        if (this.nightCup) this.nightCup.active = frame.style === 'night-blue' || frame.ownedDecor.has('D14');
        const floor = frame.style === 'night-blue' ? new Color(36, 48, 68) : frame.style === 'morning-white' ? new Color(230, 226, 218) : frame.style === 'warm-wood' ? new Color(231, 211, 176) : new Color(233, 222, 198);
        const wall = frame.style === 'night-blue' ? new Color(24, 32, 48) : frame.style === 'morning-white' ? new Color(214, 210, 202) : frame.style === 'warm-wood' ? new Color(92, 64, 44) : new Color(33, 29, 26);
        const sign = frame.style === 'night-blue' ? new Color(196, 138, 74) : frame.style === 'morning-white' ? new Color(143, 166, 160) : frame.style === 'warm-wood' ? new Color(227, 155, 58) : new Color(118, 80, 56);
        this.floor?.getSharedMaterial(0)?.setProperty('mainColor', floor);
        this.wall?.getSharedMaterial(0)?.setProperty('mainColor', wall);
        this.sign?.getSharedMaterial(0)?.setProperty('mainColor', sign);
        if (!this.interior || this.paintedStyle === frame.style) return;
        this.paintedStyle = frame.style;
        const plank = frame.style === 'night-blue' ? new Color(65, 78, 101) : frame.style === 'morning-white' ? new Color(230, 217, 192) : new Color(173, 117, 71);
        const tile = frame.style === 'night-blue' ? new Color(50, 72, 98) : frame.style === 'morning-white' ? new Color(240, 237, 225) : new Color(190, 170, 140);
        const trim = frame.style === 'night-blue' ? new Color(192, 143, 85) : frame.style === 'morning-white' ? new Color(151, 180, 169) : new Color(221, 158, 80);
        const recolor = (node: Node): void => {
            const color = node.name.startsWith('Floor_Plank') ? plank
                : node.name === 'Back_Tile' || node.name.endsWith('Burner_A_CounterTop') || node.name.endsWith('Burner_B_CounterTop') ? tile
                    : node.name === 'Sign_Trim_Top' || node.name === 'Back_Shelf' || node.name === 'Counter_Top' ? trim : null;
            if (color) node.getComponent(MeshRenderer)?.getMaterialInstance(0)?.setProperty('albedo', color);
            for (const child of node.children) recolor(child);
        };
        recolor(this.interior);
    }

    private paintPots(reads: readonly PotReadout[]): void {
        const flames = { low: new Color(92, 122, 138), mid: new Color(212, 122, 48), high: new Color(214, 72, 36) };
        const focused = reads.find(read => read.focused);
        this.potFood.forEach((node, id) => {
            const show = !!focused && focused.recipeId === id && (focused.phase === 'cooking' || focused.phase === 'window');
            node.active = show;
            if (!show || !focused) return;
            const at = POT_MOUTH[focused.index];
            if (at) node.setPosition(at.x, at.y, at.z);
        });
        reads.forEach((read, index) => {
            this.potLights[index]?.getSharedMaterial(0)?.setProperty('mainColor', this.potColor(read, flames));
            this.paintGarnish(index, read);
            const ring = this.potRings[index];
            if (!ring) return;
            ring.node.active = read.warn || read.scorchHot || read.phase === 'burnt';
            ring.getSharedMaterial(0)?.setProperty('mainColor', read.scorchHot || read.phase === 'burnt' ? new Color(92, 48, 28) : new Color(214, 146, 64));
        });
        this.paintSteam(reads);
    }

    private paintSteam(reads: readonly PotReadout[]): void {
        this.steamPuffs.forEach((puffs, index) => {
            const read = reads[index];
            const burnt = !!read && (read.phase === 'burnt' || read.label === '糊底');
            const hot = !!read && read.focused && (read.phase === 'cooking' || read.phase === 'window' || burnt);
            const count = !hot || !read ? 0 : burnt ? 2 : read.heat === 'high' ? 4 : read.heat === 'mid' ? 3 : 2;
            const color = burnt ? new Color(198, 202, 198) : new Color(236, 232, 224);
            const anchor = STEAM_ANCHOR[index];
            puffs.forEach((puff, i) => {
                puff.active = i < count;
                if (!puff.active || !anchor || !read) return;
                const rise = (this.steamTime * (0.22 + i * 0.05) + i * 0.28) % 1;
                const sway = Math.sin(this.steamTime * 1.4 + i * 1.7) * 0.07;
                const lift = burnt ? 0.32 : 0.9;
                puff.setPosition(anchor.x + sway + (i - 1.5) * 0.12, (burnt ? anchor.y - 0.22 : anchor.y) + rise * lift, anchor.z);
                const width = (burnt ? 0.34 : read.heat === 'high' ? 0.52 : 0.42) * (1 - rise * (burnt ? 0.15 : 0.35));
                puff.setScale(width, width * 1.35, width);
                puff.getComponent(MeshRenderer)?.getSharedMaterial(0)?.setProperty('mainColor', color);
            });
        });
    }

    private potColor(read: PotReadout, flames: { low: Color; mid: Color; high: Color }): Color {
        if (read.label === '刚好') return new Color(168, 198, 112);
        if (read.label === '夹生') return new Color(214, 206, 176);
        if (read.label === '过火') return new Color(158, 78, 48);
        if (read.label === '糊底' || read.phase === 'burnt') return new Color(42, 28, 24);
        if (read.phase === 'washing') return new Color(92, 128, 138);
        const soup = colorFromHex(visibleSoup(read.phase, read.label, read.soup));
        if (soup) return soup;
        if (read.phase === 'window') return new Color(232, 196, 120);
        if (read.phase === 'cooking') return flames[read.heat];
        if (read.phase === 'prep') return new Color(168, 132, 86);
        return new Color(33, 29, 26);
    }

    private paintGarnish(index: number, read: PotReadout): void {
        const bits = this.garnishes[index];
        if (!bits) return;
        const cooking = read.phase === 'cooking' || read.phase === 'window';
        const kind = !cooking ? '' : read.recipeId === 'R01' ? 'rice' : read.recipeId === 'R04' ? 'green' : read.recipeId === 'R07' ? 'gold' : '';
        bits.forEach((bit, bitIndex) => {
            bit.active = !!kind && (kind !== 'gold' || bitIndex < 2);
            if (!bit.active) return;
            const color = kind === 'green' ? new Color(92, 140, 64) : kind === 'gold' ? new Color(214, 168, 72) : new Color(248, 236, 214);
            bit.getComponent(MeshRenderer)?.getSharedMaterial(0)?.setProperty('mainColor', color);
            bit.setScale(kind === 'gold' ? 0.16 : 0.08, 0.03, kind === 'green' ? 0.08 : 0.12);
        });
    }

    private material(color: Color): Material {
        const mat = new Material();
        mat.initialize({ effectName: 'builtin-unlit' });
        mat.setProperty('mainColor', color);
        return mat;
    }

    private block(parent: Node, name: string, at: Vec3, size: Vec3, color: Color, cylinder = false): Node {
        const node = new Node(name);
        node.parent = parent;
        node.setPosition(at);
        node.setScale(size);
        const mesh = node.addComponent(MeshRenderer);
        mesh.mesh = utils.createMesh(cylinder ? primitives.cylinder(0.5, 0.5, 1, { radialSegments: 16 }) : primitives.box());
        mesh.setMaterial(this.material(color), 0);
        return node;
    }

    private disc(parent: Node, name: string, at: Vec3, color: Color): MeshRenderer {
        const node = this.block(parent, name, new Vec3(at.x, 1.19, at.z), new Vec3(0.52, 0.07, 0.52), color, true);
        return node.getComponent(MeshRenderer)!;
    }

    private ring(parent: Node, name: string, at: Vec3, color: Color): MeshRenderer {
        const node = this.block(parent, name, at, new Vec3(0.92, 0.02, 0.92), color, true);
        node.active = false;
        return node.getComponent(MeshRenderer)!;
    }

    private steam(parent: Node, name: string, at: Vec3): Node[] {
        const puffs: Node[] = [];
        for (let i = 0; i < 4; i++) {
            const node = this.block(parent, `${name}_${i}`, new Vec3(at.x, at.y + i * 0.28, at.z), new Vec3(0.42, 0.5, 0.42), new Color(236, 232, 224), true);
            node.getComponent(MeshRenderer)!.mesh = utils.createMesh(primitives.sphere(0.5));
            node.active = false;
            puffs.push(node);
        }
        return puffs;
    }

    private garnish(parent: Node, name: string, at: Vec3): Node[] {
        return [0, 1, 2].map(index => {
            const bit = this.block(parent, `${name}_${index}`, new Vec3(at.x + (index - 1) * 0.12, at.y + 0.02, at.z), new Vec3(0.08, 0.03, 0.1), new Color(243, 226, 196));
            bit.active = false;
            return bit;
        });
    }
}

function colorFromHex(hex: string): Color | null {
    if (!hex) return null;
    const value = parseInt(hex.slice(1), 16);
    if (!Number.isFinite(value)) return null;
    return new Color((value >> 16) & 255, (value >> 8) & 255, value & 255);
}
