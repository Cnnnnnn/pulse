/**
 * src/workers/pool.ts
 *
 * WorkerPool 骨架（Phase 0）。
 *
 * 设计目标（spec §6）:
 *   - N 个 worker_threads 并行（默认 max(2, hardwareConcurrency-1)）
 *   - 队列化任务，worker idle 时立即派发
 *   - worker 死了自动 respawn；当前 task reject，其余 task 继续
 *   - 消息协议：worker → main 三种 type：'progress' | 'result' | 'log'
 *
 * Phase 0 只搭骨架 + 协议；Phase 2 才会接进主进程。
 * 这版只在 Node 主进程 / 测试里跑（不引入 worker_threads.workerData 也能工作）。
 */

import { Worker } from "worker_threads";
import os from "os";

/**
 * @typedef {object} WorkerSlot
 * @property {Worker}   worker
 * @property {boolean}  busy
 * @property {{id:number, task:any, resolve:Function, reject:Function}|null} current
 */

/**
 * @typedef {object} WorkerPoolOptions
 * @property {number}  [size]              worker 数；默认 max(2, cpus-1)
 * @property {string}  [workerScript]      worker 入口文件；Phase 2 提供
 * @property {object}  [workerOpts]        透传给 worker_threads.Worker
 * @property {function} [onLog]            收到 log 消息时调用 (level, text, workerId, meta?)
 */

export class WorkerPool {
  size: any;
  workerScript: any;
  workerOpts: any;
  onProgress: any;
  onLog: any;
  workers: any;
  queue: any;
  taskId: any;
  started: any;

  /**
   * @param {WorkerPoolOptions} [opts]
   */
  constructor(opts: any = {}) {
    const cpus = (typeof os !== 'undefined' && os.cpus && os.cpus().length) || 4;
    this.size = opts.size ?? Math.max(2, cpus - 1);
    this.workerScript = opts.workerScript || null;
    this.workerOpts = opts.workerOpts || {};
    this.onProgress = opts.onProgress || (() => {});
    this.onLog = opts.onLog || (() => {});

    /** @type {(WorkerSlot|null)[]} */
    this.workers = new Array(this.size).fill(null);
    /** @type {Array<{id:number, task:any, resolve:Function, reject:Function}>} */
    this.queue = [];
    this.taskId = 0;
    this.started = false;
  }

  /**
   * 启动所有 worker。workerScript 缺省时（单测场景）走 stub 模式：
   * 任务直接 in-process resolve，pool 行为仍可测。
   */
  start() {
    if (this.started) return;
    this.started = true;
    for (let i = 0; i < this.size; i++) this._spawn(i);
  }

  /**
   * 关闭所有 worker。运行中 task 会被 reject。
   */
  async stop() {
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[i];
      if (!w) continue;
      if (w.current) {
        try { w.current.reject(new Error('WorkerPool stopped')); } catch { /* noop */ }
        w.current = null;
      }
      try { await w.worker.terminate(); } catch { /* noop */ }
      this.workers[i] = null;
    }
    // 残留队列全部 reject
    while (this.queue.length) {
      const item = this.queue.shift();
      try { item.reject(new Error('WorkerPool stopped')); } catch { /* noop */ }
    }
    this.started = false;
  }

  /**
   * 推入任务；返回 Promise 在 worker 给出 'result' 消息时 resolve。
   * @param {object} task  任意可序列化对象
   * @returns {Promise<any>}
   */
  enqueue(task: any) {
    return new Promise((resolve: any, reject: any) => {
      this.queue.push({ id: ++this.taskId, task, resolve, reject });
      this._dispatch();
    });
  }

  /**
   * 取消一个检查 job 的 queued / in-flight task。
   *
   * 一个 worker 同时只承载一个 task，因此 in-flight 取消只终止对应
   * worker slot，并立即 respawn；其它 slot 和其它 job 不受影响。
   */
  cancelJob(jobId: string) {
    if (!jobId) return { jobId, queued: 0, running: 0 };

    let queued = 0;
    const retained = [];
    for (const item of this.queue) {
      if (item.task && item.task.payload && item.task.payload.jobId === jobId) {
        queued += 1;
        try { item.reject(makeTaskCancelledError(jobId)); } catch { /* noop */ }
      } else {
        retained.push(item);
      }
    }
    this.queue = retained;

    let running = 0;
    for (let i = 0; i < this.workers.length; i += 1) {
      const slot = this.workers[i];
      const current = slot && slot.current;
      if (!slot || !current || !current.task ||
        !current.task.payload || current.task.payload.jobId !== jobId) {
        continue;
      }

      running += 1;
      current.cancelRequested = true;
      if (!slot.worker) {
        slot.busy = false;
        slot.current = null;
        try { current.reject(makeTaskCancelledError(jobId)); } catch { /* noop */ }
        continue;
      }

      const taskId = current.id;
      try {
        Promise.resolve(slot.worker.terminate()).then(() => {
          this._finishCancelled(i, taskId, jobId);
        }).catch(() => {
          this._finishCancelled(i, taskId, jobId);
        });
      } catch {
        this._finishCancelled(i, taskId, jobId);
      }
    }

    this._dispatch();
    return { jobId, queued, running };
  }

  /** 当前排队 + 飞行中 task 数（诊断用） */
  pending() {
    const flying = this.workers.reduce((n: any, w: any) => n + (w && w.busy ? 1 : 0), 0);
    return this.queue.length + flying;
  }

  // ── 内部：spawn / dispatch / message / error ─────────────────────────

  _spawn(id: any) {
    if (this.workerScript) {
      const worker = new Worker(this.workerScript, this.workerOpts);
      this.workers[id] = { worker, busy: false, current: null };
      worker.on('message', (msg: any) => {
        if (this.workers[id] && this.workers[id].worker === worker) {
          this._onMessage(id, msg);
        }
      });
      worker.on('error', (err: any) => {
        if (this.workers[id] && this.workers[id].worker === worker) {
          this._onError(id, err);
        }
      });
      worker.on('exit', (code: any) => {
        if (this.workers[id] && this.workers[id].worker === worker && code !== 0) {
          this._onError(id, new Error(`Worker ${id} exited with code ${code}`));
        }
      });
    } else {
      // stub: 没有 workerScript 时，task 直接同步 resolve（_dispatch 不进入这个 slot）
      this.workers[id] = { worker: null, busy: false, current: null };
    }
  }

  _dispatch() {
    if (!this.queue.length) return;
    const idle = this.workers.findIndex((w: any) => w && !w.busy);
    if (idle < 0) return;
    const item = this.queue.shift();
    const slot = this.workers[idle];
    slot.busy = true;
    slot.current = item;
    if (slot.worker) {
      // 只 postMessage 可序列化的部分（task + id），resolve/reject 留在 main
      slot.worker.postMessage({ id: item.id, task: item.task });
    } else {
      // stub 模式: 立刻用 null 模拟一个 result
      Promise.resolve().then(() => {
        if (!slot.current || slot.current.id !== item.id) return;
        slot.busy = false;
        const cur = slot.current;
        slot.current = null;
        if (cur && cur.cancelRequested) {
          try { cur.reject(makeTaskCancelledError(cur.task && cur.task.payload && cur.task.payload.jobId)); } catch { /* noop */ }
        } else if (cur) {
          cur.resolve(null);
        }
        this._dispatch();
      });
    }
  }

  _onMessage(id: any, msg: any) {
    const w = this.workers[id];
    if (!w) return;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'progress') {
      try { this.onProgress(msg.payload, id); } catch { /* noop */ }
      return;
    }
    if (msg.type === 'log') {
      try { this.onLog(msg.level, msg.text, id, msg.meta); } catch { /* noop */ }
      return;
    }
    if (msg.type === 'result') {
      const cur = w.current;
      w.busy = false;
      w.current = null;
      if (cur) cur.resolve(msg.payload);
      this._dispatch();
      return;
    }
    if (msg.type === 'error') {
      const cur = w.current;
      w.busy = false;
      w.current = null;
      if (cur) cur.reject(new Error(msg.message || 'worker error'));
      this._dispatch();
    }
  }

  _finishCancelled(id: any, taskId: any, jobId: string) {
    const slot = this.workers[id];
    if (!slot || !slot.current || slot.current.id !== taskId) return;
    const current = slot.current;
    slot.busy = false;
    slot.current = null;
    try { current.reject(makeTaskCancelledError(jobId)); } catch { /* noop */ }
    this.workers[id] = null;
    this._spawn(id);
    this._dispatch();
  }

  _onError(id: any, err: any) {
    const w = this.workers[id];
    if (w && w.current) {
      const cur = w.current;
      w.busy = false;
      w.current = null;
      try {
        cur.reject(cur.cancelRequested
          ? makeTaskCancelledError(cur.task && cur.task.payload && cur.task.payload.jobId)
          : err);
      } catch { /* noop */ }
    }
    // 自动 respawn
    if (this.workers[id] === w) this.workers[id] = null;
    try { if (w && w.worker) w.worker.terminate(); } catch { /* noop */ }
    this._spawn(id);
    this._dispatch();
  }
}

function makeTaskCancelledError(jobId: any) {
  const error: any = new Error(`task cancelled${jobId ? `: ${jobId}` : ""}`);
  error.code = "TASK_CANCELLED";
  return error;
}
