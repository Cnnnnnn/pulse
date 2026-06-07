/**
 * tests/main/load-smoke.test.js
 *
 * Sanity check: 每次改 main 进程代码后, 所有 main 模块都能 require
 * (语法错 / top-level throw / 缺少依赖 都会被 vitest 抓到).
 *
 * Phase 28b 出过 tray.js 写多一个 `)` 的 typo, 没有 test require 它,
 * 532 个 case 全过但 .dmg 装上后 main 进程直接崩. 这个 smoke 把所有
 * main 文件 require 一遍, 保证打包时不会出 syntax error.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';

const MAIN_DIR = new URL('../../src/main/', import.meta.url).pathname;
const CONFIG_DIR = new URL('../../src/config/', import.meta.url).pathname;

describe('main process module load smoke (Phase 28+ regression)', () => {
  // 收集 src/main/*.js (排除 _test, test, spec 命名)
  const files = readdirSync(MAIN_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !f.endsWith('.test.js'))
    .filter((f) => !f.endsWith('.spec.js'))
    .sort();

  // 至少要这些 — 防止有人误删 main 文件
  const expected = [
    'check-runner.js',
    'index.js',
    'ipc.js',
    'last-opened.js',
    'state-store.js',
    'tier.js',
    'tray.js',
  ];
  for (const e of expected) {
    it(`src/main/${e} exists`, () => {
      expect(files).toContain(e);
    });
  }

  // 核心: 每个文件 require 一遍, 任何 syntax error / 缺依赖 都会 fail
  for (const f of files) {
    it(`src/main/${f} can be required without error`, () => {
      // 用 Function 包装 require, 捕获任何 throw
      let err = null;
      try {
        require(join(MAIN_DIR, f));
      } catch (e) {
        err = e;
      }
      expect(err).toBeNull();
    });
  }
});

describe('config module load smoke (Phase A1b regression)', () => {
  // Phase A1b: src/config/category.js 启动期 require, 任何 syntax error /
  // top-level throw / 缺依赖都会被 vitest 抓到.
  it('src/config/category.js can be required without error', () => {
    let err = null;
    try {
      require(join(CONFIG_DIR, 'category.js'));
    } catch (e) {
      err = e;
    }
    expect(err).toBeNull();
  });
});
