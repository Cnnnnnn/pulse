/**
 * src/main/app-icon.js
 *
 * Phase 25: 读 macOS .app bundle 的真实图标, 转成 PNG dataUrl.
 *
 * 策略: 解析 .app/Contents/Info.plist 拿 CFBundleIconFile, 用 macOS `sips` CLI
 *   把 .icns 转 PNG buffer, 再 base64 成 dataUrl. 完全绕过 Electron nativeImage
 *   (arm64 + Electron 35 的 nativeImage.getFileIcon / createFromBuffer 都有 SIGTRAP).
 *
 * 之前踩的坑 (历程):
 *   - v1 nativeImage.createFromPath(bundlePath) 返 app 自己的 icon (错, 跟 .app path 解码无关)
 *   - v2 app.getFileIcon('large').resize().toDataURL() — SIGTRAP (NativeImage GC race)
 *   - v3 app.getFileIcon('normal').toDataURL() — Promise (在 main process 是 async) 上
 *     调 .toDataURL() 返 undefined, 然后 PNG 全部 1634 字节 placeholder (async bug)
 *   - v4 nativeImage.createFromPath(.icns) — Electron 不支持 .icns, 11 个都 image empty
 *   - v5 (现在): sips CLI 把 .icns 转 PNG buffer, 直接 base64
 *
 * 平台: 仅 macOS (依赖 sips).
 */

const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { mainLog } = require("./log.ts");

/**
 * Main 进程端 app-icon 缓存 + in-flight 去重.
 *
 * 历史问题 (Phase 25 之后): 启动期 renderer 13 个 AppRow 同时挂载 → 13 次并发
 * `get-app-icon` IPC → 13 次同步 sips spawnSync (每个 40-50ms) → 启动期卡 main
 * process event loop ~650ms. 加上 AppRow 在 pending→done 切换时再发一次, 实际
 * 2 × N = 26 次 ≈ 1.3s 完全在 main process 同步阻塞.
 *
 * 修法:
 *   1. _iconCache: bundlePath → base64 dataUrl. 命中直接返回, 0 spawnSync.
 *   2. _inflight: bundlePath → Promise. 并发请求复用同一个 in-flight Promise,
 *      防止 N 个 AppRow 同时挂载时把 sips 跑 N 遍.
 *
 * 两个 cache 都是模块级, 跨 IPC 共享, 跨 AppRow 共享, 进程生命周期内常驻.
 * 进程退出时自动 GC, 无需手动清理 (每次启动只 build 一次).
 *
 * 负缓存: 不缓存 "not found" / "sips 失败" / "bundle 缺", 因为:
 *   - 用户在安装新 app 后需要重新探测 → 负缓存会卡住
 *   - 失败可能是临时 (sips 临时不可用), 每次再试更安全
 *   - 失败率本来就很低 (sips 是 macOS 内置 CLI)
 */
const _iconCache = new Map();
const _inflight = new Map();

/**
 * @param {string} bundlePath  e.g. '/Applications/Cursor.app'
 * @param {object} [deps]       测试用 (fs / spawn / app / sipsPath)
 * @returns {Promise<string|null>}  base64 dataUrl 或 null
 */
async function getAppIcon(bundlePath, deps = {}) {
  // 0) 空路径快返 (cache 健壮性: 不缓存 null, 不入 in-flight)
  if (typeof bundlePath !== "string" || !bundlePath) {
    mainLog.warn("[app-icon] empty path");
    return null;
  }

  // 1) 命中正缓存 → 直接返, 0 spawnSync, 0 IPC roundtrip cost
  if (_iconCache.has(bundlePath)) {
    return _iconCache.get(bundlePath);
  }

  // 2) 已有 in-flight Promise → 复用, 防止 N 个并发 row 把 sips 跑 N 遍
  if (_inflight.has(bundlePath)) {
    return _inflight.get(bundlePath);
  }

  // 3) 没缓存也没 in-flight → 真正跑一次 sips, 结果写入 cache + in-flight
  const promise = _loadIconUncached(bundlePath, deps);
  _inflight.set(bundlePath, promise);
  try {
    const result = await promise;
    if (result) {
      // 只缓存成功结果 (正缓存), 失败不入 cache
      _iconCache.set(bundlePath, result);
    }
    return result;
  } finally {
    _inflight.delete(bundlePath);
  }
}

