/**
 * src/renderer/store/github-projects-store.js
 *
 * GitHub 优秀项目收录 — renderer 端状态 + localStorage 持久化。
 * 复用 sidenav-prefs 的 safeStorage 容错模式 (localStorage 不可用时内存兜底)。
 *
 * 2026-07-15 v2.80: 新增。
 */

import { signal } from "@preact/signals";
import { api } from "../api.js";
import { showToast } from "./toast-store.js";

const STORAGE_KEY = "pulse.github.projects.v1";

/** 全部已收录项目 (按添加时间倒序)。 */
export const githubProjects = signal([]);
/** 全局忙碌态 (添加 / 解析中) — 控制顶部按钮 loading。 */
export const githubBusy = signal(false);
/** 当前正在操作的项目 id — 控制行的 loading 态。 */
export const githubBusyId = signal(null);
/** 最近一次错误 reason — 用于顶部提示。 */
export const githubError = signal(null);
/** 视图密度偏好（comfortable | compact）— 控制更新时间线默认展开条数与间距。 */
export const githubDensity = signal("comfortable");
/** GitHub Personal Access Token（仅本机 localStorage，不发往任何服务器）。用于解除未登录 60 次/小时限流。 */
export const githubToken = signal("");

const _mem = new Map();

function readStore() {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * 写入持久层。返回 true=落盘成功；false=localStorage 可用但写入失败（配额超限等）。
 * localStorage 完全不可用时走 _mem 内存兜底，算「兜底成功」返回 true
 * （因为本来就没有持久层可言，不应误报配额错误）。
 */
function writeStore(raw) {
  if (typeof globalThis.localStorage === "undefined") {
    _mem.set(STORAGE_KEY, raw);
    return true;
  }
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, raw);
    return true;
  } catch (err) {
    // 配额超限等：内存兜底保证当次会话可见，但必须让上层知道没真正落盘
    _mem.set(STORAGE_KEY, raw);
    console.warn("[github] localStorage.setItem failed:", err && err.message);
    return false;
  }
}

export function loadGithubProjects() {
  const raw = readStore() ?? _mem.get(STORAGE_KEY) ?? null;
  if (!raw) {
    githubProjects.value = [];
    return;
  }
  try {
    const arr = JSON.parse(raw);
    githubProjects.value = Array.isArray(arr) ? arr : [];
  } catch {
    githubProjects.value = [];
  }
}

/**
 * 写回项目数组到 localStorage。返回 true 表示落盘成功，false 表示失败（配额超限等）。
 *
 * 不抛异常（保留「不阻断 UI」原则），但调用方可据返回值决定是否提示用户。
 * 配额超限是真实风险：README 原文 + 5 条 release body 全塞 localStorage，
 * 几十个项目就可能撞 5-10MB 上限。此时必须告知用户，而不是静默吞掉让数据消失。
 */
let _lastQuotaWarnTs = 0;
function warnQuotaOnce() {
  const now = Date.now();
  // 60 秒内只 warn 一次，避免批量检查更新时连续弹一堆 toast
  if (now - _lastQuotaWarnTs < 60000) return;
  _lastQuotaWarnTs = now;
  showToast(
    "本地存储已满，改动刷新后会丢失。建议导出备份后清理旧项目",
    "warn",
    8000,
  );
}

/**
 * 仅测试用：重置配额警告的 debounce 计时器。
 * 生产代码不要调用。测试间隔离用。
 */
export function __resetQuotaWarnForTest() {
  _lastQuotaWarnTs = 0;
}

function persist() {
  const ok = writeStore(JSON.stringify(githubProjects.value));
  if (!ok) {
    // 配额超限等：不阻断 UI，但必须告知用户
    warnQuotaOnce();
  }
  return ok;
}

const SETTINGS_KEY = "pulse.github.settings.v1";

function readSettings() {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

function writeSettings(raw) {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      _mem.set(SETTINGS_KEY, raw);
      return;
    }
    globalThis.localStorage.setItem(SETTINGS_KEY, raw);
  } catch {
    _mem.set(SETTINGS_KEY, raw);
  }
}

/**
 * 读取持久化的模块设置（density + token）。损坏数据忽略，回退默认。
 */
export function loadGithubSettings() {
  const raw = readSettings() ?? _mem.get(SETTINGS_KEY) ?? null;
  if (!raw) return;
  try {
    const o = JSON.parse(raw);
    if (o && (o.density === "compact" || o.density === "comfortable")) {
      githubDensity.value = o.density;
    }
    if (o && typeof o.token === "string") {
      githubToken.value = o.token;
    }
  } catch {
    /* 损坏数据忽略 */
  }
}

/** 把 density + token 一起写回，避免任一设置覆盖另一设置。 */
function persistSettings() {
  try {
    writeSettings(
      JSON.stringify({
        density: githubDensity.value,
        token: githubToken.value,
      }),
    );
  } catch {
    /* 配额超限等忽略 */
  }
}

/**
 * 设置并更新持久化视图密度。
 * @param {"comfortable"|"compact"} d
 */
export function setGithubDensity(d) {
  if (d !== "compact" && d !== "comfortable") return;
  githubDensity.value = d;
  persistSettings();
}

/**
 * 设置并更新持久化 GitHub Token（空串 = 清除）。
 * @param {string} t
 */
export function setGithubToken(t) {
  githubToken.value = typeof t === "string" ? t.trim() : "";
  persistSettings();
}

function makeId(owner, repo) {
  return `${owner}/${repo}`.toLowerCase();
}

/** 把 star 数格式化为 1.2k / 3.4w 等紧凑形式。 */
export function formatStars(n) {
  const num = typeof n === "number" ? n : 0;
  if (num < 1000) return String(num);
  if (num < 10000) return `${(num / 1000).toFixed(1)}k`;
  if (num < 100000) return `${(num / 1000).toFixed(0)}k`;
  return `${(num / 10000).toFixed(1)}w`;
}

