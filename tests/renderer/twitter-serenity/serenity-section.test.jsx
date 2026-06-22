/**
 * tests/renderer/twitter-serenity/serenity-section.test.jsx
 *
 * Task 16: DigestSection 渲染 serenity kind (🐦 icon + title + renderItem).
 */

// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { DigestSection } from "../../../src/renderer/digest/DigestSection.jsx";
import { SERENITY_SECTION_KIND } from "../../../src/renderer/twitter-serenity/serenity-section.jsx";

afterEach(() => {
  cleanup();
});

describe("DigestSection serenity", () => {
  it("渲染 serenity kind 带 🐦 icon + title", () => {
    const { getByText, container } = render(
      <DigestSection
        section={{
          kind: SERENITY_SECTION_KIND,
          items: [{ handle: "h", text: "hi", isTranslated: true }],
        }}
      />,
    );
    expect(getByText("Serenity 推文")).toBeTruthy();
    expect(container.querySelector(".digest-section__icon").textContent).toBe(
      "🐦",
    );
  });

  it("serenity item 译文标记 [译] + @handle + text", () => {
    const { getByText } = render(
      <DigestSection
        section={{
          kind: SERENITY_SECTION_KIND,
          items: [{ handle: "h", text: "hi", isTranslated: true }],
        }}
      />,
    );
    expect(getByText(/\[译\] @h: hi/)).toBeTruthy();
  });

  it("serenity item 无译文时不加 [译] 前缀", () => {
    const { getByText } = render(
      <DigestSection
        section={{
          kind: SERENITY_SECTION_KIND,
          items: [{ handle: "h", text: "raw text", isTranslated: false }],
        }}
      />,
    );
    expect(getByText(/@h: raw text/)).toBeTruthy();
  });

  it("serenity items 空时仍渲染 header", () => {
    const { getByText } = render(
      <DigestSection section={{ kind: SERENITY_SECTION_KIND, items: [] }} />,
    );
    expect(getByText("Serenity 推文")).toBeTruthy();
  });

  it("SERENITY_SECTION_KIND 常量 = 'serenity'", () => {
    expect(SERENITY_SECTION_KIND).toBe("serenity");
  });
});
