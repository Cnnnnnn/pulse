// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { PageHeader } from "../../src/renderer/components/PageHeader.jsx";

describe("PageHeader", () => {
  it("渲染 title + subtitle", () => {
    render(<PageHeader title="应用库" subtitle="11 监控 · 3 可升级" />);
    expect(screen.getByText("应用库")).toBeTruthy();
    expect(screen.getByText("11 监控 · 3 可升级")).toBeTruthy();
  });
  it("children 作为右侧操作区", () => {
    render(
      <PageHeader title="应用库" subtitle="—">
        <button>视图切换</button>
      </PageHeader>
    );
    expect(screen.getByText("视图切换")).toBeTruthy();
  });
});