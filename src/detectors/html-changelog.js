/**
 * src/detectors/html-changelog.js
 *
 * html_changelog detector — 从公开 HTML changelog 页面抓最新 release section,
 * 同时返回 version + 渲染好的 changelog HTML.
 *
 * 适用场景: app 官网有公开 changelog HTML 页 (e.g. https://www.cursor.com/changelog,
 * https://zcode.z.ai/en/changelog) 但没机器可读 API (yml / sparkle / github release).
 *
 * 配置 (config.json):
 *   {
 *     "type": "html_changelog",
 *     "url": "https://.../changelog",
 *     "section_pattern": "<div class=\"...\">",   // 包围单个 release 的 HTML 起始标记 (字符串, 不用 regex)
 *     "section_end":    "</div>",                  // 起始标记的对应闭合 (默认 "</div>")
 *     "version_pattern": "...regex...",            // 在首个 section 内匹配版本号, 必须有 1 个 capture group
 *     "content_pattern": "...regex..."             // 可选, 匹配首个 section 内要保留的子 HTML; 不填 = 整个 section
 *   }
 *
 * 工作流程:
 *   1. GET URL 拿 HTML body
 *   2. 用 section_pattern 找到第一个 release 块的起始 idx
 *   3. 从该 idx 起往后数到 section_end 平衡闭合深度 → 切出 section HTML
 *   4. section 内跑 version_pattern → version
 *   5. content_pattern? → 切内容: 否则整个 section
 *   6. strip 危险标签 (script/iframe/style + onxxx attrs) 作为第一层防护
 *   7. 返回 DetectorResult(changelog=<html>, changelog_format='html')
 *
 * 限制 (跟所有"用纯正则切 HTML"的实现一样):
 *   - 假设 section 起始/闭合是干净的 (没有嵌套同名标签)
 *   - 不处理 HTML entity encoding (版本号是纯文本, 无影响)
 *   - 不进 HTML 解析器 (main 进程没 jsdom; parse5 在 devDeps 不稳)
 *   - 这是已知折衷: changelog 内容会过 renderer 的 DOMPurify 二层清洗
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate, assertHttpResponse } = require("./utils");

class HtmlChangelogDetector extends Detector {
  static name = "html_changelog";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 15000 });
    this.url = opts.url || "";
    this.sectionPattern = opts.section_pattern || "";
    this.sectionEnd = opts.section_end || "</div>";
    this.versionPattern = opts.version_pattern || "";
    this.contentPattern = opts.content_pattern || "";
  }

  async detect(ctx) {
    const url = this.url || ctx.url;
    if (!url) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no url configured",
      });
    }
    if (!this.sectionPattern || !this.versionPattern) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "section_pattern + version_pattern required",
      });
    }

    const r = await ctx.http.get(url, {
      timeout: ctx.timeout || this.timeout,
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    assertHttpResponse(r, this.constructor.name, url);

    const html = r.body || "";
    const section = extractFirstSection(
      html,
      this.sectionPattern,
      this.sectionEnd,
    );
    if (!section) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(html, 1024),
        note: `section_pattern not found: ${this.sectionPattern.slice(0, 60)}…`,
      });
    }

    // 先在第一个 section 里找版本号, 找不到再在整个 html 里搜最大版本号
    // (e.g. Cursor changelog: 最新 article 不含版本号, 但第 2/3 个 article 含 3.7)
    let ver = "";
    let verSource = "section";
    const verRe = new RegExp(this.versionPattern, "gi");
    const sectionMatches = [...section.matchAll(verRe)];
    if (sectionMatches.length > 0 && sectionMatches[0][1]) {
      ver = sectionMatches[0][1].trim();
    } else {
      const allMatches = [...html.matchAll(verRe)];
      if (allMatches.length > 0) {
        verSource = "page-max";
        // 选最大 semver
        ver =
          allMatches
            .map((m) => (m[1] || "").trim())
            .filter(Boolean)
            .sort((a, b) => compareVersionsDesc(a, b))[0] || "";
      }
    }
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(section, 1024),
        note: `version_pattern no match: ${this.versionPattern.slice(0, 60)}…`,
      });
    }

    let contentHtml = section;
    if (this.contentPattern) {
      const cm = section.match(new RegExp(this.contentPattern, "is"));
      if (cm && cm[0]) contentHtml = cm[0];
    }

    const safeHtml = stripDangerousTags(contentHtml);

    return new DetectorResult({
      version: ver,
      raw: {
        sectionLength: section.length,
        contentLength: safeHtml.length,
        verSource,
      },
      source: this.constructor.name,
      confidence: "high",
      note: `html changelog (first section, version from ${verSource})`,
      changelog: safeHtml,
      changelog_format: "html",
    });
  }
}

/**
 * 按 semver 倒序比较 a, b. 都是 "X.Y.Z" 形式 (短形式按 0 补齐).
 * 返回 1 (a > b), -1 (a < b), 0 (相等).
 */
function compareVersionsDesc(a, b) {
  const parse = (v) =>
    String(v)
      .split(".")
      .map((p) => parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? -1 : 1; // 倒序
  }
  return 0;
}

/**
 * 从 html 文本里找到 sectionPattern 第一次出现的位置, 然后从该位置起追踪
 * sectionEnd 标签的开闭深度, 切出第一个完整 section.
 *
 * @param {string} html
 * @param {string} sectionStart  起始子串 (e.g. '<div class="...">')
 * @param {string} sectionEndTag 闭合标签 (e.g. '</div>')
 * @returns {string|null}       切出的 section HTML (含起始标记) 或 null
 */
function extractFirstSection(html, sectionStart, sectionEndTag) {
  if (!html || !sectionStart) return null;
  const startIdx = html.indexOf(sectionStart);
  if (startIdx === -1) return null;

  // 起始标记本身的标签名 (e.g. "<div")
  const tagMatch = sectionStart.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch) return null;
  const openTagRe = new RegExp(`<${tagMatch[1]}\\b`, "gi");
  const closeTag = sectionEndTag.toLowerCase(); // e.g. "</div>"

  // 数 open vs close, balance=1 时遇到第一个 close 就是 section 结束
  const searchFrom = startIdx;
  let depth = 0;
  let i = startIdx;
  // 在整个剩余 html 里交替扫描
  const slice = html.slice(searchFrom);

  // 一次性扫: 用 lastIndex 控制
  openTagRe.lastIndex = 0;
  let cursor = 0;
  while (cursor < slice.length) {
    openTagRe.lastIndex = cursor;
    const openMatch = openTagRe.exec(slice);
    const closeIdx = slice.indexOf(closeTag, cursor);

    if (closeIdx === -1) return null;

    if (openMatch && openMatch.index < closeIdx) {
      depth += 1;
      cursor = openMatch.index + openMatch[0].length;
    } else {
      depth -= 1;
      cursor = closeIdx + closeTag.length;
      if (depth === 0) {
        return slice.slice(0, cursor);
      }
    }
  }
  return null;
}

/**
 * 第一层 XSS 防护: 移除 script / iframe / style / object / embed 整块内容 + onxxx= 属性.
 * renderer 端还会再过 DOMPurify (二层防护).
 */
function stripDangerousTags(html) {
  if (!html) return "";
  return (
    html
      // <script ...>...</script> 整块 (greedy, 含多行)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, "")
      .replace(/<embed\b[^>]*\/?>/gi, "")
      // onxxx= 属性
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // javascript: 链接 (renderer 也会拦, 双重防护)
      .replace(
        /(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi,
        '$1="#"',
      )
  );
}

module.exports = {
  HtmlChangelogDetector,
  // exported for unit tests
  extractFirstSection,
  stripDangerousTags,
  compareVersionsDesc,
};
