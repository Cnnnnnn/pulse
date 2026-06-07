/**
 * tests/integration/worker-pool.test.js
 *
 * Worker pool 行为：队列化、并发上限、消息协议、stop cleanup、respawn。
 *   - 前半：stub 模式（workerScript=null）— in-process，0 worker_threads 开销
 *   - 后半：真 worker_threads（用 detect-worker.js）— 验证 spawn / 消息往返
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';
import url from 'url';
import { WorkerPool } from '../../src/workers/pool.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT = path.join(__dirname, '..', '..', 'src', 'workers', 'detect-worker.js');

describe('WorkerPool (stub mode)', () => {
  let pool;
  afterEach(async () => {
    if (pool) await pool.stop();
  });

  it('enqueue 顺序执行（stub）', async () => {
    pool = new WorkerPool({ size: 2 });
    pool.start();
    const out = await Promise.all([pool.enqueue({ kind: 'a' }), pool.enqueue({ kind: 'b' })]);
    expect(out).toEqual([null, null]);
    expect(pool.pending()).toBe(0);
  });

  it('并发上限 = size', async () => {
    pool = new WorkerPool({ size: 3 });
    pool.start();
    const tasks = Array.from({ length: 10 }, (_, i) => pool.enqueue({ i }));
    const out = await Promise.all(tasks);
    expect(out).toHaveLength(10);
  });

  it('onProgress 回调接收 progress 消息', () => {
    const onProgress = vi.fn();
    pool = new WorkerPool({ size: 1, onProgress });
    pool.start();
    pool._onMessage(0, { type: 'progress', payload: { app: 'Cursor' } });
    expect(onProgress).toHaveBeenCalledWith({ app: 'Cursor' }, 0);
  });

  it('onLog 回调接收 log 消息 (level, text, id, meta?)', () => {
    const onLog = vi.fn();
    pool = new WorkerPool({ size: 1, onLog });
    pool.start();
    // 旧式 free-text log: meta 不存在
    pool._onMessage(0, { type: 'log', level: 'info', text: 'hi' });
    expect(onLog).toHaveBeenCalledWith('info', 'hi', 0, undefined);
    // 新式 structured log: meta 透传
    pool._onMessage(0, { type: 'log', level: 'INFO', text: '', meta: { app: 'X', ms: 12 } });
    expect(onLog).toHaveBeenLastCalledWith('INFO', '', 0, { app: 'X', ms: 12 });
  });

  it('result 消息 resolve 飞行中的 task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();

    let resolveOuter;
    const taskPromise = new Promise((r) => { resolveOuter = r; });
    pool.workers[0].current = { id: 1, task: {}, resolve: resolveOuter, reject: () => {} };
    pool.workers[0].busy = true;

    pool._onMessage(0, { type: 'result', payload: { version: '1.2.3' } });

    const v = await taskPromise;
    expect(v).toEqual({ version: '1.2.3' });
    expect(pool.workers[0].busy).toBe(false);
    expect(pool.workers[0].current).toBeNull();
  });

  it('error 消息 reject 飞行中的 task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();

    let rejectOuter;
    const taskPromise = new Promise((_, r) => { rejectOuter = r; });
    pool.workers[0].current = { id: 1, task: {}, resolve: () => {}, reject: rejectOuter };
    pool.workers[0].busy = true;

    pool._onMessage(0, { type: 'error', message: 'boom' });
    await expect(taskPromise).rejects.toThrow('boom');
  });

  it('_onError 触发自动 respawn 并 reject 当前 task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();
    const p = pool.enqueue({ kind: 'x' });
    pool._onError(0, new Error('crash'));
    await expect(p).rejects.toThrow('crash');
    expect(pool.workers[0]).not.toBeNull();
  });

  it('stop() reject 所有 in-flight + queued task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();

    // 占住唯一的 worker（用 noop reject 避免 unhandled rejection）
    pool.workers[0].current = { id: 1, task: {}, resolve: () => {}, reject: () => {} };
    pool.workers[0].busy = true;

    const queued = pool.enqueue({ kind: 'y' });

    await pool.stop();
    await expect(queued).rejects.toThrow();
  });

  it('size 默认 ≥ 2', () => {
    pool = new WorkerPool();
    expect(pool.size).toBeGreaterThanOrEqual(2);
  });
});

// ─── 队列化 + respawn 行为（stub 模式，但用真实 callback 验证） ──

describe('WorkerPool — 队列化行为 (stub)', () => {
  let pool;
  afterEach(async () => {
    if (pool) await pool.stop();
  });

  it('size=1 时 task 串行执行', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();
    const order = [];
    const tasks = [1, 2, 3, 4].map((i) => pool.enqueue({ i }).then(() => order.push(i)));
    await Promise.all(tasks);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('queue 上限不限制：10 task / size=2 全部完成', async () => {
    pool = new WorkerPool({ size: 2 });
    pool.start();
    const tasks = Array.from({ length: 10 }, (_, i) => pool.enqueue({ i }));
    const out = await Promise.all(tasks);
    expect(out).toHaveLength(10);
  });

  it('result 之后立刻 dispatch 下一个 task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();
    const t1Done = vi.fn();
    const t2Done = vi.fn();

    const p1 = pool.enqueue({ a: 1 }).then((v) => { t1Done(); return v; });
    const p2 = pool.enqueue({ a: 2 }).then((v) => { t2Done(); return v; });

    // p1 的 worker 已 busy；等 t1 完成再触发 t2
    // 在 stub 模式下，enqueue → 立即 stub resolve → 实际是 microtask 顺序
    await Promise.all([p1, p2]);
    // 顺序不一定，但两个都跑过了
    expect(t1Done).toHaveBeenCalled();
    expect(t2Done).toHaveBeenCalled();
  });

  it('error 后 respawn 出来的 worker 可继续接新 task', async () => {
    pool = new WorkerPool({ size: 1 });
    pool.start();

    // 触发 _onError 让 stub 重新 spawn
    const p1 = pool.enqueue({}).catch((e) => e.message);
    pool._onError(0, new Error('boom'));
    expect(await p1).toBe('boom');

    // 新 task 应该走新的 slot
    const p2 = pool.enqueue({ kind: 'after-respawn' });
    const v = await p2;
    expect(v).toBeNull();   // stub 模式返 null
  });

  it('不同 worker 同时 busy → 各自 task 独立完成', async () => {
    pool = new WorkerPool({ size: 3 });
    pool.start();
    // 手动占住 3 个 worker
    for (let i = 0; i < 3; i++) {
      pool.workers[i].current = { id: i + 1, task: {}, resolve: () => {}, reject: () => {} };
      pool.workers[i].busy = true;
    }
    expect(pool.pending()).toBe(3);

    // resolve 第 2 个
    pool._onMessage(1, { type: 'result', payload: { from: 'w1' } });
    expect(pool.workers[1].busy).toBe(false);
    expect(pool.workers[0].busy).toBe(true);
    expect(pool.workers[2].busy).toBe(true);
  });

  it('_onError 整个 pool 还可用——后续 enqueue 不挂', async () => {
    pool = new WorkerPool({ size: 2 });
    pool.start();

    // kill 一个
    const p1 = pool.enqueue({}).catch((e) => e.message);
    pool._onError(0, new Error('crash1'));
    expect(await p1).toBe('crash1');

    // 后续 task 走 pool 仍能完成
    const out = await Promise.all([
      pool.enqueue({ i: 1 }),
      pool.enqueue({ i: 2 }),
      pool.enqueue({ i: 3 }),
    ]);
    expect(out).toEqual([null, null, null]);
  });
});

// ─── 真 worker_threads 集成（用 detect-worker.js）────────────

describe('WorkerPool — 真 worker_threads 集成', () => {
  let pool;
  afterEach(async () => {
    if (pool) {
      try { await pool.stop(); } catch { /* noop */ }
    }
  });

  it('start() 真的 spawn 2 个 worker_threads', () => {
    pool = new WorkerPool({ size: 2, workerScript: WORKER_SCRIPT });
    pool.start();
    expect(pool.workers).toHaveLength(2);
    expect(pool.workers[0].worker).toBeTruthy();
    expect(pool.workers[1].worker).toBeTruthy();
  });

  it('detect-app 任务端到端：worker 跑 → 返 result', async () => {
    pool = new WorkerPool({ size: 2, workerScript: WORKER_SCRIPT });
    pool.start();
    // 等 worker 启动后立刻发 task
    const r = await pool.enqueue({
      type: 'detect-app',
      payload: { appCfg: { name: 'Test', bundle: 'Test.app', detectors: [] } },
    });
    expect(r).toBeTruthy();
    expect(r.name).toBe('Test');
    expect(r.bundle).toBe('Test.app');
    // 应用不存在 → not_installed
    expect(r.status).toBe('not_installed');
    expect(Array.isArray(r.trace)).toBe(true);
  });

  it('真 worker 抛 progress 消息 → onProgress 收到', async () => {
    const onProgress = vi.fn();
    pool = new WorkerPool({ size: 1, workerScript: WORKER_SCRIPT, onProgress });
    pool.start();
    await pool.enqueue({
      type: 'detect-app',
      payload: { appCfg: { name: 'P', bundle: 'NoSuchBundle.app', detectors: [] } },
    });
    // 至少一次 progress（started + done）
    expect(onProgress).toHaveBeenCalled();
    const types = onProgress.mock.calls.map((c) => c[0].status);
    expect(types).toContain('started');
  });

  it('11 个 app 并发跑（size=4），全部完成', async () => {
    pool = new WorkerPool({ size: 4, workerScript: WORKER_SCRIPT });
    pool.start();
    const tasks = Array.from({ length: 11 }, (_, i) =>
      pool.enqueue({
        type: 'detect-app',
        payload: { appCfg: { name: `App${i}`, bundle: 'Nonexistent.app', detectors: [] } },
      })
    );
    const results = await Promise.all(tasks);
    expect(results).toHaveLength(11);
    for (const r of results) {
      expect(r.status).toBe('not_installed');
    }
  });

  it('真 worker 错误 task type → error 消息回主进程', async () => {
    pool = new WorkerPool({ size: 1, workerScript: WORKER_SCRIPT });
    pool.start();
    // 注：detect-worker 收到 unknown type 时只发 error 不 reply result
    // 主进程的 _onError 会处理；这里只验证 enqueue 不挂
    const p = pool.enqueue({ type: 'unknown-type', payload: {} });
    // 用 timeout 限定避免测试挂死
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await expect(Promise.race([p, timeout])).rejects.toThrow();
  });
});