/**
 * 实际跑 sips 的内部函数 — 不查 cache, 不写 cache, 错误不抛.
 * 抽出来让 getAppIcon 专心管 cache + in-flight 协议.
 */
async function _loadIconUncached(bundlePath, deps) {
  const fsMod = deps.fs || fs;
  const _app = deps.app || app;
  const _spawn = deps.spawn || spawnSync;
  const _sipsPath = deps.sipsPath || "/usr/bin/sips";

  try {
    if (!fsMod.existsSync(bundlePath)) {
      mainLog.warn("[app-icon] bundle not exists", { path: bundlePath });
      return null;
    }
    const icnsPath = findIcnsPath(bundlePath, { fs: fsMod });
    if (!icnsPath) {
      mainLog.warn("[app-icon] no .icns found", { path: bundlePath });
      return null;
    }
    const pngBuf = convertIcnsToPngWithDeps(icnsPath, {
      fs: fsMod,
      spawn: _spawn,
      sipsPath: _sipsPath,
      app: _app,
    });
    if (!pngBuf) {
      mainLog.warn("[app-icon] sips returned null", {
        path: bundlePath,
        icnsPath,
      });
      return null;
    }
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    mainLog.info("[app-icon] ok", { path: bundlePath, len: dataUrl.length });
    return dataUrl;
  } catch (err) {
    mainLog.warn("[app-icon] error", {
      path: bundlePath,
      msg: err && err.message,
    });
    return null;
  }
}

/**
 * 清空 cache (test 用). 生产代码不需要 — 进程生命周期内 cache 一直有效.
 */
function _clearIconCache() {
  _iconCache.clear();
  _inflight.clear();
}

/**
 * 找 .icns 文件 (Info.plist 优先, Resources 兜底).
 */
function findIcnsPath(bundlePath, deps) {
  // 1. Info.plist
  const plistPath = path.join(bundlePath, "Contents", "Info.plist");
  try {
    if (deps.fs.existsSync(plistPath)) {
      const buf = deps.fs.readFileSync(plistPath, "utf-8");
      const m = buf.match(
        /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/,
      );
      if (m) {
        let name = m[1].trim();
        if (!name.toLowerCase().endsWith(".icns")) name += ".icns";
        const full = path.join(bundlePath, "Contents", "Resources", name);
        if (deps.fs.existsSync(full)) return full;
      }
    }
  } catch {
    /* noop */
  }
  // 2. Resources glob
  const resDir = path.join(bundlePath, "Contents", "Resources");
  try {
    if (deps.fs.existsSync(resDir)) {
      const entries = deps.fs.readdirSync(resDir);
      const icns = entries.find((f) => f.toLowerCase().endsWith(".icns"));
      if (icns) return path.join(resDir, icns);
    }
  } catch {
    /* noop */
  }
  return null;
}

/**
 * 用 sips 把 .icns 转 PNG buffer (可注入 spawn 走测试).
 */
function convertIcnsToPngWithDeps(icnsPath, deps) {
  try {
    const out = path.join(
      deps.app.getPath("temp"),
      `appicon-${process.pid}-${Date.now()}.png`,
    );
    const r = deps.spawn(
      deps.sipsPath,
      ["-s", "format", "png", "-z", "256", "256", icnsPath, "--out", out],
      { encoding: "utf-8", timeout: 5000 },
    );
    if (r.status !== 0) {
      mainLog.warn("[app-icon] sips failed", {
        icnsPath,
        stderr: (r.stderr || "").slice(0, 200),
      });
      return null;
    }
    const buf = deps.fs.readFileSync(out);
    try {
      deps.fs.unlinkSync(out);
    } catch {
      /* noop */
    }
    return buf;
  } catch (err) {
    mainLog.warn("[app-icon] sips error", { msg: err && err.message });
    return null;
  }
}

module.exports = { getAppIcon, findIcnsPath, _clearIconCache };
