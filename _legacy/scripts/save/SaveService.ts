import { Balance } from '../core/Balance';
import { SaveFile, SaveIssue, parseSaveText, validateSave } from './SaveDocument';

export interface KeyValueDb {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

export interface LoadResult {
    file: SaveFile | null;
    warning: string;
    /** 损坏或过新的原档，供玩家导出，不会被静默覆盖。 */
    preservedText: string;
    blocked: boolean;
}

const PRIMARY = 'primary';
const BACKUP = 'backup';
const KEEP = 'backupKeep';

export class SaveService {
    blocked = false;
    private preservedText = '';

    constructor(private readonly db: KeyValueDb) {}

    async load(balance: Balance): Promise<LoadResult> {
        const primary = await this.db.get(PRIMARY);
        if (!primary) return { file: null, warning: '', preservedText: '', blocked: false };
        const parsed = parseSaveText(primary, balance);
        if (parsed.ok === true) return { file: parsed.file, warning: '', preservedText: '', blocked: false };
        const failure = parsed as SaveIssue;
        this.preservedText = primary;
        const newer = failure.message.includes('较新版本');
        if (newer) {
            this.blocked = true;
            return { file: null, warning: failure.message, preservedText: primary, blocked: true };
        }
        const backup = await this.db.get(BACKUP);
        const restored = backup ? parseSaveText(backup, balance) : null;
        if (restored?.ok === true) {
            return { file: restored.file, warning: '原档损坏，已改用备份。原档仍可导出。', preservedText: primary, blocked: false };
        }
        return { file: null, warning: `${failure.message}。本局无法自动保存，请导出原档。`, preservedText: primary, blocked: false };
    }

    /** 把当前档固定进备份。之后的自动保存只更新当前档，不再盖掉这份备份。 */
    async keepPrimary(): Promise<void> {
        const current = await this.db.get(PRIMARY);
        if (!current) return;
        await this.db.set(BACKUP, current);
        await this.db.set(KEEP, '1');
    }

    /** 先备份再写入。较新版本或写入失败都不覆盖原档。备份已固定时不再轮换。 */
    async write(file: SaveFile, balance: Balance): Promise<{ ok: boolean; message: string }> {
        if (this.blocked) return { ok: false, message: '检测到较新存档，已停止自动保存。请导出原档。' };
        const checked = validateSave(file, balance);
        if (checked.ok !== true) return { ok: false, message: (checked as SaveIssue).message };
        try {
            const current = await this.db.get(PRIMARY);
            if (current) {
                const existing = parseSaveText(current, balance);
                if (existing.ok !== true && (existing as SaveIssue).message.includes('较新版本')) {
                    this.blocked = true;
                    this.preservedText = current;
                    return { ok: false, message: '检测到较新存档，已停止自动保存。请导出原档。' };
                }
                if (await this.db.get(KEEP) !== '1') await this.db.set(BACKUP, current);
            }
            await this.db.set(PRIMARY, JSON.stringify(checked.file));
            return { ok: true, message: '' };
        } catch {
            return { ok: false, message: '存储写入失败，本局无法自动保存。请立即导出。' };
        }
    }

    /** 调用方确认后原子替换：旧档进备份，新档成为当前档。 */
    async replace(text: string, balance: Balance): Promise<{ ok: boolean; message: string; file?: SaveFile }> {
        const parsed = parseSaveText(text, balance);
        if (parsed.ok !== true) return { ok: false, message: (parsed as SaveIssue).message };
        const written = await this.write(parsed.file, balance);
        if (!written.ok) return written;
        this.blocked = false;
        return { ok: true, message: '存档已替换', file: parsed.file };
    }

    exportText(file: SaveFile | null): string {
        return this.preservedText || (file ? JSON.stringify(file) : '');
    }
}

export function memoryDb(initial: Record<string, string> = {}): KeyValueDb {
    const data = { ...initial };
    return {
        async get(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        async set(key, value) { data[key] = value; },
    };
}

export function openIndexedDb(name = 'BaTian'): Promise<KeyValueDb> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        };
        request.onerror = () => reject(request.error || new Error('无法打开本地存档'));
        request.onsuccess = () => {
            const db = request.result;
            const run = (mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest) => new Promise<unknown>((done, fail) => {
                const tx = db.transaction('saves', mode);
                const outcome = work(tx.objectStore('saves'));
                outcome.onsuccess = () => done(outcome.result);
                outcome.onerror = () => fail(outcome.error || new Error('存档读写失败'));
            });
            resolve({
                async get(key) {
                    const value = await run('readonly', store => store.get(key));
                    return typeof value === 'string' ? value : null;
                },
                async set(key, value) { await run('readwrite', store => store.put(value, key)); },
            });
        };
    });
}
