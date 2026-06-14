/**
 * tests/ai-usage/state-store-history.test.js
 *
 * 单测 state.json 的 ai_usage_history 字段 load / save / append / GC.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-state-history-'));
const statePath = path.join(tmpRoot, 'state.json');

let stateStore;
beforeEach(async () => {
  vi.resetModules();
  // 删旧文件
  try { fs.unlinkSync(statePath); } catch { /* */ }
  // 强制 userData 路径用我们的 tmp, 避免污染真实 state.json
  vi.doMock('electron', () => ({
    app: { getPath: () => tmpRoot },
  }));
  stateStore = require('../../src/main/state-store');
});

describe('loadAiUsageHistory', () => {
  test('state.json 不存在 → { days: [] }', () => {
    expect(stateStore.loadAiUsageHistory(statePath)).toEqual({ days: [] });
  });
  test('无 ai_usage_history 字段 → { days: [] }', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: {} }), 'utf-8');
    expect(stateStore.loadAiUsageHistory(statePath)).toEqual({ days: [] });
  });
  test('非法 ai_usage_history (非 object) → { days: [] }', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: {}, ai_usage_history: 'bad' }), 'utf-8');
    expect(stateStore.loadAiUsageHistory(statePath)).toEqual({ days: [] });
  });
  test('合法 days 数组 → 返回', () => {
    const days = [
      { date: '2026-06-12', used: 100, percent: 20 },
      { date: '2026-06-13', used: 200, percent: 30 },
    ];
    fs.writeFileSync(statePath, JSON.stringify({ apps: {}, ai_usage_history: { days } }), 'utf-8');
    const r = stateStore.loadAiUsageHistory(statePath);
    expect(r.days.length).toBe(2);
    // cleanExpiredUsageHistory 按 date 倒序
    expect(r.days[0].date).toBe('2026-06-13');
    expect(r.days[1].date).toBe('2026-06-12');
  });
});

describe('appendAiUsageHistoryDay', () => {
  test('date 格式不合法 → throw', () => {
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026/06/13', percent: 20 }, statePath))
      .toThrow(/YYYY-MM-DD/);
  });
  test('percent 缺失/非 number/越界 → throw', () => {
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 'x' }, statePath))
      .toThrow(/0-100/);
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026-06-13' }, statePath))
      .toThrow(/0-100/);
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 150 }, statePath))
      .toThrow(/0-100/);
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: -1 }, statePath))
      .toThrow(/0-100/);
  });
  test('used (可选) 非 number → throw', () => {
    expect(() => stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 20, used: 'x' }, statePath))
      .toThrow(/non-negative number/);
  });
  test('首次 append → 写盘 1 条 (used 缺省 → null), 其它字段保留', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: { Foo: { name: 'Foo' } } }), 'utf-8');
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 20 }, statePath);
    const r = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(r.ai_usage_history.days).toEqual([
      expect.objectContaining({ date: '2026-06-13', percent: 20, used: null }),
    ]);
    expect(r.apps.Foo.name).toBe('Foo'); // 其它字段保留
  });
  test('同一天多次 append → percent 取 max, used 各自取 max', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: {} }), 'utf-8');
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 20, used: 100 }, statePath);
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 30, used: 200 }, statePath);
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 25, used: 150 }, statePath);
    const r = stateStore.loadAiUsageHistory(statePath);
    expect(r.days.length).toBe(1);
    expect(r.days[0].percent).toBe(30);
    expect(r.days[0].used).toBe(200);
  });
  test('不同天 append → 累加 entries', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: {} }), 'utf-8');
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-12', percent: 15, used: 100 }, statePath);
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 25, used: 200 }, statePath);
    const r = stateStore.loadAiUsageHistory(statePath);
    expect(r.days.length).toBe(2);
  });
  test('同 date 新 entry 只有 percent (没 used) → 旧 used 保留', () => {
    fs.writeFileSync(statePath, JSON.stringify({ apps: {} }), 'utf-8');
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 20, used: 500 }, statePath);
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 30 }, statePath); // 无 used
    const r = stateStore.loadAiUsageHistory(statePath);
    expect(r.days[0].percent).toBe(30);
    expect(r.days[0].used).toBe(500); // 旧 used 保留
  });
  test('保留 apps / mutes / ai_usage / last_opened 其它字段 (patchState 自动 preserve)', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      apps: { Foo: { name: 'Foo' } },
      mutes: { Foo: { until: 0, reason: 'manual' } },
      ai_usage: { provider: 'minimax', region: 'cn' },
      last_opened: { Foo: { ms: 12345, source: 'spotlight' } },
    }), 'utf-8');
    stateStore.appendAiUsageHistoryDay({ date: '2026-06-13', percent: 20, used: 100 }, statePath);
    const r = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(r.apps.Foo.name).toBe('Foo');
    expect(r.mutes.Foo.until).toBe(0);
    expect(r.ai_usage.provider).toBe('minimax');
    expect(r.last_opened.Foo.ms).toBe(12345);
    expect(r.ai_usage_history.days.length).toBe(1);
  });
});

describe('cleanExpiredUsageHistory', () => {
  test('超过 30 天的 entry 自动 GC, 按 date 倒序保留最近 30 条', () => {
    // 直接构造 35 条
    const days = [];
    for (let i = 35; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push({ date: `${yyyy}-${mm}-${dd}`, used: 100 });
    }
    fs.writeFileSync(statePath, JSON.stringify({ apps: {}, ai_usage_history: { days } }), 'utf-8');
    const r = stateStore.loadAiUsageHistory(statePath);
    expect(r.days.length).toBe(30);
    // 最新一条应该是昨天 (35-30=5, i=5 → 距今 5 天)
    expect(r.days[0].date > r.days[29].date).toBe(true); // 倒序
  });
});
