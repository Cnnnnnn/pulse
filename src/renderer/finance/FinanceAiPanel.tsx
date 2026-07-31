/**
 * src/renderer/finance/FinanceAiPanel.tsx
 *
 * 财经新闻 AI 解读展示组件。复用全局 AI 配置（ai-store），
 * 优雅降级：未配置 AI / 解读失败 / 解析失败均不白屏、不崩溃。
 *
 * 字段：summary / highlights / sentiment / impact / extracted，disclaimer 常驻。
 * 全部复用项目设计令牌（CSS 在 finance.css），满足 ≥44px 触控 + 焦点环 +
 * prefers-reduced-motion。
 */

import { useEffect } from "preact/hooks";
import {
  financeAi,
  financeAiLoading,
  financeAiError,
  requestInterpret,
  clearInterpret,
} from "./financeStore.ts";
import { needsConfig, openAISettings } from "../store/ai-store.ts";
import type { FinArticle } from "../../shared/finance-types.ts";

const SENTIMENT_TEXT: Record<string, string> = {
  bullish: "偏多",
  bearish: "偏空",
  neutral: "中性",
};
const DIR_TEXT: Record<string, string> = {
  positive: "偏正面",
  negative: "偏负面",
  mixed: "中性",
};
const MAG_TEXT: Record<string, string> = {
  strong: "强",
  moderate: "中",
  weak: "弱",
};

const TIME_FMT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtTime(ts?: number): string {
  if (!ts || typeof ts !== "number") return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return TIME_FMT.format(d);
}

function Chips({ items, label }: { items: string[]; label: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div class="finance-ai-row">
      <span class="finance-ai-row-label">{label}</span>
      <div class="finance-ai-chips">
        {items.map((t: string) => (
          <span class="finance-ai-chip" key={t}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FinanceAiPanel({ article }: { article: FinArticle }) {
  // 切换文章时重置解读态为「待触发」，避免残留上一条的陈旧解读（改为点击触发，不再自动发起）
  useEffect(() => {
    financeAi.value = null;
    financeAiLoading.value = false;
    financeAiError.value = null;
  }, [article.id]);

  // 未配置 AI → 引导去设置，不发起无谓 IPC
  if (needsConfig()) {
    return (
      <section class="finance-ai finance-ai-config" aria-label="AI 解读">
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 解读</span>
        </div>
        <p class="finance-ai-config-tip">
          尚未配置 AI。先在设置中填写模型与 API Key，即可对本条新闻生成结构化解读。
        </p>
        <button
          type="button"
          class="finance-ai-rebtn"
          onClick={() => openAISettings(true)}
        >
          前往设置
        </button>
      </section>
    );
  }

  const loading = financeAiLoading.value;
  const err = financeAiError.value;
  const data = financeAi.value;

  if (loading) {
    return (
      <section
        class="finance-ai finance-ai-loading"
        aria-label="AI 解读"
        aria-busy="true"
      >
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 解读</span>
        </div>
        <div class="finance-ai-skeleton" aria-hidden="true" />
        <p class="finance-ai-loading-tip">正在生成解读…</p>
      </section>
    );
  }

  if (err) {
    return (
      <section class="finance-ai finance-ai-error" aria-label="AI 解读" role="alert">
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 解读</span>
        </div>
        <p class="finance-ai-error-tip">
          解读暂时不可用（{typeof err === "string" ? err : "未知错误"}）。
          可稍后重试，或检查 AI 设置与额度。
        </p>
        <button
          type="button"
          class="finance-ai-trigger"
          onClick={() => requestInterpret(article.id)}
        >
          重试
        </button>
      </section>
    );
  }

  if (!data) {
    return (
      <section class="finance-ai" aria-label="AI 解读">
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 解读</span>
        </div>
        <p class="finance-ai-empty">
          点击下方按钮，生成本条新闻的 AI 结构化解读。
        </p>
        <button
          type="button"
          class="finance-ai-trigger"
          onClick={() => requestInterpret(article.id)}
        >
          AI 解读
        </button>
      </section>
    );
  }

  const s = data.sentiment || { label: "neutral", score: 0.5 };
  const scorePct = Math.round(
    (typeof s.score === "number" ? s.score : 0.5) * 100,
  );
  const impact = data.impact;

  return (
    <section class="finance-ai" aria-label="AI 解读">
      <div class="finance-ai-head">
        <span class="finance-ai-title">AI 解读</span>
        <button
          type="button"
          class="finance-ai-rebtn"
          onClick={() => clearInterpret(article.id)}
          disabled={loading}
        >
          重新解读
        </button>
      </div>

      <p class="finance-ai-summary">{data.summary}</p>

      {Array.isArray(data.highlights) && data.highlights.length > 0 && (
        <ul class="finance-ai-list">
          {data.highlights.map((h: string) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      <div class="finance-ai-row">
        <span class="finance-ai-row-label">情感</span>
        <span class={`finance-ai-pill ${s.label}`}>
          {SENTIMENT_TEXT[s.label] || "中性"}
          <span class="finance-ai-score">{scorePct}%</span>
        </span>
      </div>

      {impact && (
        <div class="finance-ai-impact">
          <div class="finance-ai-row">
            <span class="finance-ai-row-label">影响</span>
            <span class="finance-ai-impact-text">
              市场影响 {DIR_TEXT[impact.direction] || "中性"}（量级
              {MAG_TEXT[impact.magnitude] || "中"}）
            </span>
          </div>
          <Chips items={impact.sectors} label="板块" />
        </div>
      )}

      <Chips items={data.extracted?.tickers} label="标的" />
      <Chips items={data.extracted?.events} label="事件" />
      <Chips items={data.extracted?.figures} label="数字" />

      <div class="finance-ai-meta">
        {(data.model ? `${data.model} · ` : "") + fmtTime(data.generatedAt)}
      </div>
      <p class="finance-ai-disclaimer">
        本解读由 AI 生成，仅为信息整理与转述，不构成任何投资建议。
      </p>
    </section>
  );
}

export default FinanceAiPanel;
