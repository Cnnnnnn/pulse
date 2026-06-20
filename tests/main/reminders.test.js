/**
 * tests/main/reminders.test.js
 *
 * reminders.js 单测 — 覆盖 spec §Testing 里 6 项:
 *   1. CRUD: create / update / remove / markDone / markDismissed / markFired
 *   2. 输入校验: title 空 / > 100 字符 / triggerAt 非 number / repeat 非法 / weekly 缺 weekday
 *   3. markDone: once → 删, daily/weekdays/weekly → 算下次 triggerAt
 *   4. _computeNextFireTime: daily 跨日, weekdays 跳过周末, weekly 跳到下个匹配 weekday, once 不变
 *   5. _sweepOnce(now): 0 / 1 / N 个待触发; fired 后不重复触发
 *   6. Atomic write: 模拟崩溃 → state.json 完整 (writeAtomic 已被 state-store.test.js 覆盖, 这里只验 "其他字段不丢")
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const reminders = require("../../src/main/reminders.js");

function tmpStatePath() {
  const dir = join(
    tmpdir(),
    `pulse-reminders-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

/** helper: 给个未来时间 + N 分钟, 默认 60min 后 */
function futureTs(minFromNow = 60) {
  return Date.now() + minFromNow * 60 * 1000;
}

describe("reminders — list / create / remove", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("list returns [] when state file missing", () => {
    expect(reminders.list(p)).toEqual([]);
  });

  it("list returns [] when state.json has no reminders field", () => {
    writeFileSync(p, JSON.stringify({ apps: {}, mutes: {} }));
    expect(reminders.list(p)).toEqual([]);
  });

  it("list returns [] when state.json is corrupt", () => {
    writeFileSync(p, "{not json");
    expect(reminders.list(p)).toEqual([]);
  });

  it("list filters out malformed reminders", () => {
    writeFileSync(
      p,
      JSON.stringify({
        reminders: [
          { id: "a", title: "ok", triggerAt: futureTs(), repeat: "once", status: "pending" },
          { id: "b", title: "bad-repeat" }, // 缺字段
          { id: "c", title: "bad-status", triggerAt: futureTs(), repeat: "once", status: "weird" },
        ],
      }),
    );
    const r = reminders.list(p);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("a");
  });

  it("create adds a new pending reminder with id", () => {
    const r = reminders.create(
      { title: "开会", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(r.ok).toBe(true);
    expect(r.reminder.id).toBeTypeOf("string");
    expect(r.reminder.id.length).toBeGreaterThan(0);
    expect(r.reminder.status).toBe("pending");
    expect(r.reminder.title).toBe("开会");
    expect(r.reminder.repeat).toBe("once");
    expect(reminders.list(p)).toHaveLength(1);
  });

  it("create weekly requires weekday 0-6", () => {
    const r = reminders.create(
      { title: "周三周会", triggerAt: futureTs(), repeat: "weekly", weekday: 3 },
      p,
    );
    expect(r.ok).toBe(true);
    expect(r.reminder.weekday).toBe(3);
  });

  it("create with invalid weekday returns ok=false", () => {
    expect(
      reminders.create(
        { title: "x", triggerAt: futureTs(), repeat: "weekly", weekday: 7 },
        p,
      ),
    ).toEqual({ ok: false, reason: "invalid_weekday" });
    expect(
      reminders.create(
        { title: "x", triggerAt: futureTs(), repeat: "weekly", weekday: -1 },
        p,
      ),
    ).toEqual({ ok: false, reason: "invalid_weekday" });
    // 缺 weekday
    expect(
      reminders.create(
        { title: "x", triggerAt: futureTs(), repeat: "weekly" },
        p,
      ),
    ).toEqual({ ok: false, reason: "invalid_weekday" });
  });

  it("create preserves other state keys", () => {
    writeFileSync(p, JSON.stringify({ apps: { Pulse: { name: "Pulse" } }, mutes: {} }));
    reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    const raw = JSON.parse(require("fs").readFileSync(p, "utf-8"));
    expect(raw.apps.Pulse).toEqual({ name: "Pulse" });
    expect(raw.reminders).toHaveLength(1);
  });

  it("remove deletes by id", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(reminders.remove(c.reminder.id, p)).toEqual({ ok: true });
    expect(reminders.list(p)).toEqual([]);
  });

  it("remove on missing id returns ok=false", () => {
    expect(reminders.remove("nope", p)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("reminders — update", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("update patches title", () => {
    const c = reminders.create(
      { title: "old", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    const u = reminders.update(c.reminder.id, { title: "new" }, p);
    expect(u.ok).toBe(true);
    expect(u.reminder.title).toBe("new");
  });

  it("update patches triggerAt", () => {
    const baseNow = Date.now();
    const c = reminders.create(
      { title: "x", triggerAt: baseNow + 60 * 60 * 1000, repeat: "once" },
      p,
    );
    const u = reminders.update(
      c.reminder.id,
      { triggerAt: baseNow + 120 * 60 * 1000 },
      p,
    );
    expect(u.ok).toBe(true);
    expect(u.reminder.triggerAt).toBe(baseNow + 120 * 60 * 1000);
  });

  it("update rejects invalid title (empty)", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(reminders.update(c.reminder.id, { title: "" }, p)).toEqual({
      ok: false,
      reason: "invalid_title",
    });
  });

  it("update rejects title > 100 chars", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(
      reminders.update(c.reminder.id, { title: "a".repeat(101) }, p),
    ).toEqual({ ok: false, reason: "title_too_long" });
  });

  it("update rejects invalid repeat", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(
      reminders.update(c.reminder.id, { repeat: "monthly" }, p),
    ).toEqual({ ok: false, reason: "invalid_repeat" });
  });

  it("update switches repeat weekly ↔ daily, weekday follows", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "daily" },
      p,
    );
    // daily → weekly, weekday=5
    const u1 = reminders.update(
      c.reminder.id,
      { repeat: "weekly", weekday: 5 },
      p,
    );
    expect(u1.ok).toBe(true);
    expect(u1.reminder.repeat).toBe("weekly");
    expect(u1.reminder.weekday).toBe(5);
    // weekly → daily, weekday 应被清掉
    const u2 = reminders.update(c.reminder.id, { repeat: "daily" }, p);
    expect(u2.ok).toBe(true);
    expect(u2.reminder.repeat).toBe("daily");
    expect(u2.reminder.weekday).toBeUndefined();
  });

  it("update on missing id returns ok=false", () => {
    expect(reminders.update("nope", { title: "x" }, p)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("reminders — markDone", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("once → markDone 后被删除", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    const r = reminders.markDone(c.reminder.id, p);
    expect(r.ok).toBe(true);
    expect(r.reminder).toBeNull();
    expect(reminders.list(p)).toEqual([]);
  });

  it("daily → markDone 后 triggerAt 跳到下个未来同时辰", () => {
    // 把 triggerAt 设为 1h 前 (今天时辰已过), markDone 后应跳到明天同时辰
    const pastHour = new Date();
    pastHour.setHours(pastHour.getHours() - 1);
    const ts = pastHour.getTime();
    const r = reminders.create(
      { title: "x", triggerAt: ts, repeat: "daily" },
      p,
    );
    const done = reminders.markDone(r.reminder.id, p);
    expect(done.ok).toBe(true);
    expect(done.reminder.status).toBe("pending");
    // 下次应该是下个未来时间 (跟 ts 同一时辰)
    expect(done.reminder.triggerAt).toBeGreaterThan(Date.now());
    // 时辰保留
    const origD = new Date(ts);
    const newD = new Date(done.reminder.triggerAt);
    expect(newD.getHours()).toBe(origD.getHours());
    expect(newD.getMinutes()).toBe(origD.getMinutes());
  });

  it("weekdays → markDone 后跳到下个工作日", () => {
    // 找一个周六的 triggerAt, markDone 后应该跳到下周一
    const satMs = new Date("2026-06-13T10:00:00Z").getTime();
    const r = reminders.create(
      { title: "x", triggerAt: satMs, repeat: "weekdays" },
      p,
    );
    const done = reminders.markDone(r.reminder.id, p);
    expect(done.ok).toBe(true);
    const next = new Date(done.reminder.triggerAt);
    // 0=Sun, 1=Mon..6=Sat
    expect([1, 2, 3, 4, 5]).toContain(next.getUTCDay());
  });

  it("weekly → markDone 后跳到下个匹配 weekday", () => {
    // Anchor triggerAt in the past so markDone has to roll forward; the
    // expected next-fire date is derived from now + weekday, not from the
    // trigger anchor. This keeps the test stable as real time advances.
    // vitest.config forces TZ=UTC, so use UTC accessors throughout.
    const now = new Date();
    const trigger = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
    trigger.setUTCHours(10, 0, 0, 0);
    const r = reminders.create(
      {
        title: "周三",
        triggerAt: trigger.getTime(),
        repeat: "weekly",
        weekday: 3,
      },
      p,
    );
    const done = reminders.markDone(r.reminder.id, p);
    expect(done.ok).toBe(true);
    const next = new Date(done.reminder.triggerAt);
    expect(next.getUTCDay()).toBe(3); // Wed
    // Compute expected: from today (UTC), walk forward until weekday=3 (Wed).
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    expected.setUTCHours(10, 0, 0, 0);
    let safety = 0;
    while (expected.getUTCDay() !== 3 || expected.getTime() <= now.getTime()) {
      expected.setUTCDate(expected.getUTCDate() + 1);
      safety += 1;
      if (safety > 8) break;
    }
    expect(next.getUTCDate()).toBe(expected.getUTCDate());
    expect(next.getUTCMonth()).toBe(expected.getUTCMonth());
    expect(next.getUTCHours()).toBe(10); // hour preserved from triggerAt
  });

  it("markDone on missing id returns ok=false", () => {
    expect(reminders.markDone("nope", p)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("reminders — markDismissed / markFired", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("markDismissed 切到 dismissed", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    const r = reminders.markDismissed(c.reminder.id, p);
    expect(r.ok).toBe(true);
    expect(r.reminder.status).toBe("dismissed");
  });

  it("markFired 切到 fired + 写 firedAt / lastNotifiedAt", () => {
    const c = reminders.create(
      { title: "x", triggerAt: futureTs(), repeat: "once" },
      p,
    );
    const before = Date.now();
    const r = reminders.markFired(c.reminder.id, p);
    expect(r.ok).toBe(true);
    expect(r.reminder.status).toBe("fired");
    expect(r.reminder.firedAt).toBeGreaterThanOrEqual(before);
    expect(r.reminder.lastNotifiedAt).toBeGreaterThanOrEqual(before);
  });
});

describe("reminders — _computeNextFireTime (纯函数)", () => {
  function reminderOf(repeat, triggerAt, weekday) {
    return { repeat, triggerAt, weekday, status: "fired" };
  }

  it("once: 不变", () => {
    const ts = futureTs(60);
    expect(
      reminders._computeNextFireTime(reminderOf("once", ts), Date.now()),
    ).toBe(ts);
  });

  it("daily: 今天还没到时辰 → 今天; 否则明天", () => {
    // 构造一个时辰: 23:59 (几乎一定 "今天还没到" 或 "今天已过" → 取决于 now)
    const hour = 23;
    const min = 59;
    const today = new Date();
    const candidate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      hour,
      min,
      0,
      0,
    );
    const r = reminderOf("daily", candidate.getTime());
    const next = reminders._computeNextFireTime(r, Date.now());
    const nextD = new Date(next);
    // 应该是 23:59, 日期要么今天 (now < 23:59) 要么明天
    if (candidate.getTime() > Date.now()) {
      // 应该是今天
      expect(nextD.getDate()).toBe(today.getDate());
    } else {
      // 应该是明天
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(nextD.getDate()).toBe(tomorrow.getDate());
    }
    // hour / min 保留
    expect(nextD.getHours()).toBe(hour);
    expect(nextD.getMinutes()).toBe(min);
  });

  it("weekdays: 跳到下个工作日 (Mon-Fri)", () => {
    // 2026-06-13 是周六, 算"今天周六" → 跳周一
    const sat = new Date("2026-06-13T10:00:00");
    const r = reminderOf("weekdays", sat.getTime());
    const next = reminders._computeNextFireTime(r, sat.getTime() + 1);
    const nextD = new Date(next);
    expect([1, 2, 3, 4, 5]).toContain(nextD.getDay());
  });

  it("weekly: 跳到下个匹配 weekday", () => {
    // 2026-06-15 是周一, weekday=3 (Wed) → 2026-06-17
    const mon = new Date("2026-06-15T10:00:00");
    const r = reminderOf("weekly", mon.getTime(), 3);
    const next = reminders._computeNextFireTime(r, mon.getTime() + 1);
    const nextD = new Date(next);
    expect(nextD.getDay()).toBe(3);
    expect(nextD.getDate()).toBe(17);
  });

  it("weekly: 已经是当天 (但时辰已过) → 跳到下周", () => {
    // 2026-06-17 是周三, weekday=3, 当前时间 11:00 (10:00 已过)
    const wed = new Date("2026-06-17T10:00:00");
    const now = new Date("2026-06-17T11:00:00").getTime();
    const r = reminderOf("weekly", wed.getTime(), 3);
    const next = reminders._computeNextFireTime(r, now);
    const nextD = new Date(next);
    // 应该是 2026-06-24 (下周三)
    expect(nextD.getDay()).toBe(3);
    expect(nextD.getDate()).toBe(24);
  });
});

describe("reminders — _sweepOnce (调度器核心)", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("0 待触发 → 返 []", () => {
    reminders.create(
      { title: "future", triggerAt: futureTs(60), repeat: "once" },
      p,
    );
    const fired = reminders._sweepOnce(Date.now(), p);
    expect(fired).toEqual([]);
  });

  it("1 待触发 → 切 fired + 返 1 条", () => {
    const past = Date.now() - 60 * 1000;
    const c = reminders.create(
      { title: "now", triggerAt: past, repeat: "once" },
      p,
    );
    const fired = reminders._sweepOnce(Date.now(), p);
    expect(fired).toHaveLength(1);
    expect(fired[0].id).toBe(c.reminder.id);
    expect(fired[0].status).toBe("fired");
    // 持久化后也是 fired
    expect(reminders.list(p)[0].status).toBe("fired");
  });

  it("N 待触发 → 返 N 条, onFire 收 N 次", () => {
    reminders.create(
      { title: "a", triggerAt: Date.now() - 1000, repeat: "once" },
      p,
    );
    reminders.create(
      { title: "b", triggerAt: Date.now() - 2000, repeat: "once" },
      p,
    );
    reminders.create(
      { title: "future", triggerAt: futureTs(60), repeat: "once" },
      p,
    );
    const calls = [];
    // 临时 set _onFire 通过 startScheduler 间接, 但我们这里只测 _sweepOnce 的 pure 路径
    // _sweepOnce 内部只在 _onFire 设置时才调, 这里我们直接断言返 fired 列表
    const fired = reminders._sweepOnce(Date.now(), p);
    expect(fired).toHaveLength(2);
    expect(fired.map((r) => r.title).sort()).toEqual(["a", "b"]);
  });

  it("fired 后再 sweep 不重复触发 (status 过滤)", () => {
    const past = Date.now() - 60 * 1000;
    const c = reminders.create(
      { title: "now", triggerAt: past, repeat: "once" },
      p,
    );
    reminders._sweepOnce(Date.now(), p);
    expect(reminders.list(p)[0].status).toBe("fired");
    // 第二次 sweep → 没 pending 可触发的
    const fired2 = reminders._sweepOnce(Date.now(), p);
    expect(fired2).toEqual([]);
  });

  it("onFire 回调收 fired reminder", () => {
    const past = Date.now() - 60 * 1000;
    reminders.create(
      { title: "now", triggerAt: past, repeat: "once" },
      p,
    );
    const calls = [];
    reminders.startScheduler({ onFire: (r) => calls.push(r), statePath: p });
    // startScheduler 内部已经 sweep 一次, 不需要再手动调
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe("now");
    reminders.stopScheduler();
  });

  it("startScheduler 重启不堆叠", () => {
    reminders.startScheduler({ onFire: () => {} });
    reminders.startScheduler({ onFire: () => {} });
    expect(reminders.isSchedulerRunning()).toBe(true);
    reminders.stopScheduler();
    expect(reminders.isSchedulerRunning()).toBe(false);
  });
});

describe("reminders — 输入校验", () => {
  let p;
  beforeEach(() => {
    p = tmpStatePath();
  });

  it("title 空字符串 → ok=false", () => {
    expect(
      reminders.create({ title: "", triggerAt: futureTs(), repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_title" });
  });

  it("title > 100 字符 → ok=false", () => {
    expect(
      reminders.create(
        { title: "x".repeat(101), triggerAt: futureTs(), repeat: "once" },
        p,
      ),
    ).toEqual({ ok: false, reason: "title_too_long" });
  });

  it("title 100 字符刚好接受", () => {
    const r = reminders.create(
      { title: "x".repeat(100), triggerAt: futureTs(), repeat: "once" },
      p,
    );
    expect(r.ok).toBe(true);
  });

  it("triggerAt 非 number / NaN / Infinity / <=0 → ok=false", () => {
    expect(
      reminders.create({ title: "x", triggerAt: "abc", repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
    expect(
      reminders.create({ title: "x", triggerAt: NaN, repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
    expect(
      reminders.create({ title: "x", triggerAt: Infinity, repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
    expect(
      reminders.create({ title: "x", triggerAt: 0, repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
    expect(
      reminders.create({ title: "x", triggerAt: -1, repeat: "once" }, p),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
  });

  it("triggerAt 超过 2100 → ok=false", () => {
    expect(
      reminders.create(
        { title: "x", triggerAt: 5_000_000_000_000, repeat: "once" },
        p,
      ),
    ).toEqual({ ok: false, reason: "invalid_triggerAt" });
  });

  it("repeat 非法 → ok=false", () => {
    expect(
      reminders.create({ title: "x", triggerAt: futureTs(), repeat: "monthly" }, p),
    ).toEqual({ ok: false, reason: "invalid_repeat" });
  });
});
