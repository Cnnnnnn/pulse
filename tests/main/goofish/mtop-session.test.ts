/**
 * tests/main/goofish/mtop-session.test.ts
 */
import { describe, it, expect, vi } from "vitest";
const { requireMain } = require("../../_setup/require-main.cjs");

const {
  mtopSign,
  parseH5Token,
  summarizeSessions,
  formatNotifyBody,
  pickTopUnreadSession,
  buildImDeepLink,
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
  it("累计真人未读与全部未读，并抽出 itemId", () => {
    const { sessions, humanUnread, allUnread } = summarizeSessions([
      {
        session: {
          sessionId: "a",
          sessionType: 1,
          userInfo: { nick: "买家", userId: "u1" },
          extension: { itemId: "item9" },
        },
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
    expect(sessions[0].itemId).toBe("item9");
    expect(sessions[0].peerUserId).toBe("u1");
  });
});

describe("formatNotifyBody / deep link", () => {
  it("优先展示最新真人未读会话昵称与摘要", () => {
    const body = formatNotifyBody(
      [
        {
          sessionId: "a",
          sessionType: 1,
          peerNick: "买家A",
          peerUserId: "1",
          itemId: "",
          unread: 1,
          lastMsg: "在吗",
          ts: 10,
        },
        {
          sessionId: "b",
          sessionType: 1,
          peerNick: "买家B",
          peerUserId: "2",
          itemId: "x",
          unread: 2,
          lastMsg: "还在吗",
          ts: 20,
        },
      ],
      3,
    );
    expect(body).toBe("买家B：还在吗（共 3 条未读）");
  });

  it("无会话摘要时回退条数文案", () => {
    expect(formatNotifyBody([], 2)).toBe("2 条未读消息，点击查看");
  });

  it("pickTop + buildImDeepLink", () => {
    const top = pickTopUnreadSession(
      [
        {
          sessionId: "a",
          sessionType: 23,
          peerNick: "官方",
          peerUserId: "9",
          itemId: "i9",
          unread: 9,
          lastMsg: "活动",
          ts: 99,
        },
        {
          sessionId: "b",
          sessionType: 1,
          peerNick: "买家",
          peerUserId: "42",
          itemId: "item1",
          unread: 1,
          lastMsg: "嗨",
          ts: 10,
        },
      ],
      true,
    );
    expect(top?.peerUserId).toBe("42");
    expect(buildImDeepLink(top)).toBe(
      "https://www.goofish.com/im?peerUserId=42&itemId=item1",
    );
    expect(buildImDeepLink(null)).toBe("https://www.goofish.com/im");
  });

  it("pickGoofishH5Token 优先 goofish 域", () => {
    const { pickGoofishH5Token, hasGoofishLoginHints } = requireMain(
      "goofish/mtop-session",
    );
    expect(
      pickGoofishH5Token([
        { name: "_m_h5_tk", domain: ".taobao.com", value: "aaa_1" },
        { name: "_m_h5_tk", domain: ".goofish.com", value: "bbb_2" },
      ]),
    ).toBe("bbb");
    expect(hasGoofishLoginHints([{ name: "unb", value: "1" }])).toBe(true);
    expect(hasGoofishLoginHints([{ name: "_m_h5_tk", value: "x" }])).toBe(false);
  });
});

describe("fetchSessionSync 令牌自愈", () => {
  it("no_token 时经 guest 无令牌请求引导新 _m_h5_tk 后重试成功", async () => {
    const { fetchSessionSync } = requireMain("goofish/mtop-session");
    let cookieJar: any[] = []; // 初始无 _m_h5_tk（睡眠后过期被清的场景）
    const cookieGets = vi.fn(async () => cookieJar);
    const mainFetch = vi.fn(async () => {
      throw new Error("main fetch should not be reached");
    });
    const fakeSession = {
      setUserAgent: () => {},
      cookies: { get: cookieGets },
      fetch: mainFetch,
    };
    let execCalls = 0;
    const fakeGuest = {
      isDestroyed: () => false,
      executeJavaScript: async () => {
        execCalls += 1;
        if (execCalls === 1) {
          // 无令牌引导请求：服务端回 TOKEN_EMPTY 并 Set-Cookie 新令牌
          cookieJar = [
            { name: "_m_h5_tk", domain: ".goofish.com", value: "fresh_123" },
          ];
          return {
            status: 200,
            text: JSON.stringify({ ret: ["FAIL_SYS_TOKEN_EMPTY::令牌为空"] }),
          };
        }
        return {
          status: 200,
          text: JSON.stringify({
            ret: ["SUCCESS::调用成功"],
            data: { sessions: [] },
          }),
        };
      },
    };

    const result = await fetchSessionSync(fakeSession as any, fakeGuest as any);
    expect(execCalls).toBe(2); // 引导 + 正式 sync
    expect(cookieGets.mock.calls.length).toBeGreaterThanOrEqual(2); // 引导后重读 cookie
    expect(result.ok).toBe(true);
    expect(mainFetch).not.toHaveBeenCalled();
  });

  it("引导失败（guest 不可用）仍返回 no_token", async () => {
    const { fetchSessionSync } = requireMain("goofish/mtop-session");
    const fakeSession = {
      setUserAgent: () => {},
      cookies: { get: async () => [] },
      fetch: async () => {
        throw new Error("should not be reached");
      },
    };
    const result = await fetchSessionSync(fakeSession as any, null);
    expect(result.ok).toBe(false);
    expect((result as any).reason).toBe("no_token");
  });

  it("ILLEGAL_ACCESS 不再归类为 auth_expired（走 unknown/error 口径）", async () => {
    const { fetchSessionSyncViaGuest } = requireMain("goofish/mtop-session");
    const fakeGuest = {
      isDestroyed: () => false,
      executeJavaScript: async () => ({
        status: 200,
        text: JSON.stringify({ ret: ["FAIL_SYS_ILLEGAL_ACCESS::非法请求"] }),
      }),
    };
    const r = await fetchSessionSyncViaGuest(fakeGuest as any, "tok_1");
    expect(r.ok).toBe(false);
    expect((r as any).reason).toBe("unknown");
  });
});
