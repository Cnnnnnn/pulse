/**
 * 模型对比 — FAB + 右侧抽屉（样式对齐 ai-leaderboard-redesign-preview）
 */
import { useEffect, useState } from "preact/hooks";
import {
  compareList,
  clearCompare,
  toggleCompare,
  items,
  activeView,
  crossSourceItems,
  crossSourceLoading,
  crossSourceError,
  loadCrossSource,
} from "./aiLeaderboardStore.js";
import { VENDOR_META } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtValueRatio } from "./format.js";
import { compareToMarkdown, copyToClipboard } from "./exportMarkdown.js";
import { CrossSourceRadar } from "./CrossSourceRadar.jsx";

export function ComparePanel() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("table");
  const ids = compareList.value;
  const view = activeView.value;

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 进入雷达标签且已有选中模型时，触发一次三源联合拉取（store 内幂等）
  useEffect(() => {
    if (open && tab === "radar" && ids.length >= 1) {
      loadCrossSource(false);
    }
  }, [open, tab, ids.length]);

  if (ids.length === 0) return null;

  const models = ids
    .map((id) => items.value.find((m) => m.id === id))
    .filter(Boolean);

  // 跨源雷达：从三源合并结果中解析当前选中模型
  const radarModels = ids
    .map((id) => (crossSourceItems.value || []).find((m) => m.id === id))
    .filter(Boolean);

  const rows = view === "arena"
    ? [
        { label: "厂商", get: (m) => (VENDOR_META[m.vendor] || {}).label || m.vendor, better: null },
        { label: "ELO (text)", get: (m) => fmtScore(m.arena && m.arena.text && m.arena.text.score), raw: (m) => m.arena && m.arena.text && m.arena.text.score, better: "high" },
        { label: "ELO (vision)", get: (m) => fmtScore(m.arena && m.arena.vision && m.arena.vision.score), raw: (m) => m.arena && m.arena.vision && m.arena.vision.score, better: "high" },
        { label: "ELO (code)", get: (m) => fmtScore(m.arena && m.arena.code && m.arena.code.score), raw: (m) => m.arena && m.arena.code && m.arena.code.score, better: "high" },
      ]
    : [
        { label: "厂商", get: (m) => (VENDOR_META[m.vendor] || {}).label || m.vendor, better: null },
        { label: "智能指数", get: (m) => fmtIndex(m.aa && m.aa.intelligenceIndex), raw: (m) => m.aa && m.aa.intelligenceIndex, better: "high" },
        { label: "代码指数", get: (m) => fmtIndex(m.aa && m.aa.codingIndex), raw: (m) => m.aa && m.aa.codingIndex, better: "high" },
        { label: "Agent", get: (m) => fmtIndex(m.aa && m.aa.agenticIndex), raw: (m) => m.aa && m.aa.agenticIndex, better: "high" },
        { label: "速度", get: (m) => fmtSpeed(m.aa && m.aa.outputTokensPerSec), raw: (m) => m.aa && m.aa.outputTokensPerSec, better: "high" },
        { label: "输出价", get: (m) => fmtPricePer1M(m.aa && m.aa.priceOutputPer1M), raw: (m) => m.aa && m.aa.priceOutputPer1M, better: "low" },
        { label: "性价比", get: (m) => fmtValueRatio(m.aa), raw: (m) => (m.aa && m.aa.intelligenceIndex != null && m.aa.priceOutputPer1M > 0) ? m.aa.intelligenceIndex / m.aa.priceOutputPer1M : null, better: "high" },
      ];

  function bestId(row) {
    if (!row.better || !row.raw || models.length < 2) return null;
    let best = null;
    let bestVal = null;
    for (const m of models) {
      const v = row.raw(m);
      if (v == null || !Number.isFinite(v)) continue;
      if (bestVal == null) {
        bestVal = v;
        best = m.id;
        continue;
      }
      if (row.better === "high" ? v > bestVal : v < bestVal) {
        bestVal = v;
        best = m.id;
      }
    }
    return best;
  }

  return (
    <>
      <button
        type="button"
        class="ai-lb-compare-fab is-visible"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        对比 <span class="ai-lb-compare-fab__count">{ids.length}</span>
      </button>

      <div
        class={`ai-lb-drawer-mask${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <aside
        class={`ai-lb-drawer${open ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="模型对比"
        aria-hidden={!open}
      >
        <header class="ai-lb-drawer__header">
          <span class="ai-lb-drawer__title">
            模型对比（<span>{models.length}</span>）
          </span>
          <div class="ai-lb-drawer__tabs" role="tablist" aria-label="对比视图">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "table"}
              class={`ai-lb-drawer__tab${tab === "table" ? " is-active" : ""}`}
              onClick={() => setTab("table")}
            >
              表格
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "radar"}
              class={`ai-lb-drawer__tab${tab === "radar" ? " is-active" : ""}`}
              onClick={() => setTab("radar")}
            >
              雷达
            </button>
          </div>
          <button
            type="button"
            class="ai-lb-drawer__btn ai-lb-drawer__btn--ghost"
            onClick={async () => {
              const md = compareToMarkdown({ models, rows });
              const ok = await copyToClipboard(md);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
          <button
            type="button"
            class="ai-lb-drawer__btn ai-lb-drawer__btn--ghost"
            onClick={() => {
              clearCompare();
              setOpen(false);
            }}
          >
            清除
          </button>
          <button
            type="button"
            class="ai-lb-drawer__icon-btn"
            aria-label="关闭"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </header>
        <div class="ai-lb-drawer__body">
          {tab === "radar" ? (
            <div class="ai-lb-drawer__radar">
              {crossSourceLoading.value ? (
                <p class="ai-lb-drawer__hint">正在加载跨源数据（Arena + AA + LiveBench）…</p>
              ) : crossSourceError.value ? (
                <p class="ai-lb-drawer__hint ai-lb-drawer__hint--err">
                  跨源数据加载失败：{crossSourceError.value}
                  <button
                    type="button"
                    class="ai-lb-drawer__btn ai-lb-drawer__btn--ghost"
                    onClick={() => loadCrossSource(true)}
                  >
                    重试
                  </button>
                </p>
              ) : radarModels.length === 0 ? (
                <p class="ai-lb-drawer__hint">所选模型未在三源合并结果中找到，无法绘制雷达。</p>
              ) : (
                <CrossSourceRadar models={radarModels} />
              )}
            </div>
          ) : models.length < 2 ? (
            <p class="ai-lb-drawer__hint">再勾选至少 1 个模型即可开始对比。</p>
          ) : (
            <table class="ai-lb-compare__table">
              <thead>
                <tr>
                  <th class="ai-lb-compare__th ai-lb-compare__th--label" scope="col" />
                  {models.map((m) => (
                    <th key={m.id} class="ai-lb-compare__th" scope="col">
                      <span class="ai-lb-compare__name">{m.name}</span>
                      <button
                        type="button"
                        class="ai-lb-compare__remove"
                        aria-label={`移除 ${m.name}`}
                        onClick={() => toggleCompare(m.id)}
                      >
                        ×
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const best = bestId(row);
                  return (
                    <tr key={row.label} class="ai-lb-compare__row">
                      <td class="ai-lb-compare__td ai-lb-compare__td--label">{row.label}</td>
                      {models.map((m) => (
                        <td
                          key={m.id}
                          class={`ai-lb-compare__td${best === m.id ? " is-best" : ""}`}
                        >
                          {row.get(m)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  );
}

export default ComparePanel;
