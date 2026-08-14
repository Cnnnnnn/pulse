/**
 * AI 榜单 Reading Rail：把数据源和主维度从表格上方的长工具栏移到固定左栏。
 * 这样中央区域可以专注于数据表，次要说明和 AI 分析不会挤压首屏表格。
 */
import {
  activeAgentDim,
  activeBoard,
  activeCodeCat,
  activeDim,
  activeLB,
  activeTextCat,
  activeView,
  compareList,
  setAgentDim,
  setBoard,
  setCodeCat,
  setCategory,
  setDim,
  setLB,
  setTextCat,
  setView,
  toggleSort,
} from "./aiLeaderboardStore.ts";
import {
  AA_DIMENSIONS,
  AA_DIMENSION_KEYS,
  AGENT_DIMENSIONS,
  ARENA_BOARDS,
  ARENA_CATEGORIES,
  CODE_CATEGORIES,
  HF_DIMENSIONS,
  HF_DIMENSION_KEYS,
  LIVE_DIMENSIONS,
  LIVE_DIMENSION_KEYS,
  TEXT_CATEGORIES,
  VIEW_KEYS,
  VIEWS,
  uiCategoryOfBoard,
} from "./types.ts";
import { IconCheck, IconChevronDown, IconSparkles } from "../components/icons.tsx";

function RailDimensionButton({ active, label, sub = "", onClick }) {
  return (
    <button
      type="button"
      class={`ai-lb-rail__dimension${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span class="ai-lb-rail__dimension-main">
        <span class="ai-lb-rail__dimension-icon" aria-hidden="true" />
        {label}
      </span>
      {sub && <span class="ai-lb-rail__dimension-sub">{sub}</span>}
    </button>
  );
}

function RailSelect({ label, value, onChange, children }) {
  return (
    <label class="ai-lb-rail__select">
      <span>{label}</span>
      <span class="ai-lb-rail__select-control">
        <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          {children}
        </select>
        <IconChevronDown size={13} />
      </span>
    </label>
  );
}

function ArenaRailControls() {
  const category = uiCategoryOfBoard(activeBoard.value);
  const categoryMeta = ARENA_CATEGORIES.find((item) => item.key === category) || ARENA_CATEGORIES[0];

  return (
    <div class="ai-lb-rail__arena-controls">
      <div class="ai-lb-rail__subheading">Arena 榜单</div>
      <div class="ai-lb-rail__category-list" role="group" aria-label="Arena 榜单类别">
        {ARENA_CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            class={`ai-lb-rail__category${category === item.key ? " is-active" : ""}`}
            aria-pressed={category === item.key}
            onClick={() => setCategory(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <RailSelect
        label="子榜"
        value={activeBoard.value}
        onChange={setBoard}
      >
        {categoryMeta.boards.map((boardKey) => (
          <option key={boardKey} value={boardKey}>
            {ARENA_BOARDS[boardKey].label}
          </option>
        ))}
      </RailSelect>
      {activeBoard.value === "agent" && (
        <RailSelect label="Agent 维度" value={activeAgentDim.value} onChange={setAgentDim}>
          {AGENT_DIMENSIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </RailSelect>
      )}
      {activeBoard.value === "text" && (
        <RailSelect label="Text 子维度" value={activeTextCat.value} onChange={setTextCat}>
          {TEXT_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </RailSelect>
      )}
      {activeBoard.value === "code" && (
        <RailSelect label="Code 子维度" value={activeCodeCat.value} onChange={setCodeCat}>
          {CODE_CATEGORIES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </RailSelect>
      )}
    </div>
  );
}

function dimensionsForView(view) {
  if (view === "aa") {
    return AA_DIMENSION_KEYS.map((key) => ({
      key,
      label: AA_DIMENSIONS[key].label,
      active: activeDim.value === key,
      onClick: () => setDim(key),
    }));
  }
  if (view === "livebench") {
    return LIVE_DIMENSION_KEYS.map((key) => ({
      key,
      label: LIVE_DIMENSIONS[key].label,
      active: activeLB.value === key,
      onClick: () => setLB(key),
    }));
  }
  if (view === "huggingface") {
    return HF_DIMENSION_KEYS.map((key) => ({
      key,
      label: HF_DIMENSIONS[key].label,
      active: activeDim.value === key,
      // HF 的各维度在同一快照中可本地切换，避免切换维度时再次挤压表格。
      onClick: () => {
        if (activeDim.value !== key) toggleSort(key);
      },
    }));
  }
  return [];
}

export function LeaderboardReadingRail({ onAnalyze }) {
  const view = activeView.value;
  const selectedCount = compareList.value.length;
  const dimensions = dimensionsForView(view);

  return (
    <aside class="ai-lb-reading-rail" aria-label="榜单阅读轨道">
      <header class="ai-lb-rail__header">
        <h2>阅读轨道</h2>
        <span>Reading Rail</span>
      </header>

      <section class="ai-lb-rail__section" aria-labelledby="ai-lb-rail-sources">
        <h3 id="ai-lb-rail-sources">数据源</h3>
        <nav class="ai-lb-rail__source-list" aria-label="数据源视角">
          {VIEW_KEYS.map((key) => {
            const meta = VIEWS[key];
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                class={`ai-lb-rail__source${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setView(key)}
              >
                <span class={`ai-lb-rail__source-dot ai-lb-rail__source-dot--${key}`} aria-hidden="true" />
                <span class="ai-lb-rail__source-copy">
                  <strong>{meta.label}</strong>
                  <small>{meta.segSub}</small>
                </span>
                {active && <IconCheck size={14} class="ai-lb-rail__source-check" />}
              </button>
            );
          })}
        </nav>
      </section>

      <section class="ai-lb-rail__section" aria-labelledby="ai-lb-rail-dimensions">
        <h3 id="ai-lb-rail-dimensions">维度</h3>
        {view === "arena" ? (
          <ArenaRailControls />
        ) : (
          <div class="ai-lb-rail__dimension-list" role="group" aria-label={view === "aa" ? "AA 排序维度" : "榜单维度"}>
            {dimensions.map((item) => (
              <RailDimensionButton
                key={item.key}
                label={item.label}
                active={item.active}
                onClick={item.onClick}
              />
            ))}
          </div>
        )}
      </section>

      <div class="ai-lb-rail__spacer" />

      <div class="ai-lb-rail__analysis">
        <button
          type="button"
          class="ai-lb-rail__analysis-btn"
          disabled={selectedCount === 0}
          onClick={onAnalyze}
          title={selectedCount === 0 ? "先在表格中选择模型" : "打开 AI 分析"}
        >
          <IconSparkles size={15} />
          <span>AI 分析</span>
          {selectedCount > 0 && <strong>{selectedCount}</strong>}
        </button>
        <p>{selectedCount > 0 ? `已选 ${selectedCount} 个模型` : "选择模型后可用"}</p>
      </div>
    </aside>
  );
}

export default LeaderboardReadingRail;
