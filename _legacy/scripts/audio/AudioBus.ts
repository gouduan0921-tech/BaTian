import { SimEvent } from '../simulation/Events';

export interface AudioSettings { music: boolean; kitchen: boolean; ui: boolean; reducedMotion: boolean }

export const defaultAudioSettings = (): AudioSettings => ({ music: true, kitchen: true, ui: true, reducedMotion: false });

/**
 * 音乐、厨房、界面三路。没有音源时只记录提示，暂停时停掉厨房循环。
 * 重复交付不重复登记金币声。
 */
export class AudioBus {
    private kitchenRunning = false;
    private readonly paidOrders = new Set<string>();
    readonly cues: string[] = [];

    constructor(private settings: AudioSettings = defaultAudioSettings()) {}

    apply(settings: AudioSettings): void { this.settings = { ...settings }; }

    onSimEvent(event: SimEvent): void {
        switch (event.type) {
            case 'costPaid': this.cue('ui', '落料'); break;
            case 'cookingStarted': this.kitchenRunning = true; this.cue('kitchen', '煮粥'); break;
            case 'potReady': this.cue('kitchen', '出锅'); break;
            case 'burned': this.kitchenRunning = false; this.cue('kitchen', '烧糊'); break;
            case 'delivered':
                if (this.paidOrders.has(event.orderId)) return;
                this.paidOrders.add(event.orderId);
                this.cue('ui', '金币');
                break;
            case 'expired': this.cue('ui', '超时'); break;
            case 'settled': this.kitchenRunning = false; this.cue('music', '打烊'); break;
            case 'upgraded': this.cue('ui', '升级'); break;
            default: break;
        }
    }

    pause(): void { this.kitchenRunning = false; this.cue('kitchen', '厨房淡出'); }
    resume(): void { if (this.kitchenRunning) this.cue('kitchen', '煮粥'); }
    get kitchenAudible(): boolean { return this.kitchenRunning && this.settings.kitchen; }

    private cue(bus: keyof Pick<AudioSettings, 'music' | 'kitchen' | 'ui'>, name: string): void {
        if (!this.settings[bus]) return;
        this.cues.push(`${bus}:${name}`);
        if (this.cues.length > 24) this.cues.shift();
    }
}
