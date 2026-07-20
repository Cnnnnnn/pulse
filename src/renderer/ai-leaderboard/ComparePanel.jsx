/**
 * src/renderer/ai-leaderboard/ComparePanel.jsx
 *
 * v3.0 模型对比 — 复用项目 DrawerShell 组件（右侧抽屉）。
 * 勾选 ≥1 个模型时，右下角显示浮标按钮"对比 N"；
 * 点击打开右侧抽屉展示完整对比表；关闭抽屉可继续勾选。
 */

import { useState } from "preact/hooks";
import { compareList, clearCompare, toggleCompare, items, activeView } from "./aiLeaderboardStore.js";
import { VENDOR_META } from "./types.js";
import { fmtScore, fmtIndex, fmtSpeed, fmtPricePer1M, fmtValueRatio } from "./format.js";
import { compareToMarkdown, copyToClipboard } from "./exportMarkdown.js";

export function ComparePanel() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ids = compareList.value;
  const view = activeView.value;

  if (ids.length === 0) return null;

  const models = ids
    .map((id) => items.value.find((m) => m.id === id))
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

  /** 找每行最优值的 model id。 */
  function bestId(row) {
    if (!row.better || !row.raw || models.length < 2) return null;
    let best = null;
    let bestVal = null;
    for (const m of models) {
      const v = row.raw(m);
      if (v == null || !Number.isFinite(v)) continue;
      if (bestVal == null) { bestVal = v; best = m.id; continue; }
      if (row.better === "high" ? v > bestVal : v < bestVal) { bestVal = v; best = m.id; }
    }
    return best;
  }

  return (
    <>
      {/* 浮标按钮 */}
      {!open && (
        <button
          type="button"
          class="ai-lb-compare-fab"
          onClick={() => setOpen(true)}
        >
          对比 {ids.length}
        </button>
      )}

      {/* 抽屉 */}
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99998, pointerEvents: "none" }}>
          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "620px",
              maxWidth: "88vw",
              zIndex: 99999,
              background: "var(--surface, #fff)",
              borderLeft: "1px solid var(--border, #ddd)",
              boxShadow: "-4px 0 16px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              pointerEvents: "auto",
            }}
            role="complementary"
            aria-label="模型对比"
          >
            <header class="ai-lb-drawer__header">
              <span class="ai-lb-drawer__title">模型对比（{models.length}）</span>
              <button
                type="button"
                class="ai-lb-drawer__clear"
                onClick={async () => {
                  const md = compareToMarkdown({ models, rows });
                  const ok = await copyToClipboard(md);
                  if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
                }}
              >
                {copied ? "已复制 ✓" : "复制对比"}
              </button>
              <button type="button" class="ai-lb-drawer__clear" onClick={clearCompare}>
                清除全部
              </button>
              <button
                type="button"
                class="ai-lb-drawer__close"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div class="ai-lb-drawer__body">
              {models.length < 2 ? (
                <p class="ai-lb-drawer__hint">再勾选至少 1 个模型即可开始对比</p>
              ) : (
                <table class="ai-lb-compare__table">
                  <thead>
                    <tr>
                      <th class="ai-lb-compare__th ai-lb-compare__th--label" />
                      {models.map((m) => (
                        <th key={m.id} class="ai-lb-compare__th">
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
                            <td key={m.id} class={`ai-lb-compare__td${best === m.id ? " is-best" : ""}`}>
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
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99997, background: "rgba(0,0,0,0.22)", pointerEvents: "auto" }}
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

export default ComparePanel;
