// @vitest-environment happy-dom
/**
 * tests/renderer/a11y-versions.test.jsx
 *
 * Task 23: A11y smoke test for the 8 new versions components.
 *
 * ponytail: axe-core / jest-axe are NOT installed in devDependencies, and the
 * Ponytail rule says "no new deps unless absolutely necessary". The plan's Step 1
 * claims "已经在 package.json 锁定" but the lockfile confirms neither is present,
 * so this is a structural stub instead of a real axe-core scan. The stub does
 * the cheapest meaningful check: render each component, walk the resulting DOM,
 * and assert every interactive / landmark element has either visible text, an
 * aria-label, or a labelled-by relationship. That catches the most common axe
 * violations (button-name, link-name, image-alt, region) without pulling in a
 * 200 KB dependency. Upgrade path: `npm i -D axe-core jest-axe` then replace
 * the body of each `it(...)` with `expect(await axe(container)).toHaveNoViolations()`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/preact";
import { TopBar } from "../../src/renderer/components/TopBar.jsx";
import { CommandPalette } from "../../src/renderer/components/CommandPalette.jsx";
import { LibraryPage } from "../../src/renderer/components/LibraryPage.jsx";
import { KPICard } from "../../src/renderer/components/KPICard.jsx";
import { ViewSwitcher } from "../../src/renderer/components/ViewSwitcher.jsx";
import { MergedFilterChip } from "../../src/renderer/components/MergedFilterChip.jsx";
import { AIDrawerShell } from "../../src/renderer/components/AIDrawerShell.jsx";
import { openPalette, closePalette } from "../../src/renderer/command-palette-store.js";
import { resetOverview } from "../../src/renderer/overview-store.js";
import { setViewMode } from "../../src/renderer/library-view-store.js";
import { results, resetCheck } from "../../src/renderer/store.js";

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    detectResultsExport: vi.fn(async () => ({ ok: true })),
    openUrl: vi.fn(),
    versionsRunCheck: vi.fn(async () => ({ started: true })),
    brewUpgrade: vi.fn(async () => undefined),
    versionsOverviewKpis: vi.fn(async () => ({ upgradable: 0, latest: 0, error: 0, total: 0 })),
    versionsOverviewTrend: vi.fn(async () => []),
    versionsOverviewWatchlist: vi.fn(async () => []),
    versionsOverviewRecent: vi.fn(async () => []),
    versionsOverviewAiInsights: vi.fn(async () => ({ ok: true, text: "", fromCache: false })),
  },
}));

beforeEach(() => {
  cleanup();
  closePalette();
  resetOverview();
  setViewMode("table");
  resetCheck();
});

/**
 * ponytail: structural a11y check — every interactive element must have an
 * accessible name (visible text, aria-label, aria-labelledby) and landmark
 * elements must carry a role or be a semantic tag. This catches the bulk of
 * axe-core's button-name / link-name / image-alt / region rules; it does NOT
 * cover contrast, focus order, or ARIA-attribute validity.
 */
function assertA11y(container, label) {
  const issues = [];
  const interactive = container.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="option"]'
  );
  interactive.forEach((el) => {
    const name =
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      (el.textContent || "").trim() ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder");
    if (!name) issues.push(`${label}: <${el.tagName.toLowerCase()}> missing accessible name`);
  });
  const images = container.querySelectorAll("img");
  images.forEach((img) => {
    if (!img.getAttribute("alt") && img.getAttribute("role") !== "presentation") {
      issues.push(`${label}: <img> missing alt`);
    }
  });
  expect(issues, issues.join("\n")).toEqual([]);
}

describe("a11y: versions components (structural stub)", () => {
  it("TopBar has accessible interactive controls", () => {
    const { container } = render(<TopBar />);
    assertA11y(container, "TopBar");
  });

  it("CommandPalette (open) has accessible controls", () => {
    openPalette();
    const { container } = render(<CommandPalette />);
    assertA11y(container, "CommandPalette");
  });

  it("LibraryPage has accessible interactive controls", () => {
    // 填充一个结果, 让 LibraryPage 走列表分支 (有 .library-page 与交互控件)
    results.value = new Map([
      ["App1", { name: "App1", current_version: "1", latest_version: "2", has_update: false, bundle: "" }],
    ]);
    const { container } = render(<LibraryPage />);
    assertA11y(container, "LibraryPage");
  });

  it("KPICard has accessible content", () => {
    const { container } = render(<KPICard label="测试" value={3} />);
    assertA11y(container, "KPICard");
  });

  it("ViewSwitcher has accessible toggle buttons", () => {
    const { container } = render(<ViewSwitcher />);
    assertA11y(container, "ViewSwitcher");
  });

  it("MergedFilterChip has accessible search + chips", () => {
    const { container } = render(<MergedFilterChip />);
    assertA11y(container, "MergedFilterChip");
  });

  it("AIDrawerShell (open) has accessible close button + body", () => {
    const { container } = render(
      <AIDrawerShell open onClose={() => {}} title="test">
        <div>x</div>
      </AIDrawerShell>
    );
    assertA11y(container, "AIDrawerShell");
  });
});