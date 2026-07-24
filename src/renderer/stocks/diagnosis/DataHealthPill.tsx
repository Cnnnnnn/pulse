/**
 * DataHealthPill — 单卡数据健康度徽标.
 *
 * ponytail 2026-07-18 P0-1: 嵌在 ModuleCard 标题区右侧 (替换现有 CardFreshness
 * 在 ModuleCard 里的位置). 4 态: ok / partial / stale / failed.
 * 失败时显示 "重试" 按钮, 沿用 AiNoteLine 风格的极简 inline button.
 * ponytail 2026-07-18 P0-1 T8 review MI: 去掉 ⏵ unicode 符号, 改用纯文字 "重试".
 *   ⏵ (U+23F5) 在系统字体里渲染未必稳定 (字体降级时可能出方块), 纯文字 + 同族 btn
 *   视觉更一致, 不引 icon 库.
 */
import { deriveAngleStatus, failureReasonText } from "./dataHealth.js";

const STATUS_LABEL = {
  ok: "已更新",
  partial: "部分数据",
  stale: "陈旧",
  failed: "失败",
};

const STATUS_CLASS = {
  ok: "data-health-pill-ok",
  partial: "data-health-pill-partial",
  stale: "data-health-pill-stale",
  failed: "data-health-pill-failed",
};

export function DataHealthPill({ angle, onRefresh, now = Date.now() }) {
  if (!angle) return null;
  const status = deriveAngleStatus(angle, now);
  const label = STATUS_LABEL[status];
  const cls = STATUS_CLASS[status];
  const tooltip = status === "failed"
    ? failureReasonText(angle)
    : status === "stale"
      ? `上次成功: ${angle.lastSuccessAt ? new Date(angle.lastSuccessAt).toLocaleString("zh-CN") : "未知"}`
      : status === "partial"
        ? "数据返回了但部分字段缺失"
        : `更新于 ${new Date(angle.fetchedAt).toLocaleString("zh-CN")}`;
  const streak = angle.failureStreakCount || 0;
  const showStreak = status === "failed" && streak >= 2;
  return (
    <span
      class={`data-health-pill ${cls}`}
      title={tooltip}
      data-status={status}
    >
      {showStreak ? `连续 ${streak} 次失败` : label}
      {status === "failed" && onRefresh ? (
        <button
          type="button"
          class="data-health-pill-retry"
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          aria-label="重试本卡"
        >
          重试
        </button>
      ) : null}
    </span>
  );
}

export default DataHealthPill;