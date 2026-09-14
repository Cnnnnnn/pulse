/**
 * tests/main/goofish/notify-service.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  startGoofishNotifyService,
  __resetGoofishNotifyForTest,
} = requireMain("goofish/notify-service");

describe("goofish notify-service", () => {
  beforeEach(() => {
    __resetGoofishNotifyForTest();
  });
  afterEach(() => {
    __resetGoofishNotifyForTest();
  });

  it("首次 sync 只建基线不通知；上涨才通知", async () => {
    const sends: any[] = [];
    const win = {
      isDestroyed: () => false,
      isMinimized: () => false,
      restore: () => {},
      show: () => {},
      focus: () => {},
      webContents: {
        send: (ch: string, payload: any) => sends.push({ ch, payload }),
      },
    };
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
    });

    await svc.tickNow(); // seed
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(false);
    expect(sends.some((s) => s.ch === "goofish:unread" && s.payload === 1)).toBe(
      true,
    );

    human = 3;
    await svc.tickNow();
    expect(sends.some((s) => s.ch === "goofish:alert")).toBe(true);
    expect(
      sends.filter((s) => s.ch === "goofish:unread").map((s) => s.payload),
    ).toContain(3);

    svc.stop();
  });
});
