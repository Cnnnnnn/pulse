// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { WorldcupHeader } from "../../src/renderer/worldcup/WorldcupHeader.jsx";

describe("WorldcupHeader migrated to FeatureHeader shell", () => {
  beforeEach(() => {
    global.window.api = {}; // stub
  });

  it("外壳使用 FeatureHeader 双 class 结构, brand + controls 两栏布局", () => {
    const { container } = render(
      <WorldcupHeader
        subTab="matches"
        subTabs={[{ key: "matches", label: "赛程" }, { key: "teams", label: "球队" }]}
        onSubTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        onRefreshScores={() => {}}
        scoresLoading={false}
      />
    );
    const root = container.querySelector(".worldcup-header.feature-header");
    expect(root).toBeTruthy();
    // 双 class 都在 brand/controls 上
    expect(container.querySelector(".worldcup-header-brand.feature-header-brand")).toBeTruthy();
    expect(container.querySelector(".worldcup-header-controls.feature-header-controls")).toBeTruthy();
  });

  it("搜索 input 仍然 id 正确 (Cmd+F 切对齐)", () => {
    const { container } = render(
      <WorldcupHeader
        subTab="matches"
        subTabs={[{ key: "matches", label: "赛程" }]}
        onSubTabChange={() => {}}
        search="hi"
        onSearchChange={() => {}}
      />
    );
    const input = container.querySelector("#worldcup-search-input");
    expect(input).toBeTruthy();
    expect(input.value).toBe("hi");
  });
});