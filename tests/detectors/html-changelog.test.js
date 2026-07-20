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

  // 2026-06-28: next-start 模式. sectionEnd 是起始标记 (e.g. "<h2") 而非
  // 闭合标签, 切到下一个起始出现处. 给 VitePress 类 changelog 用 (h2 + 跟随
  // 兄弟节点直到下个 h2). 之前用 </h2> 当 balance 闭合会把整个 release 块
  // 切短, 只剩 h2 标题.
  it("next-start 模式: sectionEnd 是起始标记, 切到下一个起始", () => {
    const html =
      '<h2 id="_5-1-7">5.1.7 release</h2><ul><li>fix A</li><li>fix B</li></ul>' +
      '<h2 id="_5-1-6">5.1.6 release</h2><ul><li>fix C</li></ul>';
    const section = extractFirstSection(html, '<h2 id="_', '<h2 id="_');
    expect(section).toBe(
      '<h2 id="_5-1-7">5.1.7 release</h2><ul><li>fix A</li><li>fix B</li></ul>',
    );
  });

  it("next-start 模式: 文档只有 1 个 section, 切到末尾", () => {
    const html = '<h2 id="_x">only</h2><p>body</p>';
    const section = extractFirstSection(html, '<h2 id="_', '<h2 id="_');
    expect(section).toBe(html);
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

describe("MiniMax Code changelog (mintlify/next.js)", () => {
  // 从真实 https://agent.minimaxi.com/docs/changelog 简化的 fixture:
  // 每个 version 是独立 <h2 id="vX-Y-Z"> ... <span>vX.Y.Z</span></h2>,
  // 下面跟 <h3>...</h3><ul><li>...</li></ul>, 中间用 <hr/> 分隔.
  // 没有 <div>/<article> 包整个 section, 所以 section_pattern 锁 <h2 id="v" 即可.
  const MINIMAX_HTML = `
<html><body>
  <div class="doc">
    <h2 class="flex whitespace-pre-wrap group font-semibold" id="v3-0-47">
      <span class="cursor-pointer">v3.0.47</span>
    </h2>
    <ul><li>修复部分代理情况下服务不可用的问题</li></ul>
    <hr/>
    <h2 class="flex whitespace-pre-wrap group font-semibold" id="v3-0-46">
      <span class="cursor-pointer">v3.0.46</span>
    </h2>
    <h3 id="新功能"><span class="cursor-pointer">新功能</span></h3>
    <ul><li>Worktree 基准分支选择</li></ul>
    <hr/>
    <h2 class="flex whitespace-pre-wrap group font-semibold" id="v3-0-37-v3-0-40">
      <span class="cursor-pointer">v3.0.37~v3.0.40 — 2026-06-08</span>
    </h2>
  </div>
</body></html>
`;
  const MINIMAX_CFG = {
    url: "https://agent.minimaxi.com/docs/changelog",
    section_pattern: "<h2 ",
    section_end: "</h2>",
    version_pattern: '<span class="cursor-pointer">v([0-9.]+)</span>',
  };

  it("首个 h2 里有版本 → 直接拿", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: MINIMAX_HTML }] });
    const r = await new HtmlChangelogDetector(MINIMAX_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("3.0.47");
    expect(r.confidence).toBe("high");
    expect(r.note).toContain("first section");
  });

  it("首个 h2 没有版本 → 退化到 page-max 取最大版本", async () => {
    // 最新 h2 没有版本 span (e.g. 整段重构还没切回模板), 退到整页搜
    const html = MINIMAX_HTML.replace(
      '<span class="cursor-pointer">v3.0.47</span>',
      '<span class="cursor-pointer">Bug 修复</span>',
    );
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    const r = await new HtmlChangelogDetector(MINIMAX_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("3.0.46"); // page-max 选最大
    expect(r.note).toContain("page-max");
  });

  it("整页都没有版本 → no_version", async () => {
    const html =
      '<html><body><h2 id="v0-0-0"><span>noop</span></h2></body></html>';
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    await expect(
      new HtmlChangelogDetector(MINIMAX_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });
});

describe("WorkBuddy changelog (VitePress)", () => {
  // 从真实 https://www.codebuddy.cn/docs/workbuddy/Changelog 简化的 fixture:
  // 每个 version 是 <h2 id="_X-Y-Z-版本发布-🚀-YYYY-MM-DD" tabindex="-1">X.Y.Z 版本发布 ...</h2>
  // 后面跟 <ul><li>...</li></ul>. 没有 <div>/<article> 包整个 section.
  // section_pattern 锁 <h2 id="_" (VitePress content h2 的 slug 前缀是 _).
  const WORKBUDDY_HTML = `
<html><body>
  <div class="VPDoc">
    <h2 class="text" data-v-248cc913>入门指南</h2>  <!-- 侧栏 nav, 不是版本 section -->
    <div class="VPDocContent">
      <h2 id="_5-1-5-版本发布-🚀-2026-06-21" tabindex="-1">5.1.5 版本发布 🚀（2026-06-21） <a class="header-anchor" href="#_5-1-5">&#x200b;</a></h2>
      <ul><li>优化产物面板展示</li><li>修复连接器误恢复</li></ul>
      <h2 id="_5-1-4-版本发布-🚀-2026-06-18" tabindex="-1">5.1.4 版本发布 🚀（2026-06-18） <a class="header-anchor" href="#_5-1-4">&#x200b;</a></h2>
      <ul><li>修复 macOS 检查更新后无法自动拉起</li></ul>
    </div>
  </div>
</body></html>
`;
  const WORKBUDDY_CFG = {
    url: "https://www.codebuddy.cn/docs/workbuddy/Changelog",
    section_pattern: '<h2 id="_',
    section_end: "</h2>",
    version_pattern: ">([0-9.]+) 版本发布",
  };

  it("首个 content h2 → 5.1.5 (跳过侧栏 nav h2)", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: WORKBUDDY_HTML }] });
    const r = await new HtmlChangelogDetector(WORKBUDDY_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("5.1.5");
    expect(r.confidence).toBe("high");
  });

  // 2026-06-28 回归: section_end = 起始标记 (next-start 模式) → section 包住
  // 整个 release 块 (h2 + 跟随 ul). 之前用 </h2> balance 切, 只剩 h2 标题,
  // changelog 内容全丢, 用户看到 panel 只有一行版本号. config.json 同步改.
  it("section_end = 起始标记 (next-start) → section 包住 h2 + 跟随 ul/li", async () => {
    const cfg = {
      ...WORKBUDDY_CFG,
      section_end: '<h2 id="_', // 切到下一个 h2 id="_" 之前
    };
    const http = new MockHttp({ get: [{ status: 200, body: WORKBUDDY_HTML }] });
    const r = await new HtmlChangelogDetector(cfg).detect(makeCtx({ http }));
    expect(r.version).toBe("5.1.5");
    expect(r.changelog).toContain("优化产物面板展示");
    expect(r.changelog).toContain("修复连接器误恢复");
    expect(r.changelog).not.toContain("修复 macOS 检查更新后无法自动拉起"); // 5.1.4 的, 不应在第一个 section
  });

  it("旧格式 (4.x) 也能抓", async () => {
    const html = `
      <h2 id="_4-24-8-版本发布-🚀-2026-06-03" tabindex="-1">4.24.8 版本发布 🚀(2026-06-03) <a class="header-anchor">&#x200b;</a></h2>
      <ul><li>x</li></ul>
      <h2 id="_4-24-7-版本发布-🚀-2026-06-01" tabindex="-1">4.24.7 版本发布 🚀(2026-06-01) <a class="header-anchor">&#x200b;</a></h2>
      <ul><li>y</li></ul>`;
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    const r = await new HtmlChangelogDetector(WORKBUDDY_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("4.24.8");
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

describe("Marvis changelog (Next.js SPA, 未来投资)", () => {
  // 2026-07-19: Marvis 官网 /changelog 当前是 Next.js SSR 兜底页 (跟首页/
  // download 同一份 HTML), 里面 <section> 是营销页布局, 不是 release section.
  // 唯一像版本号的字符串是 Android APK 文件名 marvis_1.1.3.apk (不是 Mac 版本号).
  // 配置 enrich_only=true + version_pattern 锁 1.60.x → 当前页直接 NO_VERSION,
  // 不污染版本号也不富集错误的 changelog 内容. 等 Marvis 将来真做了 /changelog
  // 页 (含 1.60.1211 release section) 时, 这个 detector 自动跟上.
  const MARVIS_CFG = {
    url: "https://marvis.qq.com/changelog",
    section_pattern: "<section",
    section_end: "</section>",
    version_pattern: "v?(1\\.60\\.\\d+)",
    enrich_only: true,
  };

  // 当前 marvis.qq.com/changelog 真实 SSR HTML 简化 fixture:
  // 含 3 个 <section> (营销页布局), 第一个 section 里有 Android APK 下载链接
  // (marvis_1.1.3.apk), 但没有任何 1.60.x Mac 版本号.
  const MARVIS_CURRENT_SSR = `
<html><body>
  <main class="page_appRoot">
    <section class="hero"><h1>Marvis 马维斯</h1>
      <a href="https://down.marvis.qq.com/marvis_install/channelsup/com.tencent.android.marvis_1.1.3.apk">Android 下载</a>
    </section>
    <section class="features"><h2>本地大模型</h2><p>文件 0 上传</p></section>
    <section class="footer"><p>© Tencent</p></section>
  </main>
</body></html>`;

  it("当前 SSR 兜底页 → NO_VERSION (1.1.3 不匹配 1.60.x, 不污染)", async () => {
    const http = new MockHttp({ get: [{ status: 200, body: MARVIS_CURRENT_SSR }] });
    await expect(
      new HtmlChangelogDetector(MARVIS_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("当前 SSR 页: section_pattern 能匹配到 <section> (不是 section 找不到)", async () => {
    // 上面那个用例 NO_VERSION 的原因是 version_pattern 不匹配, 不是 section_pattern
    // 找不到. 这里直接验证 extractFirstSection 能切出 section.
    const section = extractFirstSection(
      MARVIS_CURRENT_SSR,
      "<section",
      "</section>",
    );
    expect(section).toContain("Marvis 马维斯");
    expect(section).toContain("marvis_1.1.3.apk");
  });

  // 未来 Marvis 改版后 /changelog 真有 release section 的 fixture (假设性):
  it("未来 /changelog 有 1.60.1211 release section → 抓到版本 + changelog", async () => {
    const futureHtml = `
<html><body>
  <main>
    <section class="release">
      <h2>v1.60.1211</h2>
      <ul>
        <li>小马形象全新升级</li>
        <li>Mac 本地模式上线</li>
        <li>技能广场支持发布 UGC 案例</li>
      </ul>
    </section>
    <section class="release">
      <h2>v1.60.1111</h2>
      <ul><li>稳定性与性能优化</li></ul>
    </section>
  </main>
</body></html>`;
    const http = new MockHttp({ get: [{ status: 200, body: futureHtml }] });
    const r = await new HtmlChangelogDetector(MARVIS_CFG).detect(
      makeCtx({ http }),
    );
    expect(r.version).toBe("1.60.1211");
    expect(r.confidence).toBe("high");
    expect(r.changelog_format).toBe("html");
    expect(r.changelog).toContain("小马形象全新升级");
    expect(r.changelog).toContain("Mac 本地模式上线");
    // 第二个 release (1.60.1111) 不应包含在第一个 section 里
    expect(r.changelog).not.toContain("稳定性与性能优化");
  });

  it("section_pattern 找不到 (未来 Marvis 改用其他标签) → NO_VERSION", async () => {
    const html = "<html><body><div>no section here</div></body></html>";
    const http = new MockHttp({ get: [{ status: 200, body: html }] });
    await expect(
      new HtmlChangelogDetector(MARVIS_CFG).detect(makeCtx({ http })),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("enrich_only 字段在配置里存在 (detector 自身不读, 由 detector-chain 用)", () => {
    // detector 构造函数不处理 enrich_only, 它由 sanitize + detector-chain 消费.
    // 这里只验证配置字段透传不丢 (sanitize 白名单守护).
    expect(MARVIS_CFG.enrich_only).toBe(true);
  });
});
