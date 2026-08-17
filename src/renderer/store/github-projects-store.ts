/**
 * src/renderer/store/github-projects-store.ts
 *
 * GitHub 优秀项目收录 — renderer 端状态 + localStorage 持久化。
 * 复用 sidenav-prefs 的 safeStorage 容错模式 (localStorage 不可用时内存兜底)。
 *
 * 2026-07-15 v2.80: 新增。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import { showToast } from "./toast-store.ts";
import {
  createDataState,
  rejectData,
  resolveData,
  type DataState,
} from "../../shared/data-state.ts";
import {
  createGithubReleaseChecker,
  type GithubCheckSummary,
} from "../github/github-release-checker.ts";
import * as githubSettings from "../github/github-settings-store.ts";
import { createGithubProjectRepository } from "../github/github-project-repository.ts";
import { createGithubReadmeService } from "../github/github-readme-service.ts";
import { createGithubBackupService } from "../github/github-backup-service.ts";
import { collectGithubTags as collectGithubTagsSelector } from "../github/github-library-selectors.ts";

/** 全部已收录项目 (按添加时间倒序)。 */
export const githubProjects = signal([]);
/** 全局忙碌态 (添加 / 解析中) — 控制顶部按钮 loading。 */
export const githubBusy = signal(false);
/** 当前正在操作的项目 id — 控制行的 loading 态。 */
export const githubBusyId = signal(null);
/** 最近一次错误 reason — 用于顶部提示。 */
export const githubError = signal(null);
/** 最近一次「检查更新」失败（瞬时，非 permanent）的项目 id 列表。
 *  供工具栏「重试失败项(N)」按钮消费，不依赖会消失的 toast。 */
export const lastFailedIds = signal([]);
export const githubCheckDataState = signal<DataState<GithubCheckSummary>>(
  createDataState({
    ok: true,
    newCount: 0,
    errorCount: 0,
    skippedCount: 0,
    failedProjects: [],
    skippedProjects: [],
  }),
);
// Settings module 的兼容 façade：旧调用方继续从 projects-store 导入。
export const githubDensity = githubSettings.githubDensity;
export const githubToken = githubSettings.githubToken;
export const githubAutoCheck = githubSettings.githubAutoCheck;
export const githubAutoCheckIntervalMin = githubSettings.githubAutoCheckIntervalMin;
export const githubNotifyOnNew = githubSettings.githubNotifyOnNew;

const githubProjectRepository = createGithubProjectRepository(() => {
  showToast(
    "本地存储已满，改动刷新后会丢失。建议导出备份后清理旧项目",
    "warn",
    8000,
  );
});

export function loadGithubProjects() {
  githubProjects.value = githubProjectRepository.load();
}

/**
 * 仅测试用：重置配额警告的 debounce 计时器。
 * 生产代码不要调用。测试间隔离用。
 */
export function __resetQuotaWarnForTest() {
  githubProjectRepository.resetQuotaWarning();
}

function persist() {
  return githubProjectRepository.save(githubProjects.value);
}

export function markGithubProjectViewed(id: string) {
  let changed = false;
  githubProjects.value = githubProjects.value.map((project: any) => {
    if (project.id !== id) return project;
    changed = true;
    return { ...project, lastViewedAt: Date.now() };
  });
  if (changed) persist();
}

export const loadGithubSettings = githubSettings.loadGithubSettings;
export const setGithubDensity = githubSettings.setGithubDensity;
export const setGithubToken = githubSettings.setGithubToken;
export const setGithubAutoCheck = githubSettings.setGithubAutoCheck;
export const setGithubAutoCheckInterval = githubSettings.setGithubAutoCheckInterval;
export const setGithubNotifyOnNew = githubSettings.setGithubNotifyOnNew;

const githubBackupService = createGithubBackupService({
  getProjects: () => githubProjects.value,
  mergeProjects: (incoming) => {
    const existingIds = new Set(githubProjects.value.map((project: any) => project.id));
    let imported = 0;
    let skipped = 0;
    const added: any[] = [];
    for (const project of incoming) {
      if (!project || typeof project.id !== "string") continue;
      if (existingIds.has(project.id)) {
        skipped += 1;
      } else {
        added.push(project);
        imported += 1;
      }
    }
    if (added.length > 0) githubProjects.value = [...added, ...githubProjects.value];
    return { imported, skipped };
  },
  getDensity: () => githubDensity.value,
  setDensity: setGithubDensity,
  getToken: () => githubToken.value,
  setToken: setGithubToken,
  persist,
});

function makeId(owner: any, repo: any) {
  return `${owner}/${repo}`.toLowerCase();
}

