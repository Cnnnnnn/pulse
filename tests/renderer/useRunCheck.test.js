// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/preact";
import { useRunCheck } from "../../src/renderer/hooks/useRunCheck.js";

const mockRunCheck = vi.fn();
const mockShowToast = vi.fn();

vi.mock("../../src/renderer/api.js", () => ({
  api: {
    get versionsRunCheck() {
      return mockRunCheck;
    },
  },
}));

vi.mock("../../src/renderer/store/toast-store.js", () => ({
  showToast: (...args) => mockShowToast(...args),
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
    mockRunCheck.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useRunCheck());
    act(() => {
      result.current.run();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(mockRunCheck).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ started: true });
    });
  });

  it("完成后 2s loading 复位为 false", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isLoading).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("started:true 不弹 toast", async () => {
    mockRunCheck.mockResolvedValue({ started: true });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("started:false 弹 error toast 显示 error 字段", async () => {
    mockRunCheck.mockResolvedValue({
      started: false,
      error: "config parse failed",
    });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      "检查失败: config parse failed",
      "error",
      3500,
    );
  });

  it("started:false 无 error 字段时兜底「未知错误」", async () => {
    mockRunCheck.mockResolvedValue({ started: false });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      "检查失败: 未知错误",
      "error",
      3500,
    );
  });

  it("IPC 抛异常时也弹 error toast (防 preload 漏暴露回归)", async () => {
    mockRunCheck.mockRejectedValue(
      new Error("versionsRunCheck is not a function"),
    );
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      "检查失败: versionsRunCheck is not a function",
      "error",
      3500,
    );
  });

  it("started:false + reason:'already_running' → info toast '检查进行中' (不弹 error)", async () => {
    mockRunCheck.mockResolvedValue({
      started: false,
      reason: "already_running",
    });
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      "检查进行中, 请稍候…",
      "info",
      2500,
    );
    // 不应弹 error.
    const errorCalls = mockShowToast.mock.calls.filter((c) => c[1] === "error");
    expect(errorCalls).toHaveLength(0);
  });

  it("异常路径下 loading 仍 2s 后复位", async () => {
    mockRunCheck.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useRunCheck());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isLoading).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isLoading).toBe(false);
  });
});
