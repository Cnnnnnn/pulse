// @vitest-environment happy-dom
/**
 * tests/renderer/SettingsPage.test.jsx
 *
 * Task 19: SettingsPage — 空壳, 只渲染 PageHeader title.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { SettingsPage } from "../../src/renderer/components/SettingsPage.jsx";

describe("SettingsPage", () => {
  it("渲染 title", () => {
    render(<SettingsPage />);
    expect(screen.getByText("设置")).toBeTruthy();
  });
});