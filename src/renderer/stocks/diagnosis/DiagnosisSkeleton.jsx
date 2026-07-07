/**
 * DiagnosisSkeleton — 诊断页 loading 态骨架屏.
 *
 * ponytail: 2026-07-07 — 替代原"正在生成诊断报告…" 一行文本. 渲染跟 ready 态
 * 同结构的占位卡 (评分柱 + 8 张数据卡 + AI 解读卡), shimmer 动画, 让用户知道
 * 12 个 angle 正在并行拉取, 减少"卡住"的体感.
 *
 * 8 张数据卡布局跟 ModuleGrid 严格 1:1 对齐 (含 wrap + grid gap), 避免 ready
 * 时整页跳变.
 */
const CARD_LABELS = ["基本面", "估值", "资金", "技术", "舆情", "业绩预期", "股东", "股本"];

function CardSkeleton({ label }) {
  return (
    <div class="module-card module-card-skel">
      <div class="skel-line skel-line-title" />
      <div class="skel-line skel-line-body" />
      <div class="skel-line skel-line-body skel-line-body-2" />
      <span class="module-card-skel-label">{label}</span>
    </div>
  );
}

function DimensionScoresSkeleton() {
  return (
    <div class="dimension-scores dimension-scores-skel">
      <div class="dimension-scores-bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <div class="dim-col dim-col-skel" key={i}>
            <div class="skel-line skel-dim-label" />
            <div class="dim-bar-track">
              <div class="skel-bar-fill" />
            </div>
            <div class="skel-line skel-dim-score" />
          </div>
        ))}
      </div>
    </div>
  );
}

function VerdictSkeleton() {
  return (
    <div class="verdict-card verdict-card-skel">
      <div class="verdict-title">
        <div class="skel-line skel-verdict-title" />
      </div>
      <div class="verdict-skel-body">
        <div class="skel-line skel-verdict-summary" />
        <div class="skel-line skel-verdict-line" />
        <div class="skel-line skel-verdict-line skel-verdict-line-2" />
      </div>
    </div>
  );
}

export function DiagnosisSkeleton() {
  return (
    <div class="diagnosis-report-grid">
      <DimensionScoresSkeleton />
      <div class="module-grid">
        {CARD_LABELS.map((label, i) => (
          <div class="module-card-wrap" key={i}>
            <CardSkeleton label={label} />
          </div>
        ))}
      </div>
      <VerdictSkeleton />
    </div>
  );
}

export default DiagnosisSkeleton;