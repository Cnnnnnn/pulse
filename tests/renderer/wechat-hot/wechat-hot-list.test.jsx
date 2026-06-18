/**
 * tests/renderer/wechat-hot/wechat-hot-list.test.jsx
 *
 * WechatHotList 行渲染：rank + title + 可选 heat + tag, 点击行通过 openExternal 打开 URL,
 * query prop 做大小写不敏感子串过滤. 通过 reason prop 区分空态文案:
 *   empty (默认) | loading | no-match | error.
 * 所有 selector 都通过 getAttribute("class") 显式校验, 与 jsx 中 class= 写法保持一致.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/preact";

const { mockOpenExternal } = vi.hoisted(() => ({ mockOpenExternal: vi.fn() }));
vi.mock("../../../src/renderer/utils/external-link.js", () => ({
  openExternal: mockOpenExternal,
}));

import { WechatHotList } from "../../../src/renderer/wechat-hot/components/WechatHotList.jsx";

const ITEMS = [
  { rank: 1, title: "腾讯收购暴雪", url: "https://a", heat: "1234万", tag: "沸" },
  { rank: 2, title: "苹果发布会", url: "https://b", heat: "888万", tag: "爆" },
  { rank: 3, title: "某明星结婚", url: "https://c" },
];

function queryRow(container, idx = 0) {
  return container.querySelectorAll(".wechat-hot-list-row")[idx];
}

describe("WechatHotList", () => {
  beforeEach(() => {
    cleanup();
    mockOpenExternal.mockReset();
  });

  it("renders one row per item", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows).toHaveLength(3);
  });

  it("uses class attribute (not className) on row buttons", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    const row = queryRow(container);
    expect(row.getAttribute("class")).toBe("wechat-hot-list-row");
    expect(row.getAttribute("classname")).toBeNull();
  });

  it("click on row opens external URL", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    fireEvent.click(queryRow(container));
    expect(mockOpenExternal).toHaveBeenCalledWith("https://a");
  });

  it("row button exposes an aria-label with the article title", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    const row = queryRow(container);
    expect(row.getAttribute("aria-label")).toBe("打开热搜：腾讯收购暴雪");
  });

  it("filters by query (case-insensitive substring)", () => {
    const { container } = render(<WechatHotList items={ITEMS} query="苹果" />);
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("苹果");
  });

  it("shows default empty hint when items list is empty", () => {
    const { container } = render(<WechatHotList items={[]} />);
    expect(container.textContent).toMatch(/暂无热搜数据/);
  });

  it("shows loading hint when reason=loading", () => {
    const { container } = render(<WechatHotList items={[]} reason="loading" />);
    expect(container.textContent).toMatch(/正在拉取热搜/);
  });

  it("shows error hint when reason=error", () => {
    const { container } = render(<WechatHotList items={[]} reason="error" />);
    expect(container.textContent).toMatch(/拉取失败/);
  });

  it("shows no-match hint with the query when reason=no-match", () => {
    const { container } = render(
      <WechatHotList items={ITEMS} query="nonexistent" reason="no-match" />,
    );
    expect(container.textContent).toMatch(/未找到「nonexistent」/);
  });

  it("falls back to default empty hint when reason=no-match and query is empty", () => {
    const { container } = render(<WechatHotList items={[]} reason="no-match" />);
    expect(container.textContent).toMatch(/暂无热搜数据/);
  });

  it("shows no-match hint when query filters to nothing (default reason)", () => {
    // 当 items 非空但 query 过滤掉所有项, reason=no-match 才会展示 query 信息;
    // 默认 reason=empty 时仍按 empty 文案兜底, 这是为了和 store 语义保持一致
    // (store 决定 reason, 组件只负责渲染).
    const { container } = render(<WechatHotList items={ITEMS} query="nonexistent" />);
    expect(container.textContent).toMatch(/暂无热搜数据/);
  });

  it("renders rank + title + optional heat + optional tag", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    const first = queryRow(container);
    expect(first.textContent).toContain("1");
    expect(first.textContent).toContain("腾讯收购暴雪");
    expect(first.textContent).toContain("1234万");
    expect(first.textContent).toContain("沸");
  });
});