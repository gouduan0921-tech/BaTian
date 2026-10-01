import { GameConfig, SLOTS } from '../core/Config';
import { ProfileState } from '../rules/Progress';
import { ShiftState } from '../rules/Shift';

/**
 * 存档文档（文档 21）。只记规则状态，不记节点、网格、材质。
 */
export const SAVE_FORMAT = 1;
export const SAVE_MAX_BYTES = 1024 * 1024;

export interface GameSettings {
    music: number; pot: number; ambience: number; textSize: 'normal' | 'large'; tutorialDone: boolean;
    /** 小店的光（设计稿灯光布置）：暖木 / 夜蓝 / 晨白，只换光色不扣钱 */
    light: 'warm' | 'night' | 'morning';
    /** 减少动效 */
    reduceMotion: boolean;
}

export interface SaveFile {
    format: number;
    version: string;
    serial: number;
    profile: ProfileState;
    /** 营业中断线时的整日状态；不在营业中为 null */
    shift: ShiftState | null;
    rngStep: number;
    settings: GameSettings;
}

export function defaultSettings(): GameSettings {
    return { music: 1, pot: 1, ambience: 1, textSize: 'normal', tutorialDone: false, light: 'warm', reduceMotion: false };
}

export type SaveCheck = { ok: true; file: SaveFile } | { ok: false; message: string; newer?: boolean };

export function serializeSave(file: SaveFile): string { return JSON.stringify(file); }

export function parseSave(text: string, config: GameConfig): SaveCheck {
    if (text.length > SAVE_MAX_BYTES) return { ok: false, message: '存档超过 1MB' };
    let file: SaveFile;
    try { file = JSON.parse(text); } catch { return { ok: false, message: '存档无法解析' }; }
    return validateSave(file, config);
}

export function validateSave(file: SaveFile, config: GameConfig): SaveCheck {
    const bad = (message: string): SaveCheck => ({ ok: false, message });
    if (!file || typeof file !== 'object') return bad('存档格式错误');
    if (typeof file.format !== 'number') return bad('缺少 format');
    if (file.format > SAVE_FORMAT) return { ok: false, message: '存档来自较新版本，已停止读取以免覆盖', newer: true };
    const p = file.profile;
    if (!p) return bad('缺少 profile');
    if (!Number.isInteger(p.wallet) || p.wallet < 0 || p.wallet > 999999) return bad('钱包数值非法');
    if (!Number.isInteger(p.debt) || p.debt < 0) return bad('欠租数值非法');
    for (const id of p.upgrades) if (!config.upgrade.has(id)) return bad(`未知升级 ${id}`);
    for (const id of p.ownedDecor) if (!config.decorById.has(id)) return bad(`未知装修 ${id}`);
    for (const b of p.pantry.batches) if (!config.ingredient.has(b.id)) return bad(`未知食材 ${b.id}`);
    for (const id of p.codex.recipes) if (!config.recipe.has(id)) return bad(`未知粥谱 ${id}`);
    for (const id of p.codex.stories) if (!config.story.has(id)) return bad(`未知短篇 ${id}`);
    for (const id of Object.keys(p.favor)) {
        if (!config.customer.has(id)) return bad(`未知客人 ${id}`);
        if (p.favor[id] < 0 || p.favor[id] > config.balance.favor.max) return bad('好感越界');
    }
    for (const s of SLOTS) {
        const slot = p.placement?.[s];
        if (!slot) return bad(`装修槽 ${s} 缺失`);
        if (slot.smalls.length > 2) return bad(`装修槽 ${s} 小物超过 2 件`);
        for (const id of [slot.main, ...slot.smalls].filter(Boolean) as string[]) {
            const d = config.decorById.get(id);
            if (!d || !p.ownedDecor.includes(id)) return bad(`装修槽 ${s} 放了未拥有的 ${id}`);
            if (d.slot !== s) return bad(`${id} 不能放在 ${s}`);
        }
    }
    if (!p.ownedDecor.includes(p.tableware)) return bad('餐具未拥有');
    if (!Number.isInteger(file.rngStep) || file.rngStep < 0) return bad('随机进度非法');
    if (file.shift) {
        for (const pot of file.shift.pots) {
            if (!(pot.doneness >= 0 && pot.doneness <= 1.2) || !(pot.scorch >= 0 && pot.scorch <= 1)) return bad('锅的数值越界');
            if (pot.recipeId && !config.recipe.has(pot.recipeId)) return bad(`未知粥谱 ${pot.recipeId}`);
        }
    }
    return { ok: true, file };
}

/** 键值存储接口：浏览器用 localStorage，测试用内存。 */
export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

export function memoryStore(): KeyValueStore {
    const m = new Map<string, string>();
    return { get: k => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } };
}

const PRIMARY = 'batian.save.primary';
const BACKUP = 'batian.save.backup';

export interface LoadOutcome { file: SaveFile | null; warning: string; blocked: boolean }

/**
 * 读写存档。写入先校验再替换；较新格式的档拒绝覆盖（文档 21 §4–5）。
 */
export class SaveStore {
    blocked = false;

    constructor(private readonly kv: KeyValueStore, private readonly config: GameConfig) {}

    load(): LoadOutcome {
        const text = this.kv.get(PRIMARY);
        if (!text) return { file: null, warning: '', blocked: false };
        const got = parseSave(text, this.config);
        if (got.ok === true) return { file: got.file, warning: '', blocked: false };
        const fail = got as { ok: false; message: string; newer?: boolean };
        if (fail.newer) { this.blocked = true; return { file: null, warning: fail.message, blocked: true }; }
        const backup = this.kv.get(BACKUP);
        const restored = backup ? parseSave(backup, this.config) : null;
        if (restored && restored.ok === true) return { file: restored.file, warning: `原档损坏（${fail.message}），已改用备份。`, blocked: false };
        this.blocked = true;
        return { file: null, warning: `${fail.message}。原档保留，本局不会自动覆盖。`, blocked: true };
    }

    write(file: SaveFile): string | null {
        if (this.blocked) return '存档受保护，未写入';
        const check = validateSave(file, this.config);
        if (check.ok !== true) return (check as { message: string }).message;
        const text = serializeSave(file);
        if (text.length > SAVE_MAX_BYTES) return '存档超过 1MB';
        const prev = this.kv.get(PRIMARY);
        if (prev) this.kv.set(BACKUP, prev);
        file.serial++;
        this.kv.set(PRIMARY, serializeSave(file));
        return null;
    }

    hasSave(): boolean { return !!this.kv.get(PRIMARY); }

    /** 新游戏：用户确认后才调用。 */
    unblock(): void { this.blocked = false; }
}
