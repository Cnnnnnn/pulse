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
  const top = pickTopUnreadSession(sessions, humansOnly);
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
  if (
    /SESSION_EXPIRED|TOKEN_EXOIRED|TOKEN_EMPTY|令牌过期|ILLEGAL_ACCESS/i.test(
      retStr,
    )
  ) {
    return "auth_expired";
  }
  if (/RGV587|USER_VALIDATE|哎哟喂|\/punish/i.test(retStr)) return "risk";
  return "unknown";
}

/**
 * 调用 session.sync。优先 session.fetch（自动带分区 cookie）。
 */
export async function fetchSessionSync(
  electronSession?: electronType.Session | null,
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

    const cookies = await sess.cookies.get({});
    const h5 = cookies.find((c) => c.name === "_m_h5_tk");
    const token = parseH5Token(h5 && h5.value);
    if (!token) return { ok: false, reason: "no_token" };

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
      sessionOption: "AutoLoginOnly",
      spm_cnt: "a21ybx.im.0.0",
    });
    const url = `https://h5api.m.goofish.com/h5/${GOOFISH_SESSION_SYNC_API}/${GOOFISH_SESSION_SYNC_VER}/?${qs}`;
    const res = await sess.fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.goofish.com",
        referer: "https://www.goofish.com/",
      },
      body: new URLSearchParams({ data: dataVal }).toString(),
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
    const ret = parsed.ret || [];
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
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "unknown", detail };
  }
}
