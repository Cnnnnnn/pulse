/**
 * src/main/digest/brief-html.ts
 *
 * v3.0 beta: 渲染早报导出卡片 HTML (内嵌 CSS, 无外部 JS 依赖).
 *
 * 设计原则 (ponytail 风格):
 *   - 单文件 HTML — 拖给同事直接打开
 *   - 内联 tokens.css 的关键变量 (不依赖外链)
 *   - 复用 share-card.html 的视觉风格 (浅色 / 圆角 / 大字号)
 *   - 无 JS — 静态可分享
 *
 * 不做的事 (Ceiling):
 *   - 不抓外部图 (alpha 阶段, 不引入网络依赖)
 *   - 不做模板引擎 (字符串替换足够, 加 handlebars 反而失重)
 */

import type { BriefingSnapshot } from "../../shared/digest-types";
import { DIGEST_KIND_LABEL, DIGEST_KIND_ORDER } from "../../shared/digest-types";

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sectionHtml(s: BriefingSnapshot["sections"][number]): string {
  const items = s.items
    .map((it: any) => {
      // 复用 DigestSection.tsx 的渲染逻辑 (字符串 shape), 这里做简单 HTML 包装
      let text = "";
      if (s.kind === "updates") {
        const u = it;
        text = u.installed_version
          ? `${u.name} ${u.installed_version} → ${u.latest_version}`
          : `${u.name} ${u.latest_version}`;
      } else if (s.kind === "hot") {
        text = it.title || "";
      } else if (s.kind === "news") {
        text = it.title || "";
      } else if (s.kind === "funds") {
        const sign = it.today_change_pct >= 0 ? "+" : "";
        text = `${it.name} ${sign}${it.today_change_pct.toFixed(1)}%`;
      } else if (s.kind === "ai_usage") {
        text = `${it.provider} ${it.percent}%`;
      }
      return `<li>${escapeHtml(text)}</li>`;
    })
    .join("");
  return `
    <section class="brief-section">
      <h2>${escapeHtml(DIGEST_KIND_LABEL[s.kind] || s.kind)}</h2>
      <ul>${items}</ul>
    </section>`;
}

/**
 * 生成可分享的早报卡片 HTML.
 * @param snapshot  DailyDigestConfig 完整输出
 * @param opts.title  卡片标题 (默认 "Pulse 今日要点")
 * @param opts.appName 卡片底部署名 (默认 "Pulse")
 */
export function briefHtmlShell(
  snapshot: BriefingSnapshot,
  opts: { title?: string; appName?: string } = {},
): string {
  const title = opts.title || "Pulse 今日要点";
  const appName = opts.appName || "Pulse";
  // 按 SECTION_ORDER 排序 sections (snapshot 内已排序, 这里是兜底)
  const order = new Map(DIGEST_KIND_ORDER.map((k, i) => [k, i]));
  const sections = [...snapshot.sections].sort(
    (a, b) =>
      (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99),
  );
  const sectionsHtml = sections.map(sectionHtml).join("");
  const rewrittenTag = snapshot.rewritten
    ? `<span class="brief-tag">LLM 改写</span>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} · ${escapeHtml(snapshot.date)}</title>
<style>
  :root {
    --bg: #ffffff;
    --text: #1f2328;
    --text-secondary: #59636e;
    --border: #d0d7de;
    --accent: #0969da;
    --tag-bg: #f6f8fa;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117;
      --text: #e6edf3;
      --text-secondary: #9198a1;
      --border: #30363d;
      --accent: #58a6ff;
      --tag-bg: #21262d;
    }
  }
  body {
    margin: 0; padding: 32px 24px;
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro", "PingFang SC", sans-serif;
    font-size: 14px; line-height: 1.6;
    max-width: 640px; margin: 0 auto;
  }
  header.brief-header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 16px; margin-bottom: 24px;
    display: flex; align-items: baseline; justify-content: space-between;
  }
  header h1 {
    margin: 0; font-size: 24px; font-weight: 700;
  }
  header .brief-date {
    color: var(--text-secondary); font-size: 13px;
  }
  .brief-tag {
    display: inline-block; padding: 2px 8px;
    background: var(--tag-bg); color: var(--text-secondary);
    border-radius: 10px; font-size: 11px; margin-left: 8px;
  }
  .brief-section {
    margin: 18px 0; padding: 14px 16px;
    border: 1px solid var(--border); border-radius: 8px;
  }
  .brief-section h2 {
    margin: 0 0 8px; font-size: 13px; font-weight: 600;
    color: var(--text-secondary); text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .brief-section ul {
    margin: 0; padding-left: 18px;
  }
  .brief-section li { margin: 4px 0; }
  footer.brief-footer {
    margin-top: 32px; padding-top: 16px;
    border-top: 1px solid var(--border);
    color: var(--text-secondary); font-size: 11px;
    text-align: center;
  }
</style>
</head>
<body>
<header class="brief-header">
  <h1>${escapeHtml(title)}${rewrittenTag}</h1>
  <span class="brief-date">${escapeHtml(snapshot.date)}</span>
</header>
${sectionsHtml || '<p style="color:var(--text-secondary)">今日没有匹配的要点。</p>'}
<footer class="brief-footer">
  由 ${escapeHtml(appName)} 生成 · ${new Date(snapshot.generatedAt).toLocaleString("zh-CN")}
</footer>
</body>
</html>`;
}
