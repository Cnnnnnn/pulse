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
    const parsed: GoofishChatSession = {
      sessionId: String(session.sessionId || ""),
      sessionType,
      peerNick: String(user.nick || user.fishNick || ""),
      peerUserId: String(user.userId || ""),
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
