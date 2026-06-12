/**
 * src/renderer/worldcup/MatchAiPanel.jsx
 *
 * 比赛详情弹窗内的 AI 分析（完整版）
 */

import { useMatchAi } from './useMatchAi.js';
import { formatInsightText } from './insight-text.js';

export function MatchAiPanel({ match, score }) {
  const ai = useMatchAi(match, score);
  if (!ai.visible) return null;

  const {
    isUpcoming,
    isFinal,
    pre,
    post,
    busyType,
    error,
    handleGenerate,
  } = ai;

  function renderBlock(type, insight, busy, emptyLabel, regenLabel) {
    const hasText = !!(insight && insight.text);
    return (
      <div class="match-ai-block">
        <div class="match-ai-block-actions">
          {!hasText && (
            <button
              type="button"
              class="btn btn-secondary match-ai-btn"
              disabled={busy}
              onClick={() => handleGenerate(type, false)}
            >
              {busy ? '生成中…' : emptyLabel}
            </button>
          )}
          {hasText && (
            <button
              type="button"
              class="btn btn-ghost btn-sm match-ai-btn"
              disabled={busy}
              onClick={() => handleGenerate(type, true)}
            >
              {busy ? '生成中…' : regenLabel}
            </button>
          )}
        </div>
        {hasText && (
          <div class="match-ai-content">{formatInsightText(insight.text)}</div>
        )}
      </div>
    );
  }

  return (
    <section class="match-ai-panel">
      <div class="match-ai-panel-head">
        <h3 class="match-ai-panel-title">AI 分析</h3>
        <span class="match-ai-panel-hint">与 AI 任务总结共用模型配置 · 点击按钮才会生成</span>
      </div>

      {isUpcoming && renderBlock('pre', pre, busyType === 'pre', '赛前预测', '重新预测')}
      {isFinal && renderBlock('post', post, busyType === 'post', '赛后总结', '重新总结')}

      {error && <p class="match-ai-error">{error}</p>}
    </section>
  );
}

export default MatchAiPanel;
