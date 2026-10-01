import { Balance } from './Balance';
import { ShiftModel, ShiftOptions } from '../simulation/ShiftModel';

export interface CampaignSave {
    version: string; completedDays: number; wallet: number; upgrades: string[];
    settledSessions?: string[]; codex?: { recipes: string[]; customers: string[] };
}

export class Campaign {
    completedDays = 0;
    wallet: number;
    readonly upgrades = new Set<string>();
    readonly codex = { recipes: new Set<string>(), customers: new Set<string>() };
    private readonly settledSessions = new Set<string>();

    constructor(readonly balance: Balance, saved?: unknown) {
        this.wallet = balance.session.initialWallet;
        if (saved === undefined || saved === null) return;
        const data = saved as CampaignSave;
        if (data.version !== balance.version || !Number.isInteger(data.completedDays) || data.completedDays < 0 || data.completedDays > 7 ||
            !Number.isInteger(data.wallet) || data.wallet < 0 || !Array.isArray(data.upgrades)) throw new Error('营业记录与当前规则不匹配');
        for (const id of data.upgrades) {
            const upgrade = balance.upgrades.find(item => item.id === id);
            if (!upgrade || upgrade.requiredCompletedDays > data.completedDays) throw new Error('营业记录中的升级无效');
            this.upgrades.add(id);
        }
        this.completedDays = data.completedDays;
        this.wallet = data.wallet;
        for (const id of data.settledSessions || []) if (typeof id === 'string') this.settledSessions.add(id);
        for (const id of data.codex?.recipes || []) if (this.balance.recipes.some(recipe => recipe.id === id)) this.codex.recipes.add(id);
        for (const id of data.codex?.customers || []) if (this.balance.customers.some(customer => customer.id === id)) this.codex.customers.add(id);
    }

    noteVisit(recipeId: string, customerId: string): void {
        if (this.balance.recipes.some(recipe => recipe.id === recipeId)) this.codex.recipes.add(recipeId);
        if (this.balance.customers.some(customer => customer.id === customerId)) this.codex.customers.add(customerId);
    }

    get nextDay(): number { return Math.min(7, this.completedDays + 1); }
    createShift(options?: ShiftOptions): ShiftModel { return new ShiftModel(this.balance, this.nextDay, undefined, this.wallet, this.upgrades, options); }

    finish(shift: ShiftModel): void {
        if (!shift.ended || shift.day !== this.nextDay || this.settledSessions.has(shift.session)) throw new Error('营业记录不能重复结算');
        this.settledSessions.add(shift.session);
        this.wallet = shift.wallet;
        this.completedDays = Math.max(this.completedDays, shift.day);
    }

    purchase(id: string): { ok: boolean; message: string } {
        const upgrade = this.balance.upgrades.find(item => item.id === id);
        if (!upgrade) return { ok: false, message: '升级不存在' };
        if (this.upgrades.has(id)) return { ok: false, message: '已购买过' };
        if (this.completedDays < upgrade.requiredCompletedDays) return { ok: false, message: `完成第${upgrade.requiredCompletedDays}日后开放` };
        if (this.wallet < upgrade.price) return { ok: false, message: '金币不足' };
        this.wallet -= upgrade.price; this.upgrades.add(id);
        return { ok: true, message: `购买${upgrade.name}，花费${upgrade.price}金币` };
    }

    snapshot(): CampaignSave {
        return {
            version: this.balance.version, completedDays: this.completedDays, wallet: this.wallet, upgrades: Array.from(this.upgrades).sort(),
            settledSessions: Array.from(this.settledSessions),
            codex: { recipes: Array.from(this.codex.recipes).sort(), customers: Array.from(this.codex.customers).sort() },
        };
    }
}
