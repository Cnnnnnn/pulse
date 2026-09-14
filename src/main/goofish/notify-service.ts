/**
 * src/main/goofish/notify-service.ts
 *
 * 闲鱼未读通知服务（协议层）:
 *   定时调 session.sync → 未读上涨 → Electron.Notification + goofish:alert toast
 *   与「检查更新」同构：自己拉完结果再弹，不刮 DOM。
 *
 * 登录态过期时请求 embed warm/refresh 一次再重试。
 * 只读，不发送消息。
 */

import type * as electronType from "electron";
import { fetchSessionSync } from "./mtop-session.ts";

export type GoofishNotifyDeps = {
  getWindow: () => electronType.BrowserWindow | null;
  /** 唤醒 guest 刷新 cookie（通常 goofishEmbedWarmStart） */
  refreshSession?: (win: electronType.BrowserWindow) => void | Promise<void>;
  intervalMs?: number;
  /** 注入时钟 / sync，便于测试 */
  sync?: typeof fetchSessionSync;
  now?: () => number;
};

type StopHandle = { stop: () => void; tickNow: () => Promise<void> };

let lastUnread = 0;
let seeded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let authFailStreak = 0;

const liveNotifications: electronType.Notification[] = [];

function log(msg: string): void {
  try {
    const { mainLog } = require("../log.ts");
    mainLog.info(`[goofish-notify] ${msg}`);
  } catch {
    /* noop */
  }
}

function pushUnreadBadge(win: electronType.BrowserWindow | null, unread: number): void {
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send("goofish:unread", unread);
    }
  } catch {
    /* noop */
  }
}

function fireNotify(win: electronType.BrowserWindow | null, unread: number): void {
  const body = `${unread} 条未读消息，点击查看`;
  try {
    const { Notification, app } = require("electron") as typeof electronType;
    if (Notification && Notification.isSupported && Notification.isSupported()) {
      const n = new Notification({
        title: "闲鱼消息",
        body,
        silent: false,
      });
      liveNotifications.push(n);
      if (liveNotifications.length > 8) liveNotifications.shift();
      n.on("click", () => {
        try {
          if (win && !win.isDestroyed()) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            win.webContents.send("goofish:open-request");
          }
        } catch {
          /* noop */
        }
      });
      n.show();
    }
    try {
      if (app?.dock?.bounce) app.dock.bounce("informational");
    } catch {
      /* noop */
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`notify failed: ${msg}`);
  }
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send("goofish:alert", {
        title: "闲鱼消息",
        body,
        unread,
      });
    }
  } catch {
    /* noop */
  }
  log(`notify shown: unread=${unread}`);
}

async function tick(deps: GoofishNotifyDeps): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const sync = deps.sync || fetchSessionSync;
    const win = deps.getWindow ? deps.getWindow() : null;
    let result = await sync();

    if (!result.ok && result.reason === "auth_expired" && deps.refreshSession && win) {
      authFailStreak += 1;
      log(`auth_expired streak=${authFailStreak}, refreshing guest…`);
      try {
        await Promise.resolve(deps.refreshSession(win));
        // 给首页/havana 一点时间续 cookie
        await new Promise((r) => setTimeout(r, 3500));
        result = await sync();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`refresh failed: ${msg}`);
      }
    }

    if (!result.ok) {
      if (result.reason !== "auth_expired") {
        log(`sync fail: ${result.reason} ${result.detail || ""}`);
      }
      // 连续认证失败：放慢节奏，避免刷风控
      return;
    }

    authFailStreak = 0;
    // 侧栏 + 通知都用真人会话未读（sessionType=1）
    const unread = result.humanUnread;

    if (!seeded) {
      seeded = true;
      lastUnread = unread;
      pushUnreadBadge(win, unread);
      log(
        `seed humanUnread=${unread} all=${result.allUnread} sessions=${result.sessions.length}`,
      );
      return;
    }

    if (unread !== lastUnread) {
      pushUnreadBadge(win, unread);
    }

    if (unread > lastUnread && unread > 0) {
      log(`unread ${lastUnread} -> ${unread}`);
      fireNotify(win, unread);
    } else if (unread !== lastUnread) {
      log(`unread ${lastUnread} -> ${unread} (no notify)`);
    }
    lastUnread = unread;
  } finally {
    inflight = false;
  }
}

/**
 * 启动轮询。默认 45s（比 DOM 5s 轻，也够「有消息就知道」）。
 */
export function startGoofishNotifyService(deps: GoofishNotifyDeps): StopHandle {
  if (timer) {
    return {
      stop: stopGoofishNotifyService,
      tickNow: () => tick(deps),
    };
  }
  const intervalMs = Math.max(15_000, deps.intervalMs || 45_000);
  log(`started interval=${intervalMs}ms`);
  // 启动稍后第一票，避开 bootstrap 高峰
  bootTimer = setTimeout(() => {
    bootTimer = null;
    void tick(deps);
  }, 8_000);
  timer = setInterval(() => {
    void tick(deps);
  }, intervalMs);

  return {
    stop: stopGoofishNotifyService,
    tickNow: () => tick(deps),
  };
}

export function stopGoofishNotifyService(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 测试复位 */
export function __resetGoofishNotifyForTest(): void {
  stopGoofishNotifyService();
  lastUnread = 0;
  seeded = false;
  inflight = false;
  authFailStreak = 0;
}
