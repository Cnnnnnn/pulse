// @vitest-environment happy-dom
/**
 * P61 Task 4: ConfigImportModal diff 表格 + 字段勾选.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/preact";
import { ConfigImportModal } from "../../src/renderer/components/ConfigImportModal.jsx";
import { api } from "../../src/renderer/api.js";

// mock showToast 避免依赖 store
vi.mock("../../src/renderer/store.js", () => ({
  showToast: vi.fn(),
}));

describe("ConfigImportModal", () => {
  beforeEach(() => {
    cleanup();
    vi.spyOn(api, "configImportLoad").mockResolvedValue({
      ok: true,
      diff: [
        { field: "watchlist", status: "changed", currentCount: 5, incomingCount: 7, summary: "内容不同 (+2)" },
        { field: "reminders", status: "added", currentCount: 0, incomingCount: 3, summary: "新增 3 项" },
        { field: "funds", status: "same", currentCount: 2, incomingCount: 2, summary: "无变化" },
      ],
      fields: {
        watchlist: [{ type: "app", ref: "A" }],
        reminders: [{ id: "r1" }],
        funds: { holdings: [] },
      },
      filePath: "/tmp/x.json",
    });
    vi.spyOn(api, "configImportApply").mockResolvedValue({
      ok: true,
      applied: ["watchlist", "reminders"],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("打开后加载 diff, 显示每行字段+状态+摘要", async () => {
    render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("关注列表")).toBeTruthy());
    expect(screen.getByText("提醒")).toBeTruthy();
    expect(screen.getByText(/内容不同/)).toBeTruthy();
  });

  it("默认勾选非 same/removed 的字段, same 默认不勾", async () => {
    render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("关注列表")).toBeTruthy());
    const wlCheckbox = screen.getByLabelText("watchlist");
    const fundsCheckbox = screen.getByLabelText("funds");
    expect(wlCheckbox.checked).toBe(true);
    expect(fundsCheckbox.checked).toBe(false);
  });

  it("点导入 → 只提交勾选字段 (取消勾选的不传)", async () => {
    render(<ConfigImportModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("关注列表")).toBeTruthy());
    // 取消勾选 reminders
    fireEvent.click(screen.getByLabelText("reminders"));
    fireEvent.click(screen.getByRole("button", { name: /导入/ }));
    await waitFor(() => expect(api.configImportApply).toHaveBeenCalled());
    const arg = api.configImportApply.mock.calls[0][0];
    expect(arg.fields.watchlist).toBeDefined();
    expect(arg.fields.reminders).toBeUndefined(); // 被取消
  });

  it("导入成功后调用 onClose", async () => {
    const onClose = vi.fn();
    render(<ConfigImportModal onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("关注列表")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /导入/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("取消按钮调用 onClose", async () => {
    const onClose = vi.fn();
    render(<ConfigImportModal onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("关注列表")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /取消/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
