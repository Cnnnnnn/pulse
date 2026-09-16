import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 会被提升到文件顶部，工厂引用的 mock 必须用 vi.hoisted 一并提升，
// 否则报 "Cannot access 'handlerFn' before initialization"。
const { showToast, openConfirm, handlerFn } = vi.hoisted(() => ({
  showToast: vi.fn(),
  openConfirm: vi.fn(),
  handlerFn: vi.fn(),
}));

vi.mock("../../../src/renderer/store/toast-store.ts", () => ({
  showToast,
}));

vi.mock("../../../src/renderer/store/confirmStore.ts", () => ({
  openConfirm,
}));

// 只替换会被真实执行的 handler，避免副作用；确认文案走真实 builder
vi.mock("../../../src/renderer/assistant/assistant-action-handlers.ts", async (importOriginal) => {
  const actual = (await importOriginal()) as {
    RENDERER_ACTION_HANDLERS: Record<string, unknown>;
    CONFIRM_MESSAGE_BUILDERS: Record<string, unknown>;
  };
  return {
    ...actual,
    RENDERER_ACTION_HANDLERS: {
      refresh_concerts: handlerFn,
      upgrade_app: handlerFn,
    },
  };
});

import { executeRendererAction } from "../../../src/renderer/assistant/assistant-actions.ts";
import { TOOL_POLICY } from "../../../src/shared/assistant-tool-policy.ts";

type Action = Parameters<typeof executeRendererAction>[0];

beforeEach(() => {
  showToast.mockReset();
  openConfirm.mockReset();
  handlerFn.mockReset();
});

describe("executeRendererAction — 策略三态", () => {
  it("allow 档: 直接执行, 不弹确认", async () => {
    await executeRendererAction({ tool: "refresh_concerts", params: {} } as Action);

    expect(handlerFn).toHaveBeenCalledTimes(1);
    expect(openConfirm).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("confirm 档: 用户确认后执行", async () => {
    openConfirm.mockResolvedValue(true);

    await executeRendererAction({
      tool: "upgrade_app",
      params: { appName: "TestApp" },
    } as Action);

    expect(openConfirm).toHaveBeenCalledTimes(1);
    expect(handlerFn).toHaveBeenCalledTimes(1);
  });

  it("confirm 档: 用户取消则不执行并提示", async () => {
    openConfirm.mockResolvedValue(false);

    await executeRendererAction({
      tool: "upgrade_app",
      params: { appName: "TestApp" },
    } as Action);

    expect(openConfirm).toHaveBeenCalledTimes(1);
    expect(handlerFn).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("已取消操作", "info", 2000);
  });

  it("deny 档: 拒绝执行并提示理由", async () => {
    const original = TOOL_POLICY.refresh_concerts.risk;
    TOOL_POLICY.refresh_concerts.risk = "deny";
    try {
      await executeRendererAction({ tool: "refresh_concerts", params: {} } as Action);

      expect(handlerFn).not.toHaveBeenCalled();
      expect(openConfirm).not.toHaveBeenCalled();
      const [msg, type] = showToast.mock.calls[0] as [string, string];
      expect(msg).toContain("操作被拒绝");
      expect(type).toBe("error");
    } finally {
      TOOL_POLICY.refresh_concerts.risk = original;
    }
  });

  it("未声明工具: fail-closed 拒绝执行", async () => {
    await executeRendererAction({ tool: "not_a_real_tool", params: {} } as Action);

    expect(handlerFn).not.toHaveBeenCalled();
    const [msg] = showToast.mock.calls[0] as [string];
    expect(msg).toContain("undeclared_tool:not_a_real_tool");
  });
});
