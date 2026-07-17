/**
 * tests/main/timer-registry.test.js
 *
 * Phase Q5 v1: registry unit tests. Pure node environment, no Electron.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registry = require('../../src/main/timer-registry.js');

beforeEach(() => {
  registry.__resetForTest();
});

afterEach(() => {
  registry.__resetForTest();
});

describe('setManagedInterval', () => {
  it('登记到 listManaged 含正确 type=interval', () => {
    const h = registry.setManagedInterval(() => {}, 60000, { label: 'tick' });
    const all = registry.listManaged();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe('interval');
    expect(all[0].label).toBe('tick');
    expect(all[0].id).toBe(h.id);
    expect(all[0].startedAt).toBeGreaterThan(0);
  });

  it('缺省 meta 时 label 是 anon, file/line 是 null', () => {
    registry.setManagedInterval(() => {}, 60000);
    const [entry] = registry.listManaged();
    expect(entry.label).toBe('anon');
    expect(entry.file).toBeNull();
    expect(entry.line).toBeNull();
  });
});

describe('setManagedTimeout', () => {
  it('type 区分 timeout', () => {
    registry.setManagedTimeout(() => {}, 100);
    const [entry] = registry.listManaged();
    expect(entry.type).toBe('timeout');
  });
});

describe('clearManaged', () => {
  it('从 listManaged 移除 + 返回 true', () => {
    const h = registry.setManagedInterval(() => {}, 60000, { label: 'x' });
    expect(registry.listManaged()).toHaveLength(1);
    expect(registry.clearManaged(h)).toBe(true);
    expect(registry.listManaged()).toHaveLength(0);
  });

  it('传入已失效 handle 不抛, 返回 false', () => {
    const h = registry.setManagedInterval(() => {}, 60000);
    registry.clearManaged(h);
    // 再次 clear 同一个 handle
    expect(() => registry.clearManaged(h)).not.toThrow();
    expect(registry.clearManaged(h)).toBe(false);
  });

  it('传入非法输入(无 id) 不抛, 返回 false', () => {
    expect(() => registry.clearManaged(null)).not.toThrow();
    expect(() => registry.clearManaged({})).not.toThrow();
    expect(registry.clearManaged(null)).toBe(false);
    expect(registry.clearManaged({})).toBe(false);
  });
});

describe('clearAllManaged', () => {
  it('不传 labelPrefix 时清空所有', () => {
    registry.setManagedInterval(() => {}, 1000, { label: 'a' });
    registry.setManagedInterval(() => {}, 1000, { label: 'b' });
    registry.setManagedTimeout(() => {}, 100, { label: 'c' });
    const cleared = registry.clearAllManaged();
    expect(cleared).toBe(3);
    expect(registry.getStats().count).toBe(0);
  });

  it('传 labelPrefix 时只清匹配前缀的', () => {
    registry.setManagedInterval(() => {}, 1000, { label: 'fund.tick' });
    registry.setManagedInterval(() => {}, 1000, { label: 'worldcup.tick' });
    registry.setManagedInterval(() => {}, 1000, { label: 'fund.goals' });
    const cleared = registry.clearAllManaged('fund.');
    expect(cleared).toBe(2);
    const remaining = registry.listManaged();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('worldcup.tick');
  });

  it('清理后原生 timer 不再执行回调', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    registry.setManagedInterval(callback, 10, { label: 'tick' });
    registry.setManagedTimeout(callback, 10, { label: 'once' });
    expect(registry.clearAllManaged()).toBe(2);
    vi.advanceTimersByTime(20);
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('getStats', () => {
  it('按 type 分别计数', () => {
    registry.setManagedInterval(() => {}, 1000);
    registry.setManagedInterval(() => {}, 2000);
    registry.setManagedTimeout(() => {}, 100);
    const stats = registry.getStats();
    expect(stats.count).toBe(3);
    expect(stats.byType.interval).toBe(2);
    expect(stats.byType.timeout).toBe(1);
  });
});

describe('id 不重复', () => {
  it('连续 setManagedInterval 同一 label, id 单调递增不重复', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const h = registry.setManagedInterval(() => {}, 1000, { label: 'same' });
      expect(ids.has(h.id)).toBe(false);
      ids.add(h.id);
    }
    expect(ids.size).toBe(50);
  });
});
