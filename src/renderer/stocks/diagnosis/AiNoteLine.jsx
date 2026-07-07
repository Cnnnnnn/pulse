/**
 * AiNoteLine — 单条 AI 解读, 嵌在 ModuleGrid 每张数据卡正上方.
 *
 * ponytail: 2026-07-07 任务 C 加的视觉元素. 不展开, 不折叠, 一行 + 图标 + tooltip
 * 全文. 让 perAngle 输出从"被遗忘的字段" 变"贴着数据的注解", 跟 VerdictCard
 * 的总结互补 — 一个看全局, 一个贴数据.
 *
 * ponytail: 2026-07-07 P1-2 — 加 onRefresh prop, 渲染尾部"换一句"按钮 (仅在 onRefresh
 * 存在时显示). 走 stocks:angle-refresh (本地规则, 不调 LLM), 0.05s 出新句.
 */
import { IconSparkles, IconRefresh } from "../../components/icons.jsx";

export function AiNoteLine({ note, refreshing, onRefresh }) {
  if (!note) return null;
  return (
    <div class="ai-note-line" title={note}>
      <IconSparkles size={11} class="ai-note-icon" />
      <span class="ai-note-text">{refreshing ? "正在换一句…" : note}</span>
      {onRefresh && (
        <button
          type="button"
          class="ai-note-refresh"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="换一句"
          title="换一句本地解读"
        >
          <IconRefresh size={11} />
        </button>
      )}
    </div>
  );
}

export default AiNoteLine;
