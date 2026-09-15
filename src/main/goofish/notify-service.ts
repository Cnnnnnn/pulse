/**
 * src/main/goofish/notify-service.ts
 *
 * 闲鱼未读通知服务（协议层）:
 *   定时 / WS 唤醒 → session.sync → 未读上涨 → Notification + toast
 *   WS chat 帧可直接弹（不依赖 humanUnread；站点未读常堆在运营号）
 *   与「检查更新」同构：自己拉完结果再弹，不刮 DOM。
 *
 * P2: guest 内官方 WS 唤醒即时 sync；通知冷却 + 全局免打扰时段。
 * 只读，不发送消息。
 */

import type * as electronType from "electron";
import {
  buildImDeepLink,
  fetchSessionSync,
  formatNotifyBody,
  hasGoofishLoginHints,
  pickTopUnreadSession,
  type GoofishChatSession,
  type SessionSyncResult,
} from "./mtop-session";
import type { GoofishWsEvent } from "./ws-frames";
import { inQuietHours } from "../notification-policy";

export type GoofishAuthStatus =
  | "unknown"
  | "ok"
  | "logged_out"
  | "auth_expired"
  | "risk"
  | "error";

export type GoofishNotifyDeps = {
  getWindow: () => electronType.BrowserWindow | null;
  /** 取 guest webContents；有则优先页内 sync */
  getGuestWebContents?: () => electronType.WebContents | null;
  /** 轻量续 cookie（勿整页狂 reload） */
  refreshSession?: (win: electronType.BrowserWindow) => void | Promise<void>;
  /** 分区里是否仍有网页登录痕迹 cookie（unb/tracknick/sgcookie/havana_lgc*）；默认读真实分区 */
  hasLoginCookies?: () => boolean | Promise<boolean>;
  /** 打开 IM（可带会话深链） */
  openIm?: (win: electronType.BrowserWindow, url: string) => void;
  /** 是否允许系统通知（设置开关）；默认 true */
  isNotifyEnabled?: () => boolean;
  /** 仅统计/提醒真人会话（sessionType=1）；默认 true */
  isHumansOnly?: () => boolean;
  /** 是否处于全局免打扰时段；默认读 config.notifications */
  isInQuietHours?: () => boolean;
  /** 同会话连续通知最小间隔（ms）；默认 90s */
  notifyCooldownMs?: number;
  /** 轮询兜底间隔；有 WS 唤醒时仍保留。默认 60s */
  intervalMs?: number;
  sync?: typeof fetchSessionSync;
};

type StopHandle = {
  stop: () => void;
  tickNow: () => Promise<void>;
  getAuthStatus: () => GoofishAuthStatus;
};

let lastUnread = 0;
let seeded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let authFailStreak = 0;
let authStatus: GoofishAuthStatus = "unknown";
let activeDeps: GoofishNotifyDeps | null = null;
let lastNotifyAt = 0;
let lastWsWakeAt = 0;
let lastRefreshAt = 0;
let wsWakeTimer: ReturnType<typeof setTimeout> | null = null;

const liveNotifications: electronType.Notification[] = [];
const GOOFISH_IM = "https://www.goofish.com/im";
const DEFAULT_COOLDOWN_MS = 90_000;
const DEFAULT_INTERVAL_MS = 60_000;
const WS_WAKE_DEBOUNCE_MS = 2_500;
/** 认证失败时最多软刷新 1 次 / 15 分钟，避免整页 reload 风暴把人赶去扫码 */
const REFRESH_COOLDOWN_MS = 15 * 60_000;

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

function pushAuth(win: electronType.BrowserWindow | null, status: GoofishAuthStatus): void {
  if (authStatus !== status) {
    log(`auth status ${authStatus} -> ${status}`);
  }
  authStatus = status;
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send("goofish:auth", { status });
    }
  } catch {
    /* noop */
  }
}

function humansOnly(deps: GoofishNotifyDeps): boolean {
  if (typeof deps.isHumansOnly === "function") {
    try {
      return deps.isHumansOnly() !== false;
    } catch {
      return true;
    }
  }
  return true;
}

