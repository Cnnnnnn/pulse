import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

describe("cross-platform build scripts", () => {
  it("build-main uses the esbuild API instead of spawning a package binary", () => {
    const source = fs.readFileSync(path.join(root, "scripts/build-main.cjs"), "utf8");

    expect(source).not.toContain("esbuild/bin/esbuild");
    expect(source).not.toContain("execFileSync");
    expect(source).toContain("esbuild.buildSync");
  });

  it("renderer and preload builds run through Node wrappers", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["build:renderer"]).toBe(
      "node scripts/build-renderer.cjs",
    );
    expect(packageJson.scripts["build:preload"]).toBe(
      "node scripts/build-preload.cjs",
    );

    const renderer = fs.readFileSync(
      path.join(root, "scripts/build-renderer.cjs"),
      "utf8",
    );
    const cleaner = fs.readFileSync(
      path.join(root, "scripts/clean-renderer-css-chunks.cjs"),
      "utf8",
    );
    const preload = fs.readFileSync(
      path.join(root, "scripts/build-preload.cjs"),
      "utf8",
    );

    expect(renderer).toContain("esbuild.build");
    expect(renderer).toContain("cleanRendererCssChunks()");
    expect(renderer).toContain("mergeRendererCss()");
    expect(cleaner).toContain("require.main === module");
    expect(cleaner).not.toContain("process.exit(0)");
    expect(preload).toContain("esbuild.buildSync");
  });
});
