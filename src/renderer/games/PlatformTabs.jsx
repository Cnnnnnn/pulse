/**
 * src/renderer/games/PlatformTabs.jsx — 平台分类切换 (全部 / Steam / Epic / …)。
 */
import { PLATFORMS, activePlatform, setPlatform } from "./gamesStore.js";

export function PlatformTabs() {
  return (
    <div class="games-platform-tabs" role="tablist" aria-label="平台分类">
      {PLATFORMS.map((p) => {
        const active = activePlatform.value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-platform={p.key}
            class={`games-platform-tab${active ? " is-active" : ""}`}
            onClick={() => setPlatform(p.key)}
          >
            <span class="games-platform-tab__dot" aria-hidden="true" />
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
