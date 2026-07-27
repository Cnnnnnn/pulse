/**
 * src/renderer/ai-leaderboard/LeaderboardFilterBar.tsx
 *
 * 对齐 ai-leaderboard-redesign-preview：分段视角切换 + 工具栏（左筛选 / 右搜索刷新）
 */
import { useState, useEffect } from "preact/hooks";
import {
  activeView,
  activeBoard,
  activeDim,
  activeAgentDim,
  activeTextCat,
  activeCodeCat,
  activeCategory,
  activeVendor,
  licenseFilter,
  searchQuery,
  loading,
  setView,
  setBoard,
  setCategory,
  setDim,
  setAgentDim,
  setTextCat,
  setCodeCat,
  setVendor,
  setLicenseFilter,
  setSearchQuery,
  clearSearchQuery,
  refresh,
} from "./aiLeaderboardStore.ts";
import {
  VIEW_KEYS,
  VIEWS,
  ARENA_CATEGORIES,
  ARENA_BOARDS,
  boardsOfCategory,
  AGENT_DIMENSIONS,
  TEXT_CATEGORIES,
  CODE_CATEGORIES,
  AA_DIMENSIONS,
  AA_DIMENSION_KEYS,
  VENDOR_OPTIONS,
  LICENSE_FILTER_OPTIONS,
} from "./types.ts";

/**
 * Arena 大类 + 二级榜合并选择器（方案 B）：
 *  - 单 board 大类（多模态/代码）→ 直接按钮切换
 *  - 多 board 大类（文本/图像/视频）→ 点击展开下拉菜单选子榜
 *  - 当前选中大类高亮；下拉里当前子榜高亮
 *  - 点击空白处关闭下拉（透明 overlay 兜底）
 */
function ArenaBoardSelector() {
  const [openCat, setOpenCat] = useState(null);
  const activeCat = activeCategory();
  return (
    <div class="ai-leaderboard-boardsel" role="group" aria-label="Arena 大类">
      {openCat && <div class="ai-leaderboard-boardsel__overlay" onClick={() => setOpenCat(null)} aria-hidden="true" />}
      {ARENA_CATEGORIES.map((c: any) => {
        const isActive = activeCat === c.key;
        const hasMultiple = c.boards.length > 1;
        if (!hasMultiple) {
          return (
            <button
              key={c.key}
              type="button"
              class={`ai-leaderboard-boardsel__cat${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => setBoard(c.boards[0])}
            >
              {c.label}
            </button>
          );
        }
        return (
          <div key={c.key} class="ai-leaderboard-boardsel__grp">
            <button
              type="button"
              class={`ai-leaderboard-boardsel__cat${isActive ? " is-active" : ""}${openCat === c.key ? " is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={openCat === c.key}
              onClick={() => setOpenCat(openCat === c.key ? null : c.key)}
            >
              {c.label}
              <span class="ai-leaderboard-boardsel__arrow" aria-hidden="true">▾</span>
            </button>
            {openCat === c.key && (
              <div class="ai-leaderboard-boardsel__menu" role="menu">
                {c.boards.map((bk: string) => (
                  <button
                    key={bk}
                    type="button"
                    role="menuitem"
                    class={`ai-leaderboard-boardsel__item${activeBoard.value === bk ? " is-active" : ""}`}
                    aria-pressed={activeBoard.value === bk}
                    onClick={() => { setBoard(bk); setOpenCat(null); }}
                  >
                    {ARENA_BOARDS[bk].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Arena 二级维度统一下拉框：
 *  - agent → 6 维细分（Net Improvement / Confirmed Success / ...）
 *  - text  → 6 category 子榜（综合 / 代码 / 数学 / ...）
 *  - code  → 2 category 子榜（WebDev / Image-to-WebDev）
 *  - 其他 board → 不渲染（无二级维度）
 */
function ArenaSubDimSelect() {
  const board = activeBoard.value;
  if (board === "agent") {
    return (
      <label class="ai-leaderboard-select ai-leaderboard-select--toolbar">
        <span class="ai-leaderboard-select__label">维度</span>
        <select
          class="ai-leaderboard-select__input"
          value={activeAgentDim.value}
          onChange={(e) => setAgentDim(e.currentTarget.value)}
        >
          {AGENT_DIMENSIONS.map((dim) => (
            <option key={dim} value={dim}>{dim}</option>
          ))}
        </select>
      </label>
    );
  }
  if (board === "text") {
    return (
      <label class="ai-leaderboard-select ai-leaderboard-select--toolbar">
        <span class="ai-leaderboard-select__label">子榜</span>
        <select
          class="ai-leaderboard-select__input"
          value={activeTextCat.value}
          onChange={(e) => setTextCat(e.currentTarget.value)}
        >
          {TEXT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </label>
    );
  }
  if (board === "code") {
    return (
      <label class="ai-leaderboard-select ai-leaderboard-select--toolbar">
        <span class="ai-leaderboard-select__label">子榜</span>
        <select
          class="ai-leaderboard-select__input"
          value={activeCodeCat.value}
          onChange={(e) => setCodeCat(e.currentTarget.value)}
        >
          {CODE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </label>
    );
  }
  return null;
}

/** AA 子榜维度 chips — 对齐官网 Intelligence / Coding / Agentic 切换手感。 */
function AaDimChips() {
  return (
    <div class="ai-leaderboard-chips ai-leaderboard-chips--dim" role="group" aria-label="AA 排序维度">
      {AA_DIMENSION_KEYS.map((key) => {
        const meta = AA_DIMENSIONS[key];
        const active = activeDim.value === key;
        return (
          <button
            key={key}
            type="button"
            class={`ai-leaderboard-chip ai-leaderboard-chip--dim${active ? " is-active" : ""}`}
            aria-pressed={active}
            onClick={() => setDim(key)}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function LeaderboardFilterBar() {
  const [q, setQ] = useState(searchQuery.value);

  // 外部（如性价比榜点击跳转）改了搜索时，回灌本地输入态，保持搜索框与过滤一致
  useEffect(() => {
    setQ(searchQuery.value);
  }, [searchQuery.value]);

  function onSearch(e) {
    const v = e.currentTarget.value;
    setQ(v);
    setSearchQuery(v);
  }
  function onClear() {
    setQ("");
    clearSearchQuery();
  }
  function onSearchKey(e) {
    if (e.key === "Escape" && q) {
      e.preventDefault();
      onClear();
    }
  }

  const view = activeView.value;

  return (
    <div class="ai-leaderboard-filter-bar">
      <div class="ai-leaderboard-view-switch" role="tablist" aria-label="数据视角">
        {VIEW_KEYS.map((key) => {
          const meta = VIEWS[key];
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              class={`ai-leaderboard-seg ai-leaderboard-seg--${key}${active ? " is-active" : ""}`}
              onClick={() => setView(key)}
            >
              <span class="ai-leaderboard-seg__main">
                <span class="ai-leaderboard-seg__dot" aria-hidden="true" />
                {meta.label}
              </span>
              <span class="ai-leaderboard-seg__sub">{meta.segSub}</span>
            </button>
          );
        })}
      </div>

      <div class="ai-leaderboard-toolbar-row">
        <div class="ai-leaderboard-toolbar__left">
          {view === "arena" && <ArenaBoardSelector />}

          {view === "arena" && <ArenaSubDimSelect />}

          {view === "aa" && <AaDimChips />}

          <div class="ai-leaderboard-chips" role="group" aria-label="许可筛选">
            {LICENSE_FILTER_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                class={`ai-leaderboard-chip${licenseFilter.value === o.key ? " is-active" : ""}`}
                aria-pressed={licenseFilter.value === o.key}
                onClick={() => setLicenseFilter(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div class="ai-leaderboard-toolbar__right">
          <label class="ai-leaderboard-select ai-leaderboard-select--toolbar">
            <span class="ai-leaderboard-select__label">厂商</span>
            <select
              class="ai-leaderboard-select__input"
              value={activeVendor.value}
              onChange={(e) => setVendor(e.currentTarget.value)}
            >
              {VENDOR_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </label>

          <div class="ai-leaderboard-search" role="search">
            <span class="ai-leaderboard-search__icon" aria-hidden="true">🔍</span>
            <input
              id="ai-leaderboard-search-input"
              type="search"
              class="ai-leaderboard-search__input"
              role="searchbox"
              aria-label="搜索模型"
              aria-controls="ai-leaderboard-table"
              placeholder="搜索模型 / 厂商…"
              value={q}
              onInput={onSearch}
              onKeyDown={onSearchKey}
            />
            {q && (
              <button
                type="button"
                class="ai-leaderboard-search__clear"
                aria-label="清除搜索"
                onClick={onClear}
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            class="ai-leaderboard-refresh ai-leaderboard-refresh--primary"
            onClick={() => refresh()}
            disabled={loading.value}
          >
            {loading.value ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeaderboardFilterBar;