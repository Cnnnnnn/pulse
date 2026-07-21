/**
 * src/detectors/hilo-changelog-manifest.js
 *
 * hilo 桌面端 (minimax Hub / 内部代号 hilo, app.asar 包名 @hilo/desktop) 的
 * 更新日志数据源.
 *
 * hilo 桌面端内嵌的「更新日志」窗口 (用户截图) 走的是 `buildReleaseCdnUrl("changelog.json")`,
 * 即在 release CDN 根目录放一份 schemaVersion=1 的 manifest, 内容:
 *
 *   {
 *     schemaVersion: 1,
 *     updatedAt: "2026-06-27T...",
 *     en: { badge, title, items: [{ version, date, subtitle, changelog: [..], featured?, branch? }] },
 *     zh: { badge, title, items: [...] }
 *   }
 *
 * hilo 桌面端按用户 locale 取 items[0]; Pulse 跟随同约定: zh 优先, 缺则 fallback en.
 *
 * 配置: { type: 'hilo_changelog_manifest', urls: ['https://.../changelog.json', ...] }
 *
 * 行为:
 *   - urls 数组, 按顺序并发尝试, 第一个 200 + schemaVersion=1 + 含 items[] 的胜出
 *   - 胜出后**并发**拉同 baseUrl 下的 latest-mac.yml 取 zip URL 当 release_url
 *     (yml 失败不阻断, release_url 留空 — Bulk Upgrade 拿不到就 fallback openExternal)
 *   - changelog 拼成 markdown bullet list + heading, 给现有 AppInfo.changelogPreview 渲染
 *   - changelog_url 指向 manifest 本身 (用户能跳完整 JSON)
 *
 * ponytail: urls 并发用 Promise.any, 不等所有 url 返回 (坏 URL 等到 timeout 是浪费).
 */

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate } = require("./utils");
const { cleanVersion } = require("../utils/version-utils");

const DEFAULT_TIMEOUT = 4000;
const SUPPORTED_SCHEMA = 1;

class HiloChangelogManifestDetector extends Detector {
  static name = "hilo_changelog_manifest";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? DEFAULT_TIMEOUT });
    this.urls = Array.isArray(opts.urls) ? opts.urls.filter(Boolean) : [];
  }

  async detect(ctx) {
    const urls = this.urls.length > 0 ? this.urls : ctx.detCfg.urls || [];
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no urls configured",
      });
    }

    const timeout = ctx.timeout || this.timeout;
    const ctxLog = ctx.logger || console;

    // 1. 并发尝试所有 manifest URL, 第一个 valid 的胜出
    const probe = await firstValidManifest(urls, ctx.http, timeout, ctxLog);
    if (!probe) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `all ${urls.length} manifest url(s) failed schema check`,
      });
    }

    const { url: manifestUrl, manifest } = probe;
    const items = pickItems(manifest);
    if (!items || items.length === 0) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: truncate(JSON.stringify(manifest), 1024),
        note: "manifest has empty items[]",
      });
    }

    // 2. items[0] = 最新发布
    const head = items[0];
    const version = cleanVersion(head.version);
    if (!version) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: head,
        note: "items[0].version empty",
      });
    }

    const changelog = renderChangelog(head);
    const changelogUrl = manifestUrl;

    // 3. 并发拉 yml, 既取 release_url 也取 version (ymlsometimes 比 manifest 新)
    const baseUrl = manifestUrl.replace(/\/[^/]*$/, "");
    const yml = await fetchYml(baseUrl, ctx.http, timeout, ctxLog);
    const releaseUrl = yml ? extractZipUrl(yml, ctx.arch) : "";
    const ymlVersion = yml ? extractYmlVersion(yml) : "";

    // 若 yml 报告的版本比 manifest.items[0] 更新, 以 yml 为准 (manifest 漏更新常见)
    let finalVersion = version;
    let finalChangelog = changelog;
    if (ymlVersion && isGreater(ymlVersion, version)) {
      finalVersion = ymlVersion;
      finalChangelog = ""; // manifest 没这一版, changelog 留空避免误导
    }

    return new DetectorResult({
      version: finalVersion,
      raw: truncate(JSON.stringify(head), 1024),
      source: this.constructor.name,
      confidence: ymlVersion && isGreater(ymlVersion, version) ? "medium" : "high",
      note: ymlVersion && isGreater(ymlVersion, version)
        ? `hilo changelog+yml (manifest=${version}, yml=${ymlVersion})`
        : `hilo changelog (${new URL(manifestUrl).hostname})`,
      changelog: finalChangelog,
      changelog_url: changelogUrl,
      release_url: releaseUrl,
    });
  }
}

/**
 * 并发探所有 url, 返回第一个 valid manifest. 全部失败返 null.
 *
 * valid = HTTP 2xx + JSON.parse 成功 + schemaVersion === 1 + 含 zh.items[] 或 en.items[].
 *
 * ponytail: 一旦某个 url resolve 出 valid manifest, 立刻 return — 后台慢请求继续跑,
 * 结果被忽略, 不浪费 timeout 等待. Node 18+ 支持 Promise.any, 这里用它.
 */
