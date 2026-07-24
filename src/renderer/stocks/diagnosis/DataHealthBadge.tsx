/**
 * DataHealthBadge — 工具位数据健康度汇总徽标.
 *
 * ponytail 2026-07-18 P0-1: 嵌在 StockLayout 工具位 runScreen 按钮旁.
 * 渲染 "数据: 6/9 已更新" 形式, hover tooltip 列出每张卡状态.
 * 不引第三方 tooltip 库, 走原生 title 属性 (跟 CardFreshness 一致).
 */
import { deriveAngleStatus, failureReasonText } from "./dataHealth.js";
import { ANGLE_LABELS, ALL_ANGLES } from "../diagnosisStore.js";

const STATUS_TEXT = {
  ok: "已更新",
  partial: "部分",
  stale: "陈旧",
  failed: "失败",
};

export function DataHealthBadge({ perAngleData, angles = ALL_ANGLES, now = Date.now() }) {
  if (!perAngleData || Object.keys(perAngleData).length === 0) return null;
  const rows = angles.map((k) => ({
    key: k,
    label: ANGLE_LABELS[k] || k,
    status: deriveAngleStatus(perAngleData[k], now),
    angle: perAngleData[k],
  }));
  const total = rows.length;
  const okCount = rows.filter((r) => r.status === "ok").length;
  const allOk = okCount === total;
  const label = allOk
    ? `数据全部已更新 (${total}/${total})`
    : `数据 ${okCount}/${total} 已更新`;
  const tipLines = rows.map((r) => {
    const detail = r.status === "failed"
      ? ` — ${failureReasonText(r.angle)}`
      : r.status === "stale" && r.angle.lastSuccessAt
        ? ` — 上次 ${new Date(r.angle.lastSuccessAt).toLocaleDateString("zh-CN")}`
        : "";
    return `${r.label}: ${STATUS_TEXT[r.status]}${detail}`;
  });
  return (
    <span
      class={`data-health-badge${allOk ? " data-health-badge-ok" : " data-health-badge-warn"}`}
      title={tipLines.join("\n")}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}

export default DataHealthBadge;