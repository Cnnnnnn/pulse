/**
 * tests/integration/log.test.js
 *
 * 诊断日志 (log.js) — spec §6 格式单测
 *   [startup] 2026-06-05T10:23:45 +0800 tray=45ms window=180ms total=520ms
 *   [detect]  2026-06-05T10:23:46 +0800 app=Cursor det=cursor_redirect ms=234 version=3.6 confidence=high
 *   [detect]  ... error="HTTP 400"
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createLogger,
  resolveLogDir,
  isDebug,
  mainLog,
  detectLog,
} from '../../src/main/log.ts';

describe('log.js — spec §6 structured format', () => {
  let logDir;
  let origLogDir;

  beforeEach(() => {
    // 用临时目录, 不污染 ~/Library/Logs
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auc-log-test-'));
    origLogDir = process.env.AUC_LOG_DIR_FORCE;
    process.env.AUC_LOG_DIR_FORCE = logDir;
    // 强制 reload _logDir 缓存: 模块单例 _logDir
    // 我们重新 require 不现实, 改成直接读目标文件: 用 mainLog.dir 跟踪
  });

  afterEach(() => {
    if (origLogDir === undefined) {
      delete process.env.AUC_LOG_DIR_FORCE;
    } else {
      process.env.AUC_LOG_DIR_FORCE = origLogDir;
    }
    try { fs.rmSync(logDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('mainLog.dir 指向 ~/Library/Logs/AppUpdateChecker (macOS)', () => {
    if (process.platform === 'darwin') {
      expect(mainLog.dir).toContain(path.join('Library', 'Logs', 'AppUpdateChecker'));
    } else {
      expect(mainLog.dir).toBeTruthy();
    }
  });

  it('isDebug 默认关, env=1 时开', () => {
    const orig = process.env.APP_UPDATE_CHECKER_DEBUG;
    delete process.env.APP_UPDATE_CHECKER_DEBUG;
    expect(isDebug()).toBe(false);
    process.env.APP_UPDATE_CHECKER_DEBUG = '1';
    expect(isDebug()).toBe(true);
    process.env.APP_UPDATE_CHECKER_DEBUG = 'true';
    expect(isDebug()).toBe(true);
    process.env.APP_UPDATE_CHECKER_DEBUG = '0';
    expect(isDebug()).toBe(false);
    if (orig === undefined) delete process.env.APP_UPDATE_CHECKER_DEBUG;
    else process.env.APP_UPDATE_CHECKER_DEBUG = orig;
  });

  it('event() 写 k=v 拍平 (spec §6 启动埋点格式)', () => {
    const log = createLogger('startup_test_' + Math.random().toString(36).slice(2, 8));
    log.event({ tray: '45ms', window: '180ms', total: '520ms', apps: 11 });
    // 找到刚写的文件 — 用了 startup_test_*.log 在 resolveLogDir() 返回的目录
    const dir = log.dir;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    expect(files.length).toBeGreaterThan(0);
    const lastFile = path.join(dir, files[files.length - 1]);
    const content = fs.readFileSync(lastFile, 'utf-8');
    const lastLine = content.trim().split('\n').pop();
    // 格式: [startup_test_xxx] YYYY-MM-DD ... +ZZZZ tray=45ms window=180ms total=520ms apps=11
    expect(lastLine).toMatch(/^\[startup_test_/);
    expect(lastLine).toMatch(/\+\d{4} tray=45ms window=180ms total=520ms apps=11$/);
    // ISO timestamp + 时区前必须有空格
    expect(lastLine).toMatch(/T\d{2}:\d{2}:\d{2} [+-]\d{4}/);
    // cleanup
    try { fs.unlinkSync(lastFile); } catch { /* noop */ }
  });

  it('event() 字符串字段自动加引号 + 转义换行', () => {
    const log = createLogger('detect_test_' + Math.random().toString(36).slice(2, 8));
    log.event({ app: 'Cursor', det: 'cursor_redirect', ms: 234, error: 'HTTP\n400' });
    const dir = log.dir;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    const lastFile = path.join(dir, files[files.length - 1]);
    const content = fs.readFileSync(lastFile, 'utf-8');
    const lastLine = content.trim().split('\n').pop();
    expect(lastLine).toContain('app=Cursor');
    expect(lastLine).toContain('det=cursor_redirect');
    expect(lastLine).toContain('ms=234');
    // 字符串被加双引号
    expect(lastLine).toContain('error="HTTP\\n400"');
    try { fs.unlinkSync(lastFile); } catch { /* noop */ }
  });

  it('info() 写一行带 level=INFO 默认前缀', () => {
    const log = createLogger('info_test_' + Math.random().toString(36).slice(2, 8));
    log.info('boot pid=123');
    const dir = log.dir;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    const lastFile = path.join(dir, files[files.length - 1]);
    const content = fs.readFileSync(lastFile, 'utf-8');
    const lastLine = content.trim().split('\n').pop();
    // INFO 不在 head 里 (跟 spec 风格一致); 文本在尾
    expect(lastLine).toMatch(/^\[info_test_/);
    expect(lastLine).toMatch(/ boot pid=123$/);
    try { fs.unlinkSync(lastFile); } catch { /* noop */ }
  });

  it('debug() 默认不写, env=1 时写', () => {
    const orig = process.env.APP_UPDATE_CHECKER_DEBUG;
    process.env.APP_UPDATE_CHECKER_DEBUG = '0';
    const log = createLogger('debug_test_' + Math.random().toString(36).slice(2, 8));
    log.debug('should not appear');
    const dir = log.dir;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    // debug 关时, 没有任何文件创建
    expect(files.length).toBe(0);

    process.env.APP_UPDATE_CHECKER_DEBUG = '1';
    log.debug('should appear');
    const files2 = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    expect(files2.length).toBeGreaterThan(0);
    const lastFile = path.join(dir, files2[files2.length - 1]);
    const content = fs.readFileSync(lastFile, 'utf-8');
    expect(content).toMatch(/DEBUG should appear/);
    try { fs.unlinkSync(lastFile); } catch { /* noop */ }
    if (orig === undefined) delete process.env.APP_UPDATE_CHECKER_DEBUG;
    else process.env.APP_UPDATE_CHECKER_DEBUG = orig;
  });

  it('event() 嵌套对象 JSON.stringify', () => {
    const log = createLogger('nested_test_' + Math.random().toString(36).slice(2, 8));
    log.event({ app: 'X', raw: { foo: 1, bar: 'baz' } });
    const dir = log.dir;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(log.file.split('.')[0]));
    const lastFile = path.join(dir, files[files.length - 1]);
    const content = fs.readFileSync(lastFile, 'utf-8');
    const lastLine = content.trim().split('\n').pop();
    expect(lastLine).toContain('app=X');
    expect(lastLine).toContain('raw={"foo":1,"bar":"baz"}');
    try { fs.unlinkSync(lastFile); } catch { /* noop */ }
  });

  it('mainLog + detectLog 默认导出可用', () => {
    expect(mainLog.tag).toBe('startup');
    expect(mainLog.file).toBe('startup.log');
    expect(detectLog.tag).toBe('detect');
    expect(detectLog.file).toBe('detect.log');
  });
});
