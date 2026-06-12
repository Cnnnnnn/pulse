/**
 * src/renderer/worldcup/MatchCardAi.jsx
 *
 * 赛程卡片上的 AI 按钮（紧凑版，点击不打开大名单弹窗）
 */

import { useMatchAi } from './useMatchAi.js';
import { formatInsightText } from './insight-text.js';

export function MatchCardAi({ match, score }) {
  const ai = useMatchAi(match, score);
  if (!ai.visible) return null;

  const {
    isFinal,
    pre,
    post,
    activeInsight,
    busyType,
    error,
    expanded,
    setExpanded,
    handleGenerate,
  } = ai;

  const type = isFinal ? 'post' : 'pre';
  const hasInsight = !!(isFinal ? post : pre)?.text;
  const label = isFinal
    ? (busyType === 'post' ? '生成中…' : hasInsight ? '查看总结' : '赛后总结')
    : (busyType === 'pre' ? '生成中…' : hasInsight ? '查看预测' : '赛前预测');

  function stop(e) {
    e.stopPropagation();
  }

  return (
    <div class="match-card-ai" onClick={stop}>
      <div class="match-card-ai-row">
        <button
          type="button"
          class="match-card-ai-btn"
          disabled={!!busyType}
          onClick={(e) => {
            stop(e);
            if (hasInsight) {
              setExpanded(!expanded);
              return;
            }
            handleGenerate(type, false);
          }}
        >
          {isFinal ? '📝' : '🔮'} {label}
        </button>
        {hasInsight && (
          <button
            type="button"
            class="match-card-ai-regen"
            disabled={!!busyType}
            onClick={(e) => {
              stop(e);
              handleGenerate(type, true);
            }}
            title="重新调用 AI 生成"
          >
            重新生成
          </button>
        )}
      </div>
      {error && <p class="match-card-ai-error">{error}</p>}
      {hasInsight && expanded && activeInsight?.text && (
        <div class="match-card-ai-preview">{formatInsightText(activeInsight.text)}</div>
      )}
      {hasInsight && !expanded && activeInsight?.text && (
        <div class="match-card-ai-teaser">{formatInsightText(activeInsight.text)}</div>
      )}
    </div>
  );
}

export default MatchCardAi;
