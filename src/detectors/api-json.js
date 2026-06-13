/**
 * src/detectors/api-json.js
 *
 * 通用 JSON API — 顶层 version / productVersion / latest_version / latestVersion 任一即可。
 * 也支持指定 field 路径 (点号分隔) 直接 pluck。
 *
 * 配置: { type: 'api_json', url: 'https://...', field?: 'data.version' }
 *
 * Phase 6 修复 (WorkBuddy):
 *   - WorkBuddy 真实响应顶层有 version 和 productVersion (旧实现已支持), 但
 *     部分服务把版本藏在 data.version / data.productVersion / data.latestVersion 嵌套
 *   - 增加嵌套对象搜索: 先顶层, 再递归找一层 (data.x)
 *   - URL 模板展开 ({arch})
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { expandUrl } = require("./url-template");
const { truncate } = require("./utils");
const { stripBuildNumber } = require("../utils/version-utils");

class ApiJsonDetector extends Detector {
  static name = "api_json";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.url = opts.url || "";
    this.field = opts.field || ""; // 可指定字段路径（点号分隔）
  }

  async detect(ctx) {
    const rawUrl = this.url || ctx.url;
    if (!rawUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no url configured",
      });
    }
    // 展开 {arch} / {arch_short}
    const url = expandUrl(rawUrl, ctx.arch);

    const r = await ctx.http.get(url, {
      timeout: ctx.timeout || this.timeout,
      headers: { Accept: "application/json" },
    });
    if (r.error === "timeout") {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.TIMEOUT,
        note: url,
      });
    }
    if (r.error === "network") {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NETWORK,
        note: url,
      });
    }
    if (r.status >= 400 && r.status < 500) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.HTTP_4XX,
        httpStatus: r.status,
        raw: truncate(r.body),
        note: url,
      });
    }
    if (r.status >= 500) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.HTTP_5XX,
        httpStatus: r.status,
        raw: truncate(r.body),
        note: url,
      });
    }

    let data;
    try {
      data = JSON.parse(r.body);
    } catch (e) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.PARSE,
        raw: truncate(r.body),
        note: e.message,
      });
    }

    const ver = this.field ? pluckPath(data, this.field) : pickVersion(data);
    if (!ver) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: data,
        note: this.field ? `field '${this.field}' empty` : "no version field",
      });
    }

    // Phase 14: 提取 changelog. 通用规则: 顶层 body / releaseNotes / release_notes 字段.
    // GitHub releases API: { tag_name, body, html_url } — body 就是 markdown release notes.
    // 给一个 html_url 当作 changelog_url 让用户能跳完整页.
    const changelog = pickChangelog(data);
    const changelogUrl = pickChangelogUrl(data);

    return new DetectorResult({
      version: stripBuildNumber(String(ver).trim()),
      raw: data,
      source: this.constructor.name,
      confidence: "high",
      note: this.field ? `api_json[${this.field}]` : "api_json",
      changelog,
      changelog_url: changelogUrl,
    });
  }
}

/**
 * Phase 14: 通用 changelog 提取. 优先顶层字段, 再嵌套 data/result.
 * GitHub releases API: { tag_name, body, html_url } — body 是 markdown release notes.
 * Custom APIs: releaseNotes / release_notes / changelog.
 */
function pickChangelog(obj) {
  if (!obj || typeof obj !== "object") return "";
  return (
    obj.body ||
    obj.releaseNotes ||
    obj.release_notes ||
    obj.changelog ||
    (obj.data &&
      (obj.data.body || obj.data.releaseNotes || obj.data.changelog)) ||
    ""
  );
}

function pickChangelogUrl(obj) {
  if (!obj || typeof obj !== "object") return "";
  return (
    obj.html_url ||
    obj.releaseUrl ||
    obj.release_url ||
    obj.changelog_url ||
    (obj.data && (obj.data.html_url || obj.data.changelog_url)) ||
    ""
  );
}

// stripBuildNumber (Phase 8) 定义已搬至 ../utils/version-utils.js, 在 detect() 里复用.
// 本文件不再保留副本 — 既避免双源真相, 也方便 detect-worker 的 installed 侧共用.
function pickVersion(obj) {
  if (!obj || typeof obj !== "object") return null;
  // Phase 6: 支持更多字段名 + 嵌套对象 (data.x)
  // 1) 顶层常见字段
  const top =
    obj.version ||
    obj.productVersion ||
    obj.latest_version ||
    obj.latestVersion ||
    obj.appVersion ||
    obj.app_version ||
    obj.tag_name ||
    obj.releaseName ||
    obj.build_version ||
    obj.buildVersion;
  if (top) return top;
  // 2) 嵌套: data.x  (WorkBuddy 部分 API 套了一层 { data: {...} })
  if (obj.data && typeof obj.data === "object") {
    const nested =
      obj.data.version ||
      obj.data.productVersion ||
      obj.data.latest_version ||
      obj.data.latestVersion ||
      obj.data.appVersion ||
      obj.data.app_version ||
      obj.data.tag_name ||
      obj.data.build_version;
    if (nested) return nested;
  }
  // 3) 嵌套: result.x / payload.x  (部分 API 习惯)
  for (const wrap of ["result", "payload", "response", "body"]) {
    if (obj[wrap] && typeof obj[wrap] === "object") {
      const v =
        obj[wrap].version ||
        obj[wrap].productVersion ||
        obj[wrap].latest_version;
      if (v) return v;
    }
  }
  return null;
}

function pluckPath(obj, path) {
  if (!path) return null;
  let node = obj;
  for (const seg of path.split(".")) {
    if (node == null) return null;
    node = node[seg];
  }
  return node || null;
}

module.exports = { ApiJsonDetector };

// stripBuildNumber 现在从 ../utils/version-utils 导入 (见顶部).
