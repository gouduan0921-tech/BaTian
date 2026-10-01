/** 规则表里的一声。样本由事件生成，替换成同名音频文件后走文件。 */
const RATE = 22050;

export function clipSamples(event: string): { rate: number; samples: Float32Array; loop: boolean } {
    switch (event) {
        case 'pot:heat-low': return { rate: RATE, samples: bubbles(2.2, 2.2, 90), loop: true };
        case 'pot:heat-mid': return { rate: RATE, samples: bubbles(2.0, 6.5, 140), loop: true };
        case 'pot:heat-high': return { rate: RATE, samples: bubbles(1.5, 12, 210), loop: true };
        case 'pot:stir': return { rate: RATE, samples: clink(0.16, 720), loop: false };
        case 'pot:window': return { rate: RATE, samples: chime([523, 659], 0.42), loop: false };
        case 'pot:scorch': return { rate: RATE, samples: crack(0.28), loop: false };
        case 'pot:wash': return { rate: RATE, samples: wash(0.9), loop: false };
        case 'shop:open': return { rate: RATE, samples: chime([784, 1046], 0.5), loop: false };
        case 'shop:sit': return { rate: RATE, samples: tone(0.14, 280), loop: false };
        case 'shop:leave': return { rate: RATE, samples: tone(0.22, 196), loop: false };
        case 'shop:coin': return { rate: RATE, samples: chime([988, 1318], 0.18), loop: false };
        case 'shop:close': return { rate: RATE, samples: chime([392, 330, 262], 0.9), loop: false };
        case 'shop:wipe': return { rate: RATE, samples: wipe(0.28), loop: false };
        case 'music:prep': return { rate: RATE, samples: pluck([262, 330, 392, 330], 4), loop: true };
        case 'music:service': return { rate: RATE, samples: pluck([262, 330, 392, 494], 4), loop: true };
        default: return { rate: RATE, samples: new Float32Array(RATE / 10), loop: false };
    }
}

function bubbles(seconds: number, density: number, hz: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const pop = Math.pow(Math.max(0, Math.sin(Math.PI * ((t * density) % 1))), 6);
        phase += (hz * (1 + 0.04 * Math.sin(t * 3))) / RATE;
        out[i] = pop * Math.sin(phase * Math.PI * 2) * 0.55 + (hash(i) - 0.5) * pop * 0.15;
    }
    return out;
}

function clink(seconds: number, hz: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        const env = Math.exp(-t * 28);
        out[i] = env * (Math.sin(t * hz * Math.PI * 2) * 0.7 + (hash(i) - 0.5) * 0.4);
    }
    return out;
}

function tone(seconds: number, hz: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = Math.sin(t * hz * Math.PI * 2) * Math.exp(-t * 8) * 0.45;
    }
    return out;
}

function chime(notes: number[], seconds: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    notes.forEach((hz, index) => {
        const start = Math.floor(index * RATE * 0.08);
        for (let i = start; i < out.length; i++) {
            const t = (i - start) / RATE;
            out[i] += Math.sin(t * hz * Math.PI * 2) * Math.exp(-t * 4.5) * 0.35;
        }
    });
    return out;
}

function crack(seconds: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = (hash(i) - 0.5) * Math.exp(-t * 18) * 0.9 + Math.sin(t * 90 * Math.PI * 2) * Math.exp(-t * 12) * 0.25;
    }
    return out;
}

function wash(seconds: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    let held = 0;
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        held = held * 0.92 + (hash(i) - 0.5) * 0.25;
        const env = Math.sin(Math.min(1, t / seconds) * Math.PI);
        out[i] = held * env * 0.7;
    }
    return out;
}

function wipe(seconds: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    for (let i = 0; i < out.length; i++) {
        const t = i / RATE;
        out[i] = (hash(i * 3) - 0.5) * Math.sin(Math.min(1, t / seconds) * Math.PI) * 0.35;
    }
    return out;
}

function pluck(notes: number[], seconds: number): Float32Array {
    const out = new Float32Array(Math.floor(RATE * seconds));
    const step = out.length / notes.length;
    notes.forEach((hz, index) => {
        const start = Math.floor(index * step);
        const end = Math.min(out.length, start + Math.floor(step * 1.15));
        for (let i = start; i < end; i++) {
            const t = (i - start) / RATE;
            out[i] += Math.sin(t * hz * Math.PI * 2) * Math.exp(-t * 2.2) * 0.28;
        }
    });
    return out;
}

function hash(n: number): number {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
}
