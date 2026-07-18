import { describe, expect, it } from "vitest";

const { extractCommentParams, parseCommentResponse } = require(
  "../../src/main/ithome/comment-parser.js",
);

const ARTICLE_HTML = `
  <div id="post_comm" data-id="sn-abc123" data-nid="866661"></div>
`;

function makeComment(id, extra = {}) {
  return {
    id,
    parentCommentId: 0,
    userInfo: { userNick: `用户${id}` },
    postTime: "2026-07-18T10:00:00+08:00",
    support: id,
    elements: [{ type: 0, content: `评论内容 ${id}` }],
    ...extra,
  };
}

describe("ithome comment-parser", () => {
  it("extracts sn and newsId from post_comm", () => {
    expect(extractCommentParams(ARTICLE_HTML)).toEqual({
      ok: true,
      sn: "sn-abc123",
      newsId: "866661",
    });
  });

  it("maps hotComments to safe top-level comments and caps at 20", () => {
    const hotComments = Array.from({ length: 22 }, (_, i) =>
      makeComment(i + 1),
    );
    hotComments[2] = makeComment(3, {
      parentCommentId: 99,
      elements: [{ type: 0, content: "楼中楼，不能展示" }],
    });
    hotComments[4] = makeComment(5, {
      elements: [{ type: 1, content: "图片" }],
    });

    const result = parseCommentResponse(
      JSON.stringify({ success: true, content: { hotComments } }),
    );

    expect(result.ok).toBe(true);
    expect(result.comments).toHaveLength(20);
    expect(result.comments[0]).toEqual({
      id: "1",
      author: "用户1",
      content: "评论内容 1",
      createdAt: "2026-07-18T10:00:00+08:00",
      likes: 1,
    });
    expect(result.comments.some((item) => item.content.includes("楼中楼"))).toBe(
      false,
    );
    expect(result.comments.some((item) => item.content === "图片")).toBe(false);
  });

  it("treats a successful empty hotComments array as no comments", () => {
    expect(
      parseCommentResponse(
        JSON.stringify({ success: true, content: { hotComments: [] } }),
      ),
    ).toEqual({ ok: true, comments: [] });
  });

  it("falls back to content.comments when hotComments is empty", () => {
    const fallbackComments = [
      makeComment(101, { postTime: "2026-07-19T00:11:22.987", support: 0 }),
      makeComment(102, { postTime: "2026-07-19T00:05:11.001", support: 2 }),
    ];
    const result = parseCommentResponse(
      JSON.stringify({
        success: true,
        content: { hotComments: [], comments: fallbackComments },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0]).toEqual({
      id: "101",
      author: "用户101",
      content: "评论内容 101",
      createdAt: "2026-07-19T00:11:22.987",
      likes: 0,
    });
  });

  it("prefers hotComments when both arrays are present", () => {
    const hot = [makeComment(1)];
    const all = [makeComment(99)];
    const result = parseCommentResponse(
      JSON.stringify({
        success: true,
        content: { hotComments: hot, comments: all },
      }),
    );
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].id).toBe("1");
  });

  it("rejects malformed or changed responses", () => {
    expect(parseCommentResponse("not json")).toEqual({
      ok: false,
      reason: "parse_failed",
    });
    expect(parseCommentResponse(JSON.stringify({ success: false }))).toEqual({
      ok: false,
      reason: "parse_failed",
    });
    expect(extractCommentParams("<div id=\"post_comm\"></div>")).toEqual({
      ok: false,
      reason: "comment_params_missing",
    });
  });
});
