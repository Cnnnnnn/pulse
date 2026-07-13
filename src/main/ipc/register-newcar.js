/**
 * src/main/ipc/register-newcar.js
 *
 * 「新车发布」手动刷新远程真源 (CJS, 主进程边界).
 *
 * 通过 ctx.safeHandle 注册单一 channel:
 *   newcar:refresh — 主进程拉取远程真源 → shape 校验 + 内联 normalize → RefreshResult
 *
 * CJS/ESM 红线: 主进程 (CommonJS) 不得 require 渲染层 ESM 的 src/newcar/*.js,
 * 因此远程清洗在主进程内联完成 (normalizeReleases), 合并纯函数放 ESM
 * src/newcar/merge.js 仅由渲染层/测试调用.
 *
 * 任何意外异常都兜底为 { ok:false, reason:'threw' }, 绝不崩主进程.
 */

const { HttpClient } = require("../http-client.js");
const { mainLog } = require("../log");

// 真实数据源 (已托管, 可匿名拉取). P2-2 前不支持 config 覆盖地址.
const DEFAULT_NEWCAR_REMOTE_URL =
  "https://gist.githubusercontent.com/Cnnnnnn/7fb25c169e4577511fbf5c76bdd9a919/raw/newcar-2026.json";

const REMOTE_TIMEOUT_MS = 10000;

/**
 * releaseDate 是否合法: 格式 YYYY-MM-DD 且为真实日历日期.
 * 与 src/newcar/merge.js 的 isValidReleaseDate 同口径 (含真实日期校验,
 * 2026-13-01 这类月=13 的非法日历会被丢弃), 主进程内联避免 require 渲染层 ESM.
 * @param {*} s
 * @returns {boolean}
 */
function isValidReleaseDate(s) {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/**
 * 等价于 src/newcar/dataset.js 的 normalize 的最小实现 (校验 id + releaseDate 真实日期).
 * 主进程内联, 避免 require 渲染层 ESM 模块.
 * @param {Array} list
 * @returns {Array} 已清洗的 ReleaseRecord[]
 */
function normalizeReleases(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r) =>
      r &&
      typeof r.id === "string" &&
      r.id &&
      isValidReleaseDate(r.releaseDate),
  );
}

/**
 * 拉取远程真源并清洗为 RefreshResult.
 * 整个流程用 try/catch 兜底任意意外 → { ok:false, reason:'threw' }.
 * @returns {Promise<object>} RefreshResult
 */
async function handleNewcarRefresh() {
  try {
    const URL = DEFAULT_NEWCAR_REMOTE_URL;
    if (!URL) {
      return { ok: false, reason: "no_url" };
    }

    let result;
    try {
      const http = new HttpClient({
        timeout: REMOTE_TIMEOUT_MS,
        maxRetries: 1,
      });
      result = await http.get(URL, {
        follow: true,
        timeout: REMOTE_TIMEOUT_MS,
      });
    } catch (err) {
      // HttpClient 内部不应抛, 这里仅作最后兜底
      mainLog.warn(`[ipc] newcar:refresh http threw: ${err && err.message}`);
      return { ok: false, reason: "network" };
    }

    // 传输层错误: network/timeout 直用; too_large 归 parse_failed
    if (result.error) {
      if (result.error === "too_large") {
        return { ok: false, reason: "parse_failed" };
      }
      return { ok: false, reason: result.error };
    }

    // 非 2xx → 归 network
    if (
      typeof result.status !== "number" ||
      result.status < 200 ||
      result.status >= 300
    ) {
      return { ok: false, reason: "network" };
    }

    // body 解析
    let parsed;
    try {
      parsed = JSON.parse(result.body || "null");
    } catch (e) {
      return { ok: false, reason: "parse_failed" };
    }
    if (!parsed || !Array.isArray(parsed.releases)) {
      return { ok: false, reason: "parse_failed" };
    }

    const releases = normalizeReleases(parsed.releases);
    return {
      ok: true,
      releases,
      source: URL,
      fetchedAt: Date.now(),
    };
  } catch (err) {
    mainLog.warn(`[ipc] newcar:refresh threw: ${err && err.message}`);
    return { ok: false, reason: "threw" };
  }
}

/**
 * 注册 newcar IPC handlers (紧随 wechatHot 之后接线, 风格一致).
 * @param {object} ctx — createIpcContext 返回的共享上下文
 */
function registerNewCarHandlers(ctx) {
  const { safeHandle } = ctx;
  if (typeof safeHandle !== "function") return;

  // safeHandle 内部已 try/catch 兜底为 { ok:false, reason:'threw' };
  // handleNewcarRefresh 自身也有 try/catch, 双保险, 绝不崩主进程.
  safeHandle("newcar:refresh", handleNewcarRefresh);
}

module.exports = {
  registerNewCarHandlers,
  DEFAULT_NEWCAR_REMOTE_URL,
  normalizeReleases,
};
