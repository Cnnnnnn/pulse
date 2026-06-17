/**
 * src/metals/metal-scheduler.js
 *
 * 5-minute setInterval state machine for metals. Runs in main process.
 * No worker_threads — only 2 HTTP requests per cycle.
 *
 * HTTP abstraction: takes an injected `httpGet(url, headers) => Promise<string|Buffer>`
 * so the scheduler itself has no electron / http deps. The caller wires up the
 * Pulse httpClient adapter.
 *
 * State machine:
 *   idle → running → idle
 *   running → running (manual fetch re-entry via in-flight guard)
 *   idle → running (manual fetch bypasses timer)
 */

const { fetchAllQuotes } = require('./metal-fetcher.js');

const FIVE_MINUTES_MS = 5 * 60 * 1000;

class MetalScheduler {
  constructor({ onUpdate, httpGet } = {}) {
    this.status = 'idle';
    this.lastFetch = null;
    this.nextFetch = null;
    this.intervalId = null;
    this.onUpdate = onUpdate || (() => {});
    this.httpGet = httpGet;
    this.fetchInFlight = null;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this._tick(), FIVE_MINUTES_MS);
    // Fire immediately on start (don't wait 5 min for first data)
    this.fetchNow();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async fetchNow() {
    if (!this.httpGet) {
      throw new Error('MetalScheduler: httpGet not injected');
    }

    // Re-entrancy guard: if a fetch is in flight, await it instead of starting a new one
    if (this.fetchInFlight) {
      return this.fetchInFlight;
    }

    this.status = 'running';
    this.fetchInFlight = (async () => {
      try {
        const { quotes, fx, errors } = await fetchAllQuotes(this.httpGet);
        this.onUpdate({ quotes, fx, errors, fetchedAt: Date.now() });
      } finally {
        this.fetchInFlight = null;
        this.status = 'idle';
        this.lastFetch = Date.now();
        this.nextFetch = this.lastFetch + FIVE_MINUTES_MS;
        this._emitState();
      }
    })();

    return this.fetchInFlight;
  }

  getState() {
    return {
      status: this.status,
      lastFetch: this.lastFetch,
      nextFetch: this.nextFetch,
    };
  }

  _tick() {
    this.fetchNow().catch((err) => {
      console.error('[metals] scheduled fetch failed:', err);
    });
  }

  _emitState() {
    this.onUpdate({ state: this.getState() });
  }
}

module.exports = { MetalScheduler, FIVE_MINUTES_MS };