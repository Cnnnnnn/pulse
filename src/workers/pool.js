/**
 * src/workers/pool.js
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

const { Worker } = require('worker_threads');
const os = require('os');

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

class WorkerPool {
  /**
   * @param {WorkerPoolOptions} [opts]
   */
  constructor(opts = {}) {
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
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.taskId, task, resolve, reject });
      this._dispatch();
    });
  }

  /** 当前排队 + 飞行中 task 数（诊断用） */
  pending() {
    const flying = this.workers.reduce((n, w) => n + (w && w.busy ? 1 : 0), 0);
    return this.queue.length + flying;
  }

  // ── 内部：spawn / dispatch / message / error ─────────────────────────

  _spawn(id) {
    if (this.workerScript) {
      const worker = new Worker(this.workerScript, this.workerOpts);
      this.workers[id] = { worker, busy: false, current: null };
      worker.on('message', (msg) => this._onMessage(id, msg));
      worker.on('error', (err) => this._onError(id, err));
      worker.on('exit', (code) => {
        if (code !== 0) this._onError(id, new Error(`Worker ${id} exited with code ${code}`));
      });
    } else {
      // stub: 没有 workerScript 时，task 直接同步 resolve（_dispatch 不进入这个 slot）
      this.workers[id] = { worker: null, busy: false, current: null };
    }
  }

  _dispatch() {
    if (!this.queue.length) return;
    const idle = this.workers.findIndex((w) => w && !w.busy);
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
        slot.busy = false;
        const cur = slot.current;
        slot.current = null;
        if (cur) cur.resolve(null);
        this._dispatch();
      });
    }
  }

  _onMessage(id, msg) {
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

  _onError(id, err) {
    const w = this.workers[id];
    if (w && w.current) {
      const cur = w.current;
      w.busy = false;
      w.current = null;
      try { cur.reject(err); } catch { /* noop */ }
    }
    // 自动 respawn
    try { if (w && w.worker) w.worker.terminate(); } catch { /* noop */ }
    this._spawn(id);
    this._dispatch();
  }
}

module.exports = { WorkerPool };
