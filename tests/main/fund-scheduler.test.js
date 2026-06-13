/**
 * tests/main/fund-scheduler.test.js
 *
 * FundScheduler 单测 — 覆盖:
 *   - 构造校验
 *   - 启动 / 停止
 *   - 状态机迁移: closed → idle/running → idle → closed
 *   - 自动 tick (交易时段内立即跑 + 排下一次)
 *   - 手动 fetchNow (绕过定时器, in_flight 重入拒绝)
 *   - 空 codes → 立即返 ok, 不调 httpClient
 *   - 事件: state / fetched 推送
 *
 * 用 fake timers + 注入 now() 让测试不真睡
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockHttp } from "../helpers/mock-http.js";
const { FundScheduler } = require("../../src/main/fund-scheduler.js");

const SAMPLE =
  'jsonpgz({"fundcode":"000001","name":"x","jzrq":"2026-06-11","dwjz":"1.0","gsz":"1.05","gszzl":"5","gztime":"2026-06-12 13:00"});';
const SAMPLE_SINA = 'var hq_str_of000001="x,1.0,1.0,1.05,5,2026-06-11";';

function dualSourceHttp(overrides = {}) {
  return new MockHttp({
    urlHandlers: [
      {
        match: /1234567\.com\.cn/,
        response: overrides.tiantian ?? { status: 200, body: SAMPLE },
      },
      {
        match: /sinajs\.cn/,
        response: overrides.sina ?? { status: 200, body: SAMPLE_SINA },
      },
    ],
  });
}

function makeCodes(codes) {
  return () => codes || ["000001", "000002"];
}

function silentLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

describe("FundScheduler 构造", () => {
  it("缺 httpClient → throw", () => {
    expect(() => new FundScheduler({ getCodes: makeCodes() })).toThrow(
      /httpClient required/,
    );
  });
  it("缺 getCodes → throw", () => {
    expect(() => new FundScheduler({ httpClient: new MockHttp() })).toThrow(
      /getCodes must be a function/,
    );
  });
});

describe("start / stop", () => {
  it("start 后 stop 不抛错", () => {
    const s = new FundScheduler({
      httpClient: new MockHttp(),
      getCodes: makeCodes(),
      now: () => new Date("2026-06-15T10:00:00"), // 周一上午, 交易中
      logger: silentLogger(),
    });
    s.start();
    s.stop();
    expect(s.getState().status).toMatch(/closed|idle|running/);
  });

  it("重复 start 不重叠 timer", () => {
    const s = new FundScheduler({
      httpClient: new MockHttp(),
      getCodes: makeCodes(),
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    s.start();
    s.start(); // 第二次
    s.stop();
  });
});

describe("状态机: 交易时段", () => {
  it("上午 10:00 启动 → status 进入 idle 或 running (异步 fetch)", async () => {
    const http = dualSourceHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: makeCodes(),
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    const states = [];
    s.on("state", (st) => states.push(st.status));
    s.start();
    // 等 microtask + setImmediate
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    s.stop();
    // 至少看到 idle 或 running
    expect(states.some((x) => x === "running" || x === "idle")).toBe(true);
    // 2 只 × 双源
    expect(http.getCalls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("状态机: 非交易时段", () => {
  it("周六有持仓 → 启动时仍拉一次净值 (非交易时段兜底)", async () => {
    const http = dualSourceHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: makeCodes(),
      now: () => new Date("2026-06-13T10:00:00"), // 周六
      logger: silentLogger(),
    });
    const states = [];
    s.on("state", (st) => states.push(st.status));
    s.start();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    s.stop();
    expect(states.some((x) => x === "running")).toBe(true);
    expect(http.getCalls.length).toBeGreaterThan(0);
  });

  it("周六无持仓 → status=closed, 不发 http 请求", () => {
    const http = new MockHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: () => [],
      now: () => new Date("2026-06-13T10:00:00"), // 周六
      logger: silentLogger(),
    });
    const states = [];
    s.on("state", (st) => states.push(st.status));
    s.start();
    s.stop();
    expect(states[0]).toBe("closed");
    expect(http.getCalls).toHaveLength(0);
  });
});

describe("fetchNow", () => {
  it("手动触发 → 立即拉 + 推 fetched 事件", async () => {
    const http = dualSourceHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: makeCodes(),
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    let fetched = null;
    s.on("fetched", (p) => {
      fetched = p;
    });

    const r = await s.fetchNow();
    expect(r.ok).toBe(true);
    expect(Object.keys(r.results)).toEqual(["000001", "000002"]);
    expect(fetched).toBeTruthy();
    expect(fetched.results["000001"].nav).toBe(1.0);
    expect(fetched.results["000001"].altAvailable).toBe(true);
  });

  it("空 codes → 立即返 ok, 不调 http", async () => {
    const http = new MockHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: () => [],
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    const r = await s.fetchNow();
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe("empty_codes");
    expect(http.getCalls).toHaveLength(0);
  });

  it("in-flight 重入拒绝", async () => {
    // 用一个 pending promise 模拟慢请求
    const http = {
      get: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ status: 200, body: SAMPLE }), 50),
        ),
    };
    const s = new FundScheduler({
      httpClient: http,
      getCodes: makeCodes(),
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    const p1 = s.fetchNow();
    const p2 = await s.fetchNow();
    expect(p2.ok).toBe(false);
    expect(p2.reason).toBe("in_flight");
    await p1;
  });
});

describe("fetched 事件 payload", () => {
  it("包含 results / errors / fetchedAt / durationMs", async () => {
    const http = dualSourceHttp({
      tiantian: (url) =>
        url.includes("/000001.js")
          ? { status: 500, body: "oops" }
          : { status: 200, body: SAMPLE },
    });
    const s = new FundScheduler({
      httpClient: http,
      getCodes: () => ["000001", "000002"],
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    let payload = null;
    s.on("fetched", (p) => {
      payload = p;
    });
    await s.fetchNow();
    expect(payload).toBeTruthy();
    // 主源 (tiantian) 500 时, sina 兜底 → 000001 进 results, 标 fallbackFrom
    expect(payload.results["000001"]).toBeTruthy();
    expect(payload.results["000001"].fallbackFrom).toBe("tiantian");
    expect(payload.errors["000001"]).toBeUndefined();
    expect(payload.results["000002"]).toBeTruthy();
    expect(payload.fetchedAt).toBeGreaterThan(0);
    expect(payload.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("双源都失败 → 进 errors", async () => {
    const http = dualSourceHttp({
      tiantian: () => ({ status: 500, body: "oops" }),
      sina: () => ({ status: 502, body: "bad gw" }),
    });
    const s = new FundScheduler({
      httpClient: http,
      getCodes: () => ["000001"],
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    let payload = null;
    s.on("fetched", (p) => {
      payload = p;
    });
    await s.fetchNow();
    expect(payload).toBeTruthy();
    expect(payload.errors["000001"]).toMatch(/HTTP 500/);
    expect(payload.results["000001"]).toBeUndefined();
  });

  it("getNavHealth 返回源健康度快照", async () => {
    const http = dualSourceHttp();
    const s = new FundScheduler({
      httpClient: http,
      getCodes: () => ["000001"],
      now: () => new Date("2026-06-15T10:00:00"),
      logger: silentLogger(),
    });
    await s.fetchNow();
    const snap = s.getNavHealth();
    expect(snap.tiantian.samples).toBeGreaterThan(0);
    expect(snap.sina.samples).toBeGreaterThan(0);
    expect(snap.tiantian.successRate).toBe(1);
  });
});
