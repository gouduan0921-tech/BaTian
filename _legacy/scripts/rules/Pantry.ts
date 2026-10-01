import { Catalog, Ingredient, Recipe } from './Catalog';
import type { PantrySave } from './DeskSave';

export type FreshTier = 'today' | 'overnight' | 'aged' | 'expired';
interface Unit { id: string; hoursLeft: number; ready: boolean; prepLeft: number }
export interface StockResult { ok: boolean; message: string; cost: number; tier: FreshTier }
export interface StockView {
    id: string; name: string; unit: string; total: number; ready: number; prepping: number; prepLeft: number; tier: FreshTier;
}

/**
 * 库存、新鲜度和预处理。采购扣款由钱包执行，这里只改库存。
 * 营业中每 60 秒消耗 1 个游戏小时。打烊再过 16 小时，表示未营业的隔夜。
 */
export class Pantry {
    private units: Unit[] = [];
    private readonly boughtToday = new Map<string, number>();

    constructor(private readonly catalog: Catalog) {}

    get count(): number { return this.units.length; }

    held(id: string): number { return this.units.filter(unit => unit.id === id && this.tier(unit) !== 'expired').length; }

    summary(): StockView[] {
        const ids = Array.from(new Set(this.units.map(unit => unit.id)));
        return ids.map(id => {
            const item = this.catalog.ingredient(id) as Ingredient;
            const group = this.units.filter(unit => unit.id === id);
            const prepping = group.filter(unit => unit.prepLeft > 0);
            return {
                id, name: item.name, unit: item.unit, total: group.length,
                ready: group.filter(unit => unit.ready && this.tier(unit) !== 'expired').length,
                prepping: prepping.length,
                prepLeft: prepping.reduce((left, unit) => Math.max(left, unit.prepLeft), 0),
                tier: group.map(unit => this.tier(unit)).reduce((left, right) => worse(left, right)),
            };
        });
    }

    purchase(id: string, count: number, kindLimit: number): StockResult {
        const item = this.catalog.ingredient(id);
        if (!item) return { ok: false, message: `食材表没有 ${id}`, cost: 0, tier: 'expired' };
        if (!Number.isInteger(count) || count < 1) return { ok: false, message: '采购数量无效', cost: 0, tier: 'expired' };
        const already = this.boughtToday.get(id) || 0;
        if (already + count > this.catalog.balance.session.unitCap) return { ok: false, message: `${item.name} 今日已到单种上限`, cost: 0, tier: 'expired' };
        const kinds = Array.from(this.boughtToday.values()).filter(amount => amount > 0).length;
        if (already === 0 && kinds >= kindLimit) return { ok: false, message: '今日可购种类已满', cost: 0, tier: 'expired' };
        this.boughtToday.set(id, already + count);
        for (let index = 0; index < count; index++) this.units.push({ id, hoursLeft: item.freshHours, ready: item.prep === 'none', prepLeft: 0 });
        return { ok: true, message: `购入${item.name} ${count}${item.unit}`, cost: item.buyPrice * count, tier: 'today' };
    }

    startPrep(id: string, slotLimit: number): StockResult {
        const item = this.catalog.ingredient(id);
        if (!item) return { ok: false, message: `食材表没有 ${id}`, cost: 0, tier: 'expired' };
        if (item.prep === 'none') return { ok: false, message: `${item.name} 不用处理`, cost: 0, tier: 'today' };
        if (this.units.filter(unit => unit.prepLeft > 0).length >= slotLimit) return { ok: false, message: '备料位已满', cost: 0, tier: 'today' };
        const unit = this.units.find(candidate => candidate.id === id && !candidate.ready && candidate.prepLeft <= 0 && this.tier(candidate) !== 'expired');
        if (!unit) return { ok: false, message: `${item.name} 没有可处理的库存`, cost: 0, tier: 'expired' };
        unit.prepLeft = this.catalog.balance.prep[item.prep];
        return { ok: true, message: `开始处理${item.name}`, cost: 0, tier: this.tier(unit) };
    }

