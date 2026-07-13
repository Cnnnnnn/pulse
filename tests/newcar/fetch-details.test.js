/**
 * tests/newcar/fetch-details.test.js
 *
 * P1 详情占位验收: fetchCarDetails 返回 null (失败静默降级, 不阻断主列表).
 */

import { describe, it, expect } from "vitest";
import { fetchCarDetails } from "../../src/newcar/fetch-details.js";

describe("fetchCarDetails (P1 占位)", () => {
  it("返回 Promise<null>", async () => {
    const r = fetchCarDetails("2026-byd-han-ev-001");
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toBeNull();
  });

  it("任意 id 均返 null, 不抛异常", async () => {
    await expect(fetchCarDetails("")).resolves.toBeNull();
    await expect(fetchCarDetails(null)).resolves.toBeNull();
    await expect(fetchCarDetails("x")).resolves.toBeNull();
  });
});
