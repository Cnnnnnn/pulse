/**
 * tests/main/goofish/notify-service.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  startGoofishNotifyService,
  goofishNotifyOnWsWake,
  goofishNotifyOnWsChat,
  goofishNotifyOnWsChatSkipBadge,
  goofishNotifyOnDomRail,
  diffHumanMessageUpdates,
  __resetGoofishNotifyForTest,
  __getLastWsWakeAtForTest,
} = requireMain("goofish/notify-service");

function makeWin(sends: any[]) {
  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: () => {},
    show: () => {},
    focus: () => {},
    webContents: {
      send: (ch: string, payload: any) => sends.push({ ch, payload }),
    },
  };
}

describe("goofish notify-service", () => {
  beforeEach(() => {
    __resetGoofishNotifyForTest();
  });
  afterEach(() => {
    __resetGoofishNotifyForTest();
  });

  it("humansOnly 时徽标由 DOM 轨主导；协议层不推", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: 0,
      allUnread: 57,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      isHumansOnly: () => true,
    });

    await svc.tickNow();
    // A2: 协议层不推徽标；DOM 轨角标才是真值
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  it("DOM 右侧栏角标上涨时更新徽标并通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: 0,
      allUnread: 57,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
      isHumansOnly: () => true,
    });
    await svc.tickNow();
    goofishNotifyOnDomRail(0); // seed via dom
    goofishNotifyOnDomRail(1);
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 1)).toBe(
      true,
    );
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(true);
    svc.stop();
  });

  it("首次 sync 只建基线不通知；上涨才通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let human = 1;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionId: "a",
          sessionType: 1,
          peerNick: "买家",
          unread: human,
          lastMsg: "你好",
          ts: 1,
        },
      ],
      humanUnread: human,
      allUnread: human,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
    });

    await svc.tickNow(); // seed
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    // A2: seed 不再 push 协议层徽标；DOM 轨/WS chat 才是徽标源
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "ok")).toBe(
      true,
    );

    human = 3;
    await svc.tickNow();
    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert).toBeTruthy();
    expect(String(alert.payload.body)).toContain("买家");

    svc.stop();
  });

  it("关闭通知开关时仍走通知路径但不弹 toast", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let human = 1;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: human,
      allUnread: human,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      isNotifyEnabled: () => false,
    });

    await svc.tickNow();
    human = 4;
    await svc.tickNow();
    // A2: 协议层不再 push 徽标；徽标走 DOM 轨/WS chat。
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  it("全局冷却期内上涨只走协议逻辑不重复弹通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let human = 1;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: human,
      allUnread: human,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 60_000,
    });

    await svc.tickNow();
    human = 2;
    await svc.tickNow();
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(1);

    human = 5;
    await svc.tickNow();
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(1);
    svc.stop();
  });

  it("免打扰时段跳过通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let human = 1;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: human,
      allUnread: human,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
      isInQuietHours: () => true,
    });

    await svc.tickNow();
    human = 3;
    await svc.tickNow();
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    // A2: 协议层不再 push 徽标
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    svc.stop();
  });

  it("humansOnly=false 时协议层不推徽标（DOM 轨才是真值）", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: 1,
      allUnread: 8,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      isHumansOnly: () => false,
    });

    await svc.tickNow();
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    svc.stop();
  });

  it("通知点击走会话深链", async () => {
    const sends: any[] = [];
    const opened: string[] = [];
    const win = makeWin(sends);
    let human = 0;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionId: "a",
          sessionType: 1,
          peerNick: "买家",
          peerUserId: "77",
          itemId: "item77",
          unread: human,
          lastMsg: "在吗",
          ts: 1,
        },
      ],
      humanUnread: human,
      allUnread: human,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
      openIm: (_win: any, url: string) => {
        opened.push(url);
      },
    });

    await svc.tickNow();
    human = 1;
    await svc.tickNow();

    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert?.payload?.url).toContain("peerUserId=77");
    expect(alert?.payload?.url).toContain("itemId=item77");

    // fireNotify 把深链放进 alert；Notification click 才会调 openIm
    expect(opened).toHaveLength(0);
    svc.stop();
  });

  it("ws wake 防抖后触发 sync", async () => {
    vi.useFakeTimers();
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: 0,
      allUnread: 0,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
    });

    goofishNotifyOnWsWake();
    goofishNotifyOnWsWake();
    goofishNotifyOnWsWake();
    expect(sync).not.toHaveBeenCalled();
    expect(__getLastWsWakeAtForTest()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(2600);
    expect(sync).toHaveBeenCalledTimes(1);

    svc.stop();
    vi.useRealTimers();
  });

  it("WS chat 帧在 humanUnread=0 时仍能直接弹通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [],
      humanUnread: 0,
      allUnread: 54,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
    });

    await svc.tickNow(); // seed: human=0
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);

    goofishNotifyOnWsChat({
      kind: "chat",
      nick: "张三",
      text: "还在吗",
      senderUserId: "u1",
      cid: "c1@goofish",
      itemId: "item9",
      ts: Date.now(),
    });

    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert).toBeTruthy();
    expect(String(alert.payload.body)).toContain("张三");
    expect(String(alert.payload.body)).toContain("还在吗");
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload >= 1)).toBe(
      true,
    );

    svc.stop();
  });

  it("humanUnread=0 但真人 lastMsg/ts 变化时仍通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let lastMsg = "旧消息";
    let ts = 100;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionId: "h1",
          sessionType: 1,
          peerNick: "买家乙",
          peerUserId: "u2",
          itemId: "",
          unread: 0,
          lastMsg,
          ts,
        },
      ],
      humanUnread: 0,
      allUnread: 40,
      ret: ["SUCCESS"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
    });

    await svc.tickNow();
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);

    lastMsg = "新报价";
    ts = 200;
    await svc.tickNow();
    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert).toBeTruthy();
    expect(String(alert.payload.body)).toContain("买家乙");
    expect(String(alert.payload.body)).toContain("新报价");

    svc.stop();
  });

  it("diffHumanMessageUpdates 只报变化会话", () => {
    const prev = new Map([["h1", "100\0旧"]]);
    const { changed, next } = diffHumanMessageUpdates(
      [
        {
          sessionId: "h1",
          sessionType: 1,
          peerNick: "A",
          peerUserId: "u",
          itemId: "",
          unread: 0,
          lastMsg: "新",
          ts: 200,
        },
        {
          sessionId: "ops",
          sessionType: 23,
          peerNick: "运营",
          peerUserId: "o",
          itemId: "",
          unread: 9,
          lastMsg: "活动",
          ts: 999,
        },
      ],
      prev,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0].sessionId).toBe("h1");
    expect(next.get("h1")).toBe("200\0新");
  });

  it("no_token 但登录 cookie 仍在 → 降级同步异常，不弹未登录/扫码提示", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: false as const,
      reason: "no_token" as const,
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      hasLoginCookies: () => true,
    });

    await svc.tickNow();
    expect(
      sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "error"),
    ).toBe(true);
    expect(
      sends.some(
        (s) =>
          s.ch === "goofish:auth" && s.payload?.status === "logged_out",
      ),
    ).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  it("no_token 且登录 cookie 也不在 → 维持 logged_out 并提示扫码", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: false as const,
      reason: "no_token" as const,
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      hasLoginCookies: () => false,
    });

    await svc.tickNow();
    expect(
      sends.some(
        (s) => s.ch === "goofish:auth" && s.payload?.status === "logged_out",
      ),
    ).toBe(true);
    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert).toBeTruthy();
    expect(String(alert.payload.body)).toContain("尚未登录");
    svc.stop();
  });

  it("auth_expired 但登录 cookie 仍在 → 降级同步异常", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: false as const,
      reason: "auth_expired" as const,
      ret: ["FAIL_SYS_SESSION_EXPIRED::Session过期"],
    }));

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      hasLoginCookies: () => true,
    });

    await svc.tickNow();
    expect(
      sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "error"),
    ).toBe(true);
    expect(
      sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "auth_expired"),
    ).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  it("auth_expired 连续 ≥5 次且登录 cookie 仍在 → 如实报登录过期, 引导重新扫码", async () => {
    vi.useFakeTimers();
    const sends: any[] = [];
    const win = makeWin(sends);
    const sync = vi.fn(async () => ({
      ok: false as const,
      reason: "auth_expired" as const,
      ret: ["FAIL_SYS_SESSION_EXPIRED::Session过期"],
    }));
    const refreshSession = vi.fn();

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      hasLoginCookies: () => true,
      refreshSession,
    });

    for (let i = 0; i < 6; i++) {
      const p = svc.tickNow();
      await vi.advanceTimersByTimeAsync(3_000); // 覆盖软刷新后的 2.5s 重试等待
      await p;
      await vi.advanceTimersByTimeAsync(10);
    }

    const last = sends.filter((s) => s.ch === "goofish:auth").pop();
    expect(last?.payload?.status).toBe("auth_expired");
    svc.stop();
    vi.useRealTimers();
  });

  it("no_token 且登录 cookie 在时触发软刷新并重试", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const refreshSession = vi.fn();
    let attempts = 0;
    const sync = vi.fn(async () => {
      attempts += 1;
      // 刷新后（第二次 sync）拿到新令牌，恢复正常
      if (attempts >= 2) {
        return {
          ok: true as const,
          sessions: [],
          humanUnread: 0,
          allUnread: 0,
          ret: ["SUCCESS"],
        };
      }
      return { ok: false as const, reason: "no_token" as const };
    });

    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      hasLoginCookies: () => true,
      refreshSession,
    });

    await svc.tickNow(); // 内部含 2.5s 刷新等待
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(
      sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "ok"),
    ).toBe(true);
    svc.stop();
  }, 15_000);

  // ─── A1: WS chat dedup（30s 窗）───────────────────
  it("A1: WS chat 同会话短窗内只弹一次", () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync: vi.fn(async () => ({
        ok: true as const,
        sessions: [],
        humanUnread: 0,
        allUnread: 0,
        ret: ["SUCCESS"],
      })),
      notifyCooldownMs: 0,
    });
    const ev = {
      kind: "chat" as const,
      nick: "买家A",
      text: "在吗",
      senderUserId: "u1",
      cid: "c1@goofish",
      itemId: "i1",
      ts: 12345,
    };
    goofishNotifyOnWsChat(ev);
    goofishNotifyOnWsChat({ ...ev });
    goofishNotifyOnWsChat({ ...ev });
    // 同 key 在 30s 内只弹 1 次
    const alerts = sends.filter((s) => s.ch === "goofish:alert");
    expect(alerts).toHaveLength(1);
    // 徽标仍每次 +1（去重只是不再弹 toast，不是数值去重）
    const badges = sends
      .filter((s) => s.ch === "goofish:unread")
      .map((s) => s.payload);
    expect(badges.length).toBe(3);
    svc.stop();
  });

  // ─── B2: 同会话冷却 vs 全局冷却 ─────────────────
  it("B2: 同会话冷却 — 60s 内同会话不再弹，其他会话可弹", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let sessions: Array<Record<string, any>> = [];
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions,
      humanUnread: sessions.reduce((s, x) => s + (x.unread || 0), 0),
      allUnread: sessions.reduce((s, x) => s + (x.unread || 0), 0),
      ret: ["SUCCESS"],
    }));
    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
      isHumansOnly: () => false,
      isNotifyEnabled: () => true,
    });

    sessions = [
      {
        sessionId: "a",
        sessionType: 1,
        peerNick: "买家A",
        peerUserId: "uA",
        itemId: "",
        unread: 1,
        lastMsg: "你好",
        ts: 1,
      },
    ];
    await svc.tickNow();
    // 首次 tick 只建基线 (seed)，不弹通知
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(0);

    sessions = [
      {
        sessionId: "a",
        sessionType: 1,
        peerNick: "买家A",
        peerUserId: "uA",
        itemId: "",
        unread: 2,
        lastMsg: "你好",
        ts: 1,
      },
    ];
    await svc.tickNow();
    // 上涨 → 弹 1 次
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(1);

    sessions = [
      {
        sessionId: "a",
        sessionType: 1,
        peerNick: "买家A",
        peerUserId: "uA",
        itemId: "",
        unread: 2,
        lastMsg: "你好",
        ts: 1,
      },
    ];
    await svc.tickNow();
    // 同会话 → 60s 冷却，不再弹
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(1);

    sessions = [
      {
        sessionId: "a",
        sessionType: 1,
        peerNick: "买家A",
        peerUserId: "uA",
        itemId: "",
        unread: 3,
        lastMsg: "你好",
        ts: 1,
      },
      {
        sessionId: "b",
        sessionType: 1,
        peerNick: "买家B",
        peerUserId: "uB",
        itemId: "",
        unread: 1,
        lastMsg: "在吗",
        ts: 2,
      },
    ];
    await svc.tickNow();
    // 不同会话 → 可弹
    const alerts = sends.filter((s) => s.ch === "goofish:alert");
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(String(alerts[1].payload.body)).toContain("买家B");
    svc.stop();
  });

  // ─── B4: session DND ─────────────────────
  it("B4: 会话级 DND 让该会话不再弹通知", async () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    let unread = 0;
    const sync = vi.fn(async () => ({
      ok: true as const,
      sessions: [
        {
          sessionId: "a",
          sessionType: 1,
          peerNick: "买家A",
          peerUserId: "uA",
          itemId: "",
          unread,
          lastMsg: "你好",
          ts: 1,
        },
      ],
      humanUnread: unread,
      allUnread: unread,
      ret: ["SUCCESS"],
    }));
    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync,
      notifyCooldownMs: 0,
      isSessionDnd: (k) => k === "uA",
    });
    unread = 1;
    await svc.tickNow();
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  // ─── keepalive view: skipBadge 不动 lastBadge 但仍 fire 通知 ──────
  it("keepalive 路径只 fire 通知不 push 徽标", () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync: vi.fn(async () => ({
        ok: true as const,
        sessions: [],
        humanUnread: 0,
        allUnread: 0,
        ret: ["SUCCESS"],
      })),
      notifyCooldownMs: 0,
    });
    const ev = {
      kind: "chat" as const,
      nick: "买家",
      text: "在吗",
      senderUserId: "u1",
      cid: "c1@goofish",
      itemId: "i1",
      ts: 999,
    };
    goofishNotifyOnWsChatSkipBadge(ev);
    expect(sends.some((s) => s.ch === "goofish:unread")).toBe(false);
    expect(sends.filter((s) => s.ch === "goofish:alert")).toHaveLength(1);
    svc.stop();
  });

  it("keepalive + 主 view 同 frame 同时触发，徽标只 +1", () => {
    const sends: any[] = [];
    const win = makeWin(sends);
    const svc = startGoofishNotifyService({
      getWindow: () => win as any,
      intervalMs: 60_000,
      sync: vi.fn(async () => ({
        ok: true as const,
        sessions: [],
        humanUnread: 0,
        allUnread: 0,
        ret: ["SUCCESS"],
      })),
      notifyCooldownMs: 0,
    });
    const ev = {
      kind: "chat" as const,
      nick: "买家",
      text: "在吗",
      senderUserId: "u1",
      cid: "c1@goofish",
      itemId: "i1",
      ts: 999,
    };
    goofishNotifyOnWsChatSkipBadge(ev);
    goofishNotifyOnWsChat(ev);
    // 主 view 推 1 次徽标，keepalive 不推
    expect(sends.filter((s) => s.ch === "goofish:unread")).toHaveLength(1);
    expect(sends.filter((s) => s.ch === "goofish:unread")[0].payload).toBe(1);
    svc.stop();
  });
});
