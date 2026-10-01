import { AtmoPart, ATMO_PARTS, Customer, GameConfig, SlotId, SLOTS } from '../core/Config';

/** 氛围计算（文档 09 §2、13）。 */

export interface SlotPlacement { main: string | null; smalls: string[] }
export type DecorPlacement = Record<SlotId, SlotPlacement>;

export function emptyPlacement(): DecorPlacement {
    const p = {} as DecorPlacement;
    for (const s of SLOTS) p[s] = { main: null, smalls: [] };
    return p;
}

export interface AtmoDynamic {
    cookingPots: number;
    burntPots: number;
    /** 空碗造成的整洁扣减（负数） */
    dirtyClean: number;
    seated: number;
    seats: number;
}

export interface AtmoReading {
    parts: Record<AtmoPart, number>;
    total: number;
    mixed: boolean;
    styleCount: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 装修带来的静态分量（不含动态项），以及混色信息。 */
export function staticParts(config: GameConfig, placement: DecorPlacement): { parts: Record<AtmoPart, number>; mixed: boolean; styleCount: number } {
    const a = config.atmosphere;
    const parts = { ...a.base } as Record<AtmoPart, number>;
    const styles = new Set<string>();
    for (const slot of SLOTS) {
        const p = placement[slot];
        const ids = [p.main, ...p.smalls].filter((x): x is string => !!x);
        for (const id of ids) {
            const d = config.decorById.get(id);
            if (!d) continue;
            parts.warmth += d.atmosphere.warmth;
            parts.clean += d.atmosphere.clean;
            parts.aroma += d.atmosphere.aroma;
            parts.light += d.atmosphere.light;
        }
        if (p.main) {
            const d = config.decorById.get(p.main);
            if (d && d.style !== 'common') styles.add(d.style);
        }
    }
    const mixed = styles.size > a.mixStyleLimit;
    if (mixed) parts.light -= a.mixLightPenalty;
    return { parts, mixed, styleCount: styles.size };
}

export function readAtmosphere(config: GameConfig, placement: DecorPlacement, dyn: AtmoDynamic, weightShift?: Partial<Record<AtmoPart, number>>): AtmoReading {
    const a = config.atmosphere;
    const st = staticParts(config, placement);
    const parts = { ...st.parts };
    parts.aroma += dyn.cookingPots * a.cookingAroma + dyn.burntPots * a.burntAroma;
    parts.clean += dyn.dirtyClean + (dyn.burntPots > 0 ? a.burntPotClean : 0);
    parts.crowd = dyn.seats > 0 ? (dyn.seated / dyn.seats) * 100 : 0;
    let total = 0;
    for (const k of ATMO_PARTS) {
        parts[k] = clamp(parts[k], 0, 100);
        total += parts[k] * (a.weights[k] + (weightShift?.[k] ?? 0));
    }
    return { parts, total: clamp(total, 0, 100), mixed: st.mixed, styleCount: st.styleCount };
}

/** 对具体客人生效的氛围强度 t'。 */
export function tPrime(total: number, customer: Customer): number {
    return (total / 100) * (0.5 + customer.atmosphereCare);
}

export function atmosphereWords(avg: number): string {
    if (avg < 30) return '今天铺子有点冷清。';
    if (avg < 60) return '有人愿意把粥喝完。';
    return '有人坐下来又点了一碗。';
}
