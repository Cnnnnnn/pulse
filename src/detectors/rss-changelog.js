/**
 * src/detectors/rss-changelog.js
 *
 * RSS changelog detector — 抓 RSS 2.0 feed (e.g. Codex changelog RSS), 拿
 * 最新一个 item 的 content:encoded 当 changelog markdown.
 *
 * 设计: 这个 detector **不**返 version 字段. 它必须配 `enrich_only: true`
 * 让 chain 知道它只 enrich, 不参与版本号竞争. 配法:
 *
 *   detectors: [
 *     { type: "sparkle_appcast", url: "..." },          // 拿 version
 *     { type: "rss_changelog", url: ".../rss.xml", enrich_only: true }, // 拿 markdown
 *   ]
 *
 * chain 行为: sparkle 先跑 → 写 firstHit, chain stop; rss_changelog 后跑
 * (enrich_only 模式) → 把 content:encoded 填到 firstHit.result.changelog.
 *
 * 限制: 只支持 RSS 2.0 + content:encoded (Markdown 嵌入). Atom / JSON Feed
 * 暂不支持. 这是 Codex changelog RSS 专属探测器, 后续若有其它 RSS 源需要
 * 通用化再扩展.
 */
const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate, assertHttpResponse } = require("./utils");

class RssChangelogDetector extends Detector {
  static name = "rss_changelog";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 10000 });
    this.url = opts.url || "";
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
    const r = await ctx.http.get(url, {
      timeout: ctx.timeout || this.timeout,
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    });
    assertHttpResponse(r, this.constructor.name, url);

    // 切第一个 <item>...</item> 范围. RSS 2.0 标准; Atom 是 <entry>, 这里
    // 不支持 (Codex 是 RSS 2.0).
    const startIdx = r.body.indexOf("<item>");
    if (startIdx === -1) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(r.body, 512),
        note: "no <item> in RSS body",
      });
    }
    const endIdx = r.body.indexOf("</item>", startIdx);
    if (endIdx === -1) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(r.body, 512),
        note: "no </item> close",
      });
    }
    const firstItem = r.body.slice(startIdx, endIdx + "</item>".length);

    // content:encoded 是 Codex changelog 用的字段 (markdown 嵌入).
    // 优先取它; 缺则 fallback <description>.
    const encMatch = firstItem.match(
      /<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i,
    );
    const descMatch = firstItem.match(
      /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i,
    );
    let content = encMatch ? encMatch[1] : descMatch ? descMatch[1] : "";
    if (!content) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(firstItem, 512),
        note: "no content:encoded or description in first item",
      });
    }

    // 把 content 当 markdown; 后续 renderer 用 marked + DOMPurify 渲染.
    // 留空的 version 让 chain 知道这是 enrich_only 探测器, 不能 stop.
    // ponytail: 拿 URL pathname 当 note; URL 解析失败 (e.g. 测试用 "x")
    // 时回退到 url 原文, 不让整个 detector 抛错.
    let pathNote = url;
    try {
      pathNote = new URL(url).pathname;
    } catch {
      /* keep url as fallback */
    }
    return new DetectorResult({
      version: "", // 故意空: 不参与版本号竞争
      raw: { firstItemLength: firstItem.length, contentLength: content.length },
      source: this.constructor.name,
      confidence: "high",
      note: `rss latest (${pathNote})`,
      changelog: content.trim(),
      changelog_url: url, // RSS URL 让用户能跳完整 feed
      changelog_format: "md",
    });
  }
}

module.exports = { RssChangelogDetector };
