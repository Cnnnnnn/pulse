/**
 * src/detectors/sparkle-appcast.js
 *
 * Sparkle appcast XML — 提取 sparkle:shortVersionString（优先）/ sparkle:version。
 * 例如：
 *   <item><title>3.0</title>
 *     <enclosure ... sparkle:shortVersionString="3.0.1" sparkle:version="310" />
 *   </item>
 *
 * 配置: { type: 'sparkle_appcast', url: 'https://...' }
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate, assertHttpResponse } = require("./utils");

class SparkleAppcastDetector extends Detector {
  static name = "sparkle_appcast";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
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

    const r = await ctx.http.get(url, { timeout: ctx.timeout || this.timeout });
    assertHttpResponse(r, this.constructor.name, url);

    const ver = extractSparkleVersion(r.body);
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(r.body),
        note: "no sparkle:shortVersionString / sparkle:version",
      });
    }

    // Phase 14: 提取 description (HTML 格式, spark 自定义节点). 标 changelog_format='html'
    // 让 renderer 走 DOMPurify 而不是 markdown 渲染
    const desc = extractSparkleDescription(r.body);

    // Phase 22: 提取最新 item 的 <enclosure url="..."> —— Sparkle appcast 几乎都有
    // 指向具体版本的 .zip 下载. 给 Bulk Upgrade 用 openExternal 打开下载页 (比
    // shell.openPath 启动 app 等自带 updater 弹更可靠).
    const releaseUrl = extractSparkleEnclosureUrl(r.body);

    return new DetectorResult({
      version: ver,
      raw: truncate(r.body, 1024),
      source: this.constructor.name,
      confidence: "high",
      note: "sparkle appcast",
      changelog: desc,
      changelog_format: "html",
      release_url: releaseUrl,
    });
  }
}

/**
 * Phase 14: 提取 sparkle <description> 节点内容. 两种形式:
 *   <description><![CDATA[ ... html ... ]]></description>
 *   <description>html content</description>
 * 取最近 (第一个) item 的 description, 因为 appcast 通常是倒序 (最新在前).
 * 如果没有 description 节点, 返回空串 (UI 端 fallback 到 "无 release notes").
 */
function extractSparkleDescription(xml) {
  if (!xml) return "";
  // 匹配第一个 <item>...</item> 块
  const itemMatch = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/i);
  const block = itemMatch ? itemMatch[1] : xml;
  // 描述节点 (可能带 CDATA, 也可能不带)
  let m = block.match(
    /<description[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/i,
  );
  if (m) return m[1].trim();
  m = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
  if (m) return m[1].trim();
  return "";
}

function extractSparkleVersion(xml) {
  if (!xml) return null;
  // 优先 shortVersionString（更接近用户能看的版本号）
  // 两种形式都兼容：
  //   a) <elem sparkle:shortVersionString="3.0.1" ... />
  //   b) <elem sparkle:shortVersionString>3.0.1</elem>
  let m = xml.match(/sparkle:shortVersionString\s*=\s*["']([^"']+)["']/i);
  if (m) return m[1].trim();
  m = xml.match(/sparkle:shortVersionString\s*>\s*([^<]+?)\s*</i);
  if (m) return m[1].trim();
  m = xml.match(/sparkle:version\s*=\s*["']([^"']+)["']/i);
  if (m) return m[1].trim();
  m = xml.match(/sparkle:version\s*>\s*([^<]+?)\s*</i);
  if (m) return m[1].trim();
  return null;
}

/**
 * Phase 22: 提取最新 (第一个) <item> 块里的 <enclosure url="...">.
 * Sparkle appcast 倒序 (最新在前), 所以第一个 item 就是目标版本.
 * 没找到 → 返回 '' (caller fallback 到 shell.openPath).
 */
function extractSparkleEnclosureUrl(xml) {
  if (!xml) return "";
  const itemMatch = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/i);
  const block = itemMatch ? itemMatch[1] : xml;
  const m = block.match(/<enclosure\b[^>]*\burl\s*=\s*["']([^"']+)["']/i);
  return m ? m[1].trim() : "";
}

module.exports = { SparkleAppcastDetector };
