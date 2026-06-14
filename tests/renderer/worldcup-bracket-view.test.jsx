// @vitest-environment happy-dom
import { describe, test, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { WorldcupBracketView } from "../../src/renderer/worldcup/WorldcupBracketView.jsx";
import {
  worldcupBracket,
  bracketComputing,
  bracketError,
} from "../../src/renderer/worldcup/bracketStore.js";

const sampleSnapshot = {
  version: 1,
  computedAt: 12345,
  inputsHash: "sha256:abc",
  projected: true,
  r32: [
    {
      matchNum: 73,
      slot1: { team: { name: "South Africa" }, source: "group:A:runnerUp" },
      slot2: { team: { name: "Switzerland" }, source: "group:B:runnerUp" },
      status: "pending",
    },
    {
      matchNum: 74,
      slot1: { team: { name: "Germany" }, source: "group:E:winner" },
      slot2: { team: null, source: "best-third-pool", pool: ["A", "B", "C", "D", "F"] },
      status: "projected",
    },
  ],
  r16: [
    {
      matchNum: 90,
      slot1: { team: null, source: "r32:73" },
      slot2: { team: null, source: "r32:75" },
      status: "projected",
    },
  ],
  qf: [],
  sf: [],
  final: null,
  third: null,
  thirdPlacedAdvancing: ["E", "I", "J", "K", "L", "D", "F", "G"],
  annexCIndex: 0,
  warnings: ["simplified_annex_c_default_row"],
};

describe("WorldcupBracketView smoke", () => {
  beforeEach(() => {
    worldcupBracket.value = sampleSnapshot;
    bracketComputing.value = false;
    bracketError.value = null;
  });

  test("renders without crash with snapshot", () => {
    const { container } = render(<WorldcupBracketView />);
    expect(container.querySelector(".bracket-view")).toBeTruthy();
    expect(container.textContent).toContain("1/16 决赛");
  });

  test("renders empty state when snapshot null", () => {
    worldcupBracket.value = null;
    const { container } = render(<WorldcupBracketView />);
    expect(container.textContent).toMatch(/小组赛尚未开始|暂无数据/);
  });

  test("renders error state when bracketError set", () => {
    bracketError.value = "网络错误";
    const { container } = render(<WorldcupBracketView />);
    expect(container.textContent).toContain("网络错误");
  });
});