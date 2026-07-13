// @vitest-environment happy-dom
/**
 * tests/newcar/components.test.jsx
 *
 * 组件冒烟测试: NewCarReleaseList / NewCarReleaseCalendar.
 * 仅 happy-dom + @testing-library/preact, 验证渲染与基本交互 (onOpen / onSelectDate).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";

afterEach(cleanup);
import { NewCarReleaseList } from "../../src/renderer/components/NewCarReleaseList.jsx";
import { NewCarReleaseCalendar } from "../../src/renderer/components/NewCarReleaseCalendar.jsx";

const rec = (id, name, date, brand = "比亚迪") => ({
  id,
  name,
  brand,
  releaseDate: date,
  type: "轿车",
  energyType: "纯电",
  priceMin: 10,
  priceMax: 20,
  thumbnailUrl: null,
  sourceUrl: null,
  status: "上市",
});

describe("NewCarReleaseList", () => {
  it("渲染一条记录 (名称 / 类型 / 能源 / 状态 badge)", () => {
    const r = rec("1", "比亚迪 汉 EV", "2026-01-15");
    render(<NewCarReleaseList releases={[r]} />);
    expect(screen.getByText("比亚迪 汉 EV")).toBeTruthy();
    expect(screen.getByText("轿车")).toBeTruthy();
    expect(screen.getByText("纯电")).toBeTruthy();
    expect(screen.getByText("上市")).toBeTruthy();
  });

  it("空列表显示空态文案", () => {
    render(<NewCarReleaseList releases={[]} />);
    expect(screen.getByText(/暂无匹配/)).toBeTruthy();
  });

  it("releases 输入变化 → 列表行数随之变化 (筛选生效的下游表现)", () => {
    const all = [rec("1", "A", "2026-01-15"), rec("2", "B", "2026-02-01", "特斯拉")];
    const { container, rerender } = render(<NewCarReleaseList releases={all} />);
    expect(container.querySelectorAll(".newcar-row").length).toBe(2);
    rerender(<NewCarReleaseList releases={[all[0]]} />);
    expect(container.querySelectorAll(".newcar-row").length).toBe(1);
  });

  it("点击行触发 onOpen(record)", () => {
    const onOpen = vi.fn();
    const r = rec("1", "比亚迪 汉 EV", "2026-01-15");
    render(<NewCarReleaseList releases={[r]} onOpen={onOpen} />);
    const row = screen.getByText("比亚迪 汉 EV").closest(".newcar-row");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledWith(r);
  });
});

describe("NewCarReleaseCalendar", () => {
  it("渲染时间轴与记录名, 不崩溃", () => {
    const r = rec("1", "比亚迪 汉 EV", "2026-01-15");
    render(<NewCarReleaseCalendar releases={[r]} onSelectDate={() => {}} onOpen={() => {}} />);
    expect(screen.getByText("比亚迪 汉 EV")).toBeTruthy();
    const monthHeaders = document.querySelectorAll(".newcar-tl-month");
    expect(monthHeaders.length).toBeGreaterThan(0);
    expect(monthHeaders[0].textContent).toContain("2026");
  });

  it("有发布的日期单元格显示数量并可下钻 onSelectDate", () => {
    const onSelectDate = vi.fn();
    const r = rec("1", "比亚迪 汉 EV", "2026-01-15");
    render(<NewCarReleaseCalendar releases={[r]} onSelectDate={onSelectDate} onOpen={() => {}} />);
    const cell = screen.getByTitle("2026-01-15 · 1 款发布");
    expect(cell).toBeTruthy();
    fireEvent.click(cell);
    expect(onSelectDate).toHaveBeenCalledWith("2026-01-15");
  });

  it("点击时间轴记录触发 onOpen(record)", () => {
    const onOpen = vi.fn();
    const r = rec("1", "比亚迪 汉 EV", "2026-01-15");
    render(<NewCarReleaseCalendar releases={[r]} onSelectDate={() => {}} onOpen={onOpen} />);
    const tlRow = screen.getByText("比亚迪 汉 EV").closest(".newcar-tl-row");
    fireEvent.click(tlRow);
    expect(onOpen).toHaveBeenCalledWith(r);
  });
});
