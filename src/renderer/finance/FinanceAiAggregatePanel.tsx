/**
 * src/renderer/finance/FinanceAiAggregatePanel.tsx
 *
 * 财经新闻跨新闻聚合洞察展示组件（P2）。复用全局 AI 配置（ai-store），
 * 优雅降级：未配置 AI / 聚合失败 / 解析失败均不白屏、不崩溃。
 *
 * 展示：summary / themes / consensus / conflicts / watchSignals / affectedSectors / horizon，
 * disclaimer 常驻。复用 FinanceAiPanel 的设计令牌（finance.css）。
 */

import { useEffect, useRef } from "preact/hooks";
import {
  financeAggregate,
  financeAggregateLoading,
  financeAggregateError,
  financeAggregateScope,
  clearAggregate,
  requestAggregate,
  financeCategory,
} from "./financeStore.ts";
import { needsConfig, openAISettings } from "../store/ai-store.ts";

const HORIZON_TEXT: Record<string, string> = {
  short: "短期",
  medium: "中期",
  long: "长期",
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

function List({ items, label }: { items: string[]; label: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div class="finance-ai-block">
      <div class="finance-ai-block-label">{label}</div>
      <ul class="finance-ai-list">
        {items.map((t: string) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function FinanceAiAggregatePanel({
  onBack,
}: {
  onBack: () => void;
}) {
  // 进入聚合视图时锁定当前分类作用域（分类 tab 在聚合视图中隐藏）
  const scopeRef = useRef<string>(financeCategory.value || "all");

  useEffect(() => {
    // 进入聚合视图即按当前分类作用域懒加载聚合（零默认成本）
    void requestAggregate(scopeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 未配置 AI → 引导去设置，不发起无谓 IPC
  if (needsConfig()) {
    return (
      <section class="finance-ai finance-ai-config" aria-label="AI 聚合洞察">
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 聚合洞察</span>
          <button type="button" class="finance-ai-rebtn" onClick={onBack}>
            返回
          </button>
        </div>
        <p class="finance-ai-config-tip">
          尚未配置 AI。先在设置中填写模型与 API Key，即可对近期财经新闻做跨新闻聚合分析。
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

  const loading = financeAggregateLoading.value;
  const err = financeAggregateError.value;
  const data = financeAggregate.value;

  if (loading) {
    return (
      <section
        class="finance-ai finance-ai-loading"
        aria-label="AI 聚合洞察"
        aria-busy="true"
      >
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 聚合洞察</span>
          <button type="button" class="finance-ai-rebtn" onClick={onBack}>
            返回
          </button>
        </div>
        <div class="finance-ai-skeleton" aria-hidden="true" />
        <p class="finance-ai-loading-tip">正在聚合近期财经新闻…</p>
      </section>
    );
  }

  if (err) {
    return (
      <section
        class="finance-ai finance-ai-error"
        aria-label="AI 聚合洞察"
        role="alert"
      >
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 聚合洞察</span>
          <button type="button" class="finance-ai-rebtn" onClick={onBack}>
            返回
          </button>
        </div>
        <p class="finance-ai-error-tip">
          聚合暂时不可用（{typeof err === "string" ? err : "未知错误"}）。
          可稍后重试，或检查 AI 设置与额度。
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section class="finance-ai" aria-label="AI 聚合洞察">
        <div class="finance-ai-head">
          <span class="finance-ai-title">AI 聚合洞察</span>
          <button type="button" class="finance-ai-rebtn" onClick={onBack}>
            返回
          </button>
        </div>
        <p class="finance-ai-empty">暂无聚合结果。</p>
      </section>
    );
  }

  const scopeText =
    data.scope && data.scope !== "all" ? `（${data.scope}）` : "（全部）";

  return (
    <section class="finance-ai" aria-label="AI 聚合洞察">
      <div class="finance-ai-head">
        <span class="finance-ai-title">
          AI 聚合洞察<span class="finance-ai-scope">{scopeText}</span>
        </span>
        <div class="finance-ai-head-actions">
          <button
            type="button"
            class="finance-ai-rebtn"
            onClick={() => clearAggregate(financeAggregateScope.value)}
            disabled={loading}
          >
            重新聚合
          </button>
          <button type="button" class="finance-ai-rebtn" onClick={onBack}>
            返回
          </button>
        </div>
      </div>

      <p class="finance-ai-summary">{data.summary}</p>

      <div class="finance-ai-row">
        <span class="finance-ai-row-label">时间视角</span>
        <span class={`finance-ai-pill ${data.horizon || "medium"}`}>
          {HORIZON_TEXT[data.horizon] || "中期"}
        </span>
      </div>

      <Chips items={data.themes} label="主题" />
      <List items={data.consensus} label="多方共识" />
      <List items={data.conflicts} label="分歧 / 矛盾" />
      <List items={data.watchSignals} label="值得关注信号" />
      <Chips items={data.affectedSectors} label="受影响板块" />

      <div class="finance-ai-meta">
        {(data.model ? `${data.model} · ` : "") + fmtTime(data.generatedAt)}
      </div>
      <p class="finance-ai-disclaimer">
        本聚合由 AI 生成，仅为信息整理与转述，不构成任何投资建议。
      </p>
    </section>
  );
}

export default FinanceAiAggregatePanel;
