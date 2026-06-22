// @vitest-environment happy-dom
/**
 * tests/renderer/food-store.test.js
 *
 * Task 9: renderer foodStore — 4 signal + setters + state machine.
 *
 * 覆盖 (跟 plan Task 9 Step 1 完全一致):
 *  - 初始 idle 态
 *  - 4 个 setter 各自更新 signal
 *  - resetFoodState 清回 idle
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  foodList,
  foodLoading,
  foodError,
  setFoodList,
  setFoodLoading,
  setFoodError,
  resetFoodState,
} from "../../src/renderer/food/foodStore.js";

describe("foodStore state machine", () => {
  beforeEach(() => resetFoodState());

  it("starts in idle state", () => {
    expect(foodList.value).toEqual([]);
    expect(foodLoading.value).toBe(false);
    expect(foodError.value).toBeNull();
  });

  it("setFoodList updates signal", () => {
    setFoodList([{ id: "1", name: "X" }]);
    expect(foodList.value).toEqual([{ id: "1", name: "X" }]);
  });

  it("setFoodLoading toggles loading", () => {
    setFoodLoading(true);
    expect(foodLoading.value).toBe(true);
    setFoodLoading(false);
    expect(foodLoading.value).toBe(false);
  });

  it("setFoodError stores error", () => {
    setFoodError("network");
    expect(foodError.value).toBe("network");
  });

  it("resetFoodState clears all", () => {
    setFoodList([{ id: "1" }]);
    setFoodLoading(true);
    setFoodError("e");
    resetFoodState();
    expect(foodList.value).toEqual([]);
    expect(foodLoading.value).toBe(false);
    expect(foodError.value).toBeNull();
  });
});
