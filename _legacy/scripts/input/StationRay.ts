export type Station = 'PREP' | 'BURNER_A' | 'BURNER_B' | 'BURNER_C' | 'BURNER_D' | 'PLATE' | 'COUNTER';
export interface Vec { x: number; y: number; z: number }
export interface Hitbox { station: Station; center: Vec; half: Vec }

/** 简化命中体，只服务点选。坐标与灰盒工位一致。 */
export const STATION_HITBOXES: Hitbox[] = [
    { station: 'PREP', center: { x: -2.5, y: 0.45, z: -1.8 }, half: { x: 0.75, y: 0.55, z: 0.6 } },
    { station: 'BURNER_A', center: { x: -0.7, y: 0.65, z: -1.8 }, half: { x: 0.55, y: 0.65, z: 0.55 } },
    { station: 'BURNER_B', center: { x: 0.6, y: 0.45, z: -1.8 }, half: { x: 0.55, y: 0.55, z: 0.55 } },
    { station: 'BURNER_C', center: { x: -0.7, y: 0.65, z: -0.65 }, half: { x: 0.48, y: 0.65, z: 0.48 } },
    { station: 'BURNER_D', center: { x: 0.6, y: 0.65, z: -0.65 }, half: { x: 0.48, y: 0.65, z: 0.48 } },
    { station: 'PLATE', center: { x: 2.3, y: 0.45, z: -1.8 }, half: { x: 0.75, y: 0.55, z: 0.6 } },
    { station: 'COUNTER', center: { x: 0, y: 0.45, z: 1 }, half: { x: 2.3, y: 0.55, z: 0.5 } },
];

export function rayBox(origin: Vec, direction: Vec, center: Vec, half: Vec): number {
    let near = 0, far = Infinity;
    for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(direction[axis]) < 0.00001) {
            if (Math.abs(origin[axis] - center[axis]) > half[axis]) return Infinity;
            continue;
        }
        const a = (center[axis] - half[axis] - origin[axis]) / direction[axis];
        const b = (center[axis] + half[axis] - origin[axis]) / direction[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far) return Infinity;
    }
    return near;
}

export function pickStation(origin: Vec, direction: Vec): Station | '' {
    let station: Station | '' = '';
    let nearest = Infinity;
    for (const hitbox of STATION_HITBOXES) {
        const distance = rayBox(origin, direction, hitbox.center, hitbox.half);
        if (distance < nearest) { nearest = distance; station = hitbox.station; }
    }
    return station;
}
