#!/usr/bin/env node
/**
 * scripts/q4-baseline.js
 *
 * 2026-06-23: Phase Q4 baseline profiler — measures cold require time
 * per module in src/main, so we can spot the heaviest bootstrap imports
 * before any renderer / Electron window exists.
 *
 * Why this and not a real Electron run?
 *   - macOS sandbox in CI has no display server, BrowserWindow is fine
 *     but webContents loading the renderer (preload + index.html) is
 *     expensive to time consistently.
 *   - The renderer / window phase is one of two halves; the OTHER half
 *     (main: require() chain + app.whenReady + bootstrap()) is the
 *     half we can directly measure here and is where most of the
 *     cheap wins will live (lazy require, deflate heavyweight deps,
 *     parallelize).
 *
 * Usage:
 *   node scripts/q4-baseline.js               # 1 run, default cold
 *   node scripts/q4-baseline.js --runs=5      # 5 runs (median + spread)
 *   node scripts/q4-baseline.js --watch       # side-by-side: r1..r5
 *
 * Output:
 *   module                  require_ms   ok
 *   ...
 *   Total cold require: 234.5 ms (1 run)
 */

const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── args ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argMap = Object.fromEntries(
  argv.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.split("=");
    return [k.replace(/^--/, ""), v ?? "true"];
  }),
);
const RUNS = Math.max(1, parseInt(argMap.runs || "1", 10));
const WATCH = argMap.watch === "true";

// ─── module list ────────────────────────────────────────────────────
// 摘自主进程 index.js 顶部 require 链 — 这是"启动必须 require"的模块
// 集合. 任何延迟到 whenReady() 之后再 require 的不进表.
const MAIN_REQUIRED = [
  "src/workers/pool",
  "src/main/ipc",
  "src/main/search/search-index",
  "src/main/ipc/register-search",
  "src/main/digest/daily-summary-job",
  "src/main/bootstrap/ai-usage",
  "src/main/bootstrap/state-init",
  "src/main/bootstrap/error-init",
  "src/main/state-store",
  "src/ai-sessions/storage",
  "src/main/http-client",
  "src/main/pool-size",
  "src/main/timer-registry",
  "src/main/fund-store",
  "src/main/fund-scheduler",
  "src/main/metal-ipc.js",
  "src/main/reminders",
  "src/main/recent-activity",
  "src/main/worldcup/goal-watcher",
  "src/main/bootstrap/config.js",
  "src/main/bootstrap/category.js",
  "src/main/bootstrap/ai-tasks.js",
  "src/main/bootstrap/schedulers.js",
  "src/main/bootstrap/send-to-renderer.js",
  "src/main/bootstrap/tray-init.js",
];

// ─── runner ─────────────────────────────────────────────────────────
function timeRequire(relPath, label) {
  const abs = path.resolve(PROJECT_ROOT, relPath);
  let resolved;
  try {
    resolved = require.resolve(abs);
  } catch (e) {
    return { label, modPath: relPath, ms: 0, ok: false, err: e };
  }
  delete require.cache[resolved];
  const t0 = process.hrtime.bigint();
  let ok = true;
  let err = null;
  try {
    require(abs);
  } catch (e) {
    ok = false;
    err = e;
  }
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  return { label, modPath: relPath, ms, ok, err };
}

function clearAllCaches() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(PROJECT_ROOT + path.sep)) {
      delete require.cache[k];
    }
  }
}

function profileOnce() {
  const results = [];
  for (const rel of MAIN_REQUIRED) {
    results.push(timeRequire(rel, rel));
  }
  return results;
}

function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── main ───────────────────────────────────────────────────────────
const allRuns = [];
for (let i = 0; i < RUNS; i++) {
  clearAllCaches();
  const t0 = process.hrtime.bigint();
  const results = profileOnce();
  const t1 = process.hrtime.bigint();
  const totalMs = Number(t1 - t0) / 1e6;
  allRuns.push({ results, totalMs });
}

console.log("\n=== Q4 cold-require profiler ===");
console.log(`runs=${RUNS}, env=${process.version} ${process.platform}\n`);

if (WATCH && RUNS > 1) {
  const head = "module".padEnd(50);
  const cols = [];
  for (let r = 1; r <= RUNS; r++) cols.push(`r${r}`.padStart(10));
  console.log(head, ...cols);
  for (let i = 0; i < MAIN_REQUIRED.length; i++) {
    const cells = [MAIN_REQUIRED[i].padEnd(50)];
    for (let r = 0; r < RUNS; r++) {
      const rec = allRuns[r].results[i];
      cells.push(rec ? `${rec.ms.toFixed(1)}`.padStart(10) : "—".padStart(10));
    }
    console.log(...cells);
  }
} else {
  const sorted = [...allRuns[0].results].sort((a, b) => b.ms - a.ms);
  console.log("module".padEnd(50), "require_ms".padStart(12), "  ok");
  console.log("—".repeat(72));
  for (const r of sorted) {
    const okMark = r.ok ? " " : "✗";
    console.log(r.label.padEnd(50), r.ms.toFixed(1).padStart(12), " ", okMark);
    if (!r.ok && r.err) console.log("   └─", r.err.message);
  }
  console.log("");
  console.log(`Total cold require: ${allRuns[0].totalMs.toFixed(1)} ms (1 run)`);
}

if (RUNS > 1 && !WATCH) {
  console.log("");
  console.log("Multi-run summary (top-5 heaviest, median across runs):");
  const sortedLabels = MAIN_REQUIRED.slice().sort((a, b) => {
    const ma = median(allRuns.map((r) => r.results.find((x) => x.label === a)?.ms ?? 0));
    const mb = median(allRuns.map((r) => r.results.find((x) => x.label === b)?.ms ?? 0));
    return mb - ma;
  });
  for (const lab of sortedLabels.slice(0, 5)) {
    const ms = median(allRuns.map((r) => r.results.find((x) => x.label === lab)?.ms ?? 0));
    console.log(`  ${lab.padEnd(50)} median ${ms.toFixed(1)} ms`);
  }
  const totals = allRuns.map((r) => r.totalMs);
  console.log(`\nTotal cold (median): ${median(totals).toFixed(1)} ms across ${RUNS} runs`);
  console.log(`Total cold (min..max): ${Math.min(...totals).toFixed(1)}..${Math.max(...totals).toFixed(1)} ms`);
}