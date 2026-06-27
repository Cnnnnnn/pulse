import { viewMode, setViewMode } from "../library-view-store.js";
import { IconList, IconGrid } from "./icons.jsx";

export function ViewSwitcher() {
  return (
    <div class="view-switcher" role="group" aria-label="视图切换">
      <button
        type="button"
        class={`view-switcher-btn${viewMode.value === "table" ? " active" : ""}`}
        onClick={() => setViewMode("table")}
        aria-label="表格视图"
        aria-pressed={viewMode.value === "table"}
        title="表格视图"
      >
        <IconList size={14} />
      </button>
      <button
        type="button"
        class={`view-switcher-btn${viewMode.value === "card" ? " active" : ""}`}
        onClick={() => setViewMode("card")}
        aria-label="卡片视图"
        aria-pressed={viewMode.value === "card"}
        title="卡片视图"
      >
        <IconGrid size={14} />
      </button>
    </div>
  );
}

export default ViewSwitcher;
