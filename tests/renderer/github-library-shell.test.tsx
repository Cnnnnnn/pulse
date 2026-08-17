// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { GithubLibraryHeader } from "../../src/renderer/github/GithubLibraryHeader.tsx";
import { GithubLibrarySidebar } from "../../src/renderer/github/GithubLibrarySidebar.tsx";
import { GithubAddDialog } from "../../src/renderer/github/GithubAddDialog.tsx";

vi.mock("../../src/renderer/github/GithubAddForm.tsx", () => ({
  GithubAddForm: () => <div aria-label="GitHub 项目地址">mock form</div>,
}));

const stats = {
  total: 12,
  unread: 3,
  parsed: 8,
  unchecked: 2,
  languages: ["TypeScript", "Python"],
  tags: ["ai", "frontend"],
};

describe("GitHub curated library shell", () => {
  it("renders library title, counts, and primary actions", () => {
    const onAdd = vi.fn();
    const { getByText, getByRole } = render(
      <GithubLibraryHeader
        stats={stats}
        checking={false}
        progress={{ done: 0, total: 0 }}
        onAdd={onAdd}
        onCheckUpdates={vi.fn()}
        onMarkAllSeen={vi.fn()}
        onRetryFailed={vi.fn()}
      />,
    );

    expect(getByText("我的开源库")).toBeTruthy();
    expect(getByText(/12 个项目/)).toBeTruthy();
    expect(getByText(/3 个待处理更新/)).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "添加项目" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders status filters and emits controlled filter changes", () => {
    const onFiltersChange = vi.fn();
    const filters = { status: "all", language: "", topic: "" };
    const { getByRole } = render(
      <GithubLibrarySidebar
        stats={stats}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />,
    );

    expect(getByRole("button", { name: /全部项目/ })).toBeTruthy();
    expect(getByRole("button", { name: /待处理更新/ })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /待处理更新/ }));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, status: "unread" });
  });

  it("opens a labelled add dialog and closes it through the supplied callback", () => {
    const onClose = vi.fn();
    const { getByRole, getByLabelText } = render(
      <GithubAddDialog open onClose={onClose} />,
    );

    expect(getByRole("dialog")).toBeTruthy();
    expect(getByLabelText("GitHub 项目地址")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
