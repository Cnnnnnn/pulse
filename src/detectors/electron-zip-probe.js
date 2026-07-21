/**
 * src/detectors/electron-zip-probe.js
 *
 * electron-builder CDN 兜底：当 latest-mac.yml 下线/404，但历史 zip 仍在时，
 * 通过 HEAD 探测 `{product}-{version}-{arch}.zip` 推断最新版本。
 *
 * 配置:
 *   {
 *     type: 'electron_zip_probe',
 *     baseUrl: 'https://filecdn.minimax.chat/public/minimax-agent-prod/release',
 *     product: 'MiniMax Code',
 *     arch_suffix: 'arm64-mac'   // 可选；默认 arm64→arm64-mac, x64→mac
 *     seed_version: '3.0.0'       // 可选；缺省从已安装 app 的 plist 读
 *     path_template: '{baseUrl}/{version}/macos-{arch}/{product}-{version}-mac-{arch}.zip'
 *       // 可选；默认扁平 {baseUrl}/{product}-{version}-{arch_suffix}.zip (MiniMax CDN)
 *   }
 */

const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const pExecFile = promisify(execFile);
const { appBundleResourcePath } = require("../utils/app-paths");

const { Detector, DetectorResult } = require("./base");
const { DetectorError, REASONS } = require("./errors");

const DEFAULT_MAX_PROBE = 20;

class electron_zip_probe extends Detector {
  static name = "electron_zip_probe";

  constructor(opts = {}) {
    super({ timeout: opts.timeout ?? 8000 });
    this.baseUrl = opts.baseUrl || "";
    this.product = opts.product || "";
    this.archSuffix = opts.arch_suffix || "";
    this.seedVersion = opts.seed_version || "";
    this.maxProbe =
      typeof opts.max_probe === "number" ? opts.max_probe : DEFAULT_MAX_PROBE;
    this.pathTemplate = opts.path_template || "";
  }

  async detect(ctx) {
    const baseUrl = (this.baseUrl || ctx.detCfg.baseUrl || "").replace(
      /\/+$/,
      "",
    );
    const product = this.product || ctx.detCfg.product || ctx.appCfg.name || "";
    if (!baseUrl) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no baseUrl configured",
      });
    }
    if (!product) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no product name configured",
      });
    }

    const archSuffix = this.archSuffix || defaultArchSuffix(ctx.arch);
    let seed =
      this.seedVersion ||
      (await readInstalledVersion(ctx.appCfg && ctx.appCfg.bundle));
    if (!seed) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: "no seed_version and cannot read installed plist",
      });
    }

    let parts = parseVersion(seed);
    if (!parts) {
      throw new DetectorError({
        detector: this.constructor.name,
        reason: REASONS.NO_VERSION,
        note: `invalid seed version: ${seed}`,
      });
    }

    // 若 seed 在 CDN 上不存在（例如本地比 CDN 新），向下找最近可用版本
    if (!(await this._exists(ctx, baseUrl, product, parts, archSuffix))) {
      let found = null;
      for (let i = 0; i < this.maxProbe; i++) {
        const prev = decrementPatch(parts);
        if (!prev) break;
        parts = prev;
        if (await this._exists(ctx, baseUrl, product, parts, archSuffix)) {
          found = parts;
          break;
        }
      }
      if (!found) {
        throw new DetectorError({
          detector: this.constructor.name,
          reason: REASONS.NO_VERSION,
          note: `no zip found near seed ${seed}`,
        });
      }
    }

    let latest = formatVersion(parts);
    for (let i = 0; i < this.maxProbe; i++) {
      const next = incrementPatch(parts);
      if (!next) break;
      if (!(await this._exists(ctx, baseUrl, product, next, archSuffix))) break;
      parts = next;
      latest = formatVersion(parts);
    }

    return new DetectorResult({
      version: latest,
      raw: { baseUrl, product, archSuffix, seed, latest },
      source: this.constructor.name,
      confidence: "medium",
      note: "zip probe (yml fallback)",
    });
  }

  async _exists(ctx, baseUrl, product, parts, archSuffix) {
    const url = buildZipUrl(
      baseUrl,
      product,
      formatVersion(parts),
      archSuffix,
      ctx.arch,
      this.pathTemplate,
    );
    const r = await ctx.http.head(url, {
      timeout: ctx.timeout || this.timeout,
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
    return r.status >= 200 && r.status < 300;
  }
}

function defaultArchSuffix(arch) {
  return arch === "arm64" ? "arm64-mac" : "mac";
}

function buildZipUrl(
  baseUrl,
  product,
  version,
  archSuffix,
  arch,
  pathTemplate,
) {
  if (pathTemplate) {
    const archSeg = arch === "x64" ? "x64" : "arm64";
    return pathTemplate
      .replace(/\{baseUrl\}/g, baseUrl.replace(/\/+$/, ""))
      .replace(/\{version\}/g, version)
      .replace(/\{product\}/g, product)
      .replace(/\{arch\}/g, archSeg);
  }
  const file = `${product}-${version}-${archSuffix}.zip`;
  return `${baseUrl}/${encodeURIComponent(file).replace(/%20/g, "%20")}`;
  // encodeURIComponent encodes space as %20 — matches MiniMax CDN layout
}

function parseVersion(v) {
  const m = String(v)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function formatVersion(parts) {
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function incrementPatch(parts) {
  if (!Array.isArray(parts) || parts.length !== 3) return null;
  return [parts[0], parts[1], parts[2] + 1];
}

function decrementPatch(parts) {
  if (!Array.isArray(parts) || parts.length !== 3 || parts[2] <= 0) return null;
  return [parts[0], parts[1], parts[2] - 1];
}

async function readInstalledVersion(bundle) {
  if (!bundle || typeof bundle !== "string") return null;
  const plistPath = appBundleResourcePath(bundle, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return null;
  try {
    const { stdout } = await pExecFile(
      "plutil",
      ["-convert", "xml1", "-o", "-", plistPath],
      { timeout: 3000 },
    );
    const m = stdout.match(
      /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
    );
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

module.exports = { electron_zip_probe };