/** 把 star 数格式化为 1.2k / 3.4w 等紧凑形式。 */
export function formatStars(n: any) {
  const num = typeof n === "number" ? n : 0;
  if (num < 1000) return String(num);
  if (num < 10000) return `${(num / 1000).toFixed(1)}k`;
  if (num < 100000) return `${(num / 1000).toFixed(0)}k`;
  return `${(num / 10000).toFixed(1)}w`;
}

/** 把收录时间格式化为 MM-DD（如 07-16）。 */
export function formatAddedDate(ts: any) {
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
export function hostnameOf(url: any) {
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
export function hasDistinctHomepage(project: any) {
  if (!project || !project.homepage || !project.homepage.trim()) return false;
  if (project.url && project.homepage === project.url) return false;
  if (/^https?:\/\/github\.com\//i.test(project.homepage)) return false;
  return true;
}

/**
 * 从项目集合中收集去重的标签集合（合并 GitHub topics + AI 解析 tags）。
 * 纯函数，便于单测。返回按字母序排序的字符串数组。
 * - topics：仓库作者在 GitHub 上标注的（抓元数据时已存）
 * - aiParse.tags：AI 解析 README 时生成的关键词（可能为没填 topics 的仓库补充）
 * 合并两者覆盖更广：有 topics 用 topics，没 topics 但解析过的用 AI tags。
 */
export function collectGithubTags(projects: any[]): string[] {
  return collectGithubTagsSelector(projects);
}

/** 把时间戳格式化为「N 天前 / N 个月前」等人读相对时间。 */
export function formatRelativeTime(ts: any) {
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
export function githubReasonText(reason: any) {
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
export function hasGithubUpdate(p: any) {
  if (!p || !p.latestVersion) return false;
  return p.latestVersion !== p.lastSeenVersion;
}

const githubReleaseChecker = createGithubReleaseChecker({
  getProjects: () => githubProjects.value,
  updateProjects: (updater) => {
    githubProjects.value = updater(githubProjects.value);
  },
  getToken: () => githubToken.value,
  fetchRelease: (url, token) => api.githubFetchRelease(url, token),
  persist,
  setBusyId: (id) => {
    githubBusyId.value = id;
  },
  hasUpdate: hasGithubUpdate,
});

const githubReadmeService = createGithubReadmeService({
  getProject: (id) => githubProjects.value.find((project: any) => project.id === id),
  updateProject: (id, updater) => {
    githubProjects.value = githubProjects.value.map((project: any) =>
      project.id === id ? updater(project) : project,
    );
  },
  getToken: () => githubToken.value,
  fetchProject: (url, token) => api.githubFetch(url, token),
  parseReadme: (input) => api.aiParseReadme(input),
  persist,
  setBusyId: (id) => {
    githubBusyId.value = id;
  },
});

/**
 * 解析 GitHub 地址 (renderer 侧校验，给输入框即时反馈用)。
 * 支持 http(s) / git@ / 裸 slug。
 */
export function parseGithubUrl(input: any) {
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
export async function addGithubProject(input: any) {
  const parsed = parseGithubUrl(input);
  if (!parsed) return { ok: false, reason: "invalid_url" };
  const id = makeId(parsed.owner, parsed.repo);
  if (githubProjects.value.some((p: any) => p.id === id)) {
    return { ok: false, reason: "duplicate" };
  }
  githubBusy.value = true;
  githubError.value = null;
  try {
    const res = await api.githubFetch(input, githubToken.value);
    if (res.ok !== true) {
      const reason = res.reason || "fetch_failed";
      githubError.value = reason;
      return { ok: false, reason };
    }
    const meta = res.meta;
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

/**
 * 批量添加项目（textarea 多行粘贴用）。串行执行避免并发打爆 GitHub 限流。
 * @param {string[]} inputs 地址数组
 * @returns {Promise<{ok:boolean, added:number, duplicates:number, failed:Array<{input:string, reason:string}>}>}
 */
export async function addGithubProjectsBatch(inputs: any) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: true, added: 0, duplicates: 0, failed: [] };
  }
  let added = 0;
  let duplicates = 0;
  const failed: any[] = [];
  for (const input of inputs) {
    const r = await addGithubProject(input);
    if (r.ok) {
      added += 1;
    } else if (r.reason === "duplicate") {
      duplicates += 1;
    } else {
      failed.push({ input, reason: r.reason || "fetch_failed" });
    }
  }
  return { ok: true, added, duplicates, failed };
}

export function removeGithubProject(id: any) {
  githubProjects.value = githubProjects.value.filter((p: any) => p.id !== id);
  persist();
}

/**
 * 切换某项目的置顶状态（钉在列表顶部）。
 * 旧数据可能无 pinned 字段，按 falsy 处理，翻转后写入 true。
 * @param {string} id
 */
export function togglePinGithubProject(id: any) {
  githubProjects.value = githubProjects.value.map((x: any) =>
    x.id === id ? { ...x, pinned: !x.pinned } : x,
  );
  persist();
}

/**
 * 重新抓取某项目 README + 元数据。
 */
export function refreshGithubReadme(id: any) {
  return githubReadmeService.refreshReadme(id);
}

/**
 * AI 解析某项目 README。若 readme 为空先抓取；若已有结果直接复用。
 * @param {string} id
 * @param {boolean} [force] 强制重新解析
 * @returns {Promise<{ok:boolean, reason?:string, result?:object}>}
 */
export function parseGithubProjectAi(id: string, force = false) {
  return githubReadmeService.parseProjectAi(id, force);
}

/**
 * 抓取某项目最新 release 并写回数据模型。
 * 首次拉取（lastSeenVersion 为空）时把 lastSeenVersion 种子为 latestVersion，
 * 避免把「刚收录时的最新版」误报成「有更新」。
 * @param {string} id
 * @param {{silent?:boolean}} [opts] silent=true 时不显示行级 loading 态
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
export function fetchGithubRelease(id: any, opts: any = {}) {
  return githubReleaseChecker.fetchProjectRelease(id, opts);
}

/**
 * 标记某项目「已读」：把 lastSeenVersion 设为当前 latestVersion，
 * 消除「新版本」徽标（用户已通过徽标或更新 tab 内的按钮主动查看）。
 * @param {string} id
 */
export function markGithubSeen(id: any) {
  const p = githubProjects.value.find((x: any) => x.id === id);
  if (!p || !p.latestVersion) return;
  githubProjects.value = githubProjects.value.map((x: any) =>
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
  const next = githubProjects.value.map((x: any) => {
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
 *   不再每轮把整批拖成「失败」。瞬时失败 (限流/网络/5xx) 计入 errorCount，并记录到
 *   lastFailedIds 供「重试失败项」按钮消费。
 */
export async function checkGithubUpdates(opts: any = {}) {
  const { onProgress, onlyStale } = opts;
  let list = githubProjects.value;
  if (onlyStale) list = list.filter((p: any) => !p.releaseFetchedAt);
  try {
    githubBusy.value = true;
    const r = await githubReleaseChecker.checkProjects(list, onProgress);
    githubBusy.value = false;
    lastFailedIds.value = (r.failedProjects || []).map((f: any) => f.id);
    githubCheckDataState.value = resolveData(
      githubCheckDataState.value,
      r,
      { source: "live" },
    );
    return r;
  } catch (err) {
    githubBusy.value = false;
    githubCheckDataState.value = rejectData(githubCheckDataState.value, err);
    throw err;
  }
}

/**
 * 只重试上次「检查更新」失败的项目（lastFailedIds）。
 * 用于工具栏「重试失败项(N)」按钮 —— 不依赖会消失的 toast。
 * 重试后 lastFailedIds 更新为本次仍失败的 id（全部成功则清空）。
 */
export async function retryFailedGithubUpdates(opts: any = {}) {
  const { onProgress } = opts;
  const ids = lastFailedIds.value;
  if (!ids.length) {
    return { ok: true, newCount: 0, errorCount: 0, skippedCount: 0, failedProjects: [], skippedProjects: [] };
  }
  const idSet = new Set(ids);
  const list = githubProjects.value.filter((p: any) => idSet.has(p.id));
  try {
    githubBusy.value = true;
    const r = await githubReleaseChecker.checkProjects(list, onProgress);
    githubBusy.value = false;
    lastFailedIds.value = (r.failedProjects || []).map((f: any) => f.id);
    githubCheckDataState.value = resolveData(
      githubCheckDataState.value,
      r,
      { source: "live" },
    );
    return r;
  } catch (err) {
    githubBusy.value = false;
    githubCheckDataState.value = rejectData(githubCheckDataState.value, err);
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 数据导出 / 导入（纯 renderer，不走主进程）
//
// 收录库全在 localStorage，换电脑/清缓存/配额撞墙 = 全丢。导出/导入让数据可
// 备份可迁移。导出走 Blob 下载，导入走 file input，数据不经过主进程文件系统。
// ──────────────────────────────────────────────────────────────────────────

export const exportGithubData = githubBackupService.exportData;
export const importGithubData = githubBackupService.importData;
export const downloadGithubBackup = githubBackupService.downloadBackup;
export const pickGithubBackupFile = githubBackupService.pickBackupFile;
