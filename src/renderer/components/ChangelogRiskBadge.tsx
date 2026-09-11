/**
 * src/renderer/components/ChangelogRiskBadge.tsx
 *
 * 更新风险标签 — 列表行轻量 badge，点一下拉 AI 分类（有缓存）。
 * 与 UpgradeAdvice（完整「该不该升」）互补：这里只给 risk / score / tags。
 */
import { useState } from "preact/hooks";
import { api } from "../api.ts";

// 不 import src/ai/changelog-risk.ts — 那里有 node:crypto / state-store，
// 渲染层不能吃。类型与标签本地镜像（与 ai 侧保持一致）。
type RiskLevel =
  | "security"
  | "breaking"
  | "mixed"
  | "feature"
  | "bugfix"
  | "unknown";

const RISK_LABEL: Record<RiskLevel, string> = {
  security: "安全修复",
  breaking: "破坏性变更",
  mixed: "多项变更",
  feature: "新功能",
  bugfix: "仅修复",
  unknown: "待分类",
};

type RiskInfo = {
  risk: RiskLevel;
  score: number;
  tags: string[];
  oneLiner: string;
};

const RISK_CLASS: Record<RiskLevel, string> = {
  security: "risk-badge--security",
  breaking: "risk-badge--breaking",
  mixed: "risk-badge--mixed",
  feature: "risk-badge--feature",
  bugfix: "risk-badge--bugfix",
  unknown: "risk-badge--unknown",
};

export function ChangelogRiskBadge({
  appName,
  hasUpdate,
}: {
  appName: string;
  hasUpdate: boolean;
}) {
  const [info, setInfo] = useState<RiskInfo | null>(null);
  const [loading, setLoading] = useState(false);

  if (!hasUpdate || !appName) return null;

  async function fetchRisk() {
    if (loading || !api.changelogRiskFetch) return;
    setLoading(true);
    try {
      const r = await api.changelogRiskFetch({ appName });
      if (r && r.ok && r.risk) {
        setInfo({
          risk: r.risk,
          score: typeof r.score === "number" ? r.score : 0,
          tags: r.tags || [],
          oneLiner: r.oneLiner || "",
        });
      }
    } catch {
      /* 失败静默，保持可再点 */
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <span class="risk-badge risk-badge--loading" title="AI 分析中…">
        分析中…
      </span>
    );
  }

  if (!info) {
    return (
      <button
        type="button"
        class="risk-badge risk-badge--idle"
        onClick={(e) => {
          e.stopPropagation();
          fetchRisk();
        }}
        title="AI 分析本次更新风险类型"
      >
        风险?
      </button>
    );
  }

  const label = RISK_LABEL[info.risk] || info.risk;
  const tip = [info.oneLiner, ...info.tags].filter(Boolean).join(" · ");

  return (
    <span
      class={`risk-badge ${RISK_CLASS[info.risk] || ""}`}
      title={tip}
      data-score={info.score}
    >
      {label}
      {info.score >= 80 ? "!" : ""}
    </span>
  );
}

export default ChangelogRiskBadge;
