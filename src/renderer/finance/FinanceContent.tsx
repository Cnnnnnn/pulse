/**
 * src/renderer/finance/FinanceContent.tsx
 *
 * 财经列表 + 分类 chips（SubtabList 下划线变体）+ 排序 + 搜索（search 由 header 框驱动）。
 */

import { useEffect, useRef } from "preact/hooks";
import { SubtabList } from "../components/SubtabList.tsx";
import { IconRefresh } from "../components/icons.tsx";
import { FinanceRow } from "./FinanceRow.tsx";
import {
  financeCategory,
  financeSort,
  financeList,
  financeLoading,
  financeError,
  financeSearch,
  applyNewsFilters,
  refreshFinanceNews,
  markFinanceRead,
  toggleFinanceFavorite,
  financeSelectedId,
  financeCategoryCounts,
  financeViewMode,
} from "./financeStore.ts";
import { CAT_TABS } from "./finance-cats.ts";
import { FinanceAiAggregatePanel } from "./FinanceAiAggregatePanel.tsx";

export function FinanceContent({ search }: { search: string }) {
  // B3：搜索词逐字符变化时做 300ms 防抖，避免每次按键都打满 IPC + 服务端全量读。
  // 显式用户动作（刷新/分类/排序/broadcast）走未防抖路径，不受影响。
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    financeSearch.value = search;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      applyNewsFilters(search);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [financeCategory.value, financeSort.value, search]);

  const list = financeList.value;
  const loading = financeLoading.value;
  const error = financeError.value;
  const counts = financeCategoryCounts.value;

  function handleRefresh() {
    void refreshFinanceNews();
  }
  function setCategory(k: string) {
    financeCategory.value = k;
  }
  function setSort(s: string) {
    financeSort.value = s;
  }
  function openAggregate() {
    financeViewMode.value = "aggregate";
  }
  function closeAggregate() {
    financeViewMode.value = "list";
  }

  if (financeViewMode.value === "aggregate") {
    return (
      <div class="finance-content">
        <FinanceAiAggregatePanel onBack={closeAggregate} />
      </div>
    );
  }

  return (
    <div class="finance-content">
      <div class="finance-toolbar">
        <SubtabList
          prefix="finance"
          tabs={CAT_TABS}
          activeKey={financeCategory.value}
          onChange={setCategory}
          ariaLabel="财经分类"
        >
          {(t) => (
            <span>
              {t.label}
              {counts[t.key] != null && counts[t.key] > 0 && (
                <span class="finance-cat-count">{counts[t.key]}</span>
              )}
            </span>
          )}
        </SubtabList>
        <div class="finance-toolbar-right">
          <button
            type="button"
            class="finance-agg-btn"
            onClick={openAggregate}
            disabled={loading}
            aria-label="AI 聚合洞察"
            title="AI 聚合洞察"
          >
            AI 聚合洞察
          </button>
          <label class="finance-sort">
            <span class="finance-sort-label">排序</span>
            <select
              class="finance-sort-select"
              value={financeSort.value}
              onChange={(e) =>
                setSort((e.currentTarget as HTMLSelectElement).value)
              }
              aria-label="排序方式"
            >
              <option value="time">时间</option>
              {/* E1：热度源未接入（popularity 恒为 0），禁用该选项避免「能点但没用」 */}
              <option value="popularity" disabled>
                热度（未接入）
              </option>
            </select>
          </label>
          <button
            type="button"
            class={`finance-refresh-btn${loading ? " is-loading" : ""}`}
            onClick={handleRefresh}
            disabled={loading}
            aria-label="刷新财经新闻"
            title="刷新财经新闻"
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div class="finance-error" role="alert">
          {typeof error === "string" ? error : error.reason || "加载失败"}
        </div>
      )}

      <div class="finance-list">
        {list.length === 0 && !loading && (
          <div class="finance-empty">暂无财经新闻，点击右上角刷新</div>
        )}
        {list.map((a: any) => (
          <FinanceRow
            key={a.id}
            article={a}
            onOpen={() => {
              void markFinanceRead(a.id);
              financeSelectedId.value = a.id;
            }}
            onToggleFavorite={() => void toggleFinanceFavorite(a.id)}
          />
        ))}
      </div>

      <p class="finance-disclaimer">内容仅供参考，不构成投资建议</p>
    </div>
  );
}

export default FinanceContent;