function focusAndOpenIm(
  win: electronType.BrowserWindow | null,
  deps: GoofishNotifyDeps,
  targetUrl: string,
): void {
  try {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const url = targetUrl || GOOFISH_IM;
    win.webContents.send("goofish:open-request", { url });
    if (typeof deps.openIm === "function") {
      deps.openIm(win, url);
    } else {
      try {
        const { goofishEmbedNav } = require("../goofish-embed.ts");
        goofishEmbedNav(win, { action: "load", url });
      } catch {
        /* noop */
      }
    }
    setTimeout(() => {
      void tick(deps);
    }, 4000);
  } catch {
    /* noop */
  }
}

function quietHoursBlocked(deps: GoofishNotifyDeps): boolean {
  if (typeof deps.isInQuietHours === "function") {
    try {
      return !!deps.isInQuietHours();
    } catch {
      return false;
    }
  }
  return false;
}

function fireNotify(
  win: electronType.BrowserWindow | null,
  deps: GoofishNotifyDeps,
  unread: number,
  sessions: GoofishChatSession[],
): void {
  if (deps.isNotifyEnabled && !deps.isNotifyEnabled()) {
    log(`notify skipped: disabled unread=${unread}`);
    return;
  }
  if (quietHoursBlocked(deps)) {
    log(`notify skipped: quiet_hours unread=${unread}`);
    return;
  }
  const cooldown =
    typeof deps.notifyCooldownMs === "number" && deps.notifyCooldownMs >= 0
      ? deps.notifyCooldownMs
      : DEFAULT_COOLDOWN_MS;
  const now = Date.now();
  if (cooldown > 0 && lastNotifyAt > 0 && now - lastNotifyAt < cooldown) {
    log(
      `notify cooled: unread=${unread} remainMs=${cooldown - (now - lastNotifyAt)}`,
    );
    return;
  }

  const onlyHumans = humansOnly(deps);
  const body = formatNotifyBody(sessions, unread, { humansOnly: onlyHumans });
  const top = pickTopUnreadSession(sessions, onlyHumans);
  const deepLink = buildImDeepLink(top);
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
      n.on("click", () => focusAndOpenIm(win, deps, deepLink));
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
        url: deepLink,
      });
    }
  } catch {
    /* noop */
  }
  lastNotifyAt = now;
  log(
    `notify shown: unread=${unread} deepLink=${top?.peerUserId ? "session" : "list"}`,
  );
}

function authFromFail(result: Extract<SessionSyncResult, { ok: false }>): GoofishAuthStatus {
  if (result.reason === "no_token") return "logged_out";
  if (result.reason === "auth_expired") return "auth_expired";
  if (result.reason === "risk") return "risk";
  return "error";
}

async function cookiesHintLoggedIn(): Promise<boolean> {
  try {
    const { session } = require("electron") as typeof electronType;
    const sess = session.fromPartition("persist:goofish");
    const cookies = await sess.cookies.get({});
    return hasGoofishLoginHints(cookies);
  } catch {
    return false;
  }
}

/** 优先 deps 注入（单测），否则读真实分区 */
async function hasLoginCookies(deps: GoofishNotifyDeps): Promise<boolean> {
  if (typeof deps.hasLoginCookies === "function") {
    try {
      return (await deps.hasLoginCookies()) === true;
    } catch {
      /* fallthrough to real check */
    }
  }
  return cookiesHintLoggedIn();
}

async function runSync(deps: GoofishNotifyDeps): Promise<SessionSyncResult> {
  const sync = deps.sync || fetchSessionSync;
  const guest =
    typeof deps.getGuestWebContents === "function"
      ? deps.getGuestWebContents()
      : null;
  // 自定义 sync（单测）不传 guest
  if (deps.sync) return sync();
  return sync(null, guest);
}

