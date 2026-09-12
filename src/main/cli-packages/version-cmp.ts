/**
 * src/main/cli-packages/version-cmp.ts
 *
 * v3.2: CLI 包版本比较 — 从 workers/detector-chain.ts 的 compareVersions 忠实移植
 * (pre-release 排序 + 4 段 build 号归一). 不直接 import detector-chain: 那会把整个
 * detector 注册表拉进主进程 bundle, 这里只要一个纯函数.
 */

import { cleanVersion } from "../../utils/version-utils";

const PRE_RANK: Record<string, number> = {
  alpha: 0,
  a: 0,
  beta: 1,
  b: 1,
  pre: 1,
  preview: 1,
  rc: 2,
  c: 2,
};

function splitPrerelease(v: any) {
  if (!v) return { core: "", pre: null as string | null };
  const s = String(v);
  const idx = s.indexOf("-");
  if (idx === -1) return { core: s, pre: null };
  return { core: s.slice(0, idx), pre: s.slice(idx + 1) };
}

function parsePre(pre: any) {
  if (!pre) return { rank: 99, num: 0 }; // release 视为最"新"
  const nameMatch = String(pre).match(/^[a-zA-Z]+/);
  const name = nameMatch ? nameMatch[0].toLowerCase() : "";
  const rank = PRE_RANK[name] !== undefined ? PRE_RANK[name] : 50;
  const numMatch = String(pre).match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1], 10) : 0;
  return { rank, num };
}

function compareCores(ic: any, lc: any) {
  const si = String(ic)
    .split(".")
    .map((s: any) => parseInt(s, 10) || 0);
  const sl = String(lc)
    .split(".")
    .map((s: any) => parseInt(s, 10) || 0);

  const looksLikeBuild = (n: any) => Number.isFinite(n) && n >= 100;
  const canNormalize =
    si.length >= 3 &&
    sl.length >= 3 &&
    si[0] === sl[0] &&
    si[1] === sl[1] &&
    (si.length === 4 || sl.length === 4) &&
    (looksLikeBuild(si[si.length - 1]) || looksLikeBuild(sl[sl.length - 1]));

  if (canNormalize) {
    const insBase = si.slice(0, 3);
    const latBase = sl.slice(0, 3);
    const insBuild = si[si.length - 1];
    const latBuild = sl[sl.length - 1];
    for (let i = 0; i < 3; i++) {
      if (insBase[i] !== latBase[i]) return insBase[i] < latBase[i] ? -1 : 1;
    }
    if (insBuild !== latBuild) return insBuild < latBuild ? -1 : 1;
    return 0;
  }

  const maxLen = Math.max(si.length, sl.length);
  for (let i = 0; i < maxLen; i++) {
    const a = si[i] || 0;
    const b = sl[i] || 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function comparePre(pi: any, pl: any) {
  const a = parsePre(pi);
  const b = parsePre(pl);
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  if (a.num !== b.num) return a.num < b.num ? -1 : 1;
  return 0;
}

export function compareCliVersions(installed: any, latest: any) {
  const ins = cleanVersion(installed);
  const lat = cleanVersion(latest);
  if (!ins || !lat) return { hasUpdate: false, note: "version_unknown" };
  if (ins === lat) return { hasUpdate: false, note: "" };

  const { core: ic, pre: ip } = splitPrerelease(ins);
  const { core: lc, pre: lp } = splitPrerelease(lat);

  const coreCmp = compareCores(ic, lc);
  if (coreCmp !== 0) {
    return coreCmp < 0
      ? { hasUpdate: true, note: "" }
      : { hasUpdate: false, note: "installed_newer" };
  }

  const preCmp = comparePre(ip, lp);
  if (preCmp === 0) return { hasUpdate: false, note: "" };
  return preCmp < 0
    ? { hasUpdate: true, note: "" }
    : { hasUpdate: false, note: "installed_newer" };
}
