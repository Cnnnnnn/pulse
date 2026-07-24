/**
 * tests/detectors/qclaw-api.test.js
 */
import { describe, it, expect } from "vitest";
import { QClawApiDetector } from "../../src/detectors/qclaw-api.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";
import { REASONS } from "../../src/detectors/errors.js";

const OK = {
  data: {
    resp: {
      data: {
        version_code: "2.4.1",
      },
    },
  },
};

describe("QClawApiDetector", () => {
  it("arm64 → system_type=macarm", async () => {
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify(OK) }],
    });
    await new QClawApiDetector({
      url: "https://jprx.m.qq.com/data/4066/forward",
    }).detect(makeCtx({ http, arch: "arm64" }));
    expect(http.postCalls[0].body).toEqual({
      from: "web",
      system_type: "macarm",
    });
  });

  it("x64 → system_type=mac", async () => {
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify(OK) }],
    });
    await new QClawApiDetector({ url: "https://x" }).detect(
      makeCtx({ http, arch: "x64" }),
    );
    expect(http.postCalls[0].body).toEqual({ from: "web", system_type: "mac" });
  });

  it("取 data.resp.data.version_code", async () => {
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify(OK) }],
    });
    const r = await new QClawApiDetector({ url: "https://x" }).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("2.4.1");
    expect(r.confidence).toBe("high");
    expect(http.postCalls[0].headers.Origin).toBe("https://qclaw.qq.com");
  });

  it("链断 → no_version", async () => {
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify({ data: {} }) }],
    });
    await expect(
      new QClawApiDetector({ url: "https://x" }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  // 2026-06-28: QClaw 网关在 data.resp.data.update_content 字段直返当前版本
  // 更新日志原文, 跟 app 内嵌"版本日志"窗口一致. 提取到 changelog, 用户
  // 点 ⓘ 展开 panel 看到 bullet 列表. 没 update_content 时降级空字符串,
  // 不影响 version 字段.
  it("提取 update_content → changelog (含 emoji + bullet 列表)", async () => {
    const fixture = {
      data: {
        resp: {
          data: {
            version_code: "0.2.29",
            update_content:
              "🎉 v0.2.29版本更新内容:\n· 对话支持快速定位\n· 提升 Agent 列表加载速度",
          },
        },
      },
    };
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify(fixture) }],
    });
    const r = await new QClawApiDetector({ url: "x" }).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("0.2.29");
    expect(r.changelog).toContain("🎉 v0.2.29版本更新内容");
    expect(r.changelog).toContain("· 对话支持快速定位");
    expect(r.changelog_format).toBe("md");
  });

  it("无 update_content → changelog 为空字符串 (不抛错)", async () => {
    const http = new MockHttp({
      post: [{ status: 200, body: JSON.stringify(OK) }],
    });
    const r = await new QClawApiDetector({ url: "https://x" }).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("2.4.1");
    expect(r.changelog).toBe("");
  });

  it("5xx / timeout / parse", async () => {
    const h5 = new MockHttp({ post: [{ status: 500, body: "" }] });
    await expect(
      new QClawApiDetector({ url: "x" }).detect(makeCtx({ http: h5 })),
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });

    const ht = new MockHttp({ post: [{ error: "timeout" }] });
    await expect(
      new QClawApiDetector({ url: "x" }).detect(makeCtx({ http: ht })),
    ).rejects.toMatchObject({ reason: REASONS.TIMEOUT });

    const hp = new MockHttp({ post: [{ status: 200, body: "oops" }] });
    await expect(
      new QClawApiDetector({ url: "x" }).detect(makeCtx({ http: hp })),
    ).rejects.toMatchObject({ reason: REASONS.PARSE });
  });
});
