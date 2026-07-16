/**
 * src/main/github.js
 *
 * GitHub 优秀项目收录 — 主进程侧仓库元数据 + README 抓取.
 * 走统一 HttpClient (带超时 / 重试 / User-Agent)，避免 renderer 直接联网 (CORS + 凭据安全).
 *
 * 2026-07-15 v2.80: 新增.
 */

const { HttpClient } = require("./http-client");
const { mainLog } = require("./log");

const UA = "Pulse-AppUpdateChecker/2.79";
const API_BASE = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

let _http = null;
function http() {
  if (!_http) {
    _http = new HttpClient({
      timeout: 20000,
      maxRetries: 1,
      maxBodyBytes: 2 * 1024 * 1024,
    });
  }
  return _http;
}

/**
 * 解析常见 GitHub 项目地址，提取 owner / repo。
 * 支持：
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo/tree/main/...
 *   git@github.com:owner/repo.git
 *   owner/repo            (裸 slug)
 * @param {string} input
 * @returns {{owner:string, repo:string} | null}
 */
function parseGithubUrl(input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  // git@github.com:owner/repo.git
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  // 裸 slug: owner/repo
  const bare = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (bare) return { owner: bare[1], repo: bare[2] };

  // http(s)://...
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
 * 抓取仓库元数据 (描述 / star / 语言 / 主页 / 默认分支等)。
 * @returns {Promise<{ok:boolean, reason?:string, meta?:object, status?:number}>}
 */
async function fetchRepoMeta(owner, repo) {
  const res = await http().get(`${API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/vnd.github+json",
    },
    timeout: 20000,
  });
  if (!res || res.status === 403 || res.status === 429) {
    return { ok: false, reason: "rate_limited", status: res && res.status };
  }
  if (!res || res.status !== 200) {
    return { ok: false, reason: "not_found", status: res && res.status };
  }
  let data;
  try {
    data = JSON.parse(res.body || "{}");
  } catch {
    return { ok: false, reason: "parse_error" };
  }
  return {
    ok: true,
    meta: {
      name: data.full_name || `${owner}/${repo}`,
      description: typeof data.description === "string" ? data.description : "",
      stars:
        typeof data.stargazers_count === "number" ? data.stargazers_count : 0,
      language: typeof data.language === "string" ? data.language : "",
      homepage: typeof data.homepage === "string" ? data.homepage : "",
      htmlUrl:
        typeof data.html_url === "string"
          ? data.html_url
          : `https://github.com/${owner}/${repo}`,
      defaultBranch:
        typeof data.default_branch === "string" ? data.default_branch : "main",
      license:
        data.license && data.license.spdx_id && data.license.spdx_id !== "NOASSERTION"
          ? data.license.spdx_id
          : "",
      topics: Array.isArray(data.topics) ? data.topics : [],
    },
  };
}

/**
 * 抓取 README 原始 markdown。优先 GitHub API raw 端点，失败回退 raw.githubusercontent.com 多候选路径。
 * @returns {Promise<string|null>}
 */
async function fetchReadmeRaw(owner, repo, branch) {
  const candidates = [
    {
      url: `${API_BASE}/repos/${owner}/${repo}/readme`,
      api: true,
    },
    { url: `${RAW_BASE}/${owner}/${repo}/${branch}/README.md` },
    { url: `${RAW_BASE}/${owner}/${repo}/${branch}/readme.md` },
    { url: `${RAW_BASE}/${owner}/${repo}/${branch}/README.markdown` },
    { url: `${RAW_BASE}/${owner}/${repo}/${branch}/README.rst` },
    { url: `${RAW_BASE}/${owner}/${repo}/${branch}/docs/README.md` },
  ];
  for (const c of candidates) {
    try {
      const res = await http().get(c.url, {
        headers: c.api
          ? { "User-Agent": UA, Accept: "application/vnd.github.raw+json" }
          : { "User-Agent": UA },
        timeout: 20000,
        maxBodyBytes: 2 * 1024 * 1024,
      });
      if (res && res.status === 200 && res.body && res.body.trim()) {
        return res.body;
      }
    } catch {
      /* 候选失败继续下一个 */
    }
  }
  return null;
}

/**
 * 抓取仓库 Releases（最新若干条，用于「更新追踪」）。
 * GitHub API 返回数组按发布时间倒序，[0] 即最新版。
 * @returns {Promise<{ok:boolean, reason?:string, release?:object|null, releases?:Array}>}
 */
async function fetchRepoRelease(owner, repo) {
  let res;
  try {
    res = await http().get(`${API_BASE}/repos/${owner}/${repo}/releases`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/vnd.github+json",
      },
      timeout: 20000,
    });
  } catch (err) {
    mainLog.warn("[github] fetchRepoRelease network error", {
      owner,
      repo,
      msg: err && err.message,
    });
    return { ok: false, reason: "network_error", error: err && err.message };
  }
  // HttpClient 保证不抛：网络错误 → {status:0, error:'network'}；超时 → {status:0, error:'timeout'}
  if (!res || res.status === 403 || res.status === 429) {
    return { ok: false, reason: "rate_limited", status: res && res.status };
  }
  if (!res || res.error === "network" || res.error === "timeout") {
    return {
      ok: false,
      reason: res.error === "timeout" ? "timeout" : "network_error",
      error: res && res.error,
    };
  }
  if (res.status !== 200) {
    return { ok: false, reason: "not_found", status: res && res.status };
  }
  let list;
  try {
    list = JSON.parse(res.body || "[]");
  } catch {
    return { ok: false, reason: "parse_error" };
  }
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: true, release: null, releases: [] };
  }
  const stripV = (t) => (typeof t === "string" ? t.replace(/^[vV]/, "") : "");
  const map = (r) => ({
    version: stripV(r.tag_name),
    tagName: typeof r.tag_name === "string" ? r.tag_name : "",
    publishedAt: r.published_at ? Date.parse(r.published_at) : 0,
    notesUrl: typeof r.html_url === "string" ? r.html_url : "",
    body: typeof r.body === "string" ? r.body : "",
  });
  return {
    ok: true,
    release: map(list[0]),
    releases: list.slice(0, 5).map(map),
  };
}

/**
 * 统一入口：解析地址 → 抓元数据 + README。
 * @param {string} input
 * @returns {Promise<{ok:boolean, reason?:string, owner?:string, repo?:string, meta?:object, readme?:string}>}
 */
async function fetchGithubProject(input) {
  const parsed = parseGithubUrl(input);
  if (!parsed) return { ok: false, reason: "invalid_url" };
  const { owner, repo } = parsed;
  try {
    const metaRes = await fetchRepoMeta(owner, repo);
    if (!metaRes.ok) {
      return { ok: false, reason: metaRes.reason, status: metaRes.status };
    }
    const readme = await fetchReadmeRaw(owner, repo, metaRes.meta.defaultBranch);
    return {
      ok: true,
      owner,
      repo,
      meta: metaRes.meta,
      readme: readme || "",
    };
  } catch (err) {
    mainLog.warn("[github] fetch failed", {
      owner,
      repo,
      msg: err && err.message,
    });
    return { ok: false, reason: "fetch_failed", error: err && err.message };
  }
}

module.exports = {
  parseGithubUrl,
  fetchGithubProject,
  fetchRepoMeta,
  fetchReadmeRaw,
  fetchRepoRelease,
};
