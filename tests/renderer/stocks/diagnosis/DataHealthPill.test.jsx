// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { DataHealthPill } from "../../../../src/renderer/stocks/diagnosis/DataHealthPill.jsx";

const NOW = 1_700_000_000_000;
const recent = NOW - 1000;

describe("DataHealthPill", () => {
  it("renders '已更新' for ok status", () => {
    const { container } = render(<DataHealthPill angle={{ status: "ok", data: { x: 1 }, fetchedAt: recent }} now={NOW} />);
    expect(container.textContent).toMatch(/已更新/);
  });

  it("renders '陈旧' for stale status (>30 天)", () => {
    const stale = NOW - 31 * 24 * 60 * 60 * 1000;
    const { container } = render(<DataHealthPill angle={{ status: "ok", data: { x: 1 }, fetchedAt: stale }} now={NOW} />);
    expect(container.textContent).toMatch(/陈旧/);
  });

  it("renders '失败' for failed status", () => {
    const { container } = render(<DataHealthPill angle={{ status: "failed", reason: "fetch_failed", error: "timeout" }} now={NOW} />);
    expect(container.textContent).toMatch(/失败/);
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain("数据源请求失败");
  });

  it("renders '部分数据' for partial status (ok + empty data)", () => {
    const { container } = render(<DataHealthPill angle={{ status: "ok", data: null, fetchedAt: recent }} now={NOW} />);
    expect(container.textContent).toMatch(/部分数据/);
  });

  it("shows failure streak count when >=2", () => {
    const { container } = render(<DataHealthPill angle={{ status: "failed", reason: "fetch_failed", failureStreakCount: 3 }} now={NOW} />);
    expect(container.textContent).toMatch(/连续 3 次失败/);
  });

  it("invokes onRefresh when retry button clicked", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <DataHealthPill
        angle={{ status: "failed", reason: "fetch_failed" }}
        onRefresh={onRefresh}
        now={NOW}
      />
    );
    const btn = container.querySelector("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("hides retry button when no onRefresh provided", () => {
    const { container } = render(
      <DataHealthPill angle={{ status: "failed", reason: "fetch_failed" }} now={NOW} />
    );
    expect(container.querySelector("button")).toBeNull();
  });
});