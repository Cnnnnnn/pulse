// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { useRunCheck } from "../../src/renderer/hooks/useRunCheck.js";

const mockRunCheck = vi.fn();

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsRunCheck() { return mockRunCheck; },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

describe("useRunCheck", () => {
  it("初始 loading 为 false", () => {
    const { result } = renderHook(() => useRunCheck());
    expect(result.current.isLoading).toBe(false);
  });

  it("run() 调用 api.versionsRunCheck 并置 loading=true", async () => {
    let resolve;
    mockRunCheck.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useRunCheck());
    act(() => { result.current.run(); });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ started: true }); });
  });

  it("完成后 2s loading 复位为 false", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => { await result.current.run(); });
    expect(result.current.isLoading).toBe(true);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.isLoading).toBe(false);
  });
});
