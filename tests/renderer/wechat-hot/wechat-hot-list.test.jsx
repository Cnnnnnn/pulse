/**
 * tests/renderer/wechat-hot/wechat-hot-list.test.jsx
 *
 * WechatHotList 行渲染：rank + title + 可选 heat + tag, 点击行通过 openExternal 打开 URL,
 * query prop 做大小写不敏感子串过滤. 空态 / 过滤后空态显示 "暂无数据".
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

  it("click on row opens external URL", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    fireEvent.click(container.querySelector(".wechat-hot-list-row"));
    expect(mockOpenExternal).toHaveBeenCalledWith("https://a");
  });

  it("filters by query (case-insensitive substring)", () => {
    const { container } = render(<WechatHotList items={ITEMS} query="苹果" />);
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("苹果");
  });

  it("shows empty hint when no items", () => {
    const { container } = render(<WechatHotList items={[]} />);
    expect(container.textContent).toMatch(/暂无数据/);
  });

  it("shows empty hint when query filters to nothing", () => {
    const { container } = render(<WechatHotList items={ITEMS} query="nonexistent" />);
    expect(container.textContent).toMatch(/暂无数据/);
  });

  it("renders rank + title + optional heat + optional tag", () => {
    const { container } = render(<WechatHotList items={ITEMS} />);
    const first = container.querySelector(".wechat-hot-list-row");
    expect(first.textContent).toContain("1");
    expect(first.textContent).toContain("腾讯收购暴雪");
    expect(first.textContent).toContain("1234万");
    expect(first.textContent).toContain("沸");
  });
});