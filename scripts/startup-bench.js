#!/usr/bin/env node
/**
 * scripts/startup-bench.js
 *
 * 自动化冷启动基准 (spec §10 / §13):
 *   - 启动 100 次, 量"冷启动 → 窗口可见"时间
 *   - 输出:  中位数 / p95 / 最小 / 最大
 *   - 验收:  中位数 < 1.5s
 *
 * 工作方式 (CJS Node 脚本, 跑在 macOS):
 *   1. 跑一次冷启动, electron 进程自己 fire 'ready-to-show'
 *   2. main 进程在 ready-to-show 触发瞬间, 给 bench 进程发 IPC: "visible"
 *      (走 main 进程的 event() log 行, bench 端用 file-watcher 收)
 *   3. bench 计算: t0 (electron 进程 fork 之前) → 收到"visible" 的差值
 *
 * 为了不引 IPC 复杂度, 简化实现:
 *   - 用 stdout 解析: main/index.js 加一个 env-gate
 *     BENCH=1 时, ready-to-show 立刻 console.log "BENCH_VISIBLE"
 *   - bench 脚本: spawn electron, 计 t0, 等到 stdout 含 "BENCH_VISIBLE" 算 t1
 *   - 100 次: 每跑完一次, kill + 等待 1s 让 OS 释放资源
 *
 * 用法:
 *   node scripts/startup-bench.js [--iterations=100] [--no-quit]
 *
 * 输出: stdout + tests/fixtures/startup-bench-{timestamp}.json
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// 跑 build 后的 .app (dist/mac-arm64/Pulse.app) — 真生产路径
// dev 模式 (electron .) 也能跑, 但 1) node_modules/.bin/electron 在某些环境是
// 错的平台 (CI 上 npm install 没装对), 2) 测 .app 才能反映最终用户首次启动感受
const BUILT_APP = path.join(PROJECT_ROOT, 'dist', 'mac-arm64', 'Pulse.app', 'Contents', 'MacOS', 'Pulse');
const ELECTRON_DEV = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron');

function pickRunner() {
  if (process.env.BENCH_DEV === '1') return ELECTRON_DEV;
  if (fs.existsSync(BUILT_APP)) return BUILT_APP;
  return ELECTRON_DEV;   // 兜底
}

function parseArgs(argv) {
  const out = { iterations: 100, quitAfter: true, warmupMs: 800 };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--iterations=')) out.iterations = parseInt(a.slice(13), 10) || 100;
    if (a === '--no-quit') out.quitAfter = false;
    if (a.startsWith('--warmup-ms=')) out.warmupMs = parseInt(a.slice(12), 10) || 800;
  }
  return out;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
}

function median(arr) {
  if (arr.length === 0) return 0;
  return percentile(arr, 50);
}

function summary(arr) {
  if (arr.length === 0) return null;
  return {
    count: arr.length,
    min: Math.min(...arr),
    max: Math.max(...arr),
    mean: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    median: median(arr),
    p50: percentile(arr, 50),
    p90: percentile(arr, 90),
    p95: percentile(arr, 95),
    p99: percentile(arr, 99),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 跑一次冷启动, 测量到 "BENCH_VISIBLE" 出现的耗时 (ms)。
 * @returns {Promise<{ok: boolean, ms: number, err?: string, timeout?: boolean}>}
 */
function runOnce() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      resolve({ ok: false, ms: 15000, err: 'timeout (15s)', timeout: true });
    }, 15000);

    const env = {
      ...process.env,
      BENCH: '1',                  // 触发 main/index.js 的 bench 模式
      APP_UPDATE_CHECKER_DEBUG: '0',
    };

    const runner = pickRunner();
    const isApp = runner.endsWith('Pulse');
    const child = isApp
      ? spawn(runner, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(runner, ['.'], { cwd: PROJECT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdoutBuf = '';
    let stderrBuf = '';

    const onData = (which, chunk) => {
      const s = chunk.toString();
      if (which === 'out') stdoutBuf += s;
      else stderrBuf += s;
      const combined = stdoutBuf + '\n' + stderrBuf;
      if (combined.includes('BENCH_VISIBLE') && !resolved) {
        resolved = true;
        clearTimeout(timer);
        const ms = Date.now() - t0;
        try { child.kill('SIGTERM'); } catch { /* noop */ }
        resolve({ ok: true, ms });
      }
    };

    child.stdout.on('data', (c) => onData('out', c));
    child.stderr.on('data', (c) => onData('err', c));

    child.on('exit', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ ok: false, ms: Date.now() - t0, err: 'exited before BENCH_VISIBLE' });
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[startup-bench] project=${PROJECT_ROOT}`);
  console.log(`[startup-bench] iterations=${args.iterations}  warmupMs=${args.warmupMs}`);

  // 预跑 1 次, 把 require 缓存预热 — 不计入正式数据
  console.log('[startup-bench] warmup run...');
  const warm = await runOnce();
  console.log(`[startup-bench]   warmup: ${warm.ok ? warm.ms + 'ms' : 'failed'}`);
  if (!warm.ok) {
    console.error('[startup-bench] warmup failed, aborting. err=' + warm.err);
    process.exit(2);
  }
  await sleep(args.warmupMs);

  const samples = [];
  let failCount = 0;
  for (let i = 1; i <= args.iterations; i++) {
    const r = await runOnce();
    if (r.ok) {
      samples.push(r.ms);
      process.stdout.write(`  [${String(i).padStart(3)}/${args.iterations}] ${r.ms}ms\n`);
    } else {
      failCount++;
      process.stdout.write(`  [${String(i).padStart(3)}/${args.iterations}] FAILED: ${r.err}\n`);
    }
    // 跑完一次清场: 给 OS 释放资源 / 上一进程冷却
    await sleep(args.warmupMs);
  }

  const sum = summary(samples);
  console.log('\n[startup-bench] results:');
  console.log(JSON.stringify(sum, null, 2));
  console.log(`[startup-bench] failed iterations: ${failCount}/${args.iterations}`);
  console.log(`[startup-bench] target (spec §10): median < 1500ms`);

  if (sum) {
    const verdict = sum.median < 1500 ? 'PASS' : 'FAIL';
    console.log(`[startup-bench] verdict: ${verdict} (median ${sum.median}ms vs target 1500ms)`);
  }

  // 落盘: 留个 audit trail
  const outDir = path.join(PROJECT_ROOT, 'tests', 'fixtures');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* noop */ }
  const outFile = path.join(outDir, `startup-bench-${Date.now()}.json`);
  try {
    fs.writeFileSync(outFile, JSON.stringify({
      at: new Date().toISOString(),
      iterations: args.iterations,
      failed: failCount,
      summary: sum,
      samples,
    }, null, 2));
    console.log(`[startup-bench] wrote: ${outFile}`);
  } catch (err) {
    console.error(`[startup-bench] write failed: ${err.message}`);
  }

  // exit code: 0=PASS, 1=FAIL (median >= 1.5s), 2=aborted
  if (!sum) process.exit(2);
  process.exit(sum.median < 1500 ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[startup-bench] fatal:', err);
    process.exit(2);
  });
}

module.exports = { runOnce, summary, percentile };
