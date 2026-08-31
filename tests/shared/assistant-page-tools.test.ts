import { describe, expect, it } from "vitest";
import {
  extractFcPageContext,
  resolveAssistantPageKey,
  resolveToolNamesForPage,
} from "../../src/shared/assistant-page-tools";
import { resolveFcToolPolicy, buildOpenAiFcRequest } from "../../src/ai/fc-tool-policy";

describe("assistant-page-tools", () => {
  it("resolveAssistantPageKey handles invest and news sub tabs", () => {
    expect(
      resolveAssistantPageKey({ activeNav: "invest", investTab: "stocks" }),
    ).toBe("invest:stocks");
    expect(
      resolveAssistantPageKey({ activeNav: "news", newsSubTab: "finance" }),
    ).toBe("news:finance");
    expect(resolveAssistantPageKey({ activeNav: "movies" })).toBe("movies");
  });

  it("resolveToolNamesForPage includes page-specific tools", () => {
    const movies = resolveToolNamesForPage({ activeNav: "movies" });
    expect(movies.has("query_movies")).toBe(true);
    expect(movies.has("open_movie_detail")).toBe(true);
    expect(movies.has("query_apps")).toBe(false);

    const versions = resolveToolNamesForPage({ activeNav: "versions" });
    expect(versions.has("query_apps")).toBe(true);
    expect(versions.has("query_movies")).toBe(false);
  });

  it("extractFcPageContext reads pageData snapshot", () => {
    expect(
      extractFcPageContext(
        { activeNav: "news", newsSubTab: "ithome", route: "news" },
        { activeNav: "home" },
      ),
    ).toEqual({
      activeNav: "news",
      route: "news",
      newsSubTab: "ithome",
      investTab: undefined,
    });
  });
});

describe("fc-tool-policy page filtering", () => {
  it("limits tools on movies page for normal queries", () => {
    const policy = resolveFcToolPolicy(
      { userText: "最近有什么热映" },
      { activeNav: "movies" },
    );
    expect(policy.forceUiTool).toBe(false);
    expect(policy.allowedToolCount).toBeLessThan(30);
    const req = buildOpenAiFcRequest(
      [{ role: "user", content: "最近有什么热映" }],
      { userText: "最近有什么热映" },
      { model: "test", pageCtx: { activeNav: "movies" } },
    );
    const names = req.tools.map((t) => t.function.name);
    expect(names).toContain("query_movies");
    expect(names).not.toContain("query_apps");
  });

  it("wantsUiTool still forces UI subset on movies page", () => {
    const policy = resolveFcToolPolicy(
      { userText: "打开应用列表" },
      { activeNav: "movies" },
    );
    expect(policy.forceUiTool).toBe(true);
    expect(policy.openAiToolChoice).toBe("required");
    const req = buildOpenAiFcRequest(
      [{ role: "user", content: "打开应用列表" }],
      { userText: "打开应用列表" },
      { model: "test", pageCtx: { activeNav: "movies" } },
    );
    const names = req.tools.map((t) => t.function.name);
    expect(names).toContain("pulse_open");
    expect(names).toContain("navigate");
    expect(names).not.toContain("query_movies");
  });
});
