import { AudioClip, resources } from 'cc';
import { clipSamples } from './ClipWave';

export type VolumeBus = 'music' | 'pot' | 'room';
export type PotHeatSound = '' | 'low' | 'mid' | 'high';

/** 关、低、中、高。关是 0，警告仍由画面负责。 */
export function volumeOf(level: number): number {
    return [0, 0.05, 0.12, 0.22][level] ?? 0;
}

const BUS_OF: Record<string, VolumeBus> = {
    'pot:heat-low': 'pot', 'pot:heat-mid': 'pot', 'pot:heat-high': 'pot',
    'pot:stir': 'pot', 'pot:window': 'pot', 'pot:scorch': 'pot', 'pot:wash': 'pot',
    'shop:open': 'room', 'shop:sit': 'room', 'shop:leave': 'room', 'shop:coin': 'room', 'shop:close': 'room', 'shop:wipe': 'room',
    'music:prep': 'music', 'music:service': 'music',
};

interface Tone { source: AudioBufferSourceNode; gain: GainNode }
interface PotNote { phase: string; scorchHot: boolean; scorchAt: number }

/**
 * 音乐、锅声、环境三路。事件名来自 audio.json。
 * 同名音频文件导入后替换生成样本。音量为关时该路不发声。
 */
export class LiveAudio {
    private ctx: AudioContext | null = null;
    private levels = { music: 3, pot: 3, room: 3 };
    private shopOpen = false;
    private heat: PotHeatSound = '';
    private background: PotHeatSound = '';
    private readonly buffers = new Map<string, AudioBuffer>();
    private readonly loops = new Map<string, Tone>();
    private readonly notes = new Map<number, PotNote>();
    private musicBed: '' | 'music:prep' | 'music:service' = '';
    private now = 0;

    load(cues: readonly { event: string; file: string }[]): void {
        for (const cue of cues) {
            this.ensureBuffer(cue.event);
            this.adoptFile(cue.event, cue.file);
        }
        this.ensureBuffer('music:prep');
        this.ensureBuffer('music:service');
        this.adoptFile('music:prep', 'music_prep_loop');
        this.adoptFile('music:service', 'music_service_loop');
    }

    private adoptFile(event: string, file: string): void {
        resources.load(`audio/${file}`, AudioClip, (error, clip) => {
            const native = clip && (clip as unknown as { _nativeAsset?: AudioBuffer })._nativeAsset;
            if (!error && native instanceof AudioBuffer) {
                this.buffers.set(event, native);
                this.pushLoops();
            }
        });
    }

    apply(levels: { music: number; pot: number; room: number }): void {
        this.levels = { music: levels.music, pot: levels.pot, room: levels.room };
        this.pushLoops();
    }

    setShopOpen(open: boolean): void {
        this.shopOpen = open;
        this.ensure();
        this.pushLoops();
    }

    /** 设置里试听这一路。关着的时候不响。 */
    cue(bus: VolumeBus): void {
        const event = bus === 'pot' ? 'pot:stir' : bus === 'room' ? 'shop:coin' : 'music:prep';
        this.play(event);
    }

    play(event: string): void {
        const bus = BUS_OF[event];
        if (!bus) return;
        const level = volumeOf(this.levels[bus]);
        const ctx = this.ensure();
        const buffer = this.ensureBuffer(event);
        if (!ctx || !buffer || level <= 0) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime(level, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.min(buffer.duration, event.startsWith('music:') ? 0.35 : buffer.duration));
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        source.stop(ctx.currentTime + Math.min(buffer.duration, event.startsWith('pot:heat') ? 0.35 : buffer.duration));
    }

    /**
     * 跟着当班走。看向的锅用全文火，别的正在熬的锅降到四成。
     * 快糊同一口锅三秒内只响一次。画面警告不经过这里。
     */
    follow(paused: boolean, phase: string, reported: boolean, reads: readonly { index: number; phase: string; heat: PotHeatSound; focused: boolean; scorchHot: boolean }[]): void {
        const clock = ((globalThis.performance?.now()) ?? Date.now()) / 1000;
        this.now = clock;
        const open = !paused && !reported && (phase === 'service' || phase === 'close');
        const prep = !paused && !reported && phase === 'prep';
        this.shopOpen = open || prep;
        const bed = open ? 'music:service' : prep ? 'music:prep' : '';
        if (bed !== this.musicBed) {
            this.stopLoop('music:prep');
            this.stopLoop('music:service');
            this.musicBed = bed;
        }
        const focused = reads.find(read => read.focused && (read.phase === 'cooking' || read.phase === 'window'));
        const other = reads.find(read => !read.focused && (read.phase === 'cooking' || read.phase === 'window'));
        this.heat = focused?.heat || '';
        this.background = other?.heat || '';
        for (const read of reads) {
            const previous = this.notes.get(read.index);
            if (previous?.phase !== 'cooking' && read.phase === 'cooking') this.play(heatEvent(read.heat));
            if (previous?.phase !== 'washing' && read.phase === 'washing') this.play('pot:wash');
            const hot = read.scorchHot || read.phase === 'burnt';
            const cooled = !previous?.scorchAt || this.now - previous.scorchAt >= 3;
            if (hot && cooled) {
                this.play('pot:scorch');
                this.notes.set(read.index, { phase: read.phase, scorchHot: true, scorchAt: this.now });
                continue;
            }
            this.notes.set(read.index, { phase: read.phase, scorchHot: hot, scorchAt: previous?.scorchAt || 0 });
        }
        this.pushLoops();
    }

    private ensure(): AudioContext | null {
        const host = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const Ctor = host.AudioContext || host.webkitAudioContext;
        if (!Ctor) return null;
        if (!this.ctx) this.ctx = new Ctor();
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return this.ctx;
    }

    private ensureBuffer(event: string): AudioBuffer | null {
        const cached = this.buffers.get(event);
        if (cached) return cached;
        const ctx = this.ensure();
        if (!ctx) return null;
        const clip = clipSamples(event);
        const buffer = ctx.createBuffer(1, clip.samples.length, clip.rate);
        buffer.getChannelData(0).set(clip.samples);
        this.buffers.set(event, buffer);
        return buffer;
    }

    private pushLoops(): void {
        const ctx = this.ensure();
        if (!ctx) return;
        this.setLoop(this.musicBed, this.musicBed, this.shopOpen ? volumeOf(this.levels.music) * 0.55 : 0);
        const focus = heatEvent(this.heat);
        const back = heatEvent(this.background);
        for (const heat of ['pot:heat-low', 'pot:heat-mid', 'pot:heat-high'] as const) {
            this.setLoop(heat, heat, heat === focus ? volumeOf(this.levels.pot) * 0.7 : 0);
            this.setLoop(`bg:${heat}`, heat, heat === back && this.background ? volumeOf(this.levels.pot) * 0.28 : 0);
        }
    }

    private setLoop(key: string, event: string, gainValue: number): void {
        if (!key || !event) return;
        const ctx = this.ctx;
        const buffer = this.ensureBuffer(event);
        if (!ctx || !buffer) return;
        let tone = this.loops.get(key);
        if (tone && tone.source.buffer !== buffer) {
            try { tone.source.stop(); } catch { /* 已经停过 */ }
            this.loops.delete(key);
            tone = undefined;
        }
        if (!tone) {
            if (gainValue <= 0) return;
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            source.loop = true;
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(ctx.destination);
            source.start();
            tone = { source, gain };
            this.loops.set(key, tone);
        }
        tone.gain.gain.setTargetAtTime(gainValue, ctx.currentTime, 0.08);
    }

    private stopLoop(event: string): void {
        const tone = this.loops.get(event);
        if (!tone || !this.ctx) return;
        tone.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
}

function heatEvent(heat: PotHeatSound): '' | 'pot:heat-low' | 'pot:heat-mid' | 'pot:heat-high' {
    if (heat === 'low') return 'pot:heat-low';
    if (heat === 'mid') return 'pot:heat-mid';
    if (heat === 'high') return 'pot:heat-high';
    return '';
}
