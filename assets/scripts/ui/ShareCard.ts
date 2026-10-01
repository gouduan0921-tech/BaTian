/**
 * 「今日的粥」分享卡（文档 24）：打烊页点「留下这张」，在浏览器里画一张横图并保存到本地。
 * 只写店名、完成日、最好的一碗与结果、氛围的人话；不写钱包数字。失败只提示，不影响结算。
 * 只依赖浏览器 2D 画布，不另起一套 3D 渲染。
 */
export interface ShareInfo {
    shopName: string;
    day: number;
    recipeName: string;
    resultWord: string;
    soupColor: string;
    garnish: string[];
    atmosphere: string;
    served: number;
}

const W = 1200;
const H = 630;
const DISPLAY = '"Songti SC", "STSong", "SimSun", serif';
const UI = '"PingFang SC", "Microsoft YaHei", sans-serif';

function mix(hex: string, to: string, k: number): string {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const c = [16, 8, 0].map(s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/** 画出卡片，返回画布；非浏览器环境返回 null。 */
export function drawShareCard(info: ShareInfo): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return null;
    // 夜色底 + 暖光
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1E3A3A');
    bg.addColorStop(1, '#122927');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(360, 330, 20, 360, 330, 360);
    glow.addColorStop(0, 'rgba(229,176,105,0.35)');
    glow.addColorStop(1, 'rgba(229,176,105,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // 碗
    const cx = 360;
    const cy = 340;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(cx, cy + 150, 170, 26, 0, 0, Math.PI * 2); g.fill();
    const body = g.createLinearGradient(cx - 200, 0, cx + 200, 0);
    body.addColorStop(0, '#FFF7E6');
    body.addColorStop(1, '#CABB96');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx - 200, cy);
    g.bezierCurveTo(cx - 200, cy + 190, cx + 200, cy + 190, cx + 200, cy);
    g.closePath(); g.fill();
    g.strokeStyle = '#6F9A52'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(cx, cy + 70, 150, 26, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#EFE7D2';
    g.beginPath(); g.ellipse(cx, cy, 200, 52, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#D2C3A0'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, cy, 200, 52, 0, 0, Math.PI * 2); g.stroke();
    const soup = g.createRadialGradient(cx - 50, cy - 12, 10, cx, cy, 190);
    soup.addColorStop(0, mix(info.soupColor, '#FFFFFF', 0.2));
    soup.addColorStop(1, mix(info.soupColor, '#9C7A4A', 0.25));
    g.fillStyle = soup;
    g.beginPath(); g.ellipse(cx, cy, 176, 42, 0, 0, Math.PI * 2); g.fill();
    const spots = [[-90, -8], [30, -18], [100, 6], [-20, 14], [-60, 20], [60, 22], [-120, 10], [130, -6]];
    spots.forEach(([x, y], i) => {
        if (!info.garnish.length) return;
        g.fillStyle = info.garnish[i % info.garnish.length];
        g.beginPath(); g.ellipse(cx + x, cy + y, 16, 6, (i % 3) * 0.6, 0, Math.PI * 2); g.fill();
    });
    // 热气
    g.strokeStyle = 'rgba(255,248,232,0.45)'; g.lineWidth = 6; g.lineCap = 'round';
    for (const dx of [-60, 0, 60]) {
        g.beginPath();
        g.moveTo(cx + dx, cy - 70);
        g.bezierCurveTo(cx + dx - 30, cy - 110, cx + dx + 30, cy - 140, cx + dx, cy - 180);
        g.stroke();
    }

    // 右侧纸笺
    roundRect(g, 640, 70, 500, 490, 26);
    g.fillStyle = '#F5ECD7'; g.fill();
    g.fillStyle = '#B4A084';
    roundRect(g, 640, 552, 500, 14, 8); g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#A48451';
    g.font = `20px ${UI}`;
    g.fillText(`第 ${info.day} 日 · 今日的粥`.split('').join(' '), 890, 130);
    g.fillStyle = '#3C3529';
    g.font = `bold 64px ${DISPLAY}`;
    g.fillText(info.recipeName || '一碗白粥', 890, 220);
    g.fillStyle = '#326B5B';
    roundRect(g, 820, 250, 140, 48, 24); g.fill();
    g.fillStyle = '#FFF2D6';
    g.font = `bold 26px ${UI}`;
    g.fillText(info.resultWord, 890, 284);
    g.fillStyle = '#807965';
    g.font = `24px ${UI}`;
    g.fillText(info.atmosphere, 890, 358);
    g.fillText(info.served ? `今天端出 ${info.served} 碗热粥` : '今天的锅，明天再热', 890, 400);
    g.strokeStyle = '#BDAB89'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(700, 440); g.lineTo(1080, 440); g.stroke();
    g.fillStyle = '#3C3529';
    g.font = `bold 40px ${DISPLAY}`;
    g.fillText(info.shopName, 870, 500);
    g.fillStyle = '#AD4F36';
    roundRect(g, 955, 470, 30, 36, 4); g.fill();
    g.fillStyle = '#F7EAD0';
    g.font = `20px ${DISPLAY}`;
    g.fillText('粥', 970, 495);
    g.fillStyle = 'rgba(219,197,161,0.7)';
    g.font = `18px ${UI}`;
    g.fillText('炭 火 慢 熬  ·  街 坊 小 铺', 360, 590);
    return cv;
}

/** 保存为 PNG。成功返回 null，失败返回给玩家看的原因。 */
export function saveShareCard(info: ShareInfo): Promise<string | null> {
    return new Promise(resolve => {
        try {
            const cv = drawShareCard(info);
            if (!cv) { resolve('这个平台还不能保存图片'); return; }
            cv.toBlob(blob => {
                if (!blob) { resolve('图片没生成出来'); return; }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `粥霸天_第${info.day}日_今日的粥.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                resolve(null);
            }, 'image/png');
        } catch (e) {
            resolve(`没能保存：${(e as Error).message}`);
        }
    });
}
