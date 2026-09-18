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
  pickLatestSession,
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
  /** 该会话是否被用户加「不再提醒」(dnd) */
  isSessionDnd?: (sessionKey: string) => boolean;
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
let lastBadge = 0;
let seeded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;
let authFailStreak = 0;
let authStatus: GoofishAuthStatus = "unknown";
let activeDeps: GoofishNotifyDeps | null = null;
/** 全局「上次 fire 系统通知」epoch ms —— 90s 全局冷却避免刷屏 */
let lastNotifyAt = 0;
let lastWsWakeAt = 0;
let lastRefreshAt = 0;
let wsWakeTimer: ReturnType<typeof setTimeout> | null = null;
/** sessionId → `${ts}\\0${lastMsg}`；真人 unread 常为 0，靠摘要变化发现新消息 */
let lastHumanMsgFp = new Map<string, string>();
/**
 * 同会话通知冷却（解决 WS 帧风暴里同一会话连发多帧 → 连弹 2+ 次通知）：
 *   key = sessionDeepLinkKey(session)，value = 上次 fire 的 epoch ms。
 *   WS_CHAT_DEDUP_MS 窗内相同 key 不再弹通知（只更新徽标 + 仍触发 ws-wake）。
 *
 * 不同于全局 lastNotifyAt：全局冷却让"买家 A 弹完 30s 内 B 来也压住"；本 map 让
 * "同一会话连发"被去重，但**其他会话立即可弹**。
 */
const WS_CHAT_DEDUP_MS = 30_000;
const wsChatNotifyLastAt = new Map<string, number>();
const PER_SESSION_COOLDOWN_MS = 60_000;
/** sessionDeepLinkKey → 上次 fire 的 epoch ms（避免同一会话被刷屏） */
const sessionNotifyLastAt = new Map<string, number>();

const liveNotifications: electronType.Notification[] = [];
const GOOFISH_IM = "https://www.goofish.com/im";
const DEFAULT_COOLDOWN_MS = 90_000;
/** 无可靠 WS 时 20s 兜底；有 CDP/门铃时仍保留 */
const DEFAULT_INTERVAL_MS = 20_000;
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

/** 同会话深链稳定 key：peerUserId 优先；缺则用 cid 前缀 */
function sessionDeepLinkKey(session: GoofishChatSession | null | undefined): string {
  if (!session) return "_list";
  const peer = String(session.peerUserId || "").trim();
  if (peer) return peer;
  const cid = String(session.sessionId || "").split("@")[0];
  return cid || "_list";
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
    // 通知点击走 deps.openIm（已通过 goofishEmbedNav 落进主进程路由），不重复
    // 走 goofish:open-request IPC —— 否则同一次点击会触发两次 nav load。
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

function humanMsgKey(s: GoofishChatSession): string {
  return `${Number(s.ts) || 0}\0${String(s.lastMsg || "")}`;
}

/**
 * 对比真人会话 lastMsg/ts。unread 恒 0 时仍能发现「有人说话了」。
 * 返回本次变新的会话（按 ts 新→旧）。
 */
export function diffHumanMessageUpdates(
  sessions: GoofishChatSession[],
  prev: Map<string, string>,
): { changed: GoofishChatSession[]; next: Map<string, string> } {
  const next = new Map<string, string>();
  const changed: GoofishChatSession[] = [];
  for (const s of sessions || []) {
    if (s.sessionType !== 1) continue;
    const id = String(s.sessionId || s.peerUserId || "");
    if (!id) continue;
    const key = humanMsgKey(s);
    next.set(id, key);
    const old = prev.get(id);
    if (old != null && old !== key) changed.push(s);
  }
  changed.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return { changed, next };
}

function fireNotify(
  win: electronType.BrowserWindow | null,
  deps: GoofishNotifyDeps,
  unread: number,
  sessions: GoofishChatSession[],
  opts?: { skipSessionCooldown?: boolean },
): void {
  if (deps.isNotifyEnabled && !deps.isNotifyEnabled()) {
    log(`notify skipped: disabled unread=${unread}`);
    return;
  }
  if (quietHoursBlocked(deps)) {
    log(`notify skipped: quiet_hours unread=${unread}`);
    return;
  }
  const onlyHumans = humansOnly(deps);
  const top =
    pickTopUnreadSession(sessions, onlyHumans) ||
    pickLatestSession(sessions, onlyHumans);
  const sessionKey = sessionDeepLinkKey(top);
  // B4: 用户在该会话上勾了「不再提醒」→ 静默；但仍可被全局开关/会话级外的
  // 其他会话通知影响。
  if (
    sessionKey !== "_list" &&
    typeof deps.isSessionDnd === "function" &&
    deps.isSessionDnd(sessionKey)
  ) {
    log(`notify skipped: session_dnd key=${sessionKey} unread=${unread}`);
    return;
  }
  const cooldown =
    typeof deps.notifyCooldownMs === "number" && deps.notifyCooldownMs >= 0
      ? deps.notifyCooldownMs
      : DEFAULT_COOLDOWN_MS;
  const now = Date.now();

  // 同会话冷却（针对 WS chat 帧风暴）：60s 窗内同一会话不重复弹；
  // 全局冷却（90s）作为「整个会话聚合层」兜底，避免多会话同时仍刷屏。
  if (!opts?.skipSessionCooldown && sessionNotifyLastAt.has(sessionKey)) {
    const last = sessionNotifyLastAt.get(sessionKey) || 0;
    if (now - last < PER_SESSION_COOLDOWN_MS) {
      log(
        `notify session-cooled: key=${sessionKey} unread=${unread} remainMs=${PER_SESSION_COOLDOWN_MS - (now - last)}`,
      );
      return;
    }
  }
  if (cooldown > 0 && lastNotifyAt > 0 && now - lastNotifyAt < cooldown) {
    log(
      `notify cooled: unread=${unread} remainMs=${cooldown - (now - lastNotifyAt)}`,
    );
    return;
  }

  const body = formatNotifyBody(sessions, unread, { humansOnly: onlyHumans });
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
  sessionNotifyLastAt.set(sessionKey, now);
  // 偶尔清陈旧键避免无限增长（5 分钟无活动会话丢）
  if (sessionNotifyLastAt.size > 64) {
    const cutoff = now - PER_SESSION_COOLDOWN_MS;
    for (const [k, t] of sessionNotifyLastAt) {
      if (t < cutoff) sessionNotifyLastAt.delete(k);
    }
  }
  log(
    `notify shown: unread=${unread} deepLink=${top?.peerUserId ? "session" : "list"} sessionKey=${sessionKey}`,
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

    // 服务端 ret 明确写 SESSION_EXPIRED = Havana 会话真过期(终态):
    // 立即如实上报引导扫码, 且软刷新 /im 也救不回来, 不浪费一次 reload。
    // 降级「同步异常」只留给短时令牌类(TOKEN_EXOIRED/TOKEN_EMPTY)与网关误报。
    const failReason0 = result.ok === false ? result.reason : null;
    const retStr0 =
      result.ok === false && Array.isArray(result.ret)
        ? result.ret.join(" | ")
        : "";
    const sessionDefinitelyExpired =
      failReason0 === "auth_expired" && /SESSION_EXPIRED/i.test(retStr0);

    // auth_expired：令牌/会话被 mtop 拒；no_token 且登录 cookie 仍在：
    // 多半只是 _m_h5_tk 短时令牌过期被清。两者都先软刷新再重试一次。
    const refreshWorthy =
      !sessionDefinitelyExpired &&
      (failReason0 === "auth_expired" ||
        (failReason0 === "no_token" && (await hasLoginCookies(deps))));
    if (refreshWorthy && deps.refreshSession && win) {
      authFailStreak += 1;
      const now = Date.now();
      const canRefresh =
        authFailStreak === 1 || now - lastRefreshAt >= REFRESH_COOLDOWN_MS;
      if (canRefresh) {
        lastRefreshAt = now;
        log(
          `${failReason0} streak=${authFailStreak}, soft-refresh guest…`,
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
          `${failReason0} streak=${authFailStreak}, skip refresh (cooldown)`,
        );
      }
    }

    if (result.ok === false) {
      const fail = result;
      let st = authFromFail(fail);
      const prevSt = authStatus;
      // 登录 cookie 仍在却同步说没登录/过期：多半是 mtop 短时令牌缺失或网关误报，
      // 降级为同步异常，别逼用户扫码。但只在前几次失败时降级 —— 连续 ≥5 次
      // (authFailStreak) 说明服务端 Session 是真过期（如 Havana 到期），此时继续
      // 显示「同步异常」会误导用户；如实报「登录过期」引导重新扫码。
      // ret 明确写 SESSION_EXPIRED 的直接跳过降级 —— 那是终态，不是误报。
      if (
        (st === "auth_expired" || st === "logged_out") &&
        !sessionDefinitelyExpired &&
        authFailStreak < 5 &&
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
      // 提示按降级后的 st 判定：no_token 但登录 cookie 在时 st 已是 error，不再催扫码。
      // 门控用「状态翻转」而非 streak —— SESSION_EXPIRED 终态不走 streak 自增,
      // 否则同一句提示会每个 tick 重复弹。
      if (st !== prevSt && (st === "logged_out" || st === "auth_expired")) {
        try {
          if (win && !win.isDestroyed()) {
            win.webContents.send("goofish:alert", {
              title: "闲鱼",
              body:
                st === "logged_out"
                  ? "尚未登录闲鱼，打开模块扫码登录后即可收消息通知"
                  : "闲鱼登录已过期，请打开闲鱼重新扫码",
            });
          }
        } catch {
          /* noop */
        }
      }
      if (st === "error") {
        log(`sync fail: ${fail.reason} ${fail.detail || ""}`);
      }
      return;
    }

    authFailStreak = 0;
    pushAuth(win, "ok");
    const onlyHumans = humansOnly(deps);
    // 协议 allUnread 含大量运营号（常 ~50+），与站点右侧「消息」角标不是同一口径。
    // A2: 徽标改由 DOM 轨 + WS chat 为唯一真值；协议层不再 push 徽标，避免
    // 协议与 DOM 轨互相覆盖闪 0 / 闪 57。
    const notifyUnread = onlyHumans ? result.humanUnread : result.allUnread;
    const msgDiff = diffHumanMessageUpdates(result.sessions, lastHumanMsgFp);

    if (!seeded) {
      seeded = true;
      lastUnread = notifyUnread;
      lastHumanMsgFp = msgDiff.next;
      const byType: Record<string, number> = {};
      for (const s of result.sessions) {
        if (!(s.unread > 0)) continue;
        const k = String(s.sessionType || 0);
        byType[k] = (byType[k] || 0) + s.unread;
      }
      log(
        `seed notifyUnread=${notifyUnread} human=${result.humanUnread} all=${result.allUnread} sessions=${result.sessions.length} humansOnly=${onlyHumans} unreadByType=${JSON.stringify(byType)} humanTracked=${lastHumanMsgFp.size}`,
      );
      return;
    }

    if (notifyUnread > lastUnread && notifyUnread > 0) {
      log(`unread ${lastUnread} -> ${notifyUnread}`);
      fireNotify(win, deps, notifyUnread, result.sessions);
      lastUnread = notifyUnread;
      lastHumanMsgFp = msgDiff.next;
      return;
    }

    if (notifyUnread !== lastUnread) {
      log(`unread ${lastUnread} -> ${notifyUnread} (no notify)`);
    }

    // 真人 unread 常为 0：靠 lastMsg/ts 变化补通知
    if (onlyHumans && msgDiff.changed.length > 0) {
      const top = msgDiff.changed[0];
      log(
        `human-msg delta n=${msgDiff.changed.length} nick=${top.peerNick || "?"} text=${String(top.lastMsg || "").slice(0, 40)}`,
      );
      const bump = Math.max(1, notifyUnread, lastUnread + msgDiff.changed.length);
      fireNotify(win, deps, bump, msgDiff.changed);
      lastUnread = bump;
    } else {
      lastUnread = notifyUnread;
    }
    lastHumanMsgFp = msgDiff.next;
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
  try {
    const { goofishEmbedKickRailProbe } = require("../goofish-embed.ts");
    goofishEmbedKickRailProbe();
  } catch {
    /* noop */
  }
  if (!activeDeps) return;
  if (wsWakeTimer) return;
  wsWakeTimer = setTimeout(() => {
    wsWakeTimer = null;
    log("ws-wake → sync");
    void tick(activeDeps!);
  }, WS_WAKE_DEBOUNCE_MS);
}

/**
 * 站点右侧栏「消息」角标（DOM）。闲鱼常要 visibilitychange 才刷新，
 * 所以探测脚本会先伪装可见再读数——这才是用户看到的「1」，不是协议 allUnread 的 57。
 */
export function goofishNotifyOnDomRail(unread: number): void {
  if (!activeDeps) return;
  const n = Math.max(0, Math.min(99, Math.floor(Number(unread) || 0)));
  const win = activeDeps.getWindow();
  const prev = lastBadge;
  if (n !== lastBadge) {
    pushUnreadBadge(win, n);
    log(`dom-rail badge ${lastBadge} -> ${n}`);
    lastBadge = n;
  }
  if (!seeded) {
    seeded = true;
    lastUnread = n;
    return;
  }
  if (n > prev && n > 0) {
    log(`dom-rail unread ${prev} -> ${n}`);
    fireNotify(win, activeDeps, n, []);
    lastUnread = Math.max(lastUnread, n);
  } else if (n < prev) {
    // 已读后角标下降，对齐内部计数
    lastUnread = n;
  }
}

/**
 * 已解析的 WS chat 事件：不依赖 session.sync 的 humanUnread 上涨。
 * （实测真人会话 unread 常为 0，站点角标全是运营号 → 仅靠 sync 永远不弹。）
 */
export function goofishNotifyOnWsChat(ev: GoofishWsEvent): void {
  return goofishNotifyOnWsChatInternal(ev, false);
}

/**
 * keepalive /im view 入口：同一 chat frame 在主 view CDP 也会嗅到，徽标走主 view；
 * 这里只 fire 通知，避免 lastBadge 重复 +1。
 */
export function goofishNotifyOnWsChatSkipBadge(ev: GoofishWsEvent): void {
  return goofishNotifyOnWsChatInternal(ev, true);
}

function goofishNotifyOnWsChatInternal(
  ev: GoofishWsEvent,
  skipBadge: boolean,
): void {
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

  // A1: 同会话短窗去重（30s）。WS 帧风暴时同一会话可能在 ~10ms 内连发
  // 2~5 帧；fireNotify 内的「同会话冷却」是 60s 太长，仍允许 ws-wake 同步去抖。
  const dedupKey = `${String(ev.cid || "")}|${String(ev.itemId || "")}|${String(session.ts || 0)}`;
  const now = Date.now();
  const lastAt = wsChatNotifyLastAt.get(dedupKey) || 0;
  const dup = lastAt > 0 && now - lastAt < WS_CHAT_DEDUP_MS;

  if (!skipBadge) {
    const badgeNext = Math.max(lastBadge + 1, next);
    pushUnreadBadge(win, badgeNext);
    lastBadge = badgeNext;
  }

  if (dup) {
    log(`ws-chat dedup${skipBadge ? "-skipbadge" : ""} ${dedupKey} (${now - lastAt}ms ago)`);
    wsChatNotifyLastAt.set(dedupKey, now);
    goofishNotifyOnWsWake();
    return;
  }
  wsChatNotifyLastAt.set(dedupKey, now);
  if (wsChatNotifyLastAt.size > 256) {
    const cutoff = now - WS_CHAT_DEDUP_MS;
    for (const [k, t] of wsChatNotifyLastAt) {
      if (t < cutoff) wsChatNotifyLastAt.delete(k);
    }
  }

  log(`ws-chat notify${skipBadge ? "-skipbadge" : ""} nick=${nick} text=${text.slice(0, 40)}`);
  fireNotify(win, deps, next, [session]);
  // keepalive 路径不写 lastUnread — 主 view 的 wsChat 会用 lastUnread+1 计算徽标；
  // 若 keepalive 也写，主 view next 会被推到 lastUnread+2，造成徽标重复 +1。
  if (!skipBadge) {
    lastUnread = Math.max(lastUnread, next);
  }
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
  lastBadge = 0;
  seeded = false;
  inflight = false;
  authFailStreak = 0;
  authStatus = "unknown";
  lastNotifyAt = 0;
  lastWsWakeAt = 0;
  lastRefreshAt = 0;
  lastHumanMsgFp = new Map();
  wsChatNotifyLastAt.clear();
  sessionNotifyLastAt.clear();
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
