/**
 * tests/main/goofish/notify-service.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  startGoofishNotifyService,
  goofishNotifyOnWsWake,
  goofishNotifyOnWsChat,
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

  it("humansOnly 时徽标仍跟 allUnread，不跟 humanUnread", async () => {
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 57)).toBe(
      true,
    );
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 1)).toBe(
      true,
    );
    expect(sends.some((s) => s.ch === "goofish:auth" && s.payload?.status === "ok")).toBe(
      true,
    );

    human = 3;
    await svc.tickNow();
    const alert = sends.find((s) => s.ch === "goofish:alert");
    expect(alert).toBeTruthy();
    expect(String(alert.payload.body)).toContain("买家");
    expect(
      sends.filter((s) => s.ch === "goofish:unread").map((s) => s.payload),
    ).toContain(3);

    svc.stop();
  });

  it("关闭通知开关时仍更新徽标但不弹 toast", async () => {
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 4)).toBe(
      true,
    );
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    svc.stop();
  });

  it("冷却期内上涨只更新徽标不重复弹通知", async () => {
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 5)).toBe(
      true,
    );
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 3)).toBe(
      true,
    );
    svc.stop();
  });

  it("humansOnly=false 时用 allUnread 驱动徽标", async () => {
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
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 8)).toBe(
      true,
    );
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
});
