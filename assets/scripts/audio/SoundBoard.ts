import { _decorator, AudioClip, AudioSource, Component, resources } from 'cc';
import { AudioCue } from '../core/Config';
import { GameSettings } from '../save/SaveModel';

const { ccclass, property } = _decorator;

/** 环境循环：清晨（鸟鸣、车铃、早市）与营业（街坊人声，按在座人数调响度） */
export type AmbienceKind = 'morning' | 'street';
const AMBIENCE: Record<AmbienceKind, string> = { morning: 'amb_morning_loop', street: 'amb_street_loop' };
/** 各环境的基础与最大音量（乘上设置里的「环境」） */
const AMB_GAIN: Record<AmbienceKind, [number, number]> = { morning: [0.32, 0.32], street: [0.12, 0.4] };

/**
 * 三路声音（文档 18）：音乐、锅声、环境/界面。事件名 → 文件名来自 audio.json，不在组件里写第二份清单。
 * 警告音与「好了」走锅声路但不受焦点衰减，始终高于音乐。
 */
@ccclass('SoundBoard')
export class SoundBoard extends Component {
    @property(AudioSource) music: AudioSource | null = null;
    @property(AudioSource) potLoop: AudioSource | null = null;
    @property(AudioSource) sfx: AudioSource | null = null;

    private readonly clips = new Map<string, AudioClip>();
    private cues = new Map<string, string>();
    private settings: GameSettings | null = null;
    private loopFile = '';
    private musicFile = '';
    private wantLoop = '';
    private wantHeat: string | null = null;
    private wantMusic = '';
    private wantMusicKind: 'prep' | 'service' | null = null;
    private readonly amb = new Map<AmbienceKind, { src: AudioSource; vol: number }>();
    private ambKind: AmbienceKind | null = null;
    private ambLevel = 0;

    init(cues: AudioCue[]): void {
        this.cues = new Map(cues.map(c => [c.event, c.file]));
        const files = Array.from(new Set([...cues.map(c => c.file), 'music_prep_loop', 'music_service_loop', ...Object.values(AMBIENCE)]));
        for (const f of files) {
            resources.load(`audio/${f}`, AudioClip, (err, clip) => {
                if (err || !clip) return;
                this.clips.set(f, clip);
                // 声音晚于界面加载完时，补上已经点过的循环
                if (f === this.wantLoop) { this.loopFile = ''; this.setPotLoop(this.wantHeat); }
                if (f === this.wantMusic) { this.musicFile = ''; this.setMusic(this.wantMusicKind); }
                if (this.ambKind && f === AMBIENCE[this.ambKind]) this.startAmbience(this.ambKind);
            });
        }
    }

    apply(settings: GameSettings): void {
        this.settings = settings;
        if (this.music) this.music.volume = 0.35 * settings.music;
        if (this.potLoop) this.potLoop.volume = 0.5 * settings.pot;
    }

    /**
     * 环境声：kind 为空时淡出。清晨固定响度；营业时 level 0–1（在座的人越多越热闹）。
     * 每种环境一路 AudioSource（运行时补上，不占预制体），切换时交叉淡入淡出。
     */
    setAmbience(kind: AmbienceKind | null, level = 0.5): void {
        this.ambKind = kind;
        this.ambLevel = Math.max(0, Math.min(1, level));
        if (kind && !this.amb.get(kind)?.src.playing) this.startAmbience(kind);
    }

    private startAmbience(kind: AmbienceKind): void {
        const clip = this.clips.get(AMBIENCE[kind]);
        if (!clip) return;
        let a = this.amb.get(kind);
        if (!a) { a = { src: this.node.addComponent(AudioSource), vol: 0 }; this.amb.set(kind, a); }
        a.src.clip = clip;
        a.src.loop = true;
        a.src.volume = a.vol;
        a.src.play();
    }

    update(dt: number): void {
        const bus = this.settings?.ambience ?? 1;
        for (const [kind, a] of this.amb) {
            const [base, max] = AMB_GAIN[kind];
            const target = kind === this.ambKind ? (base + (max - base) * this.ambLevel) * bus : 0;
            a.vol += (target - a.vol) * Math.min(1, dt * 1.2);
            a.src.volume = a.vol;
            if (target === 0 && a.vol < 0.005 && a.src.playing) a.src.stop();
        }
    }

    play(event: string): void {
        const file = this.cues.get(event);
        const clip = file ? this.clips.get(file) : undefined;
        if (!clip || !this.sfx || !this.settings) return;
        const bus = event.startsWith('pot:') ? this.settings.pot : this.settings.ambience;
        const loud = event === 'pot:window' || event === 'pot:scorch' ? 1 : 0.7;
        if (bus > 0) this.sfx.playOneShot(clip, bus * loud);
    }

    /** 焦点锅的持续沸腾声；heat 为空时静音。 */
    setPotLoop(heat: string | null): void {
        const file = heat ? this.cues.get(`pot:heat-${heat}`) ?? '' : '';
        this.wantLoop = file;
        this.wantHeat = heat;
        if (file === this.loopFile || !this.potLoop) return;
        this.loopFile = file;
        const clip = this.clips.get(file);
        this.potLoop.stop();
        if (clip) { this.potLoop.clip = clip; this.potLoop.loop = true; this.potLoop.play(); }
    }

    setMusic(kind: 'prep' | 'service' | null): void {
        const file = kind ? `music_${kind}_loop` : '';
        this.wantMusic = file;
        this.wantMusicKind = kind;
        if (file === this.musicFile || !this.music) return;
        this.musicFile = file;
        const clip = this.clips.get(file);
        this.music.stop();
        if (clip) { this.music.clip = clip; this.music.loop = true; this.music.play(); }
        else if (file) this.musicFile = '';
    }
}
