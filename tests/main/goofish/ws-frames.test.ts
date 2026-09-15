/**
 * tests/main/goofish/ws-frames.test.ts
 *
 * spike 帧解析单测：fixture 按钉钉 IM lwp 事实标准构造
 * （外层 JSON + syncPushPackage 内层 base64(JSON) / base64(MessagePack)）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { encode as msgpackEncode } from "@msgpack/msgpack";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  parseGoofishWsFrame,
  parseGoofishWsFrameBytes,
  handleGoofishWsFrame,
  handleGoofishWsBinFrame,
  __getGoofishWsFrameStatsForTest,
  __resetGoofishWsFramesForTest,
} = requireMain("goofish/ws-frames");

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

function outerFrame(innerData: string): string {
  return JSON.stringify({
    lwp: "/r/SyncStatus/push",
    headers: { mid: "1231715000000000 0", sid: "s1", "app-key": "444e9e74" },
    body: { syncPushPackage: { data: [{ data: innerData }] } },
  });
}

const CHAT_INNER = {
  "1": {
    "2": "cid123@goofish",
    "5": "1715000000000",
    "10": {
      reminderTitle: "买家甲",
      reminderContent: "在吗？",
      senderUserId: "u888",
      reminderUrl: "https://www.goofish.com/im?itemId=item42&peerUserId=u888",
    },
  },
};

describe("goofish ws-frames 解析", () => {
  beforeEach(() => {
    __resetGoofishWsFramesForTest();
  });

  it("base64(JSON) 内层 → chat 事件全字段", () => {
    const r = parseGoofishWsFrame(outerFrame(b64(JSON.stringify(CHAT_INNER))));
    expect(r.isSync).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(1);
    const ev = r.events[0];
    expect(ev.kind).toBe("chat");
    expect(ev.nick).toBe("买家甲");
    expect(ev.text).toBe("在吗？");
    expect(ev.senderUserId).toBe("u888");
    expect(ev.cid).toBe("cid123");
    expect(ev.itemId).toBe("item42");
    expect(ev.ts).toBe(1715000000000);
  });

  it("base64(MessagePack) 内层 → 同样解出 chat 事件", () => {
    const packed = Buffer.from(msgpackEncode(CHAT_INNER)).toString("base64");
    const r = parseGoofishWsFrame(outerFrame(packed));
    expect(r.isSync).toBe(true);
    expect(r.events).toHaveLength(1);
    const ev = r.events[0];
    expect(ev.kind).toBe("chat");
    expect(ev.nick).toBe("买家甲");
    expect(ev.text).toBe("在吗？");
    expect(ev.cid).toBe("cid123");
    expect(ev.itemId).toBe("item42");
  });

  it("订单红点帧 → order 事件", () => {
    const inner = {
      "3": { redReminder: "等待买家付款" },
      "1": { "2": "cid77@goofish", "5": "1715000000001" },
    };
    const r = parseGoofishWsFrame(outerFrame(b64(JSON.stringify(inner))));
    expect(r.events).toHaveLength(1);
    expect(r.events[0].kind).toBe("order");
    expect(r.events[0].redReminder).toBe("等待买家付款");
    expect(r.events[0].cid).toBe("cid77");
  });

  it("多 item 帧一次解析多条事件", () => {
    const innerA = b64(
      JSON.stringify({
        "1": {
          "2": "cidA@goofish",
          "5": "1715000000010",
          "10": { reminderTitle: "买家A", reminderContent: "好", senderUserId: "uA" },
        },
      }),
    );
    const innerB = b64(
      JSON.stringify({
        "1": {
          "2": "cidB@goofish",
          "5": "1715000000011",
          "10": { reminderTitle: "买家B", reminderContent: "还可以便宜吗", senderUserId: "uB" },
        },
      }),
    );
    const frame = JSON.stringify({
      lwp: "/r/SyncStatus/push",
      headers: { mid: "m2" },
      body: { syncPushPackage: { data: [{ data: innerA }, { data: innerB }] } },
    });
    const r = parseGoofishWsFrame(frame);
    expect(r.events.map((e) => e.nick)).toEqual(["买家A", "买家B"]);
  });

  it("非 sync 帧（心跳/ack）→ isSync=false", () => {
    const heartbeat = JSON.stringify({
      lwp: "/r/Heartbeat/ping",
      headers: { mid: "hb1" },
      body: [{ heartbeat: 15 }],
    });
    const r = parseGoofishWsFrame(heartbeat);
    expect(r.isSync).toBe(false);
    expect(r.detail).toBe("not_sync_push");
  });

  it("非 JSON / 空输入 / 解码失败都安全返回", () => {
    expect(parseGoofishWsFrame("not-json{").detail).toBe("outer_not_json");
    expect(parseGoofishWsFrame("").detail).toBe("bad_input");
    const bad = parseGoofishWsFrame(
      outerFrame(Buffer.from([0xff, 0xfe, 0x01]).toString("base64")),
    );
    expect(bad.isSync).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain("decode_fail");
  });

  it("handleGoofishWsFrame 统计计数", () => {
    handleGoofishWsFrame(outerFrame(b64(JSON.stringify(CHAT_INNER))));
    handleGoofishWsFrame(JSON.stringify({ lwp: "/r/Heartbeat/ping", headers: {} }));
    const s = __getGoofishWsFrameStatsForTest();
    expect(s.received).toBe(2);
    expect(s.syncFrames).toBe(1);
    expect(s.chat).toBe(1);
    expect(s.nonSync).toBe(1);
  });

  it("二进制帧：msgpack 外层 + base64 字符串内层 → 解出 chat 事件", () => {
    const outer = {
      lwp: "/r/SyncStatus/push",
      headers: { mid: "bin1" },
      body: { syncPushPackage: { data: [{ data: b64(JSON.stringify(CHAT_INNER)) }] } },
    };
    const bytes = new Uint8Array(Buffer.from(msgpackEncode(outer)));
    const r = parseGoofishWsFrameBytes(bytes);
    expect(r.isSync).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.events[0].kind).toBe("chat");
    expect(r.events[0].nick).toBe("买家甲");
    expect(r.events[0].cid).toBe("cid123");
  });

  it("二进制帧：内层 .data 为裸 msgpack 字节 → 也能解出", () => {
    const innerBytes = new Uint8Array(msgpackEncode(CHAT_INNER));
    const outer = {
      lwp: "/r/SyncStatus/push",
      headers: { mid: "bin2" },
      body: { syncPushPackage: { data: [{ data: innerBytes }] } },
    };
    const r = parseGoofishWsFrameBytes(new Uint8Array(Buffer.from(msgpackEncode(outer))));
    expect(r.events).toHaveLength(1);
    expect(r.events[0].text).toBe("在吗？");
  });

  it("二进制帧：utf8 JSON 字节兜底 + 乱字节计数失败", () => {
    const r1 = parseGoofishWsFrameBytes(
      new Uint8Array(Buffer.from(outerFrame(b64(JSON.stringify(CHAT_INNER)), ))),
    );
    expect(r1.events[0].kind).toBe("chat");

    const s0 = __getGoofishWsFrameStatsForTest();
    handleGoofishWsBinFrame(Buffer.from([0x00, 0xff, 0x13]).toString("base64"));
    const s = __getGoofishWsFrameStatsForTest();
    expect(s.binReceived).toBe(s0.binReceived + 1);
    expect(s.binDecodeFail).toBe(s0.binDecodeFail + 1);
  });

  it("handleGoofishWsBinFrame 有效 msgpack 帧 → binSync 计数", () => {
    const outer = {
      lwp: "/r/SyncStatus/push",
      headers: { mid: "bin3" },
      body: { syncPushPackage: { data: [{ data: b64(JSON.stringify(CHAT_INNER)) }] } },
    };
    handleGoofishWsBinFrame(Buffer.from(msgpackEncode(outer)).toString("base64"));
    const s = __getGoofishWsFrameStatsForTest();
    expect(s.binReceived).toBe(1);
    expect(s.binSync).toBe(1);
    expect(s.chat).toBe(1);
  });

  it("深搜嵌套 reminderContent 也能识别为 chat", () => {
    const inner = {
      wrap: {
        payload: {
          reminderTitle: "深买家",
          reminderContent: "嵌套正文",
          senderUserId: "uDeep",
        },
      },
    };
    const raw = outerFrame(b64(JSON.stringify(inner)));
    const r = parseGoofishWsFrame(raw);
    expect(r.isSync).toBe(true);
    expect(r.events.some((e: any) => e.kind === "chat" && e.text === "嵌套正文")).toBe(
      true,
    );
  });
});
