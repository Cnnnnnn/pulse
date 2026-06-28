// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/preact";
import { MetalCard } from "../../../src/renderer/metals/MetalCard.jsx";
import {
  config, quoteCache, fxCache, resetMetalStore,
} from "../../../src/renderer/metals/metalStore.js";

describe("MetalCard skeleton state", () => {
  beforeEach(() => {
    resetMetalStore();
  });

  it("quote 不存在时 → 渲染骨架屏 (.skeleton-price + .skeleton-change), 不渲染 '加载中' 文本", () => {
    config.value = { watchedIds: ["AG9999"], holdings: {}, deletedIds: [] };
    quoteCache.value = { data: {}, errors: {}, fetchedAt: null };
    fxCache.value = { rate: null, fetchedAt: null };

    const metal = {
      id: "AG9999",
      name: "国内白银 AG9999",
      shortName: "AG9999",
      unit: "g",
      currency: "CNY",
      historySecid: "118.AG9999",
      proxyLabel: null,
      unitDivisor: 1000,
    };
    const { container } = render(<MetalCard metal={metal} onEdit={() => {}} />);
    expect(container.querySelector(".skeleton-price")).not.toBeNull();
    expect(container.querySelector(".skeleton-change")).not.toBeNull();
    expect(container.textContent).not.toMatch(/加载中\.\.\./);
  });
});
