import { describe, expect, it } from "vitest";
import {
  beginDataRequest,
  createDataState,
  hasUsableData,
  isRefreshingWithData,
  rejectData,
  resolveData,
} from "../../src/shared/data-state.ts";

describe("data-state contract", () => {
  it("keeps a successful value while a refresh is in flight", () => {
    const ready = resolveData(createDataState([]), ["cached"], { fetchedAt: 100 }, 100);
    const loading = beginDataRequest(ready, 200);
    expect(loading.phase).toBe("loading");
    expect(loading.data).toEqual(["cached"]);
    expect(isRefreshingWithData(loading)).toBe(true);
    expect(hasUsableData(loading)).toBe(true);
  });

  it("turns a failed refresh into stale instead of discarding data", () => {
    const ready = resolveData(createDataState({ count: 0 }), { count: 3 }, { source: "live", fetchedAt: 100 }, 100);
    const stale = rejectData(beginDataRequest(ready, 200), "network failed", 250);
    expect(stale.phase).toBe("stale");
    expect(stale.data).toEqual({ count: 3 });
    expect(stale.error).toBe("network failed");
    expect(hasUsableData(stale)).toBe(true);
  });

  it("uses error for the first failed load", () => {
    const failed = rejectData(beginDataRequest(createDataState(null), 100), "offline", 120);
    expect(failed.phase).toBe("error");
    expect(hasUsableData(failed)).toBe(false);
  });
});
