#!/usr/bin/env python3
"""
粥霸天 音效与音乐合成器（文档 18）。

不依赖外部素材：气泡、勺子、铃、铜钱、弹拨都用程序合成，写成 22.05kHz 单声道 WAV，
放到 assets/resources/audio/，文件名与 audio.json 对应。正式录音到位后直接覆盖同名文件即可。

用法：python3 tools/synth_audio.py <输出根目录（工程根）>
"""
import math, os, sys, wave
import numpy as np

SR = 22050
OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else '.', 'assets', 'resources', 'audio')
rng = np.random.default_rng(20261001)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack=0.005, decay=0.2):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / max(decay, 1e-4))


def one_pole_lp(x, cutoff):
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        s = (1 - a) * v + a * s
        y[i] = s
    return y


def bandish(x, lo, hi):
    """粗带通：两次一阶低通相减。"""
    return one_pole_lp(x, hi) - one_pole_lp(x, lo)


def write(name, x, peak=0.8):
    os.makedirs(OUT, exist_ok=True)
    if not name.endswith('_loop'):
        # 单次音效首尾各 3 毫秒淡入淡出，避免爆音
        k = min(len(x) // 4, int(SR * 0.003))
        x = x.copy()
        x[:k] *= np.linspace(0, 1, k)
        x[-k:] *= np.linspace(1, 0, k)
    m = np.max(np.abs(x)) or 1
    x = np.clip(x / m * peak, -1, 1)
    data = (x * 32767).astype('<i2').tobytes()
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f'  {name}.wav  {len(x) / SR:.1f}s')


