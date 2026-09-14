/**
 * tests/main/goofish/mtop-session.test.ts
 */
import { describe, it, expect } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  mtopSign,
  parseH5Token,
  summarizeSessions,
} = requireMain("goofish/mtop-session");

describe("mtopSign / parseH5Token", () => {
  it("token 取 _m_h5_tk 下划线前半段", () => {
    expect(parseH5Token("abc123_1700000000000")).toBe("abc123");
    expect(parseH5Token("")).toBeNull();
  });

  it("sign = md5(token&t&appKey&data)", () => {
    const { createHash } = require("node:crypto");
    const t = "1700000000000";
    const token = "tok";
    const data = '{"fetchNum":50}';
    const appKey = "34839810";
    const expectHex = createHash("md5")
      .update(`${token}&${t}&${appKey}&${data}`)
      .digest("hex");
    expect(mtopSign(t, token, data)).toBe(expectHex);
  });
});

describe("summarizeSessions", () => {
  it("累计真人未读与全部未读", () => {
    const { sessions, humanUnread, allUnread } = summarizeSessions([
      {
        session: { sessionId: "a", sessionType: 1, userInfo: { nick: "买家" } },
        message: { summary: { unread: 2, summary: "在吗", ts: 1 } },
      },
      {
        session: { sessionId: "b", sessionType: 23, userInfo: { nick: "官方" } },
        message: { summary: { unread: 5, summary: "活动", ts: 2 } },
      },
    ]);
    expect(sessions).toHaveLength(2);
    expect(humanUnread).toBe(2);
    expect(allUnread).toBe(7);
  });
});
