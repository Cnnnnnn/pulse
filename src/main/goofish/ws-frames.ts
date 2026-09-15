/**
 * src/main/goofish/ws-frames.ts
 *
 * WS 帧 spike：解析 guest 页内官方 IM WebSocket 的原始帧，验证能否
 * 稳定拿到消息事件（发送者/文本/会话），为「WS 从门铃升级为数据源」铺路。
 *
 * 帧协议（钉钉 IM lwp，事实标准参考开源实现 XianyuAutoAgent）：
 *   外层 JSON 文本帧: { lwp, headers: {mid,sid,app-key,...}, body }
 *   消息推送: body.syncPushPackage.data[]，每项 .data 为
 *     - base64(JSON)（明文路径），或
 *     - base64(MessagePack)（二进制路径，数字串 key 如 "1"/"10"）
 *   聊天消息字段: "1"."10".{reminderTitle, reminderContent, senderUserId, reminderUrl}
 *                "1"."5"=ts(ms)，"1"."2"=cid("xxx@goofish")，"3".redReminder=订单状态
 *
 * spike 口径：页内只抓原始帧（截断 + 限频），解码全在主进程纯函数里，
 * 便于单测与统计。稳定后再考虑把解析下沉页内。
 */

import { decode as msgpackDecode } from "@msgpack/msgpack";

export type GoofishWsEventKind = "chat" | "order" | "other";

export type GoofishWsEvent = {
  kind: GoofishWsEventKind;
  nick?: string;
  senderUserId?: string;
  text?: string;
  cid?: string;
  itemId?: string;
  ts?: number;
  redReminder?: string;
};

