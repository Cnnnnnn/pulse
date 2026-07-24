/**
 * tests/main/load-smoke.test.js
 *
 * Sanity check: 每次改 main 进程代码后, 顶层 main 模块都能加载
 * (语法错 / top-level throw / 缺少依赖 都会被 vitest 抓到).
 *
 * Phase 28b 出过 tray.js 写多一个 `)` 的 typo, 没有 test require 它,
 * 532 个 case 全过但 .dmg 装上后 main 进程直接崩. 这个 smoke 把所有
 * main 顶层文件加载一遍, 保证打包时不会出 syntax error.
 *
 * Phase 3 Batch 9: src/main 顶层已无 .js shim — 经 requireMain → dist-test.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
const { requireMain } = require("../_setup/require-main.cjs");

const MAIN_DIR = join(fileURLToPath(import.meta.url), '../../../src/main/');
const CONFIG_DIR = join(fileURLToPath(import.meta.url), '../../../src/config/');

describe('main process module load smoke (Phase 28+ regression)', () => {
  // 收集 src/main 顶层 .ts (排除 test / d.ts；index.ts 是 app entry，跳过)
  const files = readdirSync(MAIN_DIR)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => !f.endsWith('.spec.ts'))
    .filter((f) => !f.endsWith('.d.ts'))
    .filter((f) => f !== 'index.ts' && f !== 'ipc.ts')
    .sort();

  const expected = [
    'check-runner.ts',
    'last-opened.ts',
    'state-store.ts',
    'tray.ts',
  ];
  for (const e of expected) {
    it(`src/main/${e} exists`, () => {
      expect(files).toContain(e);
    });
  }

  for (const f of files) {
    it(`src/main/${f} can be required without error`, () => {
      let err = null;
      try {
        requireMain(f.replace(/\.ts$/, ''));
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull();
    });
  }
});

describe('config module load smoke', () => {
  let files = [];
  try {
    files = readdirSync(CONFIG_DIR)
      .filter((f) => f.endsWith('.js') || f.endsWith('.ts'))
      .filter((f) => !f.includes('test') && !f.includes('spec'))
      .sort();
  } catch {
    files = [];
  }

  if (files.length === 0) {
    it('src/config/ optional — skip when absent', () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const f of files) {
    it(`src/config/${f} can be required without error`, () => {
      let err = null;
      try {
        require(join(CONFIG_DIR, f));
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull();
    });
  }
});