def bubble(freq, dur=0.05, rise=1.8):
    t = t_axis(dur)
    f = freq * (1 + (rise - 1) * t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(len(t), 0.002, dur / 3)


def place_loop(buf, snd, at):
    """把 snd 放进循环缓冲，越界部分绕回开头，保证首尾无缝。"""
    n = len(buf)
    for i in range(len(snd)):
        buf[(at + i) % n] += snd[i]


def simmer(sec, rate, f_lo, f_hi, noise_amt, noise_cut, hard=0.0):
    n = int(SR * sec)
    buf = np.zeros(n)
    count = int(rate * sec)
    for _ in range(count):
        f = rng.uniform(f_lo, f_hi)
        b = bubble(f, rng.uniform(0.025, 0.07), rng.uniform(1.4, 2.4)) * rng.uniform(0.3, 1.0)
        if hard:
            b += hard * np.sign(b) * np.abs(b) ** 0.5 * 0.3
        place_loop(buf, b, int(rng.uniform(0, n)))
    fade = int(SR * 0.25)
    ext = one_pole_lp(rng.standard_normal(n + fade + SR), noise_cut)[SR // 2:]
    noise = ext[:n].copy()
    # 首尾交叉淡化：开头混进紧接在结尾之后的那段噪声，循环处连续不咔哒
    w = np.linspace(0, 1, fade)
    noise[:fade] = noise[:fade] * w + ext[n:n + fade] * (1 - w)
    return buf + noise * noise_amt


def bell(freq, dur=1.6, partials=((1, 1), (2.76, 0.45), (5.4, 0.25), (8.93, 0.12))):
    t = t_axis(dur)
    x = np.zeros_like(t)
    for k, a in partials:
        x += a * np.sin(2 * np.pi * freq * k * t) * np.exp(-t * (1.5 + k * 0.9))
    return x * np.clip(t / 0.003, 0, 1)


def pluck(freq, dur=1.8, bright=0.5):
    """Karplus-Strong 弹拨（像古筝 / 琵琶的一声）。"""
    n = int(SR * dur)
    p = max(2, int(SR / freq))
    y = np.zeros(n)
    y[:p] = rng.uniform(-1, 1, p) * (0.6 + 0.4 * bright)
    y[:p] = one_pole_lp(y[:p], 2000 + 6000 * bright)
    decay = 0.996
    for s in range(p, n, p):
        e = min(n, s + p)
        prev = y[s - p:e - p]
        prev1 = np.concatenate(([y[s - p - 1] if s - p - 1 >= 0 else 0], prev[:-1]))
        y[s:e] = decay * 0.5 * (prev + prev1)
    return y * env(n, 0.002, dur * 0.55)


def build_sfx():
    print('锅：')
    write('AU01_low_loop', simmer(4.0, 5, 250, 520, 0.05, 300), 0.55)
    write('AU02_mid_loop', simmer(4.0, 14, 280, 650, 0.10, 500), 0.65)
    write('AU03_high_loop', simmer(4.0, 34, 320, 800, 0.22, 900, hard=1.0), 0.75)

    t = t_axis(0.45)
    clink = (np.sin(2 * np.pi * 2450 * t) * 0.6 + np.sin(2 * np.pi * 3720 * t) * 0.35 + np.sin(2 * np.pi * 5230 * t) * 0.2) * np.exp(-t * 22)
    swish = bandish(rng.standard_normal(len(t)), 600, 2500) * np.sin(np.pi * np.clip(t / 0.35, 0, 1)) ** 2
    clink = np.roll(clink, int(SR * 0.22))
    clink[:int(SR * 0.22)] = 0
    write('AU04_stir', swish * 0.8 + clink * 0.9, 0.6)

    a = bell(659.3, 1.4)
    b = np.zeros(int(SR * 1.6))
    b[:len(a)] += a
    c = bell(880.0, 1.2)
    off = int(SR * 0.16)
    b[off:off + len(c)] += c * 0.8
    write('AU05_window', b, 0.55)

    t = t_axis(0.7)
    hiss = bandish(rng.standard_normal(len(t)), 2500, 7000) * np.exp(-t * 4.5)
    crack = np.zeros_like(t)
    for _ in range(26):
        i = int(rng.uniform(0, len(t) * 0.8))
        crack[i:i + 40] += rng.uniform(0.5, 1) * np.exp(-np.arange(min(40, len(t) - i)) / 6) * rng.choice([-1, 1])
    write('AU06_scorch', hiss + crack * 0.6, 0.8)

    t = t_axis(1.8)
    water = bandish(rng.standard_normal(len(t)), 300, 1800) * (np.sin(np.pi * t / 1.8) ** 0.8)
    for _ in range(28):
        place_loop(water, bubble(rng.uniform(500, 1100), 0.04) * 0.4, int(rng.uniform(0, len(t) - 2000)))
    write('AU07_wash', water, 0.6)

    print('铺子：')
    x = np.zeros(int(SR * 2.0))
    for k, at in enumerate((0.0, 0.18)):
        s = bell(1318.5 if k == 0 else 1568.0, 1.6, ((1, 1), (2.0, 0.3), (3.01, 0.15), (4.2, 0.08)))
        i = int(SR * at)
        x[i:i + len(s)] += s[:len(x) - i] * (1 if k == 0 else 0.8)
    write('AU11_bell', x, 0.6)

    t = t_axis(0.3)
    thump = np.sin(2 * np.pi * (110 + 60 * np.exp(-t * 30)) * t) * np.exp(-t * 18)
    wood = bandish(rng.standard_normal(len(t)), 800, 3000) * np.exp(-t * 60) * 0.5
    write('AU12_sit', thump + wood, 0.55)

    x = np.concatenate([pluck(392.0, 0.35, 0.3), np.zeros(int(SR * 0.02)), pluck(329.6, 0.55, 0.3)])
    write('AU13_leave', x, 0.4)

    t = t_axis(0.35)
    ping = lambda f, d: np.sin(2 * np.pi * f * t) * np.exp(-t * d)
    x = ping(2093, 18) * 0.6 + ping(3136, 24) * 0.35
    x2 = np.roll(ping(2637, 20) * 0.5, int(SR * 0.07))
    x2[:int(SR * 0.07)] = 0
    write('AU14_coin', x + x2, 0.45)

    t = t_axis(1.4)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.2 * t)
    ph = 2 * np.pi * np.cumsum(784 * vib) / SR
    flute = (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph))
    breath = bandish(rng.standard_normal(len(t)), 1500, 5000) * 0.12
    shape = np.clip(t / 0.08, 0, 1) * np.clip((1.4 - t) / 0.5, 0, 1)
    write('AU15_close', (flute + breath) * shape, 0.5)

    t = t_axis(0.55)
    cloth = bandish(rng.standard_normal(len(t)), 900, 4000)
    shape = np.sin(np.pi * t / 0.55) ** 2 * (1 + 0.5 * np.sin(2 * np.pi * 7 * t))
    write('AU16_wipe', cloth * shape, 0.4)


# 五声音阶（宫商角徵羽），D 宫
SCALE = [293.66, 329.63, 369.99, 440.00, 493.88]


def note(degree):
    octave, k = divmod(degree, 5)
    return SCALE[k] * (2 ** octave)


THEME = [  # (音级, 拍数)：一段安静的街巷小调，8 小节
    (0, 1), (2, 1), (3, 2), (4, 1), (3, 1), (2, 2),
    (1, 1), (2, 1), (0, 2), (-1, 2), (0, 2),
    (2, 1), (3, 1), (4, 2), (5, 1), (4, 1), (3, 2),
    (2, 1), (1, 1), (2, 1), (0, 1), (0, 4),
]
BASS = [0, -2, -1, 0, 0, -2, -1, 0]  # 每小节一个根音（低八度）


def render_music(bpm, rhythm):
    beat = 60 / bpm
    beats = sum(b for _, b in THEME)
    n = int(SR * beat * beats)
    buf = np.zeros(n + SR * 3)
    pos = 0.0
    for deg, b in THEME:
        s = pluck(note(deg), min(2.6, b * beat + 1.2), 0.55) * 0.9
        i = int(pos * SR)
        buf[i:i + len(s)] += s
        pos += b * beat
    for bar, deg in enumerate(BASS):
        s = pluck(note(deg - 5), beat * 4 + 1.0, 0.25) * 0.55
        i = int(bar * 4 * beat * SR)
        buf[i:i + len(s)] += s
        if bar % 2 == 1:
            s2 = pluck(note(deg - 3), beat * 2 + 0.8, 0.3) * 0.35
            j = int((bar * 4 + 2) * beat * SR)
            buf[j:j + len(s2)] += s2
    if rhythm:
        # 很轻的木鱼 + 沙锤，不用鼓点
        for k in range(int(beats * 2)):
            i = int(k * beat / 2 * SR)
            if k % 2 == 0:
                t = t_axis(0.12)
                blk = np.sin(2 * np.pi * (900 if k % 8 == 0 else 760) * t) * np.exp(-t * 45)
                buf[i:i + len(blk)] += blk * (0.22 if k % 8 == 0 else 0.13)
            t = t_axis(0.07)
            sh = bandish(rng.standard_normal(len(t)), 4000, 9000) * np.exp(-t * 60)
            buf[i:i + len(sh)] += sh * 0.09
    # 尾音绕回开头，循环无缝
    tail = buf[n:]
    buf = buf[:n]
    buf[:len(tail)] += tail
    return buf


def build_music():
    print('音乐：')
    write('music_prep_loop', render_music(66, False), 0.5)
    write('music_service_loop', render_music(78, True), 0.5)


def seamless(x, fade):
    """把多生成的尾巴叠到开头，做成首尾相接的循环。"""
    k = int(SR * fade)
    body = x[:-k].copy()
    w = np.linspace(0, 1, k)
    body[:k] = body[:k] * w + x[-k:] * (1 - w)
    return body


def build_ambience():
    print('环境：')
    # 街坊的人声嘈嘈：低频带通噪声 + 慢起伏，像隔着门帘听见的说话声
    sec = 12.0
    t = t_axis(sec + 1.5)
    murmur = bandish(rng.standard_normal(len(t)), 180, 900)
    swell = 0.55 + 0.25 * np.sin(2 * np.pi * 0.11 * t) + 0.2 * np.sin(2 * np.pi * 0.37 * t + 1.3)
    voices = np.zeros_like(t)
    for _ in range(18):                                   # 偶尔一句稍近一点的话
        at = rng.uniform(0, sec)
        d = rng.uniform(0.35, 0.9)
        n = int(SR * d)
        i = int(SR * at)
        seg = bandish(rng.standard_normal(n), rng.uniform(250, 380), rng.uniform(900, 1500))
        seg *= np.sin(np.pi * np.arange(n) / n) ** 2 * (1 + 0.6 * np.sin(2 * np.pi * rng.uniform(3, 6) * np.arange(n) / SR))
        voices[i:i + n] += seg[:len(voices) - i] * rng.uniform(0.3, 0.6)
    clinks = np.zeros_like(t)
    for _ in range(9):                                    # 远处碗勺碰一下
        f = rng.uniform(2200, 3400)
        tt = t_axis(0.25)
        c = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 1.51 * tt)) * np.exp(-tt * 28)
        place_loop(clinks, c * rng.uniform(0.08, 0.16), int(rng.uniform(0, len(t) - len(c))))
    insects = np.sin(2 * np.pi * 4300 * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 23 * t))) * (0.4 + 0.6 * (np.sin(2 * np.pi * 0.07 * t) > 0.3))
    insects = bandish(insects, 3000, 6000) * 0.05      # 夏夜虫鸣，很轻
    x = murmur * swell * 0.7 + voices * 0.5 + clinks + insects
    write('amb_street_loop', seamless(x, 1.5), 0.4)


