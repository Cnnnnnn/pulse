/**
 * tests/main/digest/brief-html.test.ts
 *
 * v3.0 beta: briefHtmlShell 渲染测试 — 不依赖 electron / fs.
 *
 * 覆盖:
 *   - 5 种 section kind 都能正确渲染
 *   - LLM 改写标签
 *   - 空 sections 给空状态文案
 *   - sections 排序按 DIGEST_KIND_ORDER
 *   - HTML 转义防止 XSS
 */

import { describe, it, expect } from "vitest";
import { briefHtmlShell } from "../../../src/main/digest/brief-html.ts";
import type { BriefingSnapshot } from "../../../src/shared/digest-types.ts";

function mkSnapshot(
  sections: BriefingSnapshot["sections"],
  rewritten = false,
): BriefingSnapshot {
  return {
    date: "2026-09-11",
    generatedAt: 1700000000000,
    sections,
    lines: sections.flatMap((s) => s.items.map((it) => it.name || String(it))),
    rewritten,
  };
}

describe("briefHtmlShell", () => {
  it("渲染 updates / hot / news / funds / ai_usage 5 种 section", () => {
    const snap = mkSnapshot([
      {
        kind: "updates",
        title: "Updates",
        items: [
          { id: "u1", name: "Brave", installed_version: "1.50", latest_version: "1.51" },
        ],
      } as any,
      {
        kind: "hot",
        title: "Hot",
        items: [{ id: "h1", title: "微博热搜 #1: foo" }],
      } as any,
      {
        kind: "news",
        title: "News",
        items: [{ id: "n1", title: "IT 新闻: bar" }],
      } as any,
      {
        kind: "funds",
        title: "Funds",
        items: [
          { id: "f1", name: "沪深 300", today_change_pct: 1.25, today_change: 0 },
        ],
      } as any,
      {
        kind: "ai_usage",
        title: "AI Usage",
        items: [{ provider: "minimax", percent: 70 }],
      } as any,
      {
        kind: "ai_movers",
        title: "AI Movers",
        items: [
          { model: "Claude-5", vendor: "anthropic", board: "text", from: 5, to: 2, delta: 3, is_new: false },
          { model: "Kimi-K3", vendor: "moonshot", board: "code", from: null, to: 3, delta: null, is_new: true },
        ],
      } as any,
      {
        kind: "github_releases",
        title: "GitHub Releases",
        items: [{ name: "vite", owner: "vitejs", repo: "vite", latest_version: "v8.0.0" }],
      } as any,
    ]);
    const html = briefHtmlShell(snap);
    expect(html).toContain("<title>Pulse 今日要点 · 2026-09-11</title>");
    expect(html).toContain("Brave 1.50 → 1.51");
    expect(html).toContain("微博热搜 #1: foo");
    expect(html).toContain("IT 新闻: bar");
    expect(html).toContain("沪深 300 +1.3%");
    expect(html).toContain("minimax 70%");
    expect(html).toContain("Claude-5 text榜 #5→#2");
    expect(html).toContain("Kimi-K3 新上榜 (code榜 #3)");
    expect(html).toContain("vite v8.0.0");
  });

  it("rewritten=true 时显示 LLM 改写标签", () => {
    const html = briefHtmlShell(mkSnapshot([], true));
    expect(html).toContain("LLM 改写");
  });

  it("空 sections 给空状态文案", () => {
    const html = briefHtmlShell(mkSnapshot([]));
    expect(html).toContain("今日没有匹配的要点");
  });

  it("section 顺序按 DIGEST_KIND_ORDER 排 (乱序输入应被重排)", () => {
    const snap = mkSnapshot([
      {
        kind: "ai_usage",
        title: "AI",
        items: [{ provider: "minimax", percent: 80 }],
      } as any,
      {
        kind: "updates",
        title: "Updates",
        items: [{ id: "u1", name: "X", installed_version: "1", latest_version: "2" }],
      } as any,
    ]);
    const html = briefHtmlShell(snap);
    const updatesIdx = html.indexOf("可升级");
    const aiIdx = html.indexOf("AI 用量");
    expect(updatesIdx).toBeGreaterThan(0);
    expect(aiIdx).toBeGreaterThan(0);
    expect(updatesIdx).toBeLessThan(aiIdx);
  });

  it("HTML 转义防止 XSS (字符串里嵌 <script>)", () => {
    const snap = mkSnapshot([
      {
        kind: "hot",
        title: "Hot",
        items: [{ id: "h1", title: "<script>alert(1)</script>" }],
      } as any,
    ]);
    const html = briefHtmlShell(snap);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});