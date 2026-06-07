/**
 * tests/main/state-store.test.js
 *
 * Phase 27: mutes schema + set/clear/expire/clean.
 *
 * 覆盖:
 *   - isMuteActive (纯函数, 边界: until=0=forever, until<now=expired, until>now=active)
 *   - cleanExpiredMutes (纯函数, 过滤掉过期项, 不 mutate 原对象)
 *   - getMutes (load 失败 → {}, 旧 state 缺 mutes → {}, 过期项不返)
 *   - setMute (新 mute, 写盘, 旧 mutes 保留, 过期项清理)
 *   - clearMute (删除存在的/不存在的, 写盘, 过期项清理)
 *   - 输入校验 (name 空, until 非法)
 *   - 老 state.json (无 mutes 字段) 兼容
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  load,
  getMutes,
  setMute,
  clearMute,
  isMuteActive,
  cleanExpiredMutes,
  saveAll,
  markNotified,
  loadLastOpened,
  saveLastOpened,
} from '../../src/main/state-store.js';

let tmpDir;
let statePath;
const NOW = 1750000000000; // 固定时间便于断言

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-store-test-'));
  statePath = path.join(tmpDir, 'state.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── isMuteActive (纯函数) ─────────────────────────────

describe('isMuteActive (Phase 27 pure fn)', () => {
  it('null/非对象 → false', () => {
    expect(isMuteActive(null, NOW)).toBe(false);
    expect(isMuteActive(undefined, NOW)).toBe(false);
    expect(isMuteActive('foo', NOW)).toBe(false);
    expect(isMuteActive(123, NOW)).toBe(false);
  });

  it('until=0 → 永远有效', () => {
    expect(isMuteActive({ until: 0 }, NOW)).toBe(true);
    expect(isMuteActive({ until: 0, reason: 'manual' }, NOW)).toBe(true);
  });

  it('until>now → 还有效', () => {
    expect(isMuteActive({ until: NOW + 1000 }, NOW)).toBe(true);
  });

  it('until<now → 过期', () => {
    expect(isMuteActive({ until: NOW - 1 }, NOW)).toBe(false);
    expect(isMuteActive({ until: NOW - 999999 }, NOW)).toBe(false);
  });

  it('until=now → 过期 (now < until 严格)', () => {
    // 边界: now 恰好等于 until, 视为过期
    expect(isMuteActive({ until: NOW }, NOW)).toBe(false);
  });
});

// ─── cleanExpiredMutes (纯函数) ────────────────────────

describe('cleanExpiredMutes (Phase 27 pure fn)', () => {
  it('空/非对象 → {}', () => {
    expect(cleanExpiredMutes(null, NOW)).toEqual({});
    expect(cleanExpiredMutes(undefined, NOW)).toEqual({});
    expect(cleanExpiredMutes('foo', NOW)).toEqual({});
  });

  it('混合: 留 forever + 留 future + 丢 past', () => {
    const input = {
      A: { until: 0, reason: 'manual' },                    // 永远 → 留
      B: { until: NOW + 10000, reason: 'manual' },          // future → 留
      C: { until: NOW - 1, reason: 'manual' },              // past → 丢
      D: { until: NOW - 999999, reason: 'manual' },         // past → 丢
    };
    expect(cleanExpiredMutes(input, NOW)).toEqual({
      A: { until: 0, reason: 'manual' },
      B: { until: NOW + 10000, reason: 'manual' },
    });
  });

  it('不 mutate 原对象', () => {
    const input = { A: { until: 0 }, B: { until: NOW - 1 } };
    const before = JSON.stringify(input);
    cleanExpiredMutes(input, NOW);
    expect(JSON.stringify(input)).toBe(before);
  });
});

// ─── getMutes (load 路径) ───────────────────────────────

describe('getMutes (Phase 27 read)', () => {
  it('文件不存在 → {}', () => {
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it('老 state.json (无 mutes 字段) → {} (向后兼容)', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, ts: 1, apps: { Cursor: { name: 'Cursor' } } }), 'utf-8');
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it('mutes 是数组 (损坏) → {}', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, mutes: [] }), 'utf-8');
    expect(getMutes(statePath, NOW)).toEqual({});
  });

  it('返回时过滤掉过期项', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: {
        A: { until: 0, reason: 'manual' },
        B: { until: NOW + 100, reason: 'manual' },
        C: { until: NOW - 1, reason: 'manual' },
      },
    }), 'utf-8');
    expect(getMutes(statePath, NOW)).toEqual({
      A: { until: 0, reason: 'manual' },
      B: { until: NOW + 100, reason: 'manual' },
    });
  });

  it('不自动写盘 (只读)', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: { A: { until: NOW - 1, reason: 'manual' } },
    }), 'utf-8');
    getMutes(statePath, NOW);
    // 写盘时间 ts 跟原来一致 (未被 cleanExpiredMutes 写回)
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({ A: { until: NOW - 1, reason: 'manual' } });
  });
});

// ─── setMute (写盘) ─────────────────────────────────────

describe('setMute (Phase 27 write)', () => {
  it('新 mute: 写入 mutes 字段, 落盘', () => {
    const result = setMute('Cursor', NOW + 7 * 24 * 3600 * 1000, 'manual', statePath);
    expect(result.mutes).toEqual({
      Cursor: { until: NOW + 7 * 24 * 3600 * 1000, reason: 'manual' },
    });
    // 写盘
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({
      Cursor: { until: NOW + 7 * 24 * 3600 * 1000, reason: 'manual' },
    });
  });

  it('until=0 (永远)', () => {
    const result = setMute('Cursor', 0, 'manual', statePath);
    expect(result.mutes.Cursor.until).toBe(0);
  });

  it('reason 缺省 → "manual"', () => {
    const result = setMute('Cursor', NOW + 1000, undefined, statePath);
    expect(result.mutes.Cursor.reason).toBe('manual');
  });

  it('保留旧 mutes', () => {
    setMute('Cursor', 0, 'manual', statePath);
    setMute('Kimi', NOW + 1000, 'manual', statePath);
    const result = getMutes(statePath, NOW);
    expect(Object.keys(result).sort()).toEqual(['Cursor', 'Kimi']);
  });

  it('同名覆盖: 新值替旧值', () => {
    setMute('Cursor', NOW + 100, 'manual', statePath);
    setMute('Cursor', 0, 'manual', statePath);
    const result = getMutes(statePath, NOW);
    expect(result.Cursor.until).toBe(0);
  });

  it('写盘时清理过期项', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: {
        OldApp: { until: NOW - 9999, reason: 'manual' },
      },
    }), 'utf-8');
    setMute('NewApp', NOW + 100, 'manual', statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({
      NewApp: { until: NOW + 100, reason: 'manual' },
    });
  });

  it('保留 apps 字段 (不归 0)', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: { Cursor: { name: 'Cursor', latest_version: '3.6' } },
      mutes: {},
    }), 'utf-8');
    setMute('Cursor', 0, 'manual', statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.apps.Cursor.latest_version).toBe('3.6');
  });

  it('name 空 → TypeError', () => {
    expect(() => setMute('', 0, 'manual', statePath)).toThrow(TypeError);
    expect(() => setMute(null, 0, 'manual', statePath)).toThrow(TypeError);
  });

  it('until 非法 → TypeError', () => {
    expect(() => setMute('Cursor', -1, 'manual', statePath)).toThrow(TypeError);
    expect(() => setMute('Cursor', NaN, 'manual', statePath)).toThrow(TypeError);
    expect(() => setMute('Cursor', Infinity, 'manual', statePath)).toThrow(TypeError);
    expect(() => setMute('Cursor', '1000', 'manual', statePath)).toThrow(TypeError);
  });
});

// ─── clearMute (写盘) ───────────────────────────────────

describe('clearMute (Phase 27 write)', () => {
  it('删除存在的 mute', () => {
    setMute('Cursor', 0, 'manual', statePath);
    setMute('Kimi', 0, 'manual', statePath);
    clearMute('Cursor', statePath);
    const result = getMutes(statePath, NOW);
    expect(result).toEqual({ Kimi: { until: 0, reason: 'manual' } });
  });

  it('删除不存在的 mute → noop', () => {
    setMute('Cursor', 0, 'manual', statePath);
    clearMute('NoSuchApp', statePath);
    const result = getMutes(statePath, NOW);
    expect(Object.keys(result)).toEqual(['Cursor']);
  });

  it('写盘时清理过期项 (跟 setMute 行为一致)', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: {
        Old: { until: NOW - 1, reason: 'manual' },
        Active: { until: NOW + 100, reason: 'manual' },
      },
    }), 'utf-8');
    clearMute('Active', statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({});
  });

  it('name 空 → TypeError', () => {
    expect(() => clearMute('', statePath)).toThrow(TypeError);
  });
});

// ─── load() 兼容老 state.json ─────────────────────────

describe('load() mutes 兼容 (Phase 27)', () => {
  it('老 state.json 无 mutes → load 不 mutate, 仍可读 (mutes undefined)', () => {
    // load() 是纯读, 不强制注入 mutes. 兼容老的 state.json 形状.
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: { Cursor: {} } }), 'utf-8');
    const s = load(statePath);
    expect(s.mutes).toBeUndefined();
  });

  it('saveAll 写 mutes 字段 (跟 apps 平级)', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, mutes: { A: { until: 0, reason: 'manual' } } }), 'utf-8');
    saveAll([{ name: 'Cursor', latest_version: '3.6', has_update: false, status: 'up_to_date' }], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({ A: { until: 0, reason: 'manual' } });
    expect(raw.apps.Cursor.latest_version).toBe('3.6');
  });

  it('saveAll 写盘时清过期', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: { A: { until: NOW - 1, reason: 'manual' } },
    }), 'utf-8');
    saveAll([], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({});
  });
});

// ─── Phase 29: Last-opened ─────────────────────────────────────

describe('loadLastOpened / saveLastOpened (Phase 29)', () => {
  it('文件不存在 → {}', () => {
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it('老 state.json (无 last_opened 字段) → {} (向后兼容)', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: { Cursor: { name: 'Cursor' } } }), 'utf-8');
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it('last_opened 是数组 (损坏) → {}', () => {
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, last_opened: [] }), 'utf-8');
    expect(loadLastOpened(statePath)).toEqual({});
  });

  it('读出 last_opened map', () => {
    const lo = {
      Cursor:    { ms: 1750000000000, source: 'spotlight' },
      WorkBuddy: { ms: null,          source: 'unknown' },
    };
    fs.writeFileSync(statePath, JSON.stringify({ v: 1, apps: {}, last_opened: lo }), 'utf-8');
    expect(loadLastOpened(statePath)).toEqual(lo);
  });

  it('saveLastOpened 写入 + 原子', () => {
    const map = { Cursor: { ms: 1750000000000, source: 'spotlight' } };
    saveLastOpened(map, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.last_opened).toEqual(map);
  });

  it('saveLastOpened 保留 apps 字段 (不归 0)', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: { Cursor: { name: 'Cursor', latest_version: '3.6' } },
      mutes: {},
    }), 'utf-8');
    saveLastOpened({ Kimi: { ms: 1700000000000, source: 'spotlight' } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.apps.Cursor.latest_version).toBe('3.6');
    expect(raw.last_opened.Kimi.ms).toBe(1700000000000);
  });

  it('saveLastOpened 保留 mutes 字段', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: { Cursor: { until: 0, reason: 'manual' } },
    }), 'utf-8');
    saveLastOpened({ Kimi: { ms: 1700000000000, source: 'atime' } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes.Cursor.until).toBe(0);
    expect(raw.last_opened.Kimi.source).toBe('atime');
  });

  it('saveLastOpened 写盘时清过期 mutes', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: { Old: { until: NOW - 1, reason: 'manual' } },
    }), 'utf-8');
    saveLastOpened({ X: { ms: 1, source: 'spotlight' } }, statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.mutes).toEqual({});
  });

  it('saveLastOpened 校验: map 必须是 plain object', () => {
    expect(() => saveLastOpened(null, statePath)).toThrow(TypeError);
    expect(() => saveLastOpened('foo', statePath)).toThrow(TypeError);
    expect(() => saveLastOpened([], statePath)).toThrow(TypeError);
  });

  it('saveAll 写盘时保留 last_opened 字段', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: {},
      last_opened: { X: { ms: 123, source: 'spotlight' } },
    }), 'utf-8');
    saveAll([{ name: 'Cursor', latest_version: '3.6', has_update: false, status: 'up_to_date' }], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.last_opened.X.ms).toBe(123);
  });

  it('markNotified 写盘时保留 last_opened 字段', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: { Cursor: { name: 'Cursor' } },
      mutes: {},
      last_opened: { Cursor: { ms: 999, source: 'spotlight' } },
    }), 'utf-8');
    markNotified(['Cursor'], statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.last_opened.Cursor.ms).toBe(999);
  });

  it('clearMute 写盘时保留 last_opened 字段', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      v: 1,
      apps: {},
      mutes: { Cursor: { until: 0, reason: 'manual' } },
      last_opened: { Cursor: { ms: 999, source: 'spotlight' } },
    }), 'utf-8');
    clearMute('Cursor', statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(raw.last_opened.Cursor.ms).toBe(999);
  });
});
