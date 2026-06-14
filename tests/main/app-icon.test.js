/**
 * tests/main/app-icon.test.js
 *
 * Phase 25 v5: sips 读 .icns → PNG Buffer → base64 dataUrl.
 *   Electron 35 arm64 上 nativeImage.createFromBuffer / getFileIcon / createFromPath
 *   全部 SIGTRAP. 唯一稳定的路径: sips CLI → Buffer → 直接 base64.
 *
 * 5 case: sips 成功 / sips 失败 / 找不到 .icns / bundle 缺 / 空路径.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAppIcon,
  findIcnsPath,
  _clearIconCache,
} from "../../src/main/app-icon.js";

function makeFs(overrides = {}) {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ""),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(() => {}),
    ...overrides,
  };
}

function makeApp() {
  return { getPath: vi.fn(() => "/tmp") };
}

const fakeSipsOk = { status: 0, stderr: "" };
const fakeSipsFail = { status: 1, stderr: "sips: cannot open" };

describe("getAppIcon (Phase 25 v5)", () => {
  beforeEach(() => {
    _clearIconCache();
  });

  it("sips PNG buffer → base64 dataUrl", async () => {
    let pngOutPath = null;
    const fs = makeFs({
      readFileSync: (p) => {
        if (p.endsWith("Info.plist")) return "<plist/>"; // plist 缺 CFBundleIconFile
        if (pngOutPath && p === pngOutPath)
          return Buffer.from("FAKE_PNG_BUFFER");
        return "";
      },
      readdirSync: () => ["icon.icns"],
    });
    const _app = makeApp();
    const _spawn = vi.fn((sipsPath, args) => {
      pngOutPath = args[args.length - 1];
      require("fs").writeFileSync(pngOutPath, "FAKE_PNG_BUFFER");
      return fakeSipsOk;
    });
    const r = await getAppIcon("/Applications/Cursor.app", {
      fs,
      app: _app,
      spawn: _spawn,
    });
    expect(r).toBe(
      "data:image/png;base64," +
        Buffer.from("FAKE_PNG_BUFFER").toString("base64"),
    );
    expect(_spawn).toHaveBeenCalled();
  });

  it("sips 失败 → null", async () => {
    const fs = makeFs({
      readFileSync: () => "<plist/>",
      readdirSync: () => ["icon.icns"],
    });
    const _app = makeApp();
    const r = await getAppIcon("/Applications/Cursor.app", {
      fs,
      app: _app,
      spawn: vi.fn(() => fakeSipsFail),
    });
    expect(r).toBeNull();
  });

  it("找不到 .icns → null", async () => {
    const fs = makeFs({
      readFileSync: () => "<plist/>",
      readdirSync: () => ["other.txt", "a.png"],
    });
    const _app = makeApp();
    const r = await getAppIcon("/Applications/Cursor.app", {
      fs,
      app: _app,
      spawn: vi.fn(() => fakeSipsOk),
    });
    expect(r).toBeNull();
  });

  it("bundle 不存在 → null", async () => {
    const fs = makeFs({ existsSync: vi.fn(() => false) });
    const _app = makeApp();
    expect(
      await getAppIcon("/Applications/Gone.app", { fs, app: _app }),
    ).toBeNull();
  });

  it("空路径 → null", async () => {
    const fs = makeFs();
    const _app = makeApp();
    expect(await getAppIcon("", { fs, app: _app })).toBeNull();
    expect(await getAppIcon(null, { fs, app: _app })).toBeNull();
  });
});

describe("findIcnsPath (helper)", () => {
  it("Info.plist 拿 CFBundleIconFile", () => {
    const fs = makeFs({
      existsSync: (p) => p.includes("Info.plist") || p.includes("AppIcon.icns"),
      readFileSync: () => "<key>CFBundleIconFile</key><string>AppIcon</string>",
    });
    expect(findIcnsPath("/Applications/X.app", { fs })).toBe(
      "/Applications/X.app/Contents/Resources/AppIcon.icns",
    );
  });

  it("Info.plist 缺字段 → Resources glob", () => {
    const fs = makeFs({
      existsSync: (p) => p.includes("Info.plist") || p.endsWith("Resources"),
      readFileSync: () => "<plist/>",
      readdirSync: () => ["other.txt", "icon.icns"],
    });
    expect(findIcnsPath("/Applications/X.app", { fs })).toBe(
      "/Applications/X.app/Contents/Resources/icon.icns",
    );
  });

  it("都没 → null", () => {
    const fs = makeFs({
      existsSync: () => false,
      readFileSync: () => "<plist/>",
      readdirSync: () => ["a.png"],
    });
    expect(findIcnsPath("/Applications/X.app", { fs })).toBeNull();
  });
});

/**
 * Main 端 cache + in-flight 去重测试.
 *
 * 启动期 perf 修: 13 个 AppRow 同时挂载时, 之前是 13 次同步 sips spawnSync (≈ 650ms
 * 卡 main process event loop). 加 cache + in-flight 之后:
 *   - 第二次同 bundle → 0 spawnSync (cache hit)
 *   - 并发同 bundle → 1 次 sips (in-flight 复用)
 */
