import { describe, expect, it } from "vitest";
import {
  getAppBundleCandidates,
  resolveExistingAppBundle,
} from "../../src/utils/app-paths.ts";

describe("app bundle aliases", () => {
  it("puts the configured bundle before unique non-empty aliases", () => {
    expect(
      getAppBundleCandidates("MiniMax Design.app", {
        bundle_aliases: ["MiniMax Hub.app", "MiniMax Hub.app", ""],
      }),
    ).toEqual(["MiniMax Design.app", "MiniMax Hub.app"]);
  });

  it("falls back to a legacy bundle when the current bundle is absent", () => {
    const resolved = resolveExistingAppBundle(
      "MiniMax Design.app",
      { bundle_aliases: ["MiniMax Hub.app"] },
      (bundlePath) => bundlePath === "/Applications/MiniMax Hub.app",
    );

    expect(resolved).toBe("MiniMax Hub.app");
  });
});
