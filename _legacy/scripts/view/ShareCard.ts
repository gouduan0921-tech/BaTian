import { atmosphereWords, shareCardText } from '../rules/ServiceDay';

export interface SharePicture {
    day: number;
    dish: string;
    result: string;
    atmosphere: number;
    close: string;
    color: string;
    featured: string;
}

const RESULT_INK: Record<string, string> = {
    刚好: '#a8c670',
    夹生: '#d6ceb0',
    过火: '#9e4e30',
    糊底: '#2a1c18',
};

/** 画一张日结图并交给浏览器下载。失败时抛错，不改账目。 */
export function downloadSharePicture(card: SharePicture): void {
    if (typeof document === 'undefined') throw new Error('没有浏览器画布');
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('没有画布');
    pen.fillStyle = '#1c1612';
    pen.fillRect(0, 0, 960, 540);
    pen.fillStyle = card.color || '#f3e2c4';
    pen.fillRect(0, 0, 360, 540);
    pen.fillStyle = '#241c18';
    pen.beginPath();
    pen.arc(180, 230, 108, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = card.color || '#f3e2c4';
    pen.beginPath();
    pen.arc(180, 230, 78, 0, Math.PI * 2);
    pen.fill();
    const ink = RESULT_INK[card.result] || '#3a312b';
    pen.fillStyle = ink;
    pen.fillRect(70, 390, 220, 64);
    const lightBadge = card.result === '刚好' || card.result === '夹生';
    pen.fillStyle = lightBadge ? '#241c18' : '#f5e9ce';
    pen.font = '32px sans-serif';
    pen.textAlign = 'center';
    pen.fillText(card.result || '今日', 180, 432);
    pen.textAlign = 'left';
    pen.fillStyle = '#f5e9ce';
    pen.font = '28px sans-serif';
    pen.fillText('粥霸天', 400, 96);
    pen.font = '42px sans-serif';
    pen.fillText(`第${card.day}日`, 400, 160);
    const lines = shareCardText({
        day: card.day,
        dish: card.dish,
        result: card.result,
        atmosphere: atmosphereWords(card.atmosphere),
        close: card.close,
    }).split('\n').slice(2);
    pen.font = '28px sans-serif';
    lines.forEach((line, index) => pen.fillText(line, 400, 230 + index * 46));
    if (card.featured && card.featured !== card.dish) {
        pen.font = '22px sans-serif';
        pen.fillStyle = '#d7c4a4';
        pen.fillText(`今日招牌 ${card.featured}`, 400, 470);
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `粥霸天-第${card.day}日.png`;
    link.click();
}
