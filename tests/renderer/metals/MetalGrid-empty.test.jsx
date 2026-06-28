// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalGrid } from "../../../src/renderer/metals/MetalGrid.jsx";
import {
  config,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalGrid empty state", () => {
  beforeEach(() => {
    // 直接重置 signal value (resetMetalStore 是 Task 8 才加的)
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
  });

  it("无关注品种: 渲染 4 个 ghost 卡 (黄金/白银/AU9999/AG9999)", () => {
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    const { container } = render(<MetalGrid onEdit={() => {}} />);
    const ghosts = container.querySelectorAll(".metal-empty-ghost-card");
    expect(ghosts.length).toBe(4);
    expect(container.textContent).toMatch(/黄金/);
    expect(container.textContent).toMatch(/白银/);
    expect(container.textContent).toMatch(/AU9999/);
    expect(container.textContent).toMatch(/AG9999/);
  });

  it("已关注某品种: 该品种不出现在 ghost 列表, 走 metal-card 分支", () => {
    config.value = { watchedIds: ["XAU"], holdings: {}, deletedIds: [] };
    const { container } = render(<MetalGrid onEdit={() => {}} />);
    expect(container.querySelector(".metal-empty-ghost-card")).toBeNull();
    expect(container.querySelector(".metal-card")).not.toBeNull();
  });
});