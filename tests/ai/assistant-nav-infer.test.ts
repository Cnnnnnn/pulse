import { describe, expect, it } from "vitest";
import {
  inferPulseHref,
  inferUiActionFromContext,
  isDigestOpenIntent,
  isDigestQueryIntent,
  navHrefFromText,
  PULSE_INFER_RULE_IDS,
} from "../../src/shared/pulse-infer-registry";
import {
  augmentRendererActions,
  inferNavigateFromAffirmation,
  inferNavigateFromAssistantClaim,
  inferNavigateFromUserText,
  inferOpenMovieDetail,
  inferOpenStockDiagnosis,
  normalizeNavKey,
} from "../../src/ai/assistant-nav-infer";

describe("pulse-infer-registry", () => {
  it("registers rules in priority order", () => {
    expect(PULSE_INFER_RULE_IDS[0]).toBe("overlay-digest");
    expect(PULSE_INFER_RULE_IDS).toContain("movie-detail");
    expect(PULSE_INFER_RULE_IDS).toContain("nav-user-open");
  });

  it("inferPulseHref opens digest for 早报 query on movies page", () => {
    expect(
      inferPulseHref({
        userText: "今天早报有什么?",
        assistantText: "已经为你打开今日早报",
        activeNav: "movies",
      }),
    ).toBeNull();
  });

  it("isDigestQueryIntent vs isDigestOpenIntent", () => {
    expect(isDigestQueryIntent("今天早报有什么?")).toBe(true);
    expect(isDigestQueryIntent("今天日报有什么?")).toBe(true);
    expect(isDigestOpenIntent("今天早报有什么?")).toBe(false);
    expect(isDigestOpenIntent("打开今日早报")).toBe(true);
    expect(isDigestOpenIntent("打开今日日报")).toBe(true);
    expect(isDigestQueryIntent("今天有什么要点?")).toBe(true);
    expect(isDigestOpenIntent("打开今日要点")).toBe(true);
    expect(navHrefFromText("今天早报有什么")).toBeNull();
    expect(navHrefFromText("今天日报有什么")).toBeNull();
    expect(navHrefFromText("打开今日早报")).toBe("pulse://overlay/digest");
    expect(navHrefFromText("打开今日日报")).toBe("pulse://overlay/digest");
    expect(navHrefFromText("打开今日要点")).toBe("pulse://overlay/digest");
  });

  it("inferPulseHref prefers movie detail over page nav on movies tab", () => {
    expect(inferPulseHref({ userText: "八仙!", activeNav: "movies" })).toBe(
      "pulse://movies/detail?title=%E5%85%AB%E4%BB%99",
    );
  });

  it("navHrefFromText maps aliases to pulse nav href", () => {
    expect(navHrefFromText("打开基金页面")).toBe(
      "pulse://nav/invest?tab=funds",
    );
  });

  it("inferUiActionFromContext returns parsed action", () => {
    expect(
      inferUiActionFromContext({
        userText: "打开应用列表页面",
      }),
    ).toEqual({
      tool: "navigate",
      params: { nav: "versions" },
    });
  });
});

describe("assistant-nav-infer", () => {
  it("normalizeNavKey maps Chinese aliases to nav keys", () => {
    expect(normalizeNavKey("versions")).toBe("versions");
    expect(normalizeNavKey("应用列表")).toBe("versions");
    expect(normalizeNavKey("版本检查")).toBe("versions");
    expect(normalizeNavKey("GitHub 收录")).toBe("github");
    expect(normalizeNavKey("funds")).toBe("invest");
  });

  it("inferNavigateFromUserText detects open-page intents", () => {
    expect(inferNavigateFromUserText("打开应用列表页面")).toEqual({
      tool: "navigate",
      params: { nav: "versions" },
    });
    expect(inferNavigateFromUserText("跳转到 GitHub")).toEqual({
      tool: "navigate",
      params: { nav: "github" },
    });
    expect(inferNavigateFromUserText("打开基金页面")).toEqual({
      tool: "navigate",
      params: { nav: "invest", tab: "funds" },
    });
  });

  it("inferNavigateFromUserText ignores pure query intents", () => {
    expect(inferNavigateFromUserText("有哪些应用需要更新？")).toBeNull();
    expect(inferNavigateFromUserText("我的基金盈亏怎样？")).toBeNull();
  });

  it("inferNavigateFromAffirmation handles short yes after offer", () => {
    expect(
      inferNavigateFromAffirmation("需要", "要不要打开电影页面看看？"),
    ).toEqual({
      tool: "navigate",
      params: { nav: "movies" },
    });
    expect(inferNavigateFromAffirmation("好的", "今天天气不错")).toBeNull();
  });

  it("inferNavigateFromAssistantClaim handles claimed navigation without tool", () => {
    expect(inferNavigateFromAssistantClaim("已经为你打开电影页面")).toEqual({
      tool: "navigate",
      params: { nav: "movies" },
    });
  });

  it("inferOpenMovieDetail handles movie title on movies page", () => {
    expect(
      inferOpenMovieDetail("八仙!", { activeNav: "movies" }),
    ).toEqual({
      tool: "open_movie_detail",
      params: { title: "八仙" },
    });
  });

  it("inferOpenMovieDetail handles assistant claim without tool call", () => {
    expect(
      inferOpenMovieDetail("八仙", {
        assistantText: "为你打开《八仙！》的详情页面",
      }),
    ).toEqual({
      tool: "open_movie_detail",
      params: { title: "八仙" },
    });
  });

  it("inferOpenStockDiagnosis extracts code from user text", () => {
    expect(
      inferOpenStockDiagnosis("看看600519诊断", { activeNav: "invest" }),
    ).toEqual({
      tool: "open_stock_diagnosis",
      params: { code: "600519" },
    });
  });

  it("augmentRendererActions infers from affirmation context", () => {
    const actions = augmentRendererActions("需要", [], {
      priorAssistantText: "需要我帮你打开电影页面吗？",
    });
    expect(actions).toEqual([{ tool: "navigate", params: { nav: "movies" } }]);
  });

  it("augmentRendererActions infers from assistant claim text", () => {
    const actions = augmentRendererActions("需要", [], {
      assistantText: "已经为你打开电影页面",
    });
    expect(actions).toEqual([{ tool: "navigate", params: { nav: "movies" } }]);
  });

  it("augmentRendererActions normalizes bad nav params and infers when missing", () => {
    const normalized = augmentRendererActions("打开版本检查", [
      { tool: "navigate", params: { nav: "版本检查" } },
    ]);
    expect(normalized[0]).toEqual({
      tool: "navigate",
      params: { nav: "versions" },
    });

    const inferred = augmentRendererActions("打开应用列表页面", []);
    expect(inferred).toEqual([
      { tool: "navigate", params: { nav: "versions" } },
    ]);
  });

  it("augmentRendererActions does not duplicate when navigate already present", () => {
    const actions = augmentRendererActions("打开应用列表", [
      { tool: "navigate", params: { nav: "versions" } },
    ]);
    expect(actions).toHaveLength(1);
  });
});
