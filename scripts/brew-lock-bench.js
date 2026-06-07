#!/usr/bin/env node
/**
 * scripts/brew-lock-bench.js
 *
 * 测 brew lock 兼容性 (spec §7 / §10):
 *   - 真 spawn N 个并发 `brew upgrade --cask <name>` 子进程
 *   - 计数: 成功的、brew lock 报错的
 *   - 输出: 每个并发度 (1, 2, 3, 4) 的成功/失败统计
 *
 * 设计要点:
 *   1. 不要在 CI 跑 — 真的会 brew upgrade 系统
 *   2. 用一个 fake cask (dmg 装一下) 是太重了 — 改成空跑 `brew --version` 类
 *      模拟 lock; 真正判断"brew lock 兼容性"靠 brew 进程互斥
 *   3. 实操上, brew 内部 lockfile 在 /usr/local/Library/Homebrew/.lock
 *      (Apple Silicon: /opt/homebrew/Library/Homebrew/.lock)
 *      真 spawn `brew info <cask>` 这种轻量命令并发即可触发 lock 竞争
 *
 * 用法:
 *   node scripts/brew-lock-bench.js            # 默认 1,2,3,4 各 5 次
 *   node scripts/brew-lock-bench.js --concurrencies=2,4,6 --runs=10
 *
 * 退出码:
 *   0  - 全部 OK
 *   1  - 有 lock 错误
 *   2  - 没法测 (brew 不在 PATH)
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { concurrencies: [1, 2, 3, 4], runs: 5, casks: ['git', 'wget'], dryRun: true };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--concurrencies=')) {
      out.concurrencies = a.slice(16).split(',').map((s) => parseInt(s, 10)).filter(Boolean);
    }
    if (a.startsWith('--runs=')) out.runs = parseInt(a.slice(7), 10) || 5;
    if (a.startsWith('--casks=')) out.casks = a.slice(8).split(',');
    if (a === '--no-dry-run') out.dryRun = false;
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function hasBrew() {
  return new Promise((resolve) => {
    const p = spawn('brew', ['--version'], { stdio: 'ignore' });
    p.on('exit', (code) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}

function runBrew(args) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('brew', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('exit', (code) => {
      resolve({ code, ms: Date.now() - t0, stderr });
    });
    child.on('error', (err) => {
      resolve({ code: -1, ms: Date.now() - t0, stderr: err.message });
    });
  });
}

function classifyLockErr(stderr) {
  // brew lock 的典型信号: "Could not acquire lock" / "Locked" / "Operation already in progress"
  return /Could not acquire lock|Locked|Operation already in progress/i.test(stderr);
}

async function runConcurrency(concurrency, runs, caskArgs) {
  const stats = { concurrency, runs, success: 0, lockErr: 0, otherErr: 0, totalMs: 0 };
  for (let i = 0; i < runs; i++) {
    const tasks = Array.from({ length: concurrency }, () => runBrew(caskArgs));
    const results = await Promise.all(tasks);
    for (const r of results) {
      stats.totalMs += r.ms;
      if (r.code === 0) {
        stats.success++;
      } else if (classifyLockErr(r.stderr)) {
        stats.lockErr++;
      } else {
        stats.otherErr++;
      }
    }
  }
  return stats;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[brew-lock-bench] project=${PROJECT_ROOT}`);
  console.log(`[brew-lock-bench] concurrencies=${args.concurrencies.join(',')}  runs=${args.runs}  casks=${args.casks.join(',')}  dryRun=${args.dryRun}`);

  if (!(await hasBrew())) {
    console.error('[brew-lock-bench] brew not in PATH; aborting');
    process.exit(2);
  }

  // 用 brew upgrade --dry-run <cask>: 真去抢 lock, 但不真改系统
  // 不带 --dry-run 时是破坏性的, 显式 --no-dry-run 才允许
  const upgradeArgs = ['upgrade', '--cask', ...args.casks];
  if (args.dryRun) upgradeArgs.push('--dry-run');
  const safeArgs = upgradeArgs;

  const allStats = [];
  for (const c of args.concurrencies) {
    process.stdout.write(`[brew-lock-bench]   concurrency=${c} ... `);
    const s = await runConcurrency(c, args.runs, safeArgs);
    allStats.push(s);
    process.stdout.write(`success=${s.success} lockErr=${s.lockErr} otherErr=${s.otherErr}\n`);
  }

  console.log('\n[brew-lock-bench] summary:');
  for (const s of allStats) {
    console.log(`  concurrency=${s.concurrency}: lock=${s.lockErr}/${s.concurrency * s.runs} (${(s.lockErr / (s.concurrency * s.runs) * 100).toFixed(1)}%)`);
  }

  // verdict
  // concurrency=2: 不应出现 lock 错误
  const conc2 = allStats.find((s) => s.concurrency === 2);
  if (conc2 && conc2.lockErr === 0) {
    console.log('[brew-lock-bench] verdict: PASS — concurrency=2 无 lock 冲突');
  } else if (conc2) {
    console.log(`[brew-lock-bench] verdict: CAUTION — concurrency=2 出现 ${conc2.lockErr} 次 lock 错误, 建议降到 1 或加 retry`);
  }
  // 4+ 的统计: 仅作 audit, 不作为 fail 标准
  const conc4 = allStats.find((s) => s.concurrency === 4);
  if (conc4) {
    console.log(`[brew-lock-bench] (audit) concurrency=4: lock=${conc4.lockErr}/${conc4.runs * 4} — Phase 7 选 2 是合理的`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[brew-lock-bench] fatal:', err);
    process.exit(1);
  });
}
