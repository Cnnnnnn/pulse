/**
 * tests/renderer/ithome-news-share-card.test.jsx
 */

// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { NewsShareCard } from "../../src/renderer/ithome/NewsShareCard.jsx";

describe("NewsShareCard", () => {
  it("renders all sections with valid article and summary", () => {
    const article = {
      id: "a1",
      title: "Claude 4.5 发布,编程能力大幅提升",
      link: "https://ithome.com/0/123/123.htm",
      category: "科技",
      pubDate: "2026-06-17T14:30:00+08:00",
    };
    const summary = {
      text: "Anthropic 正式发布 Claude 4.5,大幅提升 SWE-bench 表现。",
      keywords: ["AI", "Claude", "编程"],
    };
    const { container } = render(
      <NewsShareCard article={article} summary={summary} />,
    );
    expect(container.querySelector(".share-card")).toBeTruthy();
    expect(container.querySelector(".share-card-source").textContent).toContain("IT之家");
    expect(container.querySelector(".share-card-time").textContent).toContain("06-17");
    expect(container.querySelector(".share-card-title").textContent).toBe(article.title);
    expect(container.querySelector(".share-card-summary-text").textContent).toContain("Anthropic");
    const chips = container.querySelectorAll(".share-card-keyword");
    expect(chips).toHaveLength(3);
    expect(container.querySelector(".share-card-watermark").textContent).toContain("Pulse");
  });

  it("truncates summary text longer than 300 chars", () => {
    const longText = "啊".repeat(400);
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: longText, keywords: [] }}
      />,
    );
    const text = container.querySelector(".share-card-summary-text").textContent;
    // spec §6.3: > 300 → 截断到 300 字 + "..." → 总长 303
    expect(text.length).toBe(303);
    expect(text.endsWith("...")).toBe(true);
    expect(text.slice(0, 300)).toBe(longText.slice(0, 300));
  });

  it("caps keywords at 5", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a","b","c","d","e","f","g"] }}
      />,
    );
    expect(container.querySelectorAll(".share-card-keyword")).toHaveLength(5);
  });

  it("renders all keywords when 3 or fewer", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a","b","c"] }}
      />,
    );
    expect(container.querySelectorAll(".share-card-keyword")).toHaveLength(3);
  });

  it("skips summary section when summary.text is empty", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "", keywords: [] }}
      />,
    );
    expect(container.querySelector(".share-card-summary")).toBeNull();
  });

  it("renders domain and impact fields when both are present", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "a1", title: "t", pubDate: "2026-06-17" }}
        summary={{
          text: "Anthropic 发布 Claude 4.5",
          keywords: ["AI", "Claude"],
          domain: "人工智能",
          impact: "AI 编程工具格局重塑",
        }}
      />,
    );
    const fields = container.querySelectorAll(".share-card-field");
    expect(fields).toHaveLength(2);
    const labels = container.querySelectorAll(".share-card-field-label");
    expect(labels[0].textContent).toBe("所属领域");
    expect(labels[1].textContent).toBe("影响方面");
    const texts = container.querySelectorAll(".share-card-field-text");
    expect(texts[0].textContent).toBe("人工智能");
    expect(texts[1].textContent).toBe("AI 编程工具格局重塑");
  });

  it("skips domain section when domain is empty", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a"], impact: "影响" }}
      />,
    );
    const fields = container.querySelectorAll(".share-card-field");
    expect(fields).toHaveLength(1);
    expect(fields[0].querySelector(".share-card-field-label").textContent).toBe("影响方面");
  });

  it("skips impact section when impact is empty", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ text: "ok", keywords: ["a"], domain: "AI" }}
      />,
    );
    const fields = container.querySelectorAll(".share-card-field");
    expect(fields).toHaveLength(1);
    expect(fields[0].querySelector(".share-card-field-label").textContent).toBe("所属领域");
  });

  it("falls back to abstract when text is missing", () => {
    const { container } = render(
      <NewsShareCard
        article={{ id: "x", title: "t", pubDate: "2026-06-17" }}
        summary={{ abstract: "通过 abstract 字段提供的摘要", keywords: [] }}
      />,
    );
    const text = container.querySelector(".share-card-summary-text").textContent;
    expect(text).toContain("通过 abstract 字段提供的摘要");
  });
});
