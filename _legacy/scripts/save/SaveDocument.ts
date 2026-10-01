import { Balance } from '../core/Balance';
import { CampaignSave } from '../core/Campaign';
import { ShiftSave } from '../simulation/ShiftModel';
import { AudioSettings, defaultAudioSettings } from '../audio/AudioBus';
import { RngState } from '../simulation/SeededRng';

/** 存档格式。高于此版本的档禁止覆盖。 */
export const SAVE_FORMAT = 1;
export const SAVE_BYTE_LIMIT = 1024 * 1024;

export interface Codex { recipes: string[]; customers: string[] }

/** 只记录规则状态。禁止放入节点、网格或材质。 */
export interface SaveFile {
    format: number;
    version: string;
    wallet: number;
    completedDays: number;
    upgrades: string[];
    codex: Codex;
    settings: AudioSettings;
    shift: ShiftSave | null;
    serial: number;
    rng: RngState;
    ledger: string[];
    /** 正式一日的规则快照。旧原型档没有这一段。 */
    desk?: unknown;
}

export interface SaveIssue { ok: false; message: string }
export interface SaveOk { ok: true; file: SaveFile }

const emptyCodex = (): Codex => ({ recipes: [], customers: [] });

export function emptySave(balance: Balance): SaveFile {
    return {
        format: SAVE_FORMAT,
        version: balance.version,
        wallet: balance.session.initialWallet,
        completedDays: 0,
        upgrades: [],
        codex: emptyCodex(),
        settings: defaultAudioSettings(),
        shift: null,
        serial: 0,
        rng: { seed: 1, step: 0 },
        ledger: [],
    };
}

export function campaignSlice(file: SaveFile): CampaignSave {
    return {
        version: file.version,
        completedDays: file.completedDays,
        wallet: file.wallet,
        upgrades: file.upgrades,
        settledSessions: file.ledger,
        codex: file.codex,
    };
}

function byteLength(text: string): number { return new TextEncoder().encode(text).length; }

function finiteInt(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** 导入前校验体积、字段、金额和引用。通过后才允许替换。 */
export function parseSaveText(text: string, balance: Balance): SaveOk | SaveIssue {
    if (typeof text !== 'string' || !text) return { ok: false, message: '存档是空的' };
    if (byteLength(text) > SAVE_BYTE_LIMIT) return { ok: false, message: '存档超过 1MB，已拒绝' };
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return { ok: false, message: '存档不是有效记录' }; }
    return validateSave(raw, balance);
}

export function validateSave(raw: unknown, balance: Balance): SaveOk | SaveIssue {
    if (!raw || typeof raw !== 'object') return { ok: false, message: '存档不是有效记录' };
    const data = raw as Partial<SaveFile>;
    if (typeof data.format === 'number' && data.format > SAVE_FORMAT) {
        return { ok: false, message: '这是较新版本的存档，为避免覆盖已停止写入' };
    }
    if (data.format !== SAVE_FORMAT) return { ok: false, message: '存档版本无法识别' };
    if (data.version !== balance.version) return { ok: false, message: '存档与当前规则版本不一致' };
    if (!finiteInt(data.wallet, 0, 1_000_000_000) || !finiteInt(data.completedDays, 0, 7) || !finiteInt(data.serial, 0, 1_000_000_000)) {
        return { ok: false, message: '存档金额或进度无效' };
    }
    if (!Array.isArray(data.upgrades) || !Array.isArray(data.ledger)) return { ok: false, message: '存档缺少升级或账本' };
    for (const id of data.upgrades) {
        const upgrade = balance.upgrades.find(item => item.id === id);
        if (!upgrade || upgrade.requiredCompletedDays > data.completedDays) return { ok: false, message: '存档中的升级无效' };
    }
    const codex = data.codex;
    if (!codex || !Array.isArray(codex.recipes) || !Array.isArray(codex.customers)) return { ok: false, message: '图鉴记录无效' };
    if (codex.recipes.some(id => !balance.recipes.some(recipe => recipe.id === id))) return { ok: false, message: '图鉴引用了未知菜谱' };
    if (codex.customers.some(id => !balance.customers.some(customer => customer.id === id))) return { ok: false, message: '图鉴引用了未知顾客' };
    const settings = data.settings;
    if (!settings || typeof settings.music !== 'boolean' || typeof settings.kitchen !== 'boolean' || typeof settings.ui !== 'boolean' || typeof settings.reducedMotion !== 'boolean') {
        return { ok: false, message: '设置记录无效' };
    }
    const rng = data.rng;
    if (!rng || !finiteInt(rng.seed, 0, 0xffffffff) || !finiteInt(rng.step, 0, 1_000_000_000)) return { ok: false, message: '随机数位置无效' };
    if (data.shift !== null && data.shift !== undefined) {
        if (typeof data.shift !== 'object' || data.shift.version !== balance.version) return { ok: false, message: '当班记录无效' };
        if (JSON.stringify([...(data.shift.upgrades || [])].sort()) !== JSON.stringify([...data.upgrades].sort())) {
            return { ok: false, message: '当班升级与总账不一致' };
        }
    }
    const file = data as SaveFile;
    if (JSON.stringify(file).includes('"node"') || JSON.stringify(file).includes('MeshRenderer')) {
        return { ok: false, message: '存档含有画面对象，已拒绝' };
    }
    return { ok: true, file };
}