def build_stings():
    print('提示：')
    # 打烊结账：五声音阶向上一串弹拨，最后一声铃收住
    seq = [(293.66, 0.0), (369.99, 0.14), (440.0, 0.28), (587.33, 0.42)]
    x = np.zeros(int(SR * 2.4))
    for f, at in seq:
        s = pluck(f, 1.6, 0.45)
        i = int(SR * at)
        x[i:i + len(s)] += s[:len(x) - i] * 0.8
    b = bell(1174.7, 1.8)
    i = int(SR * 0.58)
    x[i:i + len(b)] += b[:len(x) - i] * 0.5
    write('AU17_dayend', x, 0.55)
    # 小目标做到：两声清亮的拨弦 + 一声铜钱
    x = np.zeros(int(SR * 0.9))
    for f, at in ((880.0, 0.0), (1174.7, 0.09)):
        s = pluck(f, 0.7, 0.7)
        i = int(SR * at)
        x[i:i + len(s)] += s[:len(x) - i]
    tt = t_axis(0.35)
    coin = np.sin(2 * np.pi * 2637 * tt) * np.exp(-tt * 20) * 0.5
    i = int(SR * 0.2)
    x[i:i + len(coin)] += coin[:len(x) - i]
    write('AU18_goal', x, 0.5)


def chirp(f0, f1, dur, vib=0.0):
    """一声鸟叫：频率滑音 + 少许颤音，快起慢收。"""
    t = t_axis(dur)
    f = f0 + (f1 - f0) * (t / dur) ** 0.7
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 38 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    shape = np.clip(t / 0.008, 0, 1) * np.exp(-t / (dur * 0.45))
    return (np.sin(ph) + 0.18 * np.sin(2 * ph)) * shape


def build_morning():
    print('清晨：')
    sec = 14.0
    t = t_axis(sec + 1.5)
    n = len(t)
    breeze = bandish(rng.standard_normal(n), 120, 1200) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.06 * t + 0.4)) * 0.35
    street = bandish(rng.standard_normal(n), 90, 380) * 0.25        # 远处的早市，低低的一层
    birds = np.zeros(n)
    at = 0.3
    while at < sec:                                                   # 麻雀：两三声一串，隔一会儿再来
        base = rng.uniform(3200, 4600)
        for k in range(rng.integers(2, 5)):
            c = chirp(base * rng.uniform(0.95, 1.1), base * rng.uniform(1.15, 1.45), rng.uniform(0.05, 0.09))
            place_loop(birds, c * rng.uniform(0.25, 0.45), int(SR * (at + k * rng.uniform(0.09, 0.14))))
        at += rng.uniform(0.6, 1.6)
    for at in (2.2, 8.7):                                             # 远一点的画眉，一句婉转的
        for k, (a, b) in enumerate(((2100, 2900), (2900, 2400), (2500, 3300), (3300, 2600))):
            c = chirp(a, b, 0.16, vib=0.02)
            place_loop(birds, c * 0.22, int(SR * (at + k * 0.17)))
    bike = np.zeros(n)                                                # 巷口一声自行车铃
    ring_ = bell(2350.0, 0.6, ((1, 1), (2.32, 0.4), (4.1, 0.15)))
    for k in range(2):
        place_loop(bike, ring_ * 0.18, int(SR * (5.4 + k * 0.13)))
    x = breeze + street + birds + bike
    write('amb_morning_loop', seamless(x, 1.5), 0.35)


if __name__ == '__main__':
    print('输出到', OUT)
    build_sfx()
    build_music()
    build_ambience()
    build_morning()
    build_stings()
