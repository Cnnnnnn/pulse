/**
 * tests/detectors/html-changelog.test.js
 *
 * html_changelog detector 单测:
 *   - extractFirstSection: 标签深度追踪
 *   - stripDangerousTags: 第一层 XSS 防护
 *   - HtmlChangelogDetector: 端到端, 含真实 ZCode 风格 fixture
 */
import { describe, it, expect } from "vitest";
import {
  HtmlChangelogDetector,
  extractFirstSection,
  stripDangerousTags,
} from "../../src/detectors/html-changelog.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";
import { REASONS } from "../../src/detectors/errors.js";

describe("extractFirstSection", () => {
  it("简单 div 块 — 切第一个完整 section", () => {
    const html = '<div class="r">A</div><div class="r">B</div>';
    expect(extractFirstSection(html, '<div class="r">', "</div>")).toBe(
      '<div class="r">A</div>',
    );
  });

  it("嵌套 div — 切到 balance 归零", () => {
    const html =
      '<div class="r">A<div>nested</div>end</div><div class="r">B</div>';
    expect(extractFirstSection(html, '<div class="r">', "</div>")).toBe(
      '<div class="r">A<div>nested</div>end</div>',
    );
  });

  it("sectionPattern 找不到 → null", () => {
    expect(
      extractFirstSection("<span>x</span>", '<div class="r">', "</div>"),
    ).toBeNull();
  });

  it("没有闭合 → null (不切半截)", () => {
    const html = '<div class="r">unterminated';
    expect(extractFirstSection(html, '<div class="r">', "</div>")).toBeNull();
  });

  it("多行 / 大文本", () => {
    const html = `
      <section class="page"><h1>Title</h1>
        <div class="r"><p>first release</p><ul><li>x</li></ul></div>
        <div class="r"><p>second release</p></div>
      </section>`;
    const section = extractFirstSection(html, '<div class="r">', "</div>");
    expect(section).toContain("<p>first release</p>");
    expect(section).not.toContain("second release");
  });
});

