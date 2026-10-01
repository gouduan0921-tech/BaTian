export const LOCAL_SETTINGS_KEY = 'BaTian_local_settings_v1';
export const VOLUME_WORDS = ['关', '低', '中', '高'] as const;

export interface LocalSettings {
    music: number;
    pot: number;
    room: number;
    largeText: boolean;
}

export interface LocalStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export function defaultLocalSettings(): LocalSettings {
    return { music: 3, pot: 3, room: 3, largeText: false };
}

export function parseLocalSettings(raw: unknown): LocalSettings {
    const base = defaultLocalSettings();
    if (!raw || typeof raw !== 'object') return base;
    const data = raw as Record<string, unknown>;
    return {
        music: level(data.music, base.music),
        pot: level(data.pot, base.pot),
        room: level(data.room, base.room),
        largeText: typeof data.largeText === 'boolean' ? data.largeText : base.largeText,
    };
}

export function loadLocalSettings(storage: LocalStore): LocalSettings {
    try {
        const text = storage.getItem(LOCAL_SETTINGS_KEY);
        if (!text) return defaultLocalSettings();
        return parseLocalSettings(JSON.parse(text));
    } catch {
        return defaultLocalSettings();
    }
}

export function saveLocalSettings(storage: LocalStore, settings: LocalSettings): void {
    storage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(parseLocalSettings(settings)));
}

function level(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3 ? value : fallback;
}
