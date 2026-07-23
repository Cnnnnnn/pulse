import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const PACKAGE_PATH = path.join(ROOT_DIR, "package.json");
const BUILD_SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "build-main.cjs");
const MAIN_BUNDLE_PATH = path.join(ROOT_DIR, "dist", "main", "index.js");
const cjsRequire = createRequire(import.meta.url);

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
}

function requireMainBundleWithElectronStub() {
  const electronPath = cjsRequire.resolve("electron");
  const previousElectronEntry = cjsRequire.cache[electronPath];
  const cachedBefore = new Set(Object.keys(cjsRequire.cache));

  cjsRequire.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  };

  try {
    const bundleCacheKey = cjsRequire.resolve(MAIN_BUNDLE_PATH);
    delete cjsRequire.cache[bundleCacheKey];
    cjsRequire(MAIN_BUNDLE_PATH);
  } finally {
    for (const cacheKey of Object.keys(cjsRequire.cache)) {
      if (!cachedBefore.has(cacheKey)) delete cjsRequire.cache[cacheKey];
    }
    if (previousElectronEntry) {
      cjsRequire.cache[electronPath] = previousElectronEntry;
    } else {
      delete cjsRequire.cache[electronPath];
    }
  }
}

describe("Electron main bundle contract", () => {
  it("points package.json main at dist/main/index.js", () => {
    expect(readPackageJson().main).toBe("dist/main/index.js");
  });

  it("defines build:main through scripts/build-main.cjs", () => {
    expect(readPackageJson().scripts["build:main"]).toBe(
      "node scripts/build-main.cjs",
    );
  });

  it("builds a non-empty dist/main/index.js", () => {
    execFileSync(process.execPath, [BUILD_SCRIPT_PATH], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });

    expect(fs.existsSync(MAIN_BUNDLE_PATH)).toBe(true);
    expect(fs.statSync(MAIN_BUNDLE_PATH).size).toBeGreaterThan(0);
  });

  it("loads the main bundle with Electron stubbed", () => {
    execFileSync(process.execPath, [BUILD_SCRIPT_PATH], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });

    expect(() => requireMainBundleWithElectronStub()).not.toThrow();
  });
});
