import { describe, it, expect } from "vitest";
import {
  navHistoryCache,
  loadFundNavHistory,
} from "../../src/renderer/funds/fundStore.js";

describe("loadFundNavHistory (renderer cache)", () => {
  it("caches series by code via fake api", async () => {
    const fakeApi = {
      fundsNavHistory: async () => ({ ok: true, series: [{ date: "2026-07-10", nav: 1.2 }] }),
    };
    const r = await loadFundNavHistory(fakeApi, "000001");
    expect(r.ok).toBe(true);
    expect(navHistoryCache.value["000001"].series.length).toBe(1);
  });
  it("empty code returns not ok", async () => {
    const r = await loadFundNavHistory({}, "");
    expect(r.ok).toBe(false);
  });
});
