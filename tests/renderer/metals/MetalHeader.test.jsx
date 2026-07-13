// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { MetalHeader } from "../../../src/renderer/metals/MetalHeader.jsx";
import {
  schedulerState, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalHeader: 标题块 + 市场状态徽标 + 刷新 (纯行情看板)", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("渲染标题块 (medal + 贵金属 + 副标) + 实时行情徽标 + 刷新按钮", () => {
    schedulerState.value = { status: "idle", lastFetch: Date.now() };
    const { container } = render(<MetalHeader />);
    // 标题
    const h1 = container.querySelector(".metals-header-title h1");
    expect(h1.textContent).toMatch(/贵金属/);
    expect(container.querySelector(".metals-header-medal")).not.toBeNull();
    // 市场状态徽标
    const badge = container.querySelector(".metals-badge.open");
    expect(badge).not.toBeNull();
    expect(badge.textContent).toMatch(/实时行情/);
    // 刷新按钮
    const refresh = container.querySelector(".metals-refresh-btn");
    expect(refresh).not.toBeNull();
  });

  it("不再渲染总览三数 (总市值/总盈亏/今日预估 — 持仓语义已移除)", () => {
    schedulerState.value = { status: "idle", lastFetch: null };
    const { container } = render(<MetalHeader />);
    expect(container.querySelector(".metals-header-summary")).toBeNull();
    expect(container.textContent).not.toMatch(/总市值/);
    expect(container.textContent).not.toMatch(/总盈亏/);
  });

  it("scheduler running → 刷新按钮显示更新中并禁用", () => {
    schedulerState.value = { status: "running", lastFetch: null };
    const { container } = render(<MetalHeader />);
    const refresh = container.querySelector(".metals-refresh-btn");
    expect(refresh.disabled).toBe(true);
    expect(refresh.textContent).toMatch(/更新中/);
  });

  it("点击刷新 → 调 refreshNow + 显示更新中态", async () => {
    schedulerState.value = { status: "idle", lastFetch: null };
    const { container } = render(<MetalHeader />);
    const refresh = container.querySelector(".metals-refresh-btn");
    // fetchNow 在 resetMetalStore 后 window.metalsApi 被 delete, refreshNow 直接 return.
    fireEvent.click(refresh);
    // 点击后进入 refreshing 态 (disabled)
    expect(refresh.disabled).toBe(true);
  });
});
