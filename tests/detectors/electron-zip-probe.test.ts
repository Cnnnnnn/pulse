/**
 * tests/detectors/electron-zip-probe.test.js
 */
import { describe, it, expect } from "vitest";
import { electron_zip_probe } from "../../src/detectors/electron-zip-probe.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";
import { REASONS } from "../../src/detectors/errors.js";

describe("electron_zip_probe", () => {
  it("无 baseUrl → no_version", async () => {
    await expect(
      new electron_zip_probe({ product: "MiniMax Code" }).detect(
        makeCtx({ appCfg: { name: "MiniMax Code" } }),
      ),
    ).rejects.toMatchObject({ reason: REASONS.NO_VERSION });
  });

  it("从 seed 向上探测到最新 patch", async () => {
    const http = new MockHttp({
      head: [
        { status: 200 }, // 3.0.37 exists (seed check)
        { status: 200 }, // 3.0.38
        { status: 200 }, // 3.0.39
        { status: 404 }, // 3.0.40
      ],
    });
    const det = new electron_zip_probe({
      baseUrl: "https://cdn.example.com/release",
      product: "MiniMax Code",
      seed_version: "3.0.37",
    });
    const r = await det.detect(
      makeCtx({ http, arch: "arm64", appCfg: { name: "MiniMax Code" } }),
    );
    expect(r.version).toBe("3.0.39");
    expect(r.confidence).toBe("medium");
    expect(r.note).toContain("zip probe");
    expect(http.headCalls).toHaveLength(4);
    expect(http.headCalls[0].url).toContain(
      "MiniMax%20Code-3.0.37-arm64-mac.zip",
    );
  });

  it("seed 在 CDN 不存在时向下回退再向上探测", async () => {
    const http = new MockHttp({
      head: [
        { status: 404 }, // 3.0.50 missing
        { status: 404 }, // 3.0.49
        { status: 200 }, // 3.0.48
        { status: 200 }, // 3.0.49
        { status: 404 }, // 3.0.50
      ],
    });
    const det = new electron_zip_probe({
      baseUrl: "https://cdn.example.com/release",
      product: "MiniMax Code",
      seed_version: "3.0.50",
    });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("3.0.49");
  });

  it("path_template → ZCode 式 CDN 目录布局", async () => {
    const http = new MockHttp({
      head: [
        { status: 200 }, // 3.4.0 seed
        { status: 200 }, // 3.4.1
        { status: 404 }, // 3.4.2
      ],
    });
    const det = new electron_zip_probe({
      baseUrl: "https://cdn-zcode.z.ai/zcode/electron/releases",
      product: "ZCode",
      seed_version: "3.4.0",
      path_template:
        "{baseUrl}/{version}/macos-{arch}/{product}-{version}-mac-{arch}.zip",
    });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("3.4.1");
    expect(http.headCalls[0].url).toBe(
      "https://cdn-zcode.z.ai/zcode/electron/releases/3.4.0/macos-arm64/ZCode-3.4.0-mac-arm64.zip",
    );
  });
});