/** 把收录时间格式化为 MM-DD（如 07-16）。 */
export function formatAddedDate(ts) {
  const d = typeof ts === "number" && ts > 0 ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

/**
 * 从 homepage URL 提取显示用的域名（去掉 www. 前缀）。解析失败原样返回。
 * 仅用于 chip 文案展示，不影响点击跳转（点击用原始 URL）。
 */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * 判断 homepage 是否值得展示：非空，且不等于仓库自身 GitHub 地址（避免冗余）。
 * 形如 https://github.com/owner/repo 的 homepage 也视为冗余。
 */
export function hasDistinctHomepage(project) {
  if (!project || !project.homepage || !project.homepage.trim()) return false;
  if (project.url && project.homepage === project.url) return false;
  if (/^https?:\/\/github\.com\//i.test(project.homepage)) return false;
  return true;
}

/** 把时间戳格式化为「N 天前 / N 个月前」等人读相对时间。 */
export function formatRelativeTime(ts) {
  const d = typeof ts === "number" && ts > 0 ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} 个月前`;
  const yr = Math.floor(day / 365);
  return `${yr} 年前`;
}

/** 把错误 reason 映射成中文提示。 */
export function githubReasonText(reason) {
  switch (reason) {
    case "invalid_url":
      return "地址无法识别为 GitHub 仓库";
    case "invalid_input":
      return "输入为空";
    case "duplicate":
      return "该项目已收录";
    case "not_found":
      return "仓库不存在或地址错误";
    case "auth_invalid":
      return "GitHub Token 无效或已失效，请在设置 → GitHub 中重新生成";
    case "rate_limited":
      return "GitHub API 频率受限（未登录 60 次/小时），请稍后再试";
    case "network_error":
      return "网络连接失败，请检查网络";
    case "timeout":
      return "请求超时，请稍后重试";
    case "parse_error":
      return "返回数据解析失败";
    case "server_error":
      return "GitHub 服务暂时异常，请稍后重试";
    case "no_readme":
      return "该项目没有可用的 README 内容";
    case "api_key_missing":
    case "unsupported_provider":
    case "model_missing":
    case "config_missing":
      return "AI 未配置：请在设置中填写 API Key 与模型";
    case "budget_exceeded":
      return "AI 今日 token 预算已用尽";
    case "llm_failed":
      return "AI 请求失败，请检查网络与配置";
    case "parse_failed":
      return "AI 返回结果无法解析";
    default:
      return "操作失败，请重试";
  }
}

/**
 * 派生：该项目是否有「未读的新版本」。
 * 首次收录时 lastSeenVersion 被种子为 latestVersion，故不会误报。
 * @param {object} p
 * @returns {boolean}
 */
export function hasGithubUpdate(p) {
  if (!p || !p.latestVersion) return false;
  return p.latestVersion !== p.lastSeenVersion;
}

/**
 * 解析 GitHub 地址 (renderer 侧校验，给输入框即时反馈用)。
 * 支持 http(s) / git@ / 裸 slug。
 */
export function parseGithubUrl(input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const bare = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (bare) return { owner: bare[1], repo: bare[2] };
  try {
    let url = s;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const u = new URL(url);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * 添加项目：校验地址 → 主进程抓取元数据 + README → 入库 (去重)。
 * @param {string} input
 * @returns {Promise<{ok:boolean, reason?:string, project?:object}>}
 */
export async function addGithubProject(input) {
  const parsed = parseGithubUrl(input);
  if (!parsed) return { ok: false, reason: "invalid_url" };
  const id = makeId(parsed.owner, parsed.repo);
  if (githubProjects.value.some((p) => p.id === id)) {
    return { ok: false, reason: "duplicate" };
  }
  githubBusy.value = true;
  githubError.value = null;
  try {
    const res = await api.githubFetch(input, githubToken.value);
    if (!res || !res.ok) {
      const reason = (res && res.reason) || "fetch_failed";
      githubError.value = reason;
      return { ok: false, reason };
    }
    const meta = res.meta || {};
    const proj = {
      id,
      owner: res.owner,
      repo: res.repo,
      name: meta.name || `${res.owner}/${res.repo}`,
      url: meta.htmlUrl || `https://github.com/${res.owner}/${res.repo}`,
      description: meta.description || "",
      homepage: meta.homepage || "",
      language: meta.language || "",
      stars: meta.stars || 0,
      license: meta.license || "",
      topics: Array.isArray(meta.topics) ? meta.topics : [],
      addedAt: Date.now(),
      pinned: false,
      readme: res.readme || "",
      readmeFetchedAt: res.readme ? Date.now() : 0,
      aiParse: null,
      aiParsedAt: 0,
      // Release 更新追踪：初值空，下面静默拉一次填充（首次收录即 lastSeen=latest，不误报）
      latestVersion: "",
      latestVersionPublishedAt: 0,
      lastSeenVersion: "",
      releases: [],
      releaseFetchedAt: 0,
    };
    githubProjects.value = [proj, ...githubProjects.value];
    const persisted = persist();
    // 静默抓取 release（失败不影响收录成功），填充版本字段
    fetchGithubRelease(id, { silent: true }).catch(() => {});
    // 仅在落盘失败时才带 persistFailed 标志，避免成功时多一个 falsy 字段
    return persisted
      ? { ok: true, project: proj }
      : { ok: true, project: proj, persistFailed: true };
  } finally {
    githubBusy.value = false;
  }
}

export function removeGithubProject(id) {
  githubProjects.value = githubProjects.value.filter((p) => p.id !== id);
  persist();
}

/**
 * 切换某项目的置顶状态（钉在列表顶部）。
 * 旧数据可能无 pinned 字段，按 falsy 处理，翻转后写入 true。
 * @param {string} id
 */
export function togglePinGithubProject(id) {
  githubProjects.value = githubProjects.value.map((x) =>
    x.id === id ? { ...x, pinned: !x.pinned } : x,
  );
  persist();
}

/**
 * 重新抓取某项目 README + 元数据。
 */