async function firstValidManifest(urls, http, timeout, logger) {
  const errors = new Map(); // url → error string (给失败日志用)
  const probes = urls.map((url) =>
    probeOne(url, http, timeout).then(
      (manifest) => ({ url, manifest }),
      (err) => {
        errors.set(url, (err && err.message) || String(err));
        throw err;
      },
    ),
  );

  let winner = null;
  try {
    winner = await Promise.any(probes);
  } catch {
    // AggregateError: 所有 promise 都 reject
    if (logger && typeof logger.debug === "function") {
      for (const [url, err] of errors) {
        logger.debug(`hilo_changelog_manifest: ${url} → ${err}`);
      }
    }
    return null;
  }
  return winner;
}

async function probeOne(url, http, timeout) {
  const r = await http.get(url, {
    timeout,
    headers: { Accept: "application/json" },
  });
  if (!r || r.error) throw new Error(r && r.error ? r.error : "empty response");
  if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
  let data;
  try {
    data = JSON.parse(r.body);
  } catch (e) {
    throw new Error(`parse: ${e.message}`);
  }
  if (
    !data ||
    data.schemaVersion !== SUPPORTED_SCHEMA ||
    !hasItemsArray(data)
  ) {
    throw new Error("schema mismatch");
  }
  return data;
}

function hasItemsArray(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const zh = manifest.zh && Array.isArray(manifest.zh.items);
  const en = manifest.en && Array.isArray(manifest.en.items);
  return zh || en;
}

function pickItems(manifest) {
  if (
    manifest.zh &&
    Array.isArray(manifest.zh.items) &&
    manifest.zh.items.length > 0
  ) {
    return manifest.zh.items;
  }
  if (manifest.en && Array.isArray(manifest.en.items)) {
    return manifest.en.items;
  }
  return [];
}

/**
 * 把 items[0] 渲染成 markdown.
 *   - heading: ### v{version} — {date}
 *   - subtitle: 一行 italic
 *   - body: items[].map(line => `- ${line}`)
 */
function renderChangelog(entry) {
  if (!entry || typeof entry !== "object") return "";
  const out = [];
  const ver = entry.version || "";
  const date = entry.date || "";
  const subtitle = entry.subtitle || "";
  if (ver) out.push(`### v${ver}${date ? ` — ${date}` : ""}`);
  if (subtitle) out.push(`*${subtitle}*`);
  if (Array.isArray(entry.changelog) && entry.changelog.length > 0) {
    for (const line of entry.changelog) {
      if (typeof line === "string" && line.trim()) {
        out.push(`- ${line.trim()}`);
      }
    }
  }
  return out.join("\n\n").trim();
}

/**
 * 拉同 baseUrl 下的 latest-mac.yml, 找匹配 arch 的 zip URL.
 * 失败 → 返 '' (caller 不阻断主流程).
 *
 * ponytail: 已知 js-yaml 存在; 失败时 regex 兜底, 跟 electron-yml detector 同款.
 */
async function fetchYml(baseUrl, http, timeout, logger) {
  if (!baseUrl) return "";
  const ymlUrl = `${baseUrl.replace(/\/+$/, "")}/latest-mac.yml`;
  try {
    const r = await http.get(ymlUrl, { timeout });
    if (!r || r.error) return "";
    if (r.status >= 400) return "";
    return r.body || "";
  } catch (err) {
    if (logger && typeof logger.debug === "function") {
      logger.debug(
        `hilo_changelog_manifest: yml ${ymlUrl} → ${(err && err.message) || err}`,
      );
    }
    return "";
  }
}

function extractYmlVersion(ymlBody) {
  if (!ymlBody) return "";
  const m = ymlBody.match(/^version:\s*['"]?([^'"\s#]+)['"]?/m);
  return m ? m[1].trim() : "";
}

/**
 * a > b? 仅当 a 严格高于 b (semver 主体逐段). 解析失败 → false.
 */
function isGreater(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * 从 yml 文本找包含 arch (arm64 / x64) 的 file url.
 *   files:
 *     - url: MiniMax Hub-1.0.7-arm64-mac.zip
 *     - url: MiniMax Hub-1.0.7-mac.zip
 * 优先匹配 `${arch}-mac`, 缺则 fallback `mac` (x64 通用).
 */
/**
 * 从 yml 文本找包含 arch (arm64 / x64) 的 file url.
 *   files:
 *     - url: MiniMax Hub-1.0.7-arm64-mac.zip
 *     - url: MiniMax Hub-1.0.7-mac.zip
 * 优先匹配 `${arch}-mac`, 缺则 fallback `mac` (x64 通用).
 *
 * ponytail: 按行扫描而不是 [^\s]+ greedy — yml 里的 product 名可能含 `mac` 子串
 * (例如 `MiniMax`), greedy 会因回溯失败. 行级 scan 简单直接, 跟 detector chain
 * 其它 url-text parser 风格一致.
 */
function extractZipUrl(ymlBody, arch) {
  if (!ymlBody || typeof ymlBody !== "string") return "";
  const preferredSuffix = arch === "arm64" ? "arm64-mac" : "mac";
  const lines = ymlBody.split(/\r?\n/);
  let fallback = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("- url:")) continue;
    const url = line.slice("- url:".length).trim();
    if (!url.endsWith(".zip")) continue;
    if (url.includes(`-${preferredSuffix}.zip`)) return url;
    if (!fallback && url.endsWith("-mac.zip")) fallback = url;
  }
  return fallback;
}

module.exports = { HiloChangelogManifestDetector };
