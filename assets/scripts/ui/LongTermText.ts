import { GameConfig } from '../core/Config';
import { chapterGoalValue, ChapterRun } from '../rules/Chapters';
import { Progress } from '../rules/Progress';
import { RequestState } from '../rules/Requests';

/** 长线内容（文档 30）在各个界面上共用的几句话。 */

const GOAL_SHORT: Record<string, string> = { perfect: '刚好', requests: '请托', fullGoalDays: '全做到的日子', calmDays: '没人等走的日子' };

/** 「白露 · 秋粥 第 3/7 天：桂花山药粥 7/18 · 刚好 12/30」 */
export function chapterLine(config: GameConfig, p: Progress, day = p.day): string {
    const run = p.chapter(day);
    if (!run) return '';
    const prog = p.chapterProgress(day);
    const len = run.endDay - run.startDay + 1;
    const parts = run.goals.map(g => {
        const label = g.type === 'served' ? config.recipe.get(g.recipeId ?? '')?.name ?? '' : GOAL_SHORT[g.type] ?? g.type;
        return `${label} ${Math.min(chapterGoalValue(g, prog), g.count)}/${g.count}`;
    });
    return `${run.name} 第 ${Math.min(len, day - run.startDay + 1)}/${len} 天：${parts.join(' · ')}`;
}

/** 章节一句话简介（清晨菜单用）。 */
export function chapterIntro(run: ChapterRun | null): string { return run ? run.cfg.intro : ''; }

/** 「街坊 · 午市 2 碗小米南瓜粥」 */
export function requestText(config: GameConfig, r: RequestState): string {
    const who = config.customer.get(r.customerId)?.name ?? '';
    const wave = config.balance.demand.waves.find(w => w.id === r.wave)?.name ?? '';
    return `${who} · ${wave} ${r.count} 碗${config.recipe.get(r.recipeId)?.name ?? ''}`;
}
