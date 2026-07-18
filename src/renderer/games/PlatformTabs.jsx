/**
 * src/renderer/games/PlatformTabs.jsx — 平台分类切换 (Steam / Epic / …)。
 *
 * 比价模式（compare）下，平台 Tab 变为「多选 toggle」：用户可勾选 2–3 个平台对比，
 * 至少保留 1 个；此时 role 用 button + aria-pressed，而非 tab。
 */
import { useRef } from "preact/hooks";
import {
  PLATFORMS,
  activePlatform,
  setPlatform,
  activeMode,
  comparePlatforms,
  toggleComparePlatform,
} from "./gamesStore.js";

export function PlatformTabs() {
  const isCompare = activeMode.value === "compare";
  const tabRefs = useRef([]);

  // WAI-ARIA Tabs 键盘模式：←/→ 移动焦点（tab 模式同时选中），Home/End 跳首尾。
  // 比价（多选 group）模式仅移动焦点，选中由 Enter/Space 原生 toggle 负责。
  function onKeyDown(e) {
    const count = PLATFORMS.length;
    const current = tabRefs.current.findIndex((el) => el === document.activeElement);
    let next = current;
    switch (e.key) {
      case "ArrowRight":
        next = (current + 1) % count;
        break;
      case "ArrowLeft":
        next = (current - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const el = tabRefs.current[next];
    if (!el) return;
    el.focus();
    if (!isCompare) setPlatform(PLATFORMS[next].key);
  }

  return (
    <div
      class="games-platform-tabs"
      role={isCompare ? "group" : "tablist"}
      aria-orientation="horizontal"
      aria-label="平台分类"
      onKeyDown={onKeyDown}
    >
      {PLATFORMS.map((p, i) => {
        const active = isCompare
          ? comparePlatforms.value.includes(p.key)
          : activePlatform.value === p.key;
        return (
          <button
            key={p.key}
            ref={(el) => (tabRefs.current[i] = el)}
            type="button"
            role={isCompare ? "button" : "tab"}
            aria-pressed={isCompare ? active : undefined}
            aria-selected={isCompare ? undefined : active}
            data-platform={p.key}
            class={`games-platform-tab${active ? " is-active" : ""}`}
            onClick={() =>
              isCompare ? toggleComparePlatform(p.key) : setPlatform(p.key)
            }
          >
            <span class="games-platform-tab__dot" aria-hidden="true" />
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