    cancelPrep(id: string): StockResult {
        const unit = this.units.find(candidate => candidate.id === id && candidate.prepLeft > 0);
        if (!unit) return { ok: false, message: '没有进行中的预处理', cost: 0, tier: 'expired' };
        unit.prepLeft = 0;
        unit.ready = false;
        return { ok: true, message: '已取消，没有消耗食材', cost: 0, tier: this.tier(unit) };
    }

    canCommit(recipe: Recipe): boolean { return typeof this.pick(recipe) !== 'string'; }

    /** 不能下锅时指出缺的那一项。已买但没处理完，和手里没有，分开写。 */
    gap(recipe: Recipe): string {
        const missing = this.pick(recipe);
        if (typeof missing !== 'string') return '';
        const name = this.catalog.ingredient(missing)?.name || missing;
        return this.held(missing) > 0 ? `${name}待处理` : `缺${name}`;
    }

    /** 下锅时才扣料。库存或预处理不够时原样退回。 */
    commit(recipe: Recipe): StockResult {
        const picked = this.pick(recipe);
        if (typeof picked === 'string') return { ok: false, message: `${this.catalog.ingredient(picked)?.name || picked} 不够或还没处理好`, cost: 0, tier: 'expired' };
        this.units = this.units.filter(unit => !picked.includes(unit));
        const worst = picked.reduce<FreshTier>((tier, unit) => worse(tier, this.tier(unit)), 'today');
        return { ok: true, message: '已下锅', cost: 0, tier: worst };
    }

    private pick(recipe: Recipe): Unit[] | string {
        const units: Unit[] = [];
        for (const need of recipe.ingredients) {
            for (let count = 0; count < need.count; count++) {
                const candidates = this.units.filter(unit => unit.id === need.id && unit.ready && this.tier(unit) !== 'expired' && !units.includes(unit));
                candidates.sort((a, b) => b.hoursLeft - a.hoursLeft);
                if (!candidates.length) return need.id;
                units.push(candidates[0]);
            }
        }
        return units;
    }

    tick(dt: number): void {
        for (const unit of this.units) {
            if (unit.prepLeft <= 0) continue;
            unit.prepLeft = Math.max(0, unit.prepLeft - dt);
            if (unit.prepLeft <= 0.000001) { unit.prepLeft = 0; unit.ready = true; }
        }
    }

    passHours(hours: number): void {
        if (hours <= 0) return;
        for (const unit of this.units) unit.hoursLeft = Math.max(0, unit.hoursLeft - hours);
    }

    /** 营业秒数按 60 秒 = 1 游戏小时折算。 */
    passServiceSeconds(seconds: number): void { this.passHours(seconds / 60); }

    closeShop(overnightHours = 16): string[] {
        this.passHours(overnightHours);
        const tossed = this.units.filter(unit => this.tier(unit) === 'expired').map(unit => unit.id);
        this.units = this.units.filter(unit => this.tier(unit) !== 'expired');
        for (const unit of this.units) if (!unit.ready) unit.prepLeft = 0;
        this.boughtToday.clear();
        return tossed;
    }

    tierOf(id: string): FreshTier {
        const item = this.catalog.ingredient(id);
        const unit = this.units.find(candidate => candidate.id === id);
        if (!item || !unit) return 'expired';
        return this.tier(unit);
    }

    capture(): PantrySave {
        return {
            units: this.units.map(unit => ({ ...unit })),
            bought: Array.from(this.boughtToday.entries()).map(([id, count]) => ({ id, count })),
        };
    }

    install(save: PantrySave): void {
        this.units = save.units.map(unit => ({ ...unit }));
        this.boughtToday.clear();
        for (const row of save.bought) this.boughtToday.set(row.id, row.count);
    }

    private tier(unit: Unit): FreshTier {
        const item = this.catalog.ingredient(unit.id) as Ingredient;
        const ratio = unit.hoursLeft / item.freshHours;
        if (unit.hoursLeft <= 0 || ratio <= 0) return 'expired';
        if (ratio > 0.66) return 'today';
        if (ratio >= 0.33) return 'overnight';
        return 'aged';
    }
}

export function freshSteps(tier: FreshTier): number {
    if (tier === 'overnight') return 1;
    if (tier === 'aged') return 2;
    return 0;
}

function worse(left: FreshTier, right: FreshTier): FreshTier {
    return freshSteps(right) > freshSteps(left) ? right : left;
}
