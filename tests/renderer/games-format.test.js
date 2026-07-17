import { describe, expect, it } from "vitest";
import {
  fmtPrice,
  fmtCnyReference,
  promotionTypeLabel,
} from "../../src/renderer/games/format.js";

describe("fmtPrice", () => {
  it("USD/EUR/GBP/CNY 使用 Intl 风格", () => {
    expect(fmtPrice(12.34, "USD")).toBe("$12.34");
    expect(fmtPrice(12.34, "EUR")).toBe("€12.34");
    expect(fmtPrice(12.34, "GBP")).toBe("£12.34");
    expect(fmtPrice(12.34, "CNY")).toBe("¥12.34");
  });

  it("JPY 显示 JPY 前缀且 0 位小数", () => {
    expect(fmtPrice(6500, "JPY")).toBe("JPY 6,500");
  });

  it("未知或非法币种安全降级", () => {
    expect(fmtPrice(12.34, "XXX")).toBe("XXX 12.34");
    expect(fmtPrice(12.34, "us")).toBe("US 12.34");
    expect(fmtPrice(12.34, null)).toBe("12.34");
    expect(fmtPrice(null, "USD")).toBe("—");
    expect(fmtPrice(NaN, "USD")).toBe("—");
  });
});

describe("fmtCnyReference", () => {
  const fx = {
    rates: { USD: 7.2, EUR: 7.8, JPY: 0.048 },
    date: "2026-07-17",
    fetchedAt: "2026-07-17T00:00:00.000Z",
    stale: false,
  };

  it("非 CNY 且有 rate 时返回约 ¥xx.xx", () => {
    expect(fmtCnyReference(10, "USD", fx)).toBe("约 ¥72.00");
    expect(fmtCnyReference(1000, "JPY", fx)).toBe("约 ¥48.00");
  });

  it("CNY 不重复显示参考价", () => {
    expect(fmtCnyReference(10, "CNY", fx)).toBe("");
  });

  it("未知或缺失 rate 返回空字符串", () => {
    expect(fmtCnyReference(10, "GBP", fx)).toBe("");
    expect(fmtCnyReference(10, "USD", null)).toBe("");
    expect(fmtCnyReference(10, "USD", { rates: {} })).toBe("");
  });

  it("非法价格返回空字符串", () => {
    expect(fmtCnyReference(-1, "USD", fx)).toBe("");
    expect(fmtCnyReference(NaN, "USD", fx)).toBe("");
    expect(fmtCnyReference(null, "USD", fx)).toBe("");
  });
});

describe("promotionTypeLabel", () => {
  it("映射四种活动类型", () => {
    expect(promotionTypeLabel("giveaway")).toBe("免费入库");
    expect(promotionTypeLabel("key")).toBe("Key 赠送");
    expect(promotionTypeLabel("free-weekend")).toBe("免费周末");
    expect(promotionTypeLabel("free-play-days")).toBe("限时试玩");
  });

  it("未知类型回退为免费活动", () => {
    expect(promotionTypeLabel("unknown")).toBe("免费活动");
    expect(promotionTypeLabel(null)).toBe("免费活动");
  });
});
