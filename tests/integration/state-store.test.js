/**
 * tests/integration/state-store.test.js
 *
 * Phase 12: last-known state 持久化.
 * 测试 atomic 写, merge 行为, 损坏文件不阻塞.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { load, saveAll, saveOne, markNotified, SCHEMA_VERSION } from '../../src/main/state-store.ts';

describe('state-store', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-store-test-'));
    statePath = path.join(tmpDir, 'state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('文件不存在 → null', () => {
      expect(load(statePath)).toBeNull();
    });

    it('文件存在且合法 → 返回 state', () => {
      const data = { v: 1, ts: 1000, apps: { Cursor: { name: 'Cursor', ts: 500 } } };
      fs.writeFileSync(statePath, JSON.stringify(data));
      const s = load(statePath);
      expect(s).toEqual(data);
    });

    it('JSON 解析失败 → null (不 throw)', () => {
      fs.writeFileSync(statePath, '{ not json }');
      expect(load(statePath)).toBeNull();
    });

    it('缺 apps 字段 → null (当成损坏文件)', () => {
      fs.writeFileSync(statePath, JSON.stringify({ v: 1, ts: 1 }));
      expect(load(statePath)).toBeNull();
    });
  });

  describe('saveAll', () => {
    it('新文件 → 创建 + 写', () => {
      const r = saveAll([{ name: 'Cursor', installed_version: '3.6.31', has_update: false }], statePath);
      expect(r.v).toBe(SCHEMA_VERSION);
      expect(r.apps.Cursor).toMatchObject({ name: 'Cursor', installed_version: '3.6.31' });
      expect(typeof r.apps.Cursor.ts).toBe('number');
      // 落盘
      expect(fs.existsSync(statePath)).toBe(true);
    });

    it('merge 行为: 已有 app 保留, 新 app 加进去', () => {
      saveAll([{ name: 'Cursor', installed_version: '3.6.30' }], statePath);
      saveAll([{ name: 'Marvis', installed_version: '1.0.10050' }], statePath);
      const s = load(statePath);
      expect(Object.keys(s.apps).sort()).toEqual(['Cursor', 'Marvis']);
    });

    it('同名 result 覆盖 (latest wins)', () => {
      saveAll([{ name: 'Cursor', installed_version: '3.6.30' }], statePath);
      saveAll([{ name: 'Cursor', installed_version: '3.6.31' }], statePath);
      const s = load(statePath);
      expect(s.apps.Cursor.installed_version).toBe('3.6.31');
    });

    it('没 name 的 result 跳过', () => {
      const r = saveAll([
        { name: 'Cursor', installed_version: '3.6.31' },
        { installed_version: '1.0' },  // 没 name
        null,                          // null
        undefined,                     // undefined
      ], statePath);
      expect(Object.keys(r.apps)).toEqual(['Cursor']);
    });

    it('每次 saveAll 给 result 加 ts', () => {
      const before = Date.now();
      const r = saveAll([{ name: 'A' }], statePath);
      const after = Date.now();
      expect(r.apps.A.ts).toBeGreaterThanOrEqual(before);
      expect(r.apps.A.ts).toBeLessThanOrEqual(after);
    });
  });

  describe('saveOne', () => {
    it('等价于 saveAll([one])', () => {
      saveOne({ name: 'Cursor', installed_version: '3.6.31' }, statePath);
      const s = load(statePath);
      expect(s.apps.Cursor).toMatchObject({ name: 'Cursor', installed_version: '3.6.31' });
    });

    it('多次 saveOne 累加', () => {
      saveOne({ name: 'A' }, statePath);
      saveOne({ name: 'B' }, statePath);
      saveOne({ name: 'C' }, statePath);
      const s = load(statePath);
      expect(Object.keys(s.apps).sort()).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Phase 17: markNotified (cooldown 跟踪)', () => {
    it('标一批 app 已通知, 写 last_notified 时间戳', () => {
      saveOne({ name: 'X' }, statePath);
      const before = Date.now();
      markNotified(['X', 'Y'], statePath);
      const after = Date.now();
      const s = load(statePath);
      expect(s.apps.X.last_notified).toBeGreaterThanOrEqual(before);
      expect(s.apps.X.last_notified).toBeLessThanOrEqual(after);
    });

    it('name 不在 state 里 → 静默跳过 (不创建空记录)', () => {
      saveOne({ name: 'X' }, statePath);
      markNotified(['X', 'NotExist'], statePath);
      const s = load(statePath);
      expect(s.apps.NotExist).toBeUndefined();
    });

    it('多次 markNotified 更新 last_notified (不是叠加)', () => {
      saveOne({ name: 'X' }, statePath);
      const t1 = Date.now();
      markNotified(['X'], statePath);
      const s1 = load(statePath).apps.X.last_notified;
      // 等几毫秒
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      return wait(5).then(() => {
        markNotified(['X'], statePath);
        const s2 = load(statePath).apps.X.last_notified;
        expect(s2).toBeGreaterThanOrEqual(s1);
        expect(s2 - s1).toBeLessThan(1000);
        expect(t1).toBeLessThanOrEqual(s1);
      });
    });

    it('空数组 → null, 不动 state', () => {
      saveOne({ name: 'X' }, statePath);
      const before = JSON.stringify(load(statePath));
      const r = markNotified([], statePath);
      expect(r).toBeNull();
      const after = JSON.stringify(load(statePath));
      expect(after).toBe(before);
    });
  });

  describe('Phase 17: saveAll 保留 last_notified', () => {
    it('saveAll 后已有的 last_notified 仍存在', () => {
      saveOne({ name: 'X' }, statePath);
      markNotified(['X'], statePath);
      const before = load(statePath).apps.X.last_notified;
      // saveAll 同名 result 应该保留 last_notified
      saveAll([{ name: 'X', has_update: true }], statePath);
      const after = load(statePath).apps.X.last_notified;
      expect(after).toBe(before);
    });
  });

  describe('Phase 18: changelog_history 滚动保存', () => {
    it('latest_version 变化 → 把旧 changelog 推到 history', () => {
      // 第一次 check: version 1.0, 有 changelog
      saveAll([{
        name: 'X',
        latest_version: '1.0',
        has_update: false,
        changelog: '## 1.0\n- Initial release',
        changelog_url: 'https://x/v1',
      }], statePath);
      expect(load(statePath).apps.X.changelog_history).toBeUndefined();

      // 第二次 check: version 1.1, 新的 changelog
      saveAll([{
        name: 'X',
        latest_version: '1.1',
        has_update: true,
        changelog: '## 1.1\n- Fix bug',
        changelog_url: 'https://x/v1.1',
      }], statePath);

      const s = load(statePath);
      expect(s.apps.X.latest_version).toBe('1.1');
      expect(s.apps.X.changelog).toContain('Fix bug');
      expect(s.apps.X.changelog_history).toHaveLength(1);
      expect(s.apps.X.changelog_history[0]).toMatchObject({
        version: '1.0',
        changelog: '## 1.0\n- Initial release',
        changelog_url: 'https://x/v1',
      });
    });

    it('latest_version 没变 → history 不动', () => {
      saveAll([{ name: 'X', latest_version: '1.0', changelog: 'A' }], statePath);
      saveAll([{ name: 'X', latest_version: '1.0', changelog: 'A again' }], statePath);
      const s = load(statePath);
      expect(s.apps.X.changelog_history).toBeUndefined(); // 没版本变化, 没 history
    });

    it('多次版本变化 → history 累加, 最新在队首, 限 10 条', () => {
      for (let v = 1; v <= 12; v++) {
        saveAll([{ name: 'X', latest_version: String(v), changelog: `Release ${v}` }], statePath);
      }
      const hist = load(statePath).apps.X.changelog_history;
      expect(hist).toHaveLength(10);
      // 队首是 v=11 (倒数第二), 队尾是 v=2 (最早保留的)
      expect(hist[0].version).toBe('11');
      expect(hist[9].version).toBe('2');
    });

    it('重复 version 不重复推入 (dedupe)', () => {
      // 状态: latest_version=1.0, history 里有 1.0
      saveAll([{ name: 'X', latest_version: '1.0', changelog: 'A' }], statePath);
      saveAll([{ name: 'X', latest_version: '2.0', changelog: 'B' }], statePath);
      expect(load(statePath).apps.X.changelog_history).toHaveLength(1);
      // 退回 1.0 (网络抽风 / 版本回滚): history 还是只有 1 条
      saveAll([{ name: 'X', latest_version: '1.0', changelog: 'A' }], statePath);
      expect(load(statePath).apps.X.changelog_history).toHaveLength(1);
    });

    it('没有 changelog 的 prev → 不进 history (避免空记录)', () => {
      saveAll([{ name: 'X', latest_version: '1.0' }], statePath);
      saveAll([{ name: 'X', latest_version: '2.0', changelog: 'B' }], statePath);
      expect(load(statePath).apps.X.changelog_history).toBeUndefined();
    });

    it('latest_version 同名但没变 → 不入 history (字符串比较严格)', () => {
      saveAll([{ name: 'X', latest_version: '1.0.0', changelog: 'A' }], statePath);
      saveAll([{ name: 'X', latest_version: '1.0.0', changelog: 'A2' }], statePath);
      expect(load(statePath).apps.X.changelog_history).toBeUndefined();
    });
  });

  describe('defaultPath', () => {
    it('默认到 ~/Library/Application Support/AppUpdateChecker/state.json', async () => {
      const { defaultPath } = await import('../../src/main/state-store.ts');
      const p = defaultPath();
      expect(p).toContain(path.join('Library', 'Application Support', 'AppUpdateChecker', 'state.json'));
    });
  });
});