export type GoofishWsFrameResult = {
  ok: boolean;
  /** 是否携带 syncPushPackage */
  isSync: boolean;
  events: GoofishWsEvent[];
  /** 解码失败时的简短原因 */
  detail?: string;
};

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** base64 → bytes；非法输入返回 null（主进程 Buffer 路径，无浏览器 API） */
function b64ToBytes(data: string): Uint8Array | null {
  try {
    const cleaned = String(data || "").replace(/[^A-Za-z0-9+/=]/g, "");
    if (!cleaned) return null;
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    const buf = Buffer.from(padded, "base64");
    return buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

/**
 * 解内层 payload：base64(JSON)、base64(MessagePack)、裸 JSON 或裸 msgpack 字节。
 * 两种形态都存在（明文 JSON 路径 + msgpack 二进制路径）。
 */
export function decodeSyncItem(
  data: string | Uint8Array | undefined,
): Record<string, any> | null {
  if (typeof data !== "string" && !(data instanceof Uint8Array)) return null;
  if (typeof data === "string") {
    // 纯 JSON 直塞的兜底（个别帧不 base64）
    try {
      const direct = JSON.parse(data);
      if (isObj(direct)) return direct;
    } catch {
      /* 不是裸 JSON，继续 base64 路径 */
    }
    return decodeSyncItem(b64ToBytes(data));
  }
  const bytes = data;
  if (bytes.length === 0) return null;
  // 字节即 utf8 JSON
  try {
    const asText = Buffer.from(bytes).toString("utf8");
    if (asText && asText.trimStart().startsWith("{")) {
      const parsed = JSON.parse(asText);
      if (isObj(parsed)) return parsed;
    }
  } catch {
    /* 走 msgpack */
  }
  // MessagePack
  try {
    const decoded: unknown = msgpackDecode(bytes);
    return isObj(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function asStr(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

function asTs(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function itemIdFromUrl(url: unknown): string | undefined {
  const s = asStr(url);
  if (!s) return undefined;
  const m = s.match(/itemId=([^&]+)/);
  return m ? m[1] : undefined;
}

/** 从内层解码对象提取事件；判别顺序：订单红点 → 聊天 → 其他 */
export function extractEvent(decoded: Record<string, any>): GoofishWsEvent {
  const red = isObj(decoded["3"]) ? asStr(decoded["3"].redReminder) : undefined;
  const timeline = isObj(decoded["1"]) ? decoded["1"] : null;
  const cid = timeline ? asStr(timeline["2"]) : undefined;
  const ts = timeline ? asTs(timeline["5"]) : undefined;
  const info = timeline && isObj(timeline["10"]) ? timeline["10"] : null;

  if (red) {
    return {
      kind: "order",
      redReminder: red,
      cid: cid ? cid.split("@")[0] : undefined,
      ts,
    };
  }
  if (info) {
    const text = asStr(info.reminderContent);
    return {
      kind: text ? "chat" : "other",
      nick: asStr(info.reminderTitle),
      senderUserId: asStr(info.senderUserId),
      text,
      cid: cid ? cid.split("@")[0] : undefined,
      itemId: itemIdFromUrl(info.reminderUrl),
      ts,
    };
  }
  return { kind: "other", cid: cid ? cid.split("@")[0] : undefined, ts };
}

function handleOuter(outer: unknown): GoofishWsFrameResult {
  const empty: GoofishWsFrameResult = { ok: false, isSync: false, events: [] };
  const pkg = isObj(outer) && isObj(outer.body) ? outer.body.syncPushPackage : null;
  if (!isObj(pkg) || !Array.isArray(pkg.data)) {
    return { ...empty, detail: "not_sync_push" };
  }
  const events: GoofishWsEvent[] = [];
  let decodeFail = 0;
  for (const item of pkg.data) {
    const data = isObj(item) ? item.data : undefined;
    const decoded = decodeSyncItem(
      typeof data === "string" ? data : data instanceof Uint8Array ? data : undefined,
    );
    if (!decoded) {
      decodeFail += 1;
      continue;
    }
    events.push(extractEvent(decoded));
  }
  if (decodeFail > 0 && events.length === 0) {
    return { ok: false, isSync: true, events, detail: `decode_fail x${decodeFail}` };
  }
  return { ok: events.length > 0, isSync: true, events };
}

/**
 * 解析一帧原始 WS 文本（页内 text 帧）。非 sync 推送（心跳/ack）isSync=false。
 * 解析绝不抛错——spike 期间任何形态的帧都只计数不炸。
 */
export function parseGoofishWsFrame(raw: string): GoofishWsFrameResult {
  const empty: GoofishWsFrameResult = { ok: false, isSync: false, events: [] };
  if (!raw || typeof raw !== "string" || raw.length > 512 * 1024) {
    return { ...empty, detail: "bad_input" };
  }
  let outer: any;
  try {
    outer = JSON.parse(raw);
  } catch {
    return { ...empty, detail: "outer_not_json" };
  }
  return handleOuter(outer);
}

/**
 * 解析一帧原始 WS 二进制帧（页内 Blob/ArrayBuffer 帧，base64 转发而来）。
 * 二进制帧外层大概率是 MessagePack 编码的同一 lwp 结构；也兜底 utf8 JSON。
 */
export function parseGoofishWsFrameBytes(bytes: Uint8Array): GoofishWsFrameResult {
  const empty: GoofishWsFrameResult = { ok: false, isSync: false, events: [] };
  if (!bytes || bytes.length === 0 || bytes.length > 512 * 1024) {
    return { ...empty, detail: "bad_input" };
  }
  // utf8 JSON 兜底（万一二进制帧里其实装的是 JSON 文本）
  try {
    const asText = Buffer.from(bytes).toString("utf8");
    if (asText && asText.trimStart().startsWith("{")) {
      return handleOuter(JSON.parse(asText));
    }
  } catch {
    /* 走 msgpack */
  }
  try {
    const outer: unknown = msgpackDecode(bytes);
    return handleOuter(outer);
  } catch {
    return { ...empty, detail: "bin_decode_fail" };
  }
}

// ---- 主进程接线：统计 + 限频日志（spike 观测面） ----

type WsFrameStats = {
  received: number;
  syncFrames: number;
  chat: number;
  order: number;
  other: number;
  decodeFail: number;
  nonSync: number;
  binReceived: number;
  binSync: number;
  binDecodeFail: number;
};

const stats: WsFrameStats = {
  received: 0,
  syncFrames: 0,
  chat: 0,
  order: 0,
  other: 0,
  decodeFail: 0,
  nonSync: 0,
  binReceived: 0,
  binSync: 0,
  binDecodeFail: 0,
};
let lastEventLogAt = 0;
let lastSummaryAt = 0;
const EVENT_LOG_GAP_MS = 3_000;
const SUMMARY_INTERVAL_MS = 5 * 60_000;

function log(msg: string): void {
  try {
    const { mainLog } = require("../log.ts");
    mainLog.info(`[goofish-ws] ${msg}`);
  } catch {
    /* noop */
  }
}

function rateLimitedEventLog(msg: string): void {
  const now = Date.now();
  if (now - lastEventLogAt < EVENT_LOG_GAP_MS) return;
  lastEventLogAt = now;
  log(msg);
}

/** IM WebSocket 连接建立时打点——证明钩子已挂 + 长连已建，用于区分“没流量”和“链路断” */
export function handleGoofishWsOpen(url: string): void {
  rateLimitedEventLog(`ws connected: ${String(url || "").slice(0, 100)}`);
}

/** 主进程 console 通道接到原始帧后调用这里 */
export function handleGoofishWsFrame(raw: string): void {
  stats.received += 1;
  const r = parseGoofishWsFrame(raw);
  tally(r);
}

/**
 * 二进制帧入口：页内把 Blob/ArrayBuffer 帧以 base64 转发过来。
 * 拿不到 sync 数据时的首要嫌疑就是页面走二进制帧，这里独立计数便于确认。
 */
export function handleGoofishWsBinFrame(b64: string): void {
  stats.binReceived += 1;
  let bytes: Uint8Array | null = null;
  try {
    const buf = Buffer.from(String(b64 || ""), "base64");
    bytes = buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    bytes = null;
  }
  if (!bytes) {
    stats.binDecodeFail += 1;
    return;
  }
  const r = parseGoofishWsFrameBytes(bytes);
  if (!r.isSync && r.detail === "bin_decode_fail") {
    stats.binDecodeFail += 1;
    rateLimitedEventLog(
      `bin undecodable head=${Array.from(bytes.slice(0, 12)).join(",")}`,
    );
    return;
  }
  tally(r);
  if (r.isSync) stats.binSync += 1;
}

function tally(r: GoofishWsFrameResult): void {
  if (!r.isSync) {
    stats.nonSync += 1;
    return;
  }
  stats.syncFrames += 1;
  for (const ev of r.events) {
    if (ev.kind === "chat") {
      stats.chat += 1;
      rateLimitedEventLog(
        `msg ${ev.nick || "?"}: ${String(ev.text || "").slice(0, 60)} cid=${ev.cid || "?"} item=${ev.itemId || "-"} from=${ev.senderUserId || "?"}`,
      );
      // chat 帧直接通知：sync 的 humanUnread 常为 0（未读堆在运营号），单靠轮询会漏真人消息
      try {
        const { goofishNotifyOnWsChat } = require("./notify-service.ts");
        goofishNotifyOnWsChat(ev);
      } catch {
        /* noop */
      }
    } else if (ev.kind === "order") {
      stats.order += 1;
      rateLimitedEventLog(`order ${ev.redReminder} cid=${ev.cid || "?"}`);
    } else {
      stats.other += 1;
    }
  }
  if (r.detail && r.detail.startsWith("decode_fail")) stats.decodeFail += 1;

  const now = Date.now();
  if (now - lastSummaryAt >= SUMMARY_INTERVAL_MS) {
    lastSummaryAt = now;
    log(
      `summary 5min: received=${stats.received} sync=${stats.syncFrames} chat=${stats.chat} order=${stats.order} other=${stats.other} decodeFail=${stats.decodeFail} nonSync=${stats.nonSync} bin=${stats.binReceived} binSync=${stats.binSync} binFail=${stats.binDecodeFail}`,
    );
  }
}

export function __getGoofishWsFrameStatsForTest(): WsFrameStats {
  return { ...stats };
}

export function __resetGoofishWsFramesForTest(): void {
  stats.received = 0;
  stats.syncFrames = 0;
  stats.chat = 0;
  stats.order = 0;
  stats.other = 0;
  stats.decodeFail = 0;
  stats.nonSync = 0;
  stats.binReceived = 0;
  stats.binSync = 0;
  stats.binDecodeFail = 0;
  lastEventLogAt = 0;
  lastSummaryAt = 0;
}