describe("getAppIcon cache + in-flight dedup", () => {
  beforeEach(() => {
    _clearIconCache();
  });

  function makeSipsSpy() {
    return vi.fn((sipsPath, args) => {
      const out = args[args.length - 1];
      require("fs").writeFileSync(out, "FAKE_PNG_BUFFER");
      return fakeSipsOk;
    });
  }

  function makeOkEnv() {
    return {
      fs: makeFs({
        readFileSync: (p) => {
          if (p.endsWith("Info.plist")) return "<plist/>";
          return Buffer.from("FAKE_PNG_BUFFER");
        },
        readdirSync: () => ["icon.icns"],
      }),
      app: makeApp(),
      spawn: makeSipsSpy(),
    };
  }

  it("第二次同 bundle → 命中 cache, sips 0 次", async () => {
    const deps = makeOkEnv();
    const r1 = await getAppIcon("/Applications/Cursor.app", deps);
    const callsAfterFirst = deps.spawn.mock.calls.length;
    const r2 = await getAppIcon("/Applications/Cursor.app", deps);
    expect(r1).toBe(r2); // 同一字符串
    expect(r1).toMatch(/^data:image\/png;base64,/);
    expect(deps.spawn).toHaveBeenCalledTimes(callsAfterFirst);
    // callsAfterFirst 是 1, 第 2 次应当不再 call spawn
    expect(callsAfterFirst).toBe(1);
  });

  it("不同 bundle → 各跑一次 sips, 互不污染", async () => {
    const deps = makeOkEnv();
    const r1 = await getAppIcon("/Applications/A.app", deps);
    const r2 = await getAppIcon("/Applications/B.app", deps);
    expect(r1).toMatch(/^data:image\/png;base64,/);
    expect(r2).toMatch(/^data:image\/png;base64,/);
    expect(r1).toBe(r2); // 同样的 fake PNG buffer, base64 后相同 — 但 cache 路径不同
    expect(deps.spawn).toHaveBeenCalledTimes(2);
  });

  it("并发同 bundle → 1 次 sips (in-flight 复用)", async () => {
    const deps = makeOkEnv();
    // 13 个 AppRow 同时挂载的模拟
    const promises = [];
    for (let i = 0; i < 13; i++) {
      promises.push(getAppIcon("/Applications/Cursor.app", deps));
    }
    const results = await Promise.all(promises);
    // 13 个并发请求应共享同一次 sips 调用
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    // 13 个结果都成功
    for (const r of results) {
      expect(r).toMatch(/^data:image\/png;base64,/);
    }
  });

  it("并发结束后, 后续单次请求 → 命中 cache, 0 sips", async () => {
    const deps = makeOkEnv();
    await Promise.all([
      getAppIcon("/Applications/Cursor.app", deps),
      getAppIcon("/Applications/Cursor.app", deps),
    ]);
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    // 并发结束 → cache 已填 → 后续直接 hit
    await getAppIcon("/Applications/Cursor.app", deps);
    expect(deps.spawn).toHaveBeenCalledTimes(1);
  });

  it("负缓存: sips 失败 → 不入 cache, 下次再试", async () => {
    const deps = makeOkEnv();
    // 第 1 次: sips 失败
    deps.spawn.mockImplementationOnce(() => fakeSipsFail);
    const r1 = await getAppIcon("/Applications/Cursor.app", deps);
    expect(r1).toBeNull();
    // 第 2 次: sips 成功 (负缓存不应卡住)
    deps.spawn.mockImplementationOnce((sipsPath, args) => {
      const out = args[args.length - 1];
      require("fs").writeFileSync(out, "FAKE_PNG_BUFFER");
      return fakeSipsOk;
    });
    const r2 = await getAppIcon("/Applications/Cursor.app", deps);
    expect(r2).toMatch(/^data:image\/png;base64,/);
    expect(deps.spawn).toHaveBeenCalledTimes(2);
  });

  it("负缓存: bundle 不存在 → 不入 cache, 下次再试", async () => {
    let exists = false;
    const deps = {
      fs: makeFs({ existsSync: () => exists }),
      app: makeApp(),
      spawn: makeSipsSpy(),
    };
    const r1 = await getAppIcon("/Applications/Ghost.app", deps);
    expect(r1).toBeNull();
    expect(deps.spawn).not.toHaveBeenCalled();
    // 用户后来装了 app → 第二次应再试
    exists = true;
    deps.fs = makeFs({
      existsSync: () => true,
      readFileSync: (p) => {
        if (p.endsWith("Info.plist")) return "<plist/>";
        return Buffer.from("FAKE_PNG_BUFFER");
      },
      readdirSync: () => ["icon.icns"],
    });
    const r2 = await getAppIcon("/Applications/Ghost.app", deps);
    expect(r2).toMatch(/^data:image\/png;base64,/);
  });

  it("空路径 → null, 不入 cache 不入 in-flight", async () => {
    const deps = makeOkEnv();
    expect(await getAppIcon("", deps)).toBeNull();
    expect(await getAppIcon(null, deps)).toBeNull();
    expect(await getAppIcon(undefined, deps)).toBeNull();
    expect(deps.spawn).not.toHaveBeenCalled();
    // 之后真实路径仍能正常加载 (空路径没污染 cache)
    const r = await getAppIcon("/Applications/Real.app", deps);
    expect(r).toMatch(/^data:image\/png;base64,/);
  });

  it("_clearIconCache 之后 → cache 清空, 下次重新跑 sips", async () => {
    const deps = makeOkEnv();
    await getAppIcon("/Applications/Cursor.app", deps);
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    await getAppIcon("/Applications/Cursor.app", deps);
    expect(deps.spawn).toHaveBeenCalledTimes(1);
    _clearIconCache();
    await getAppIcon("/Applications/Cursor.app", deps);
    expect(deps.spawn).toHaveBeenCalledTimes(2);
  });
});
