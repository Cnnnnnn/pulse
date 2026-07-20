// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { ViewSwitcher } from "../../src/renderer/components/ViewSwitcher.jsx";
import { viewMode, setViewMode } from "../../src/renderer/store/library-view-store.js";

beforeEach(() => {
  cleanup();
  setViewMode("table");
});

describe("ViewSwitcher", () => {
  it("默认 table 高亮", () => {
    render(<ViewSwitcher />);
    expect(screen.getByLabelText("表格视图").className).toContain("active");
    expect(screen.getByLabelText("卡片视图").className).not.toContain("active");
  });
  it("点击 card 切到 card", () => {
    render(<ViewSwitcher />);
    fireEvent.click(screen.getByLabelText("卡片视图"));
    expect(viewMode.value).toBe("card");
  });
});
