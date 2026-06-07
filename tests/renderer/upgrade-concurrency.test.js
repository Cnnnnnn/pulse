/**
 * tests/renderer/upgrade-concurrency.test.js
 *
 * 验证 spec §7 的并发限流 helper (createPool)。
 *
 * 测试 4 个不变量:
 *   1. 并发数上限: 2 池子, 5 个 task, 任意时刻 in-flight ≤ 2
 *   2. 全跑: 5 个 task 都能 resolve
 *   3. 失败吸收: 一个 task reject, 其他不受影响
 *   4. 失败时仍调 _next (并发槽能复用)
 *
 * 跑: npx vitest run tests/renderer/upgrade-concurrency.test.js
 */

import { describe, it, expect } from 'vitest';
import { createPool } from '../../src/renderer/upgrade-concurrency.js';

describe('createPool (spec §7 升级并发)', () => {
  it('concurrency=2: 5 个 task 任意时刻 in-flight ≤ 2', async () => {
    const pool = createPool(2);
    let active = 0;
    let peak = 0;

    function task(id, ms) {
      return pool(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
        return id;
      });
    }

    const tasks = [
      task('a', 30),
      task('b', 30),
      task('c', 30),
      task('d', 30),
      task('e', 30),
    ];
    const results = await Promise.all(tasks);

    expect(results).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);   // 实际应该打满到 2
  });

  it('allSettled 模式: 一个失败不影响其他', async () => {
    const pool = createPool(2);

    const tasks = [
      pool(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'ok-1';
      }),
      pool(async () => {
        throw new Error('brew lock');
      }),
      pool(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return 'ok-2';
      }),
    ];

    const settled = await Promise.allSettled(tasks);
    expect(settled[0].status).toBe('fulfilled');
    expect(settled[0].value).toBe('ok-1');
    expect(settled[1].status).toBe('rejected');
    expect(settled[1].reason.message).toBe('brew lock');
    expect(settled[2].status).toBe('fulfilled');
    expect(settled[2].value).toBe('ok-2');
  });

  it('空池子不卡住, 立即 resolve', async () => {
    const pool = createPool(2);
    const t0 = Date.now();
    const out = await pool(async () => 42);
    const dt = Date.now() - t0;
    expect(out).toBe(42);
    expect(dt).toBeLessThan(20);
  });

  it('concurrency=1 = 串行: 第二个一定在第一个之后开始', async () => {
    const pool = createPool(1);
    const order = [];
    const t = pool(async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
    });
    const t2 = pool(async () => {
      order.push('b-start');
    });
    await Promise.all([t, t2]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });

  it('并发上限 4: 12 个 task peak 不会超过 4', async () => {
    const pool = createPool(4);
    let active = 0;
    let peak = 0;

    const tasks = Array.from({ length: 12 }, (_, i) =>
      pool(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 8));
        active--;
        return i;
      })
    );
    await Promise.all(tasks);
    expect(peak).toBe(4);
  });
});
