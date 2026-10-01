import { Color, Component, instantiate, Label, Node, Prefab, UITransform } from 'cc';
import { RoundRect } from './RoundRect';

/** 界面小工具：列表复用、颜色、文字。预制体负责长相，脚本只填数据。 */

export const PALETTE = {
    ink: new Color(0x3c, 0x35, 0x29, 255),
    paper: new Color(0xf5, 0xec, 0xd7, 255),
    panel: new Color(0xf5, 0xec, 0xd7, 245),
    wood: new Color(0x80, 0x56, 0x38, 255),
    warm: new Color(0xd2, 0xae, 0x72, 255),
    gold: new Color(0xc5, 0x96, 0x51, 255),
    good: new Color(0x71, 0x97, 0x75, 255),
    jade: new Color(0x32, 0x6b, 0x5b, 255),
    warn: new Color(0xc0, 0x84, 0x3c, 255),
    burnt: new Color(0x97, 0x4b, 0x32, 255),
    mute: new Color(0x80, 0x79, 0x65, 255),
    white: new Color(255, 255, 255, 255),
    selected: new Color(0x52, 0x8c, 0x71, 255),
    disabled: new Color(0xd8, 0xcf, 0xc4, 255),
};

/** 壹贰叁肆…：锅号、日子用的大写数字（设计稿锅牌「壹」「贰」） */
export const BIG_NUM = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
export function bigNum(n: number): string {
    if (n <= 10) return BIG_NUM[n] ?? String(n);
    if (n < 20) return `拾${BIG_NUM[n - 10]}`;
    if (n < 100) return `${BIG_NUM[Math.floor(n / 10)]}拾${n % 10 ? BIG_NUM[n % 10] : ''}`;
    return String(n);
}

export function hexColor(hex: string, alpha = 255): Color {
    const v = parseInt(hex.replace('#', ''), 16);
    return new Color((v >> 16) & 255, (v >> 8) & 255, v & 255, alpha);
}

export function setText(label: Label | null | undefined, text: string): void {
    if (label && label.string !== text) label.string = text;
}

export function setTint(rect: RoundRect | null | undefined, color: Color): void {
    rect?.setColor(color);
}

export function setActive(node: Node | null | undefined, active: boolean): void {
    if (node && node.active !== active) node.active = active;
}

/**
 * 让 content 下正好有 count 个 prefab 实例，多的隐藏、少的实例化，返回每个实例上的组件。
 * 行的外观全部在行预制体里，这里不创建任何自定义节点。
 */
export function syncList<T extends Component>(content: Node | null, prefab: Prefab | null, count: number, type: new () => T): T[] {
    if (!content || !prefab) return [];
    const out: T[] = [];
    for (let i = 0; i < Math.max(count, content.children.length); i++) {
        let child = content.children[i];
        if (!child && i < count) {
            child = instantiate(prefab);
            child.parent = content;
        }
        if (!child) continue;
        child.active = i < count;
        if (i < count) {
            const comp = child.getComponent(type);
            if (comp) out.push(comp);
        }
    }
    return out;
}

export function setWidth(node: Node | null, width: number): void {
    const t = node?.getComponent(UITransform);
    if (t && Math.abs(t.width - width) > 0.01) t.width = width;
}

export function fmtTime(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