export async function refreshGithubReadme(id) {
  const p = githubProjects.value.find((x) => x.id === id);
  if (!p) return { ok: false, reason: "not_found" };
  githubBusyId.value = id;
  try {
    const res = await api.githubFetch(
      `https://github.com/${p.owner}/${p.repo}`,
      githubToken.value,
    );
    if (!res || !res.ok) {
      return { ok: false, reason: (res && res.reason) || "fetch_failed" };
    }
    githubProjects.value = githubProjects.value.map((x) =>
      x.id === id
        ? {
            ...x,
            readme: res.readme || x.readme,
            readmeFetchedAt: res.readme ? Date.now() : x.readmeFetchedAt,
            description: res.meta?.description || x.description,
            stars: res.meta?.stars || x.stars,
            language: res.meta?.language || x.language,
            homepage: res.meta?.homepage || x.homepage,
          }
        : x,
    );
    persist();
    return { ok: true };
  } finally {
    githubBusyId.value = null;
  }
}

/**
 * AI 解析某项目 README。若 readme 为空先抓取；若已有结果直接复用。
 * @param {string} id
 * @param {boolean} [force] 强制重新解析
 * @returns {Promise<{ok:boolean, reason?:string, result?:object}>}
 */
export async function parseGithubProjectAi(id, force = false) {
  const p = githubProjects.value.find((x) => x.id === id);
  if (!p) return { ok: false, reason: "not_found" };
  if (!force && p.aiParse) {
    return { ok: true, result: p.aiParse, cached: true };
  }
  let readme = p.readme;
  if (!readme || !readme.trim()) {
    const fr = await refreshGithubReadme(id);
    if (!fr.ok) return fr;
    readme = githubProjects.value.find((x) => x.id === id)?.readme || "";
  }
  if (!readme || !readme.trim()) {
    return { ok: false, reason: "no_readme" };
  }
  githubBusyId.value = id;
  try {
    const res = await api.aiParseReadme({
      projectName: p.name,
      description: p.description,
      readme,
    });
    if (!res || !res.ok) {
      return { ok: false, reason: (res && res.reason) || "ai_failed" };
    }
    githubProjects.value = githubProjects.value.map((x) =>
      x.id === id ? { ...x, aiParse: res.result, aiParsedAt: Date.now() } : x,
    );
    persist();
    return { ok: true, result: res.result };
  } finally {
    githubBusyId.value = null;
  }
}

/**
 * 抓取某项目最新 release 并写回数据模型。
 * 首次拉取（lastSeenVersion 为空）时把 lastSeenVersion 种子为 latestVersion，
 * 避免把「刚收录时的最新版」误报成「有更新」。
 * @param {string} id
 * @param {{silent?:boolean}} [opts] silent=true 时不显示行级 loading 态
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export async function fetchGithubRelease(id, opts = {}) {
  const silent = !!opts.silent;
  const p = githubProjects.value.find((x) => x.id === id);
  if (!p) return { ok: false, reason: "not_found" };
  if (!silent) githubBusyId.value = id;
  try {
    const res = await api.githubFetchRelease(
      `https://github.com/${p.owner}/${p.repo}`,
      githubToken.value,
    );
    if (!res || !res.ok) {
      // 透出主进程附加的元信息，让上层 toast 能显示「剩余 N 次 / 约 X 分钟后重置」
      // 以及区分永久失败 (permanent) 与瞬时失败。
      // IPC 层 safeHandle 把任何异常包成 {reason:"threw", error: msg}，
      // 这种未预期错误没有 reason 映射，必须把原始 error 透出为 detail，
      // 否则用户只看到笼统的「操作失败，请重试」无从排查。
      return {
        ok: false,
        reason: (res && res.reason) || "fetch_failed",
        retryAfter: res && res.retryAfter,
        rateLimitRemaining: res && res.rateLimitRemaining,
        permanent: !!(res && res.permanent),
        detail: res && res.error ? String(res.error) : (res && res.detail) || "",
      };
    }
    const rel = res.release || {};
    const releases = Array.isArray(res.releases) ? res.releases : [];
    githubProjects.value = githubProjects.value.map((x) =>
      x.id === id
        ? {
            ...x,
            latestVersion: rel.version || x.latestVersion || "",
            latestVersionPublishedAt: rel.publishedAt || 0,
            releases,
            releaseFetchedAt: Date.now(),
            lastSeenVersion:
              x.lastSeenVersion === "" || x.lastSeenVersion == null
                ? rel.version || x.latestVersion || ""
                : x.lastSeenVersion,
          }
        : x,
    );
    persist();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: err && (err.message || err.toString()),
    };
  } finally {
    if (!silent) githubBusyId.value = null;
  }
}

/**
 * 标记某项目「已读」：把 lastSeenVersion 设为当前 latestVersion，
 * 消除「新版本」徽标（用户已通过徽标或更新 tab 内的按钮主动查看）。
 * @param {string} id
 */
