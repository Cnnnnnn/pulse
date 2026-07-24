/**
 * tests/main/ithome-article-page-parser.test.js
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
const { requireMain, requirePlatform, mainArtifactPath, platformArtifactPath } = require("../_setup/require-main.cjs");
const parser = requireMain("ithome/article-page-parser");
const { parseIthomeArticlePage, hasArticleContent } = parser;

const FIXTURE = readFileSync(
  join(__dirname, "..", "fixtures", "ithome", "article-866661.html"),
  "utf-8",
);

describe("ithome article-page-parser", () => {
  it("extracts the article body from #paragraph", () => {
    const r = parseIthomeArticlePage(FIXTURE);
    expect(r.ok).toBe(true);
    expect(r.body.length).toBeGreaterThan(100);
    expect(r.body).toContain("蔚来与江淮合资公司注销");
  });

  it("removes the byline 感谢IT之家网友 ... 线索投递 block", () => {
    const r = parseIthomeArticlePage(FIXTURE);
    expect(r.body).not.toContain("感谢IT之家网友");
    expect(r.body).not.toContain("线索投递");
  });

  it("removes the 广告声明 tail block", () => {
    const r = parseIthomeArticlePage(FIXTURE);
    expect(r.body).not.toContain("广告声明");
    expect(r.body).not.toContain("文内含有的对外跳转链接");
  });

  it("preserves paragraph breaks (joins with newline)", () => {
    const r = parseIthomeArticlePage(FIXTURE);
    // 至少应包含两段内容段落
    const paras = r.body.split(/\n+/).filter((p) => p.length > 20);
    expect(paras.length).toBeGreaterThanOrEqual(3);
  });

  it("strips image tags and inline scripts", () => {
    const longText = "重要内容".repeat(40);
    const html =
      '<div class="post_content" id="paragraph">' +
      "<p>第一段" +
      longText +
      "</p>" +
      '<p><img src="//x" alt="占位图"></p>' +
      "<p>第二段<script>alert(1)</script>正常文字</p>" +
      "</div>";
    const r = parseIthomeArticlePage(html);
    expect(r.ok).toBe(true);
    expect(r.body).toContain("第一段");
    expect(r.body).toContain("第二段");
    expect(r.body).toContain("正常文字");
    expect(r.body).not.toContain("img");
    expect(r.body).not.toContain("script");
    expect(r.body).not.toContain("alert");
  });

  it("returns ok=false with reason when #paragraph missing", () => {
    const r = parseIthomeArticlePage("<html><body>无正文</body></html>");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("paragraph_missing");
    expect(r.body).toBe("");
  });

  it("returns ok=false for empty/short body content", () => {
    const html =
      '<html><body><div class="post_content" id="paragraph">' +
      '<div class="tougao-user">感谢投递</div>' +
      '<p class="ad-tips">广告声明：仅用于...</p>' +
      "</div></body></html>";
    const r = parseIthomeArticlePage(html);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("paragraph_too_short");
  });

  it("hasArticleContent is a quick body-presence check", () => {
    const r = parseIthomeArticlePage(FIXTURE);
    expect(hasArticleContent(r)).toBe(true);
    const empty = parseIthomeArticlePage("<html></html>");
    expect(hasArticleContent(empty)).toBe(false);
  });

  it("does not include post-paragraph footer / 投诉水文 / 相关文章 / 软媒旗下", () => {
    // 修 bug: 之前 _extractParagraphBlock 用 lastIndexOf("</div>") 会把
    // paragraph 之后的所有 footer div (newserror / shareto / 软媒旗下网站 / 版权)
    // 都包进 body, 污染 AI 总结. 修复后, body 应在 paragraph close 处结束.
    const r = parseIthomeArticlePage(FIXTURE);
    expect(r.ok).toBe(true);
    expect(r.body).not.toContain("投诉水文");
    expect(r.body).not.toContain("下载IT之家APP");
    expect(r.body).not.toContain("相关文章");
    expect(r.body).not.toContain("软媒旗下");
    expect(r.body).not.toContain("Archiver");
  });
});
