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

const STORAGE_KEY = "pulse.github.projects.v1";

/** 全部已收录项目 (按添加时间倒序)。 */
export const githubProjects = signal([]);
/** 全局忙碌态 (添加 / 解析中) — 控制顶部按钮 loading。 */
export const githubBusy = signal(false);
/** 当前正在操作的项目 id — 控制行的 loading 态。 */
export const githubBusyId = signal(null);
/** 最近一次错误 reason — 用于顶部提示。 */
export const githubError = signal(null);

const _mem = new Map();

function readStore() {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStore(raw) {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      _mem.set(STORAGE_KEY, raw);
      return;
    }
    globalThis.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    _mem.set(STORAGE_KEY, raw);
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

function persist() {
  try {
    writeStore(JSON.stringify(githubProjects.value));
  } catch {
    /* 配额超限等忽略，不阻断 UI */
  }
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
    case "rate_limited":
      return "GitHub API 频率受限（未登录 60 次/小时），请稍后再试";
    case "parse_error":
      return "返回数据解析失败";
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
    const res = await api.githubFetch(input);
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
      readme: res.readme || "",
      readmeFetchedAt: res.readme ? Date.now() : 0,
      aiParse: null,
      aiParsedAt: 0,
    };
    githubProjects.value = [proj, ...githubProjects.value];
    persist();
    return { ok: true, project: proj };
  } finally {
    githubBusy.value = false;
  }
}

export function removeGithubProject(id) {
  githubProjects.value = githubProjects.value.filter((p) => p.id !== id);
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
    const res = await api.githubFetch(`https://github.com/${p.owner}/${p.repo}`);
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