export function markGithubSeen(id) {
  const p = githubProjects.value.find((x) => x.id === id);
  if (!p || !p.latestVersion) return;
  githubProjects.value = githubProjects.value.map((x) =>
    x.id === id ? { ...x, lastSeenVersion: x.latestVersion } : x,
  );
  persist();
}

/**
 * 批量标记所有「有更新」的项目为已读（把 lastSeenVersion 设为当前 latestVersion）。
 * @returns {number} 实际标记的项目数（用于 toast 文案）
 */
export function markGithubAllSeen() {
  let count = 0;
  const next = githubProjects.value.map((x) => {
    if (x.latestVersion && x.latestVersion !== x.lastSeenVersion) {
      count += 1;
      return { ...x, lastSeenVersion: x.latestVersion };
    }
    return x;
  });
  if (count > 0) {
    githubProjects.value = next;
    persist();
  }
  return count;
}

/**
 * 批量检查所有项目的更新。
 * @param {{onProgress?:(done:number,total:number)=>void, onlyStale?:boolean}} [opts]
 *   onProgress 用于 UI 进度（检查中 N/M）；onlyStale 仅检查从未拉过 release 的项目。
 * @returns {Promise<{ok:boolean, newCount:number, errorCount:number, skippedCount:number,
 *   failedProjects:Array<{id:string,name:string,reason:string,detail?:string,retryAfter?:number,rateLimitRemaining?:number}>,
 *   skippedProjects:Array<{id:string,name:string,reason:string}>}>}
 *
 *   permanent 失败 (404 仓库不存在/已删除/私有) 归到 skippedProjects/skippedCount，
 *   不再每轮把整批拖成「失败」。瞬时失败 (限流/网络/5xx) 计入 errorCount。
 */
export async function checkGithubUpdates(opts = {}) {
  const { onProgress, onlyStale } = opts;
  let list = githubProjects.value;
  if (onlyStale) list = list.filter((p) => !p.releaseFetchedAt);
  if (list.length === 0) {
    return { ok: true, newCount: 0, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] };
  }
  githubBusy.value = true;
  let newCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const failedProjects = [];
  const skippedProjects = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (onProgress) onProgress(i + 1, list.length);
      const r = await fetchGithubRelease(p.id, { silent: true });
      if (!r.ok) {
        // 永久失败：仓库不存在/已删除/私有 → 单独归档，不拖累整批 toast
        if (r.permanent) {
          skippedCount += 1;
          skippedProjects.push({
            id: p.id,
            name: p.name || p.id,
            reason: r.reason || "not_found",
          });
        } else {
          errorCount += 1;
          failedProjects.push({
            id: p.id,
            name: p.name || p.id,
            reason: r.reason || "fetch_failed",
            detail: r.detail || "",
            retryAfter: r.retryAfter,
            rateLimitRemaining: r.rateLimitRemaining,
          });
        }
        continue;
      }
      const updated = githubProjects.value.find((x) => x.id === p.id);
      if (updated && hasGithubUpdate(updated)) newCount += 1;
    }
    return { ok: true, newCount, errorCount, skippedCount, failedProjects, skippedProjects };
  } finally {
    githubBusy.value = false;
  }
}
