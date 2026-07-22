/**
 * 模型详情抽屉 — 行点击模型名触发。
 */
import { useEffect, useState } from "preact/hooks";
import {
  closeModelDetail,
  compareList,
  detailId,
  items,
  toggleCompare,
} from "./aiLeaderboardStore.js";
import { VENDOR_META, SOURCE_URLS } from "./types.js";
import { copyToClipboard, detailToMarkdown } from "./exportMarkdown.js";

const SOURCE_LABELS = {
  arena: "Arena",
  aa: "AA",
  openrouter: "OpenRouter",
  livebench: "LiveBench",
  modelsdev: "Models.dev",
};
const SLICE_KEYS = ["arena", "aa", "openrouter", "livebench", "modelsdev"];

function findDetailModel() {
  const id = detailId.value;
  return id ? (items.value || []).find((model) => model && model.id === id) || null : null;
}

export function ModelDetailDrawer() {
  const model = findDetailModel();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("summary");

  useEffect(() => {
    if (!model) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") closeModelDetail();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [!!model]);

  if (!model) return null;

  const vendorLabel = (VENDOR_META[model.vendor] || {}).label || model.vendor || "—";
  const inCompare = compareList.value.includes(model.id);
  const compareDisabled = !inCompare && compareList.value.length >= 3;

  async function handleCopy() {
    const ok = await copyToClipboard(detailToMarkdown(model));
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div class="ai-lb-drawer-mask is-open" onClick={closeModelDetail} aria-hidden="false" />
      <aside
        class="ai-lb-drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-label={`模型详情 ${model.name}`}
      >
        <header class="ai-lb-drawer__header">
          <span class="ai-lb-drawer__title">模型详情 · {model.name}</span>
          <span class="ai-lb-drawer__sub">{vendorLabel}</span>
          <button
            type="button"
            class="ai-lb-drawer__btn ai-lb-drawer__btn--ghost"
            onClick={handleCopy}
          >
            {copied ? "已复制 ✓" : "复制"}
          </button>
          <button
            type="button"
            class="ai-lb-drawer__btn ai-lb-drawer__btn--ghost"
            disabled={compareDisabled}
            onClick={() => toggleCompare(model.id)}
            title="加入对比"
          >
            {inCompare ? "已加入" : "对比"}
          </button>
          <button
            type="button"
            class="ai-lb-drawer__icon-btn"
            aria-label="关闭"
            onClick={closeModelDetail}
          >
            ✕
          </button>
        </header>

        <div class="ai-lb-drawer__body">
          <section class="ai-lb-drawer__summary">
            <div class="ai-lb-drawer__row">
              <span class="ai-lb-drawer__label">ID</span>
              <code class="ai-lb-drawer__code">{model.id}</code>
            </div>
            <div class="ai-lb-drawer__row">
              <span class="ai-lb-drawer__label">名称</span>
              <span>{model.name || "—"}</span>
            </div>
            <div class="ai-lb-drawer__row">
              <span class="ai-lb-drawer__label">厂商</span>
              <span>{vendorLabel}</span>
            </div>
            <div class="ai-lb-drawer__row">
              <span class="ai-lb-drawer__label">分类</span>
              <span>{model.category || "—"}</span>
            </div>
            {model.isSample && (
              <div class="ai-lb-drawer__row">
                <span class="ai-lb-drawer__label">备注</span>
                <span class="ai-lb-drawer__pill ai-lb-drawer__pill--sample">示例数据</span>
              </div>
            )}
          </section>

          <div class="ai-lb-drawer__tabs" role="tablist" aria-label="详情视图">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "summary"}
              class={`ai-lb-drawer__tab${tab === "summary" ? " is-active" : ""}`}
              onClick={() => setTab("summary")}
            >
              切片
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "raw"}
              class={`ai-lb-drawer__tab${tab === "raw" ? " is-active" : ""}`}
              onClick={() => setTab("raw")}
            >
              原始
            </button>
          </div>

          {tab === "summary" ? (
            <div class="ai-lb-drawer__slices">
              {SLICE_KEYS.map((key) => (
                <SliceGroup
                  key={key}
                  sourceKey={key}
                  label={SOURCE_LABELS[key]}
                  slice={model[key]}
                  source={model.sources && model.sources[key]}
                  url={SOURCE_URLS[key]}
                />
              ))}
            </div>
          ) : (
            <pre class="ai-lb-drawer__raw"><code>{JSON.stringify(model, null, 2)}</code></pre>
          )}
        </div>
      </aside>
    </>
  );
}

function SliceGroup({ sourceKey, label, slice, source, url }) {
  const entries = slice && typeof slice === "object"
    ? Object.entries(slice).filter(([, value]) => value != null && value !== "")
    : [];
  const state = source || (entries.length ? "live" : "none");

  return (
    <details class="ai-lb-drawer__slice" open={entries.length > 0}>
      <summary>
        <span class={`ai-lb-drawer__pill ai-lb-drawer__pill--${state}`}>{label}</span>
        <span class="ai-lb-drawer__slice-meta">
          {state} · {entries.length ? `${entries.length} 项` : "无数据"}
        </span>
        {url && (
          <a
            class="ai-lb-drawer__slice-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label} 官方页面`}
            title={`${label} 官方页面`}
            onClick={(event) => event.stopPropagation()}
          >
            ↗
          </a>
        )}
      </summary>
      {entries.length > 0 && (
        <ul class="ai-lb-drawer__kv">
          {entries.map(([key, value]) => (
            <li key={key} class="ai-lb-drawer__kv-row">
              <span class="ai-lb-drawer__kv-key">{key}</span>
              <span class="ai-lb-drawer__kv-val">
                {typeof value === "object" ? JSON.stringify(value) : String(value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default ModelDetailDrawer;