describe("stripDangerousTags", () => {
  it("剥 script 块", () => {
    expect(stripDangerousTags("safe<script>alert(1)</script>after")).toBe(
      "safeafter",
    );
  });

  it("剥 iframe / style / object / embed", () => {
    expect(stripDangerousTags('a<iframe src="x">b</iframe>c')).toBe("ac");
    expect(stripDangerousTags("a<style>body{}</style>b")).toBe("ab");
    expect(stripDangerousTags("a<object>x</object>b")).toBe("ab");
    expect(stripDangerousTags('a<embed src="x"/>b')).toBe("ab");
  });

  it("剥 onxxx= 属性", () => {
    expect(stripDangerousTags('<a href="x" onclick="evil()">click</a>')).toBe(
      '<a href="x">click</a>',
    );
    expect(stripDangerousTags('<img src="x" onerror="alert(1)">')).toBe(
      '<img src="x">',
    );
  });

  it("javascript: 链接替换为 #", () => {
    expect(stripDangerousTags('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a href="#">x</a>',
    );
  });

  it("正常 HTML 不动", () => {
    expect(stripDangerousTags("<h2>title</h2><ul><li>x</li></ul>")).toBe(
      "<h2>title</h2><ul><li>x</li></ul>",
    );
  });
});

describe("HtmlChangelogDetector", () => {
  // ZCode 风格 fixture (从 subagent 报告里的真实结构简化)
  const ZCODE_HTML = `
<html><body>
  <div class="flex flex-col gap-16">
    <div class="flex flex-col gap-6 border-b border-neutral-800 pb-16">
      <span class="w-fit rounded-full border border-white px-2.5 py-0.5 font-mono text-sm">3.0.1</span>
      <span class="text-base text-foreground/50">Released Jun 14, 2026</span>
      <h2 class="text-3xl">Release v3.0.1</h2>
      <h2 class="group min-w-0 text-3xl font-medium">New Features</h2>
      <ul><li>Added new feature A</li><li>Added new feature B</li></ul>
      <h2 class="group min-w-0 text-3xl font-medium">Bug Fixes</h2>
      <ul><li>Fixed crash on X</li></ul>
    </div>
    <div class="flex flex-col gap-6 border-b border-neutral-800 pb-16">
      <span class="w-fit rounded-full border border-white px-2.5 py-0.5 font-mono text-sm">3.0.0</span>
    </div>
  </div>
</body></html>
`;

  const ZCODE_CFG = {
    url: "https://zcode.z.ai/en/changelog",
    section_pattern:
      '<div class="flex flex-col gap-6 border-b border-neutral-800 pb-16">',
    version_pattern:
      '<span class="w-fit rounded-full[^"]*font-mono[^"]*">([0-9.]+)</span>',
  };

  it("ZCode 真实结构 → version + html changelog", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: ZCODE_HTML }] });
    const r = await new HtmlChangelogDetector(ZCODE_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("3.0.1");
    expect(r.confidence).toBe("high");
    expect(r.changelog_format).toBe("html");
    expect(r.changelog).toContain("Release v3.0.1");
    expect(r.changelog).toContain("New Features");
    expect(r.changelog).toContain("Bug Fixes");
    expect(r.changelog).toContain("Added new feature A");
    // 第二个 release 不应包含
    expect(r.changelog).not.toContain("3.0.0");
  });

  it("section_pattern 找不到 → no_version", async () => {
    const http = new MockHttp({
      get: [{ status: 200, body: "<html>no changelog</html>" }],
    });
    await expect(
      new HtmlChangelogDetector(ZCODE_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("section 里有但 version_pattern 不匹配 → no_version", async () => {
    const html =
      '<div class="flex flex-col gap-6 border-b border-neutral-800 pb-16">no version here</div>';
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    await expect(
      new HtmlChangelogDetector(ZCODE_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("未配置 url → no_version", async () => {
    const http = new MockHttp();
    await expect(
      new HtmlChangelogDetector({
        section_pattern: "<div>",
        version_pattern: "([0-9]+)",
      }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("缺少 section_pattern 或 version_pattern → no_version", async () => {
    const http = new MockHttp();
    await expect(
      new HtmlChangelogDetector({ url: "https://x" }).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("网络错误 → network reason", async () => {
    const http = new MockHttp({ get: [{ error: "network" }] });
    await expect(
      new HtmlChangelogDetector(ZCODE_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NETWORK });
  });

  it("5xx → http_5xx", async () => {
    const http = new MockHttp({ get: [{ status: 502, body: "bad gw" }] });
    await expect(
      new HtmlChangelogDetector(ZCODE_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.HTTP_5XX });
  });

  it("script 块被剥 (XSS 防护第一层)", async () => {
    const evilHtml = `
      <div class="flex flex-col gap-6 border-b border-neutral-800 pb-16">
        <span class="w-fit rounded-full border border-white px-2.5 py-0.5 font-mono text-sm">1.0.0</span>
        <script>alert('xss')</script>
        <h2>Safe content</h2>
      </div>`;
    const http = new MockHttp({ get: [{ status: 200, body: evilHtml }] });
    const r = await new HtmlChangelogDetector(ZCODE_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("1.0.0");
    expect(r.changelog).not.toContain("<script>");
    expect(r.changelog).not.toContain("alert");
    expect(r.changelog).toContain("Safe content");
  });

  it("content_pattern 限定只取子 HTML", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: ZCODE_HTML }] });
    const cfg = {
      ...ZCODE_CFG,
      content_pattern:
        '<h2 class="group[^"]*">New Features</h2>[\\s\\S]*?</ul>',
    };
    const r = await new HtmlChangelogDetector(cfg).detect(makeCtx({ http }));
    expect(r.version).toBe("3.0.1");
    expect(r.changelog).toContain("New Features");
    expect(r.changelog).toContain("Added new feature A");
    // Bug Fixes 段不应包含 (不在 content_pattern 范围)
    expect(r.changelog).not.toContain("Bug Fixes");
  });

  it("首个 article 内嵌 div — Cursor 风格的标签深度追踪", async () => {
    // Cursor article 内部有 grid-cursor div (含嵌套 div), section_pattern 应该
    // 从第一个 <article> 起, 平衡到第一个 </article> 闭合, 而不是切到内部 div
    const html = `
      <article>
        <div class="grid-cursor">
          <div class="col">
            <span class="label">3.7</span>
            <h1 class="type-lg">Design Mode Improvements</h1>
            <div class="prose"><p>content</p></div>
          </div>
        </div>
      </article>
      <article>next</article>`;
    const cfg = {
      url: "https://www.cursor.com/changelog",
      section_pattern: "<article>",
      section_end: "</article>",
      version_pattern: '<span class="label">([0-9.]+)</span>',
    };
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    const r = await new HtmlChangelogDetector(cfg).detect(makeCtx({ http }));
    expect(r.version).toBe("3.7");
    expect(r.changelog).toContain("Design Mode Improvements");
    expect(r.changelog).toContain("content");
    expect(r.changelog).not.toContain("next");
  });

  it("首个 section 无版本号 → 回退到整个页面取最大版本 (Cursor 真实场景)", async () => {
    // 最新 article 不含版本号 (e.g. "Bugbot is now over 3x faster")
    // 第二个 article 含版本号 3.7, 第三个含 3.6
    const html = `
      <article><h1>Bugbot is now over 3x faster</h1><p>no version here</p></article>
      <article><span class="label">3.7</span><h1>Design Mode</h1></article>
      <article><span class="label">3.6</span><h1>Bug fixes</h1></article>`;
    const cfg = {
      url: "https://www.cursor.com/changelog",
      section_pattern: "<article>",
      section_end: "</article>",
      version_pattern: '<span class="label">([0-9.]+)</span>',
    };
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    const r = await new HtmlChangelogDetector(cfg).detect(makeCtx({ http }));
    expect(r.version).toBe("3.7");
    expect(r.changelog).toContain("Bugbot is now over 3x faster");
    expect(r.note).toContain("page-max");
  });
});

describe("compareVersionsDesc", () => {
  it("基本 semver 排序 (倒序)", async () => {
    const { compareVersionsDesc } =
      await import("../../src/detectors/html-changelog.js");
    expect(compareVersionsDesc("3.7", "3.6")).toBe(-1); // 3.7 更大
    expect(compareVersionsDesc("3.6", "3.7")).toBe(1);
    expect(compareVersionsDesc("3.7.1", "3.7")).toBe(-1);
    expect(compareVersionsDesc("3.0.0", "3.0.0")).toBe(0);
  });
});
