import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");
const PACKAGE_PATH = path.join(ROOT_DIR, "package.json");
const BUILD_SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "build-main.cjs");
// 构建到本文件私有的临时路径（PULSE_BUILD_MAIN_OUT）。vitest 并发跑多个
// contract 测试文件时，若都构建到共享 dist/main/index.js，后写的 build 会
// 覆盖/截断先写方正在读或 require 的文件 —— 今天的 flaky 来源。放 dist/ 下
// 保证 require 时裸包仍能向上解析到仓库 node_modules（packages: "external"）。
const TMP_DIR = fs.mkdtempSync(
  path.join(ROOT_DIR, "dist", "main-bundle-contract-"),
);
const MAIN_BUNDLE_PATH = path.join(TMP_DIR, "index.js");
const cjsRequire = createRequire(import.meta.url);

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

let bundleBuilt = false;

function buildBundle() {
  if (bundleBuilt) return;
  const prev = process.env.PULSE_BUILD_MAIN_OUT;
  process.env.PULSE_BUILD_MAIN_OUT = MAIN_BUNDLE_PATH;
  try {
    execFileSync("node", [BUILD_SCRIPT_PATH], {
      cwd: ROOT_DIR,
      stdio: "pipe",
    });
  } finally {
    if (prev === undefined) {
      delete process.env.PULSE_BUILD_MAIN_OUT;
    } else {
      process.env.PULSE_BUILD_MAIN_OUT = prev;
    }
  }
  bundleBuilt = true;
}

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

  it("build produces a non-empty main bundle", () => {
    buildBundle();

    expect(fs.existsSync(MAIN_BUNDLE_PATH)).toBe(true);
    expect(fs.statSync(MAIN_BUNDLE_PATH).size).toBeGreaterThan(0);
  });

  it("loads the produced main bundle with Electron stubbed", () => {
    buildBundle();

    expect(() => requireMainBundleWithElectronStub()).not.toThrow();
  });
});
