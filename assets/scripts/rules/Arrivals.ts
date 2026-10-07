import { GameConfig, WaveId, WAVES } from '../core/Config';
import { SeededRng } from '../simulation/SeededRng';

/** 一日客流计划（文档 04 §2）：按波次份额分人数，波次内均匀排布加抖动，再按权重抽原型。 */

export const CRITIC_ID = 'C07';
export const NEIGHBOR_ID = 'C02';

export interface Arrival {
    time: number;
    customerId: string;
    wave: WaveId;
    /** 固定来客，只点这一道（救援街坊） */
    onlyRecipe?: string;
    fixed?: boolean;
    /** 街坊请托约好的客人（文档 30 §3）：只点约好的粥，耐心更长 */
    request?: boolean;
}

export interface FixedGuest { customerId: string; wave: WaveId; first: boolean; onlyRecipe?: string; request?: boolean }

export interface ArrivalInput {
    day: number;
    shopLevel: number;
    unlocked: string[];
    guests: FixedGuest[];
    rescue: boolean;
    bias?: Record<string, number>;
}

export function plannedCount(config: GameConfig, day: number, shopLevel: number): number {
    const d = config.balance.demand;
    if (day <= config.days.length) return config.days[day - 1].scheduledArrivals;
    return Math.min(d.maxArrivals, d.extraDayBase + d.extraPerShopLevel * (shopLevel - 1));
}

/** 最大余数法分配；余数相同时先午市，再清晨、傍晚、午前。 */
export function splitByWave(config: GameConfig, total: number): Record<WaveId, number> {
    const waves = config.balance.demand.waves;
    const tieOrder: WaveId[] = ['lunch', 'morning', 'evening', 'forenoon'];
    const exact = waves.map(w => ({ id: w.id, v: total * w.share }));
    const out = {} as Record<WaveId, number>;
    let used = 0;
    for (const e of exact) { out[e.id] = Math.floor(e.v + 1e-9); used += out[e.id]; }
    const rest = exact
        .map(e => ({ id: e.id, frac: e.v - Math.floor(e.v + 1e-9) }))
        .sort((a, b) => (b.frac - a.frac) || (tieOrder.indexOf(a.id) - tieOrder.indexOf(b.id)));
    for (let i = 0; used < total && i < rest.length; i++, used++) out[rest[i].id]++;
    return out;
}

export function planArrivals(config: GameConfig, input: ArrivalInput, rng: SeededRng): Arrival[] {
    const bal = config.balance;
    const total = plannedCount(config, input.day, input.shopLevel);
    const split = splitByWave(config, total);
    const pool = input.unlocked.map(id => config.customer.get(id)).filter(c => !!c);
    const arrivals: Arrival[] = [];
    let critics = 0;
    for (const w of bal.demand.waves) {
        const n = split[w.id];
        const len = w.end - w.start;
        const spacing = n > 0 ? len / n : len;
        for (let k = 0; k < n; k++) {
            const jitter = (rng.next() * 2 - 1) * bal.demand.arrivalJitter * spacing;
            const time = Math.max(w.start, Math.min(w.end - 0.5, w.start + (k + 0.5) * spacing + jitter));
            const pick = rng.weighted(pool, c => {
                if (c!.id === CRITIC_ID && critics >= bal.demand.criticDailyCap) return 0;
                return c!.waveWeights[w.id] * (input.bias?.[c!.id] ?? 1);
            });
            const customerId = pick ? pick.id : NEIGHBOR_ID;
            if (customerId === CRITIC_ID) critics++;
            arrivals.push({ time, customerId, wave: w.id });
        }
    }
    arrivals.sort((a, b) => a.time - b.time);

    const firstMorning = arrivals.find(a => a.wave === 'morning');
    if (input.rescue && firstMorning) Object.assign(firstMorning, { customerId: NEIGHBOR_ID, onlyRecipe: 'R01', fixed: true });
    const extraInWave: Record<string, number> = {};
    for (const g of input.guests) {
        const extra = { ...(g.onlyRecipe ? { onlyRecipe: g.onlyRecipe } : {}), ...(g.request ? { request: true } : {}) };
        if (g.first) {
            const slot = arrivals.find(a => a.wave === g.wave && !a.fixed);
            if (slot) Object.assign(slot, { customerId: g.customerId, fixed: true, ...extra });
        } else {
            // 同一时段的几位约好的客人前后错开 8 秒进门
            const w = bal.demand.waves.find(x => x.id === g.wave)!;
            const k = extraInWave[g.wave] = (extraInWave[g.wave] ?? -1) + 1;
            arrivals.push({ time: Math.min(w.end - 0.5, (w.start + w.end) / 2 + 1 + k * 8), customerId: g.customerId, wave: g.wave, fixed: true, ...extra });
        }
    }
    if (input.day === bal.demand.chapterCriticDay && !arrivals.some(a => a.customerId === CRITIC_ID && a.wave === 'lunch')) {
        const lunch = arrivals.filter(a => a.wave === 'lunch' && !a.fixed);
        const target = lunch[Math.floor(lunch.length / 2)];
        if (target) Object.assign(target, { customerId: CRITIC_ID, fixed: true });
    }
    arrivals.sort((a, b) => a.time - b.time);
    return arrivals;
}

export function waveIndex(id: WaveId): number { return WAVES.indexOf(id); }
