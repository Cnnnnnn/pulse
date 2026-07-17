import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/api.js", () => ({
  api: { getGameDeals: vi.fn() },
}));

import {
  PLATFORMS,
  activePlatform,
} from "../../src/renderer/games/gamesStore.js";

describe("gamesStore 平台默认值", () => {
  it("不提供全部平台标签并默认选择 Steam", () => {
    expect(PLATFORMS.map((platform) => platform.key)).toEqual([
      "steam",
      "epic",
      "xbox",
      "playstation",
      "switch",
    ]);
    expect(activePlatform.value).toBe("steam");
  });
});