async function tick(deps: GoofishNotifyDeps): Promise<void> {
  if (inflight) return;
  inflight = true;
  try {
    const win = deps.getWindow ? deps.getWindow() : null;
    let result: SessionSyncResult = await runSync(deps);

    // auth_expired：令牌/会话被 mtop 拒；no_token 且登录 cookie 仍在：
    // 多半只是 _m_h5_tk 短时令牌过期被清。两者都先软刷新再重试一次。
    const failReason = result.ok === false ? result.reason : null;
    const refreshWorthy =
      failReason === "auth_expired" ||
      (failReason === "no_token" && (await hasLoginCookies(deps)));
    if (refreshWorthy && deps.refreshSession && win) {
      authFailStreak += 1;
      const now = Date.now();
      const canRefresh =
        authFailStreak === 1 || now - lastRefreshAt >= REFRESH_COOLDOWN_MS;
      if (canRefresh) {
        lastRefreshAt = now;
        log(
          `${failReason} streak=${authFailStreak}, soft-refresh guest…`,
        );
        try {
          await Promise.resolve(deps.refreshSession(win));
          await new Promise((r) => setTimeout(r, 2500));
          result = await runSync(deps);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`refresh failed: ${msg}`);
        }
      } else {
        log(
          `${failReason} streak=${authFailStreak}, skip refresh (cooldown)`,
        );
      }
    }

    if (result.ok === false) {
      const fail = result;
      let st = authFromFail(fail);
      // 登录 cookie 仍在却同步说没登录/过期：多半是 mtop 短时令牌缺失或网关误报，
      // 降级为同步异常，别逼用户扫码
      if (
        (st === "auth_expired" || st === "logged_out") &&
        (await hasLoginCookies(deps))
      ) {
        st = "error";
        log(
          `sync said ${fail.reason} but login cookies present → treat as sync error; ret=${
            Array.isArray(fail.ret) ? fail.ret.join("|") : fail.detail || ""
          }`,
        );
      }
      pushAuth(win, st);
      // 提示按降级后的 st 判定：no_token 但登录 cookie 在时 st 已是 error，不再催扫码
      if (st === "logged_out") {
        if (authFailStreak <= 1) {
          try {
            if (win && !win.isDestroyed()) {
              win.webContents.send("goofish:alert", {
                title: "闲鱼",
                body: "尚未登录闲鱼，打开模块扫码登录后即可收消息通知",
              });
            }
          } catch {
            /* noop */
          }
        }
      } else if (st === "auth_expired") {
        if (authFailStreak <= 1) {
          try {
            if (win && !win.isDestroyed()) {
              win.webContents.send("goofish:alert", {
                title: "闲鱼",
                body: "闲鱼登录已过期，请打开闲鱼重新扫码",
              });
            }
          } catch {
            /* noop */
          }
        }
      } else {
        log(`sync fail: ${fail.reason} ${fail.detail || ""}`);
      }
      return;
    }

    authFailStreak = 0;
    pushAuth(win, "ok");
    const onlyHumans = humansOnly(deps);
    const unread = onlyHumans ? result.humanUnread : result.allUnread;

    if (!seeded) {
      seeded = true;
      lastUnread = unread;
      pushUnreadBadge(win, unread);
      const byType: Record<string, number> = {};
      for (const s of result.sessions) {
        if (!(s.unread > 0)) continue;
        const k = String(s.sessionType || 0);
        byType[k] = (byType[k] || 0) + s.unread;
      }
      log(
        `seed unread=${unread} human=${result.humanUnread} all=${result.allUnread} sessions=${result.sessions.length} humansOnly=${onlyHumans} unreadByType=${JSON.stringify(byType)}`,
      );
      return;
    }

    if (unread !== lastUnread) {
      pushUnreadBadge(win, unread);
    }

    if (unread > lastUnread && unread > 0) {
      log(`unread ${lastUnread} -> ${unread}`);
      fireNotify(win, deps, unread, result.sessions);
    } else if (unread !== lastUnread) {
      log(`unread ${lastUnread} -> ${unread} (no notify)`);
    }
    lastUnread = unread;
  } finally {
    inflight = false;
  }
}

/**
 * 启动轮询。默认 60s（WS 唤醒为快路径，轮询兜底）。
 */
