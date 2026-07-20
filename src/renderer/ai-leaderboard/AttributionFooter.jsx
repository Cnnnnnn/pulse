/**
 * src/renderer/ai-leaderboard/AttributionFooter.jsx
 *
 * 署名脚注：AA 强制（架构 §12，含可点击链接 https://artificialanalysis.ai/）；
 * 其余来源按实际命中动态追加（Arena MIT / OpenRouter / 示例）。
 * 纯展示，无网络出口。
 */

import { ATTRIBUTION } from "./types.js";

export function AttributionFooter({ attribution }) {
  const active = Array.isArray(attribution) ? attribution.slice() : [];

  // 强制 AA 署名（即使主进程未返回，也保证出现）
  if (!active.some((a) => a && a.id === "artificial-analysis")) {
    active.unshift(ATTRIBUTION["artificial-analysis"]);
  }

  const items = active
    .map((a) => (a && a.id && ATTRIBUTION[a.id] ? ATTRIBUTION[a.id] : a))
    .filter(Boolean);

  return (
    <footer class="ai-lb-attribution">
      <span class="ai-lb-attribution-label">数据来源</span>
      <ul class="ai-lb-attribution-list">
        {items.map((a) => (
          <li class="ai-lb-attribution-item" key={a.id}>
            {a.url ? (
              <a
                class="ai-lb-attribution-link"
                href={a.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {a.text}
              </a>
            ) : (
              <span class="ai-lb-attribution-text">{a.text}</span>
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
}

export default AttributionFooter;
