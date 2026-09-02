import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("macOS ad-hoc update signing", () => {
  it("embeds a stable app identifier requirement for cross-version installs", () => {
    const source = fs.readFileSync(path.join(root, "build/after-pack.cjs"), "utf8");

    expect(source).toContain("--requirements");
    expect(source).toContain(
      'const APP_IDENTIFIER = "com.appupdatechecker.pulse"',
    );
    expect(source).toContain(
      '`=designated => identifier "${APP_IDENTIFIER}"`',
    );
  });
});