export function startGoofishNotifyService(deps: GoofishNotifyDeps): StopHandle {
  activeDeps = deps;
  if (timer) {
    return {
      stop: stopGoofishNotifyService,
      tickNow: () => tick(deps),
      getAuthStatus: () => authStatus,
    };
  }
  const intervalMs = Math.max(15_000, deps.intervalMs || DEFAULT_INTERVAL_MS);
  log(`started interval=${intervalMs}ms`);
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
    getAuthStatus: () => authStatus,
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
  if (wsWakeTimer) {
    clearTimeout(wsWakeTimer);
    wsWakeTimer = null;
  }
  activeDeps = null;
}

/** 外部触发立即同步（打开闲鱼 tab / 设置页「立即检查」） */
export function goofishNotifyTickNow(): Promise<void> {
  if (!activeDeps) return Promise.resolve();
  return tick(activeDeps);
}

/**
 * guest 内官方 IM WebSocket 有流量时调用。
 * 防抖后触发 session.sync，实现近实时通知而不自建钉钉长连。
 */
export function goofishNotifyOnWsWake(): void {
  lastWsWakeAt = Date.now();
  if (!activeDeps) return;
  if (wsWakeTimer) return;
  wsWakeTimer = setTimeout(() => {
    wsWakeTimer = null;
    log("ws-wake → sync");
    void tick(activeDeps!);
  }, WS_WAKE_DEBOUNCE_MS);
}

/**
 * 已解析的 WS chat 事件：不依赖 session.sync 的 humanUnread 上涨。
 * （实测真人会话 unread 常为 0，站点角标全是运营号 → 仅靠 sync 永远不弹。）
 */
export function goofishNotifyOnWsChat(ev: GoofishWsEvent): void {
  if (!activeDeps || !ev || ev.kind !== "chat") return;
  const deps = activeDeps;
  const text = String(ev.text || "").trim();
  const nick = String(ev.nick || "").trim() || "买家";
  if (!text && !ev.senderUserId) return;

  const win = deps.getWindow();
  if (!seeded) {
    seeded = true;
    lastUnread = 0;
  }
  const next = Math.max(1, lastUnread + 1);
  const session: GoofishChatSession = {
    sessionId: String(ev.cid || ""),
    sessionType: 1,
    peerNick: nick,
    peerUserId: String(ev.senderUserId || ""),
    itemId: String(ev.itemId || ""),
    unread: 1,
    lastMsg: text || "新消息",
    ts: typeof ev.ts === "number" && ev.ts > 0 ? ev.ts : Date.now(),
  };
  pushUnreadBadge(win, next);
  log(`ws-chat notify nick=${nick} text=${text.slice(0, 40)}`);
  fireNotify(win, deps, next, [session]);
  lastUnread = Math.max(lastUnread, next);
  // 随后再 sync，把徽标对齐协议层真相
  goofishNotifyOnWsWake();
}

export function getGoofishAuthStatus(): GoofishAuthStatus {
  return authStatus;
}

/** 测试：最近一次 WS 唤醒时间 */
export function __getLastWsWakeAtForTest(): number {
  return lastWsWakeAt;
}

/** 测试复位 */
export function __resetGoofishNotifyForTest(): void {
  stopGoofishNotifyService();
  lastUnread = 0;
  seeded = false;
  inflight = false;
  authFailStreak = 0;
  authStatus = "unknown";
  lastNotifyAt = 0;
  lastWsWakeAt = 0;
  lastRefreshAt = 0;
}

/** 供 index 注入：读全局 notifications 免打扰 */
export function defaultGoofishQuietHoursCheck(getConfig: () => any): () => boolean {
  return () => {
    try {
      const cfg = getConfig() || {};
      const notif = cfg.notifications || {};
      const start = notif.quiet_hours_start;
      const end = notif.quiet_hours_end;
      if (typeof start === "string" && typeof end === "string" && start && end) {
        return inQuietHours(new Date(), start, end);
      }
    } catch {
      /* noop */
    }
    return false;
  };
}
