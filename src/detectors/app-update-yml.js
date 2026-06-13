/**
 * src/detectors/app-update-yml.js
 *
 * 从已安装 app 的 Contents/Resources/app-update.yml 推断在线版本。
 * 支持两种 provider：
 *   - generic  → 把 yml 里 url 替换成 latest-mac.yml / latest.yml，丢给 electron-yml
 *   - github   → api.github.com/repos/{owner}/{repo}/releases/latest
 *
 * 配置: { type: 'app_update_yml' }  (从 appCfg.bundle 读文件)
 */

const fs = require("fs");
const path = require("path");
const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");
const { truncate } = require("./utils");

let yamlLib = null;
try {
  yamlLib = require("js-yaml");
} catch {
  /* fallback to regex */
}

class AppUpdateYmlDetector extends Detector {
  static name = "app_update_yml";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
  }

  async detect(ctx) {
    const bundle = ctx.appCfg && ctx.appCfg.bundle;
    if (!bundle) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no bundle in appCfg",
      });
    }

    const ymlPath = `/Applications/${bundle}/Contents/Resources/app-update.yml`;
    let ymlData;
    try {
      const raw = fs.readFileSync(ymlPath, "utf-8");
      ymlData = yamlLib ? yamlLib.load(raw) : parseYmlFallback(raw);
    } catch (e) {
      // 文件不存在 / 权限不足 → 视为本机未装或不是 electron-builder 出品
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `cannot read ${ymlPath}: ${e.code || e.message}`,
      });
    }

    if (!ymlData || typeof ymlData !== "object") {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        raw: ymlData,
        note: "empty yml",
      });
    }

    const provider = String(ymlData.provider || "").toLowerCase();
    const ymlUrl = ymlData.url || "";

    if (provider === "generic" && ymlUrl) {
      // 把 .../foo.exe 替换成 .../latest-mac.yml
      const candidates = [
        ymlUrl.replace(/\/[^/]+$/, "/latest-mac.yml"),
        ymlUrl.replace(/\/[^/]+$/, "/latest.yml"),
      ];
      for (const c of candidates) {
        const r = await ctx.http.get(c, {
          timeout: ctx.timeout || this.timeout,
        });
        if (r.error === "timeout" || r.error === "network") continue;
        if (r.status >= 400) continue;
        let ver = null;
        if (yamlLib) {
          try {
            const d = yamlLib.load(r.body);
            ver = d && (d.version || (d[0] && d[0].version));
          } catch {
            /* try next */
          }
        }
        if (!ver) {
          const m = r.body && r.body.match(/version:\s*['"]?([^'"\n]+)['"]?/);
          if (m) ver = m[1].trim();
        }
        if (ver) {
          return new DetectorResult({
            version: ver,
            raw: { ymlPath, ymlUrl, candidate: c },
            source: this.constructor.name,
            confidence: "high",
            note: "app-update(generic)",
          });
        }
      }
    }

    if (provider === "github" && ymlData.owner && ymlData.repo) {
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(ymlData.owner)}/${encodeURIComponent(ymlData.repo)}/releases/latest`;
      const r = await ctx.http.get(apiUrl, {
        timeout: ctx.timeout || this.timeout,
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (r.error === "timeout") {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.TIMEOUT,
          note: apiUrl,
        });
      }
      if (r.error === "network") {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.NETWORK,
          note: apiUrl,
        });
      }
      if (r.status >= 400 && r.status < 500) {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.HTTP_4XX,
          httpStatus: r.status,
          raw: truncate(r.body),
          note: apiUrl,
        });
      }
      if (r.status >= 500) {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.HTTP_5XX,
          httpStatus: r.status,
          raw: truncate(r.body),
          note: apiUrl,
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
      const tag = data && data.tag_name;
      if (tag) {
        const m = String(tag).match(/(\d+\.\d+(?:\.\d+)*)/);
        if (m) {
          return new DetectorResult({
            version: m[1],
            raw: data,
            source: this.constructor.name,
            confidence: "high",
            note: "app-update(github)",
          });
        }
      }
    }

    throw new DetectorError({
      detector: this.constructor.name,
      reason: REASONS.NO_VERSION,
      raw: ymlData,
      note: `unsupported provider='${provider}'`,
    });
  }
}

function parseYmlFallback(raw) {
  const urlMatch = raw.match(/url:\s*(.+)/);
  const providerMatch = raw.match(/provider:\s*(.+)/);
  const ownerMatch = raw.match(/owner:\s*(.+)/);
  const repoMatch = raw.match(/repo:\s*(.+)/);
  return {
    url: urlMatch ? urlMatch[1].trim() : null,
    provider: providerMatch ? providerMatch[1].trim() : null,
    owner: ownerMatch ? ownerMatch[1].trim() : null,
    repo: repoMatch ? repoMatch[1].trim() : null,
  };
}

module.exports = { AppUpdateYmlDetector };
