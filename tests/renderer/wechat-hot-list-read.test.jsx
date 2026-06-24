// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { WechatHotList } from "../../src/renderer/wechat-hot/components/WechatHotList.jsx";

// openExternal 是 side effect, mock 掉避免真打开浏览器
vi.mock("../../src/renderer/utils/external-link.js", () => ({
  openExternal: vi.fn(),
}));

const items = [
  { rank: 1, title: "热词A", url: "https://weibo.com/a" },
  { rank: 2, title: "热词B", url: "https://weibo.com/b" },
];

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("WechatHotList 行级已读 (I6 v2)", () => {
  it("点行调 onMarkRead(title)", () => {
    const onMarkRead = vi.fn();
    const { container } = render(
      <WechatHotList items={items} readIds={{}} onMarkRead={onMarkRead} />
    );
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    fireEvent.click(rows[0]);
    expect(onMarkRead).toHaveBeenCalledWith("热词A");
  });

  it("已读词 (readIds 含) → 行带 is-read class", () => {
    const { container } = render(
      <WechatHotList items={items} readIds={{ "热词A": 1 }} />
    );
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows[0].classList.contains("is-read")).toBe(true);
    expect(rows[1].classList.contains("is-read")).toBe(false);
  });

  it("不传 readIds (默认 {}) → 无行 is-read", () => {
    const { container } = render(<WechatHotList items={items} />);
    const rows = container.querySelectorAll(".wechat-hot-list-row");
    expect(rows[0].classList.contains("is-read")).toBe(false);
  });
});
