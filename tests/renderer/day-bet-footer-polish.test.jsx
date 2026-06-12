// @vitest-environment happy-dom
/**
 * v2.10.1 polish — DayBetFooter flash / emoji / note tooltip
 *
 * 覆盖:
 *   - Fix 8: 保存成功后 footer 闪绿 1s (检测 .day-bet-flash class)
 *   - Fix 9: note 加 title={entry.note} (鼠标 hover tooltip)
 *   - Fix 10: 盈亏 emoji (✅ 盈 / ❌ 亏)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/preact";
import { DayBetFooter } from "../../src/renderer/worldcup/DayBetFooter.jsx";
import { worldcupBets } from "../../src/renderer/worldcup/betsStore.js";

describe("DayBetFooter v2.10.1 polish", () => {
  beforeEach(() => {
    worldcupBets.value = {};
    global.window.api = {
      worldcupUpsertBet: async (payload) => {
        const entry = {
          date: payload.date,
          stake: payload.stake,
          pnl: payload.pnl,
          note: payload.note || "",
          updatedAt: Date.now(),
        };
        worldcupBets.value = {
          ...worldcupBets.value,
          [payload.date]: entry,
        };
        return { ok: true, entry };
      },
    };
  });

  it("Fix 10: 盈亏 pnl>0 显示 ✅", async () => {
    worldcupBets.value = {
      "2026-06-12": { stake: 100, pnl: 120, note: "" },
    };
    const { container } = render(<DayBetFooter date="2026-06-12" />);
    const pnl = container.querySelector(".day-bet-pnl");
    expect(pnl).toBeTruthy();
    expect(pnl.textContent).toMatch(/盈亏 \+?¥120/);
    expect(pnl.textContent).toContain("✅");
    expect(pnl.classList.contains("positive")).toBe(true);
  });

  it("Fix 10: 亏 pnl<0 显示 ❌", async () => {
    worldcupBets.value = {
      "2026-06-13": { stake: 50, pnl: -30, note: "" },
    };
    const { container } = render(<DayBetFooter date="2026-06-13" />);
    const pnl = container.querySelector(".day-bet-pnl");
    expect(pnl.textContent).toMatch(/盈亏 -¥30/);
    expect(pnl.textContent).toContain("❌");
    expect(pnl.classList.contains("negative")).toBe(true);
  });

  it("Fix 9: note 加 title attribute (hover tooltip)", async () => {
    worldcupBets.value = {
      "2026-06-12": {
        stake: 100,
        pnl: 50,
        note: "阿根廷 vs 法国 加时绝杀",
      },
    };
    const { container } = render(<DayBetFooter date="2026-06-12" />);
    const note = container.querySelector(".day-bet-note");
    expect(note).toBeTruthy();
    expect(note.getAttribute("title")).toBe("阿根廷 vs 法国 加时绝杀");
  });

  it("Fix 8: 保存成功后 footer 加 .day-bet-flash class (1s)", async () => {
    // happy-dom 不会真正跑 setTimeout(1000), 但我们能验证 class 临时出现
    const { container } = render(<DayBetFooter date="2026-06-12" />);
    // 初始: 未填态
    expect(container.querySelector(".day-bet-unfilled-btn")).toBeTruthy();
    expect(container.querySelector(".day-bet-flash")).toBeNull();

    // 点开 form
    fireEvent.click(container.querySelector(".day-bet-unfilled-btn"));
    await waitFor(() => {
      expect(container.querySelector(".day-bet-form")).toBeTruthy();
    });

    // 填值 + 提交
    const inputs = container.querySelectorAll("input[type=number]");
    fireEvent.input(inputs[0], { target: { value: "100" } });
    fireEvent.input(inputs[1], { target: { value: "50" } });
    fireEvent.click(container.querySelector(".day-bet-form-actions button"));

    // 等待 IPC + signal 更新
    await waitFor(() => {
      expect(container.querySelector(".day-bet-flash")).toBeTruthy();
    });
    // footer 应该切到已填态
    expect(container.querySelector(".day-bet-stake")).toBeTruthy();
  });
});
