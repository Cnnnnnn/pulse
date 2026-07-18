/**
 * src/renderer/games/BadgeWall.jsx — 徽章墙（P1b · B）。
 *
 * 展示型荣誉墙：
 *  - 已点亮徽章：图标 + 名称 + 获得日期（tabular-nums）。
 *  - 未点亮规则：置灰展示，提示目标（desc），激励收藏。
 *  - 响应式：订阅 badgesEarned signal（由 gamesStore 的引擎 effect 随 wishlist 重算）。
 *  - a11y：图标 aria-hidden，容器/条目带中文 aria-label；焦点环沿用全局范式。
 */
import { badgesEarned } from "./gamesStore.js";
import { BUILTIN_BADGE_RULES } from "./badges.js";

/** ISO 时间 → YYYY-MM-DD（本地，纯展示）。 */
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BadgeWall() {
  const earned = badgesEarned.value || {};
  const earnedIds = new Set(Object.keys(earned).filter((k) => earned[k]));

  const earnedList = BUILTIN_BADGE_RULES.filter((r) => earnedIds.has(r.id));
  const lockedList = BUILTIN_BADGE_RULES.filter((r) => !earnedIds.has(r.id));

  return (
    <section class="badge-wall" aria-label="收藏徽章墙">
      <div class="badge-wall__head">
        <h3 class="badge-wall__title">徽章墙</h3>
        <span class="badge-wall__count" aria-hidden="true">
          {earnedList.length}/{BUILTIN_BADGE_RULES.length}
        </span>
      </div>

      {BUILTIN_BADGE_RULES.length === 0 ? (
        <p class="badge-wall__empty">暂无徽章规则。</p>
      ) : (
        <ul class="badge-wall__grid">
          {earnedList.map((r) => {
            const record = earned[r.id];
            return (
              <li
                class="badge-wall__item is-earned"
                key={r.id}
                aria-label={`已点亮徽章：${r.name}，获得于 ${fmtDate(record && record.earnedAt)}`}
              >
                <span class="badge-wall__icon" aria-hidden="true">{r.icon}</span>
                <span class="badge-wall__name">{r.name}</span>
                <span class="badge-wall__date">{fmtDate(record && record.earnedAt)}</span>
              </li>
            );
          })}
          {lockedList.map((r) => (
            <li
              class="badge-wall__item is-locked"
              key={r.id}
              aria-label={`未点亮徽章：${r.name}（目标：${r.desc}）`}
              title={`目标：${r.desc}`}
            >
              <span class="badge-wall__icon" aria-hidden="true">{r.icon}</span>
              <span class="badge-wall__name">{r.name}</span>
              <span class="badge-wall__goal">{r.desc}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default BadgeWall;
