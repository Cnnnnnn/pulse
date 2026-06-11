/**
 * src/main/library/detect.js
 *
 * v2.7.2 (Library Auto-Detect): 4 层优先级 orchestrator.
 *
 * 4 层优先级 (按"概率高 + 零配置"排):
 *   1️⃣ bundleId 静态表反查 (sync, 0 网络, 0 配置)
 *   2️⃣ 启发式 + http 试探 (按 appName / bundleId 猜 detector + url)
 *   3️⃣ brew 试探 (0 配置, 大概率)
 *   4️⃣ 用户手选 (3 步 wizard fallback — 不在本模块, UI 端处理)
 *
 * 2️⃣ 跟 3️⃣ 并行 (Promise.allSettled), 8s 总 timeout. 谁先返 ok 算 best.
 *
 * 返: {
 *   results: [ { priority, ok, type?, fields?, reason?, probeMs, ... } ],
 *   best:   { priority, type, fields, probeMs } | null
 * }
 *
 * CommonJS, 跟 src/main/library 一致.
 */

const { lookupKnownApp } = require('./known-apps');
const { guessCaskName, probeBrewCask } = require('./brew-probe');

const DEFAULT_HTTP_TIMEOUT_MS = 8000;
const PROBE_LEVEL_TIMEOUT_MS = 8000;  // 2️⃣ 跟 3️⃣ 并行的总 budget

// 启发式规则: 触发条件 → 推测 detector type + URL 模板
// URL 模板含 {arch} / {arch_short} 占位符, runtime 替换
const HEURISTIC_RULES = [
  {
    match: (item) => /code|ide|studio|dev/i.test(item.appName || ''),
    probe: { type: 'electron_yml', urlTpl: '' },  // URL 待 detector 补全, 实际不用这个
  },
  {
    match: (item) => /chat|assistant|copilot/i.test(item.appName || ''),
    probe: { type: 'app_store_lookup' },
  },
  {
    match: (item) => /reader|player|viewer/i.test(item.appName || ''),
    probe: { type: 'app_store_lookup' },
  },
];

/**
 * 解析 arch 占位符.
 * 跟 url-template.js expandUrl 一致, 简版 (只 {arch}).
 */
function expandArch(urlTpl, arch) {
  if (typeof urlTpl !== 'string' || urlTpl.length === 0) return urlTpl;
  return urlTpl.replace(/\{arch\}/g, arch).replace(/\{arch_short\}/g, arch === 'arm64' ? 'aarch64' : 'x64');
}

function getArch() {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

/**
 * 4 层优先级 orchestrate.
 *
 * @param {object} item  scanned app { appName, bundleName, bundleId, ... }
 * @param {object} [opts]
 * @param {object} [opts.httpClient]     注入 (用现有 HttpClient) — 2️⃣ 探测用
 * @param {Function} [opts.execFileImpl] 注入 — 3️⃣ brew 用
 * @param {number}   [opts.totalTimeout] 默认 8000ms
 * @param {number}   [opts.now]          注入便于测试
 * @returns {Promise<{results: Array, best: object|null}>}
 */
async function detectDetector(item, opts = {}) {
  const t0 = (typeof opts.now === 'number') ? opts.now : Date.now();
  const totalTimeout = (typeof opts.totalTimeout === 'number') ? opts.totalTimeout : PROBE_LEVEL_TIMEOUT_MS;
  const arch = (opts.arch) || getArch();
  const safeItem = (item && typeof item === 'object') ? item : {};
  const results = [];

  // 1️⃣ bundleId 静态表 (sync)
  const known = lookupKnownApp(safeItem.bundleId);
  if (known) {
    const r = {
      priority: 1,
      ok: true,
      type: known.type,
      fields: expandArchFields(known.fields, arch),
      source: 'known-apps',
      probeMs: 0,
    };
    results.push(r);
    return { results, best: pickBest(r, results) };
  }
  results.push({
    priority: 1,
    ok: false,
    reason: 'not_in_known_apps',
    source: 'known-apps',
    probeMs: 0,
  });

  // 2️⃣ 跟 3️⃣ 并行
  const probes = await Promise.allSettled([
    runHeuristicProbes(safeItem, opts, arch),
    runBrewProbe(safeItem, opts),
  ]);

  // 2️⃣
  if (probes[0].status === 'fulfilled' && probes[0].value) {
    const heurResults = probes[0].value;
    results.push(...heurResults);
  } else {
    results.push({ priority: 2, ok: false, reason: 'heuristic_failed', source: 'heuristic', probeMs: 0 });
  }

  // 3️⃣
  if (probes[1].status === 'fulfilled' && probes[1].value) {
    results.push(probes[1].value);
  } else {
    results.push({ priority: 3, ok: false, reason: 'brew_failed', source: 'brew', probeMs: 0 });
  }

  const best = results.find((r) => r.ok) || null;
  return { results, best };
}

/**
 * 启发式探测: 跑所有匹配的规则, 第一个返回 ok 的算赢.
 * 现阶段 MVP: 启发式仅做 type 推测, 实际探测需要具体 URL — v2.7.2 留 ok=false 占位
 * (URL 留待 v2.7.3+ 接入 worker pool 跑真 detector). 3️⃣ 跟 4️⃣ 已经覆盖大部分现实.
 */
async function runHeuristicProbes(item, opts, arch) {
  const out = [];
  for (const rule of HEURISTIC_RULES) {
    if (!rule.match(item)) continue;
    out.push({
      priority: 2,
      ok: false,
      type: rule.probe.type,
      reason: 'heuristic_needs_url_placeholder',
      source: 'heuristic',
      probeMs: 0,
    });
  }
  return out;
}

/**
 * brew 探测 wrapper.
 */
async function runBrewProbe(item, opts) {
  const cask = guessCaskName(item);
  if (!cask) {
    return { priority: 3, ok: false, reason: 'cannot_guess_cask', source: 'brew', probeMs: 0 };
  }
  const r = await probeBrewCask(cask, {
    execFileImpl: opts.execFileImpl,
    timeout: PROBE_LEVEL_TIMEOUT_MS,
  });
  if (!r.ok) {
    return { priority: 3, ok: false, reason: r.reason, source: 'brew', probeMs: r.probeMs };
  }
  return {
    priority: 3,
    ok: true,
    type: 'brew_formulae',
    fields: { cask },
    version: r.version,  // 顺便把 probe 拿到的 version 带出来 (UI 可显示)
    source: 'brew',
    probeMs: r.probeMs,
  };
}

function expandArchFields(fields, arch) {
  if (!fields || typeof fields !== 'object') return fields || {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = (typeof v === 'string') ? expandArch(v, arch) : v;
  }
  return out;
}

function pickBest(r) {
  return r && r.ok ? { priority: r.priority, type: r.type, fields: r.fields, version: r.version, probeMs: r.probeMs } : null;
}

module.exports = {
  detectDetector,
  // test-only
  expandArch,
  expandArchFields,
  pickBest,
  HEURISTIC_RULES,
};
