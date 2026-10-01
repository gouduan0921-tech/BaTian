import { Balance, Heat, Recipe, Seasoning } from '../core/Config';

/**
 * 一口锅的纯数据与推进（文档 03 §3、04 §4）。
 * 表现层只读 PotState 快照，不写回。
 */
export type PotPhase = 'empty' | 'cooking' | 'window' | 'over' | 'burnt' | 'washing';
export type CookResult = 'raw' | 'perfect' | 'over' | 'burnt';

export interface PotAdd { id: string; at: number }

export interface PotState {
    index: number;
    phase: PotPhase;
    recipeId: string | null;
    heat: Heat;
    simmer: number;
    stir: number;
    doneness: number;
    scorch: number;
    added: PotAdd[];
    seasoning: Seasoning | null;
    /** 底料的新鲜度档（0 当日 / 1 过夜 / 2 三日），下锅时记下 */
    baseFresh: number;
    /** 已加配料里最差的新鲜度档 */
    addFresh: number;
    washLeft: number;
    sinceStir: number;
    /** 盛碗中：锅不再推进 */
    locked: boolean;
    stirWarned: boolean;
    scorchCooldown: number;
    windowAnnounced: boolean;
}

export type PotEvent =
    | { type: 'pot:window'; pot: number }
    | { type: 'pot:burnt'; pot: number }
    | { type: 'pot:stir-warn'; pot: number }
    | { type: 'pot:scorch'; pot: number }
    | { type: 'pot:washed'; pot: number };

export function emptyPot(index: number): PotState {
    return {
        index, phase: 'empty', recipeId: null, heat: 'mid', simmer: 0, stir: 1, doneness: 0, scorch: 0, added: [],
        seasoning: null, baseFresh: 0, addFresh: 0, washLeft: 0, sinceStir: 99, locked: false, stirWarned: false,
        scorchCooldown: 0, windowAnnounced: false,
    };
}

/** 让该粥在中火下恰好用 cookSeconds 到达窗口中心的速度系数。 */
export function recipeSpeed(balance: Balance, recipe: Recipe): number {
    return balance.gates.center / (balance.heat.mid.doneness * recipe.cookSeconds);
}

export function startPot(pot: PotState, recipe: Recipe, heat: Heat, baseFresh: number): void {
    Object.assign(pot, emptyPot(pot.index));
    pot.phase = 'cooking';
    pot.recipeId = recipe.id;
    pot.heat = heat;
    pot.baseFresh = baseFresh;
}

export function phaseFor(balance: Balance, pot: PotState): PotPhase {
    if (pot.scorch >= balance.gates.burn) return 'burnt';
    if (pot.doneness < balance.gates.serveMin) return 'cooking';
    if (pot.doneness <= balance.gates.serveMax) return 'window';
    return 'over';
}

/**
 * 推进一步。focus 表示是否为焦点锅；warnLine 为该粥当前的搅拌警告线（「顺手」后 0.38）。
 */
export function stepPot(pot: PotState, recipe: Recipe | null, balance: Balance, dt: number, focus: boolean, warnLine: number, out: PotEvent[]): void {
    if (pot.phase === 'washing') {
        pot.washLeft -= dt;
        if (pot.washLeft <= 0) {
            Object.assign(pot, emptyPot(pot.index));
            out.push({ type: 'pot:washed', pot: pot.index });
        }
        return;
    }
    if (pot.phase === 'empty' || !recipe || pot.locked) return;
    const coef = balance.heat[pot.heat];
    pot.sinceStir += dt;
    pot.scorchCooldown = Math.max(0, pot.scorchCooldown - dt);
    const toward = coef.simmerTarget - pot.simmer;
    const move = coef.simmerRate * dt;
    pot.simmer += Math.abs(toward) <= move ? toward : Math.sign(toward) * move;

    if (pot.phase === 'burnt') return;
    pot.stir = Math.max(0, pot.stir - (focus ? balance.stir.decayFocus : balance.stir.decayBlur) * dt);
    const k = recipeSpeed(balance, recipe);
    pot.doneness = Math.min(1.2, pot.doneness + coef.doneness * k * dt);
    const low = pot.stir < balance.stir.warn ? balance.stir.lowStirScorch : 0;
    pot.scorch = Math.min(1, pot.scorch + (coef.scorch + low) * recipe.scorchMul * dt);

    pot.phase = phaseFor(balance, pot);
    if (pot.phase === 'window' && !pot.windowAnnounced) {
        pot.windowAnnounced = true;
        out.push({ type: 'pot:window', pot: pot.index });
    }
    if (pot.phase === 'burnt') out.push({ type: 'pot:burnt', pot: pot.index });
    if (pot.stir < warnLine) {
        if (!pot.stirWarned) { pot.stirWarned = true; out.push({ type: 'pot:stir-warn', pot: pot.index }); }
    } else {
        pot.stirWarned = false;
    }
    if (pot.scorch > 0.7 && pot.phase !== 'burnt' && pot.scorchCooldown <= 0) {
        pot.scorchCooldown = 3;
        out.push({ type: 'pot:scorch', pot: pot.index });
    }
}

/** 一次成功的搅拌（前摇结束时调用）。 */
export function stirPot(pot: PotState, balance: Balance): boolean {
    if (pot.phase === 'empty' || pot.phase === 'washing' || pot.phase === 'burnt') return false;
    const gain = pot.sinceStir < balance.stir.repeatSeconds ? balance.stir.gain * balance.stir.repeatGainScale : balance.stir.gain;
    pot.stir = Math.min(1, pot.stir + gain);
    pot.sinceStir = 0;
    return true;
}

export function canAdd(pot: PotState, recipe: Recipe | null, ingredientId: string): boolean {
    if (!recipe || pot.locked) return false;
    if (pot.phase !== 'cooking' && pot.phase !== 'window' && pot.phase !== 'over') return false;
    return recipe.adds.some(a => a.id === ingredientId) && !pot.added.some(a => a.id === ingredientId);
}

/** 下一个还没加的配料（按 atDoneness 排序），给界面提示用。 */
export function nextAdd(pot: PotState, recipe: Recipe | null): { id: string; atDoneness: number } | null {
    if (!recipe) return null;
    const left = recipe.adds.filter(a => !pot.added.some(x => x.id === a.id)).sort((a, b) => a.atDoneness - b.atDoneness);
    return left[0] ?? null;
}

export function resultOf(balance: Balance, pot: PotState): CookResult {
    if (pot.phase === 'burnt' || pot.scorch >= balance.gates.burn) return 'burnt';
    if (pot.doneness < balance.gates.serveMin) return 'raw';
    if (pot.doneness > balance.gates.serveMax) return 'over';
    return 'perfect';
}

/** 数加料偏差与缺料。tolerance 为当前容差（「拿手」后 0.10）。 */
export function addAudit(pot: PotState, recipe: Recipe, tolerance: number): { missing: number; mistimed: number } {
    let missing = 0;
    let mistimed = 0;
    for (const a of recipe.adds) {
        const got = pot.added.find(x => x.id === a.id);
        if (!got) missing++;
        else if (Math.abs(got.at - a.atDoneness) > tolerance + 1e-9) mistimed++;
    }
    return { missing, mistimed };
}
