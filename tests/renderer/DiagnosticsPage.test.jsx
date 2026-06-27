// @vitest-environment happy-dom
/**
 * tests/renderer/DiagnosticsPage.test.jsx
 *
 * Task 19: DiagnosticsPage — 空壳, 只渲染 PageHeader title.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { DiagnosticsPage } from "../../src/renderer/components/DiagnosticsPage.jsx";

describe("DiagnosticsPage", () => {
  it("渲染 title", () => {
    render(<DiagnosticsPage />);
    expect(screen.getByText("错误诊断")).toBeTruthy();
  });
});