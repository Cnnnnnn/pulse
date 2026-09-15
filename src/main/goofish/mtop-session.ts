/**
 * src/main/goofish/mtop-session.ts
 *
 * 闲鱼 H5 mtop：用 persist:goofish 分区 cookie 拉会话列表。
 * 签名 = md5(token&t&appKey&data)，token 取自 `_m_h5_tk` 下划线前半段。
 *
 * 只读：session.sync，不做发送/下单。
 */

import type * as electronType from "electron";
import { createHash } from "node:crypto";

export const GOOFISH_MTOP_APP_KEY = "34839810";
export const GOOFISH_SESSION_SYNC_API = "mtop.taobao.idlemessage.pc.session.sync";
export const GOOFISH_SESSION_SYNC_VER = "3.0";

const GOOFISH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type GoofishChatSession = {
  sessionId: string;
  sessionType: number;
  peerNick: string;
  peerUserId: string;
  /** 关联商品（有则可用于 IM 深链） */
  itemId: string;
  unread: number;
  lastMsg: string;
  ts: number;
};

export type SessionSyncResult =
  | {
      ok: true;
      sessions: GoofishChatSession[];
      humanUnread: number;
      allUnread: number;
      ret: string[];
    }
  | {
      ok: false;
      reason: "no_token" | "auth_expired" | "risk" | "http" | "parse" | "unknown";
      ret?: string[];
      detail?: string;
    };

export function mtopSign(t: string, token: string, data: string, appKey = GOOFISH_MTOP_APP_KEY): string {
  return createHash("md5")
    .update(`${token}&${t}&${appKey}&${data}`, "utf8")
    .digest("hex");
}

export function parseH5Token(raw: unknown): string | null {
  const v = String(raw || "");
  if (!v) return null;
  const token = v.split("_")[0];
  return token || null;
}

export function summarizeSessions(rawSessions: unknown[]): {
  sessions: GoofishChatSession[];
  humanUnread: number;
  allUnread: number;
} {
  const sessions: GoofishChatSession[] = [];
  let humanUnread = 0;
  let allUnread = 0;
  for (const item of rawSessions || []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, any>;
    const session = row.session || {};
    const user = session.userInfo || {};
    const summary = (row.message && row.message.summary) || {};
    const unread = Number(summary.unread) || 0;
    const sessionType = Number(session.sessionType) || 0;
    const ext =
      (session.extension && typeof session.extension === "object"
        ? session.extension
        : null) ||
      (row.extension && typeof row.extension === "object" ? row.extension : null) ||
      {};
    const itemId = String(
      session.itemId ||
        (ext as any).itemId ||
        (row.item && row.item.itemId) ||
        (row.item && row.item.id) ||
        "",
    );
    const parsed: GoofishChatSession = {
      sessionId: String(session.sessionId || ""),
      sessionType,
      peerNick: String(user.nick || user.fishNick || ""),
      peerUserId: String(user.userId || user.peerUserId || ""),
      itemId,
      unread,
      lastMsg: String(summary.summary || ""),
      ts: Number(summary.ts) || 0,
    };
    sessions.push(parsed);
    allUnread += unread;
    // sessionType 1 = 真人会话（社区约定）
    if (sessionType === 1) humanUnread += unread;
  }
  return { sessions, humanUnread, allUnread };
}

/**
 * 通知文案：优先展示「有未读」会话里最新一条（可限真人）。
 * 例: "买家A：在吗（共 3 条未读）"
 */
export function formatNotifyBody(
  sessions: GoofishChatSession[],
  unreadTotal: number,
  opts?: { humansOnly?: boolean },
): string {
  const humansOnly = opts?.humansOnly !== false;
  const top =
    pickTopUnreadSession(sessions, humansOnly) ||
    pickLatestSession(sessions, humansOnly);
  const total = Math.max(0, Number(unreadTotal) || 0);
  if (!top) {
    return total > 0 ? `${total} 条未读消息，点击查看` : "有新消息，点击查看";
  }
  const nick = (top.peerNick || "买家").slice(0, 16);
  const msg = (top.lastMsg || "").replace(/\s+/g, " ").trim().slice(0, 36);
  const head = msg ? `${nick}：${msg}` : `${nick} 发来新消息`;
  if (total <= 1) return head;
  return `${head}（共 ${total} 条未读）`;
}

/** 有未读会话里取最新一条；humansOnly 时仅 sessionType=1 */
export function pickTopUnreadSession(
  sessions: GoofishChatSession[],
  humansOnly = true,
): GoofishChatSession | null {
  const list = (sessions || [])
    .filter((s) => s.unread > 0 && (!humansOnly || s.sessionType === 1))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return list[0] || null;
}

/**
 * 按最后一条消息时间取最新会话（不要求 unread>0）。
 * 真人会话的 summary.unread 常恒为 0，只能靠 ts/lastMsg 变化发现新消息。
 */
export function pickLatestSession(
  sessions: GoofishChatSession[],
  humansOnly = true,
): GoofishChatSession | null {
  const list = (sessions || [])
    .filter((s) => !humansOnly || s.sessionType === 1)
    .filter((s) => !!(s.lastMsg || s.ts))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return list[0] || null;
}

/**
 * IM 深链：有 peerUserId 时直达会话；缺省回列表。
 * 形如 /im?peerUserId=…&itemId=…
 */
export function buildImDeepLink(session: GoofishChatSession | null | undefined): string {
  const base = "https://www.goofish.com/im";
  if (!session || !session.peerUserId) return base;
  const u = new URL(base);
  u.searchParams.set("peerUserId", session.peerUserId);
  if (session.itemId) u.searchParams.set("itemId", session.itemId);
  return u.toString();
}

function classifyRet(ret: unknown): "ok" | "auth_expired" | "risk" | "unknown" {
  const retStr = Array.isArray(ret) ? ret.join(" | ") : String(ret || "");
  if (!retStr || retStr.includes("SUCCESS")) return "ok";
  // ILLEGAL_ACCESS 多为网关/签名问题，与登录态无关 → 落 unknown 走 error 口径
  if (/SESSION_EXPIRED|TOKEN_EXOIRED|TOKEN_EMPTY|令牌过期/i.test(retStr)) {
    return "auth_expired";
  }
  if (/RGV587|USER_VALIDATE|哎哟喂|\/punish/i.test(retStr)) return "risk";
  return "unknown";
}

/** 从分区 cookie 取 goofish 域的 _m_h5_tk */
export function pickGoofishH5Token(cookies: Array<{ name?: string; domain?: string; value?: string }>): string | null {
  const list = (cookies || []).filter((c) => c && c.name === "_m_h5_tk" && c.value);
  const prefer =
    list.find((c) => String(c.domain || "").includes("goofish.com")) || list[0];
  return parseH5Token(prefer && prefer.value);
}

/** 网页登录痕迹（Havana / unb），与 mtop token 是否过期分开看 */
export function hasGoofishLoginHints(
  cookies: Array<{ name?: string; domain?: string; value?: string }>,
): boolean {
  return (cookies || []).some((c) => {
    if (!c || !c.value) return false;
    const n = String(c.name || "");
    return (
      n === "unb" ||
      n === "tracknick" ||
      n === "sgcookie" ||
      n.startsWith("havana_lgc")
    );
  });
}

function interpretSyncJson(parsed: any): SessionSyncResult {
  const ret = (parsed && parsed.ret) || [];
  const kind = classifyRet(ret);
  if (kind === "auth_expired") {
    return { ok: false, reason: "auth_expired", ret };
  }
  if (kind === "risk") {
    return { ok: false, reason: "risk", ret };
  }
  if (kind !== "ok") {
    return {
      ok: false,
      reason: "unknown",
      ret,
      detail: Array.isArray(ret) ? ret.join(" | ") : String(ret),
    };
  }
  const rawSessions = (parsed.data && parsed.data.sessions) || [];
  const { sessions, humanUnread, allUnread } = summarizeSessions(rawSessions);
  return { ok: true, sessions, humanUnread, allUnread, ret };
}

function buildSyncRequest(token: string): { url: string; body: string } {
  const dataVal = JSON.stringify({ fetchNum: 50 });
  const t = String(Date.now());
  const sign = mtopSign(t, token, dataVal);
  const qs = new URLSearchParams({
    jsv: "2.7.2",
    appKey: GOOFISH_MTOP_APP_KEY,
    t,
    sign,
    v: GOOFISH_SESSION_SYNC_VER,
    type: "originaljson",
    accountSite: "xianyu",
    dataType: "json",
    timeout: "20000",
    api: GOOFISH_SESSION_SYNC_API,
    // ponytail: 不带 AutoLoginOnly — 主进程 fetch 易误伤仍在线的 Havana 会话
    spm_cnt: "a21ybx.im.0.0",
  });
  const url = `https://h5api.m.goofish.com/h5/${GOOFISH_SESSION_SYNC_API}/${GOOFISH_SESSION_SYNC_VER}/?${qs}`;
  const body = new URLSearchParams({ data: dataVal }).toString();
  return { url, body };
}

/**
 * 在 guest 页内发 session.sync（带上渲染进程 cookie / 分区态）。
 * 主进程 session.fetch 对 partitioned cookie 经常带不齐 → 假 SESSION_EXPIRED。
 */
export async function fetchSessionSyncViaGuest(
  webContents: electronType.WebContents,
  token: string,
): Promise<SessionSyncResult> {
  try {
    if (!webContents || webContents.isDestroyed()) {
      return { ok: false, reason: "unknown", detail: "no_guest" };
    }
    const { url, body } = buildSyncRequest(token);
    const raw = await webContents.executeJavaScript(
      `(() => fetch(${JSON.stringify(url)}, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: ${JSON.stringify(body)},
      }).then(async (res) => ({
        status: res.status,
        text: await res.text(),
      })).catch((e) => ({
        error: String((e && e.message) || e),
      })))()`,
      true,
    );
    if (!raw || (raw as any).error) {
      return {
        ok: false,
        reason: "http",
        detail: String((raw as any)?.error || "guest_fetch_failed"),
      };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(String((raw as any).text || ""));
    } catch {
      return {
        ok: false,
        reason: "parse",
        detail: String((raw as any).text || "").slice(0, 120),
      };
    }
    return interpretSyncJson(parsed);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "unknown", detail };
  }
}

/**
 * 调用 session.sync。
 * 优先 guest 页内 fetch；否则退回分区 session.fetch。
 */
export async function fetchSessionSync(
  electronSession?: electronType.Session | null,
  webContents?: electronType.WebContents | null,
): Promise<SessionSyncResult> {
  try {
    const { session } = require("electron") as typeof electronType;
    const sess =
      electronSession ||
      (session && typeof session.fromPartition === "function"
        ? session.fromPartition("persist:goofish")
        : null);
    if (!sess || typeof sess.fetch !== "function") {
      return { ok: false, reason: "unknown", detail: "no_session_fetch" };
    }
    try {
      if (typeof sess.setUserAgent === "function") sess.setUserAgent(GOOFISH_UA);
    } catch {
      /* noop */
    }

    let cookies = await sess.cookies.get({});
    let token = pickGoofishH5Token(cookies);
    if (!token && webContents && !webContents.isDestroyed()) {
      // _m_h5_tk 是短时令牌，睡眠/长期后台后会过期被清；登录态 cookie 仍在。
      // guest 里发一次无令牌 mtop 请求，服务端回 TOKEN_EMPTY 并 Set-Cookie
      // 新令牌，借此引导出新 _m_h5_tk 再继续，而不是直接报"未登录"。
      await fetchSessionSyncViaGuest(webContents, "");
      cookies = await sess.cookies.get({});
      token = pickGoofishH5Token(cookies);
    }
    if (!token) return { ok: false, reason: "no_token" };

    if (webContents && !webContents.isDestroyed()) {
      const viaGuest = await fetchSessionSyncViaGuest(webContents, token);
      if (viaGuest.ok === true) return viaGuest;
      // guest 已明确 auth/risk 时不再用主进程重试（避免假阴性覆盖）
      if (
        viaGuest.reason === "auth_expired" ||
        viaGuest.reason === "risk" ||
        viaGuest.reason === "parse"
      ) {
        return viaGuest;
      }
    }

    const { url, body } = buildSyncRequest(token);
    const res = await sess.fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.goofish.com",
        referer: "https://www.goofish.com/",
      },
      body,
    });
    if (!res || typeof res.text !== "function") {
      return { ok: false, reason: "http", detail: "bad_response" };
    }
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "parse", detail: text.slice(0, 120) };
    }
    return interpretSyncJson(parsed);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "unknown", detail };
  }
}
