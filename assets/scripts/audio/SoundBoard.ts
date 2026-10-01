import { _decorator, AudioClip, AudioSource, Component, resources } from 'cc';
import { AudioCue } from '../core/Config';
import { GameSettings } from '../save/SaveModel';

const { ccclass, property } = _decorator;

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

    init(cues: AudioCue[]): void {
        this.cues = new Map(cues.map(c => [c.event, c.file]));
        const files = [...new Set([...cues.map(c => c.file), 'music_prep_loop', 'music_service_loop'])];
        for (const f of files) {
            resources.load(`audio/${f}`, AudioClip, (err, clip) => {
                if (err || !clip) return;
                this.clips.set(f, clip);
                // 声音晚于界面加载完时，补上已经点过的循环
                if (f === this.wantLoop) { this.loopFile = ''; this.setPotLoop(this.wantHeat); }
                if (f === this.wantMusic) { this.musicFile = ''; this.setMusic(this.wantMusicKind); }
            });
        }
    }

    apply(settings: GameSettings): void {
        this.settings = settings;
        if (this.music) this.music.volume = 0.35 * settings.music;
        if (this.potLoop) this.potLoop.volume = 0.5 * settings.pot;
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
