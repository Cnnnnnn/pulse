// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalCard } from "../../../src/renderer/metals/MetalCard.jsx";
import {
  config, quoteCache, fxCache,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalCard polish", () => {
  beforeEach(() => {
    // 直接重置 signal value (resetMetalStore 是 Task 8 才加的)
    config.value = { watchedIds: [], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };
  });

  it("无持仓时: '录入持仓' 是文字链样式 (class metal-add-holding-text)", () => {
    config.value = { watchedIds: ["XAU"], holdings: { XAU: null }, deletedIds: [] };
    quoteCache.value = {
      data: { XAU: { id: "XAU", price: 1900, prevClose: 1890, currency: "USD", unit: "oz", quoteTime: Date.now() } },
      errors: {},
      fetchedAt: Date.now(),
    };
    fxCache.value = { rate: 7.18, fetchedAt: Date.now() };
    const metal = {
      id: "XAU",
      name: "现货黄金",
      shortName: "黄金",
      unit: "oz",
      currency: "USD",
      historySecid: "113.AU2608",
      proxyLabel: "沪金2608代理",
      unitDivisor: 1,
    };
    const { container } = render(<MetalCard metal={metal} onEdit={() => {}} />);
    const link = container.querySelector(".metal-add-holding-text");
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/录入持仓/);
  });
});