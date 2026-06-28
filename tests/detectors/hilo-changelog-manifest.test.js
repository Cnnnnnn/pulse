/**
 * tests/detectors/hilo-changelog-manifest.test.js
 *
 * hilo 桌面端 (minimax Hub / @hilo/desktop) 的更新日志数据源 detector.
 *
 * 覆盖:
 *   - happy path: 单 URL → items[0] 解析 + changelog markdown + release_url
 *   - 多 URL fallback: 第一个 503 → fallback 第二个
 *   - zh 优先: 含 zh.items 时返回 zh, 缺则 fallback en
 *   - schema 校验: schemaVersion !== 1 / 缺 items → 视为无效
 *   - arch 推断: arm64 vs x64 拿不同 zip
 *   - yml 失败不阻断: changelog.json OK + latest-mac.yml 404 → release_url 空
 *   - 异常: items 为空 / version 空 / HTTP 4xx/5xx/timeout/network
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HiloChangelogManifestDetector } from "../../src/detectors/hilo-changelog-manifest.js";
import { MockHttp, makeCtx } from "../helpers/mock-http.js";
import { REASONS } from "../../src/detectors/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_FIXTURE = path.join(
  __dirname,
  "..",
  "fixtures",
  "hilo_changelog",
  "manifest.json",
);
const YML_FIXTURE = path.join(
  __dirname,
  "..",
  "fixtures",
  "hilo_changelog",
  "yml.txt",
);

const OVERSEAS_URL =
  "https://file.cdn.minimax.io/public/minimax-hub/release/overseas/changelog.json";
const DOMESTIC_URL =
  "https://filecdn.minimax.chat/public/minimax-hub/release/domestic/changelog.json";

function buildManifest({
  schemaVersion = 1,
  zhItems,
  enItems,
  includeBoth = false,
} = {}) {
  const out = { schemaVersion, updatedAt: "2026-06-27T11:22:48.397Z" };
  if (zhItems) out.zh = { badge: "更新", title: "更新日志", items: zhItems };
  if (enItems)
    out.en = { badge: "UPDATE", title: "What's New", items: enItems };
  if (includeBoth && zhItems && enItems) {
    out.zh = { badge: "更新", title: "更新日志", items: zhItems };
    out.en = { badge: "UPDATE", title: "What's New", items: enItems };
  }
  return JSON.stringify(out);
}

const ZH_ITEM = {
  version: "1.0.7",
  date: "2026年6月27日",
  subtitle: "macOS 签名证书更新；Windows 版本同步",
  changelog: ["macOS 签名证书已更新", "Windows 版本已同步至 1.0.7"],
  featured: true,
};

const EN_ITEM = {
  version: "1.0.7",
  date: "June 27, 2026",
  subtitle: "macOS signing updated; Windows version synced",
  changelog: [
    "macOS signing certificate has been updated",
    "Windows version is synced to 1.0.7",
  ],
  featured: true,
};

describe("HiloChangelogManifestDetector", () => {
  it("happy path: 单 URL → items[0] 解析 + markdown changelog + release_url", async () => {
    const manifestBody = buildManifest({
      zhItems: [ZH_ITEM],
      enItems: [EN_ITEM],
    });
    const ymlBody = fs.readFileSync(YML_FIXTURE, "utf-8");
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        { match: /latest-mac\.yml/, response: { status: 200, body: ymlBody } },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));

    expect(r.version).toBe("1.0.7");
    expect(r.source).toBe("hilo_changelog_manifest");
    expect(r.confidence).toBe("high");
    // changelog 拼装
    expect(r.changelog).toContain("### v1.0.7");
    expect(r.changelog).toContain("macOS 签名证书已更新");
    expect(r.changelog).toContain("*macOS 签名证书更新");
    // zh 优先于 en
    expect(r.changelog).not.toContain("macOS signing certificate");
    // release_url: arm64 → arm64-mac
    expect(r.release_url).toBe("MiniMax Hub-1.0.7-arm64-mac.zip");
    expect(r.changelog_url).toBe(OVERSEAS_URL);
  });

  it("arch=x64 → x64 zip (fallback 到 *-mac.zip)", async () => {
    const manifestBody = buildManifest({ zhItems: [ZH_ITEM] });
    const ymlBody = fs.readFileSync(YML_FIXTURE, "utf-8");
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        { match: /latest-mac\.yml/, response: { status: 200, body: ymlBody } },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    const r = await det.detect(makeCtx({ http, arch: "x64" }));
    // yml 里只有 arm64-mac 和 mac 两种; x64 走 *-mac.zip fallback
    expect(r.release_url).toBe("MiniMax Hub-1.0.7-mac.zip");
  });

  it("fallback: 第一个 URL 503 → 第二个 URL 胜出", async () => {
    const manifestBody = buildManifest({ zhItems: [ZH_ITEM] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: new RegExp(
            OVERSEAS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
          response: { status: 503, body: "bad gateway" },
        },
        {
          match: new RegExp(
            DOMESTIC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
          response: { status: 200, body: manifestBody },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({
      urls: [OVERSEAS_URL, DOMESTIC_URL],
    });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("1.0.7");
    // 来自第二个 URL (国内) — 仍然能拿到 release_url 因为同 baseUrl
    expect(r.changelog_url).toBe(DOMESTIC_URL);
    expect(r.release_url).toBe("MiniMax Hub-1.0.7-arm64-mac.zip");
  });

  it("zh 缺 → fallback en", async () => {
    const manifestBody = buildManifest({ enItems: [EN_ITEM] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("1.0.7");
    expect(r.changelog).toContain("macOS signing certificate");
  });

  it("schemaVersion !== 1 → 视为无效", async () => {
    const badManifest = JSON.stringify({
      schemaVersion: 2,
      en: { items: [EN_ITEM] },
    });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: badManifest },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("缺 zh/en.items → 视为无效", async () => {
    const badManifest = JSON.stringify({
      schemaVersion: 1,
      fr: { items: [EN_ITEM] },
    });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: badManifest },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("items 为空 → NO_VERSION", async () => {
    const emptyManifest = buildManifest({ zhItems: [] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: emptyManifest },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("items[0].version 空 → NO_VERSION", async () => {
    const manifest = JSON.stringify({
      schemaVersion: 1,
      zh: { items: [{ changelog: ["x"] }] },
    });
    const http = new MockHttp({
      urlHandlers: [
        { match: /changelog\.json/, response: { status: 200, body: manifest } },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("yml 拉失败 (404) → release_url 空, version/changelog 仍正常", async () => {
    const manifestBody = buildManifest({ zhItems: [ZH_ITEM] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        { match: /latest-mac\.yml/, response: { status: 404, body: "" } },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("1.0.7");
    expect(r.changelog).toContain("### v1.0.7");
    expect(r.release_url).toBe("");
  });

  it("JSON 解析失败 → 视为无效 URL (走 fallback / NO_VERSION)", async () => {
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: "not json{" },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("全部 URL 4xx → NO_VERSION", async () => {
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 404, body: "not found" },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("URL 配置为空 → NO_VERSION (no urls configured)", async () => {
    const http = new MockHttp();
    const det = new HiloChangelogManifestDetector({ urls: [] });
    await expect(
      det.detect(makeCtx({ http, arch: "arm64" })),
    ).rejects.toMatchObject({
      reason: REASONS.NO_VERSION,
    });
  });

  it("detCfg.urls fallback: 构造时未传 → 从 ctx.detCfg.urls 读", async () => {
    const manifestBody = buildManifest({ zhItems: [ZH_ITEM] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({}); // 构造时没传
    const r = await det.detect(
      makeCtx({ http, arch: "arm64", detCfg: { urls: [OVERSEAS_URL] } }),
    );
    expect(r.version).toBe("1.0.7");
  });

  // 回归守护: 模拟"config.json → sanitizeConfig → detector"链路.
  // 早期 sanitizeConfig 没透传 urls 数组, 导致 detector runtime 拿不到 urls,
  // 抛 NO_VERSION "no urls configured" → Pulse 显示 "无法检测".
  it("sanitizeConfig → detCfg.urls 透传 → detector 能拿到 (回归守护)", async () => {
    const { sanitizeConfig } = await import("../../src/config/schema.js");
    const cfg = {
      apps: [
        {
          name: "MiniMax Hub",
          bundle: "MiniMax Hub.app",
          detectors: [
            {
              type: "hilo_changelog_manifest",
              urls: [OVERSEAS_URL, DOMESTIC_URL],
              timeout: 4000,
            },
          ],
        },
      ],
    };
    const sanitized = sanitizeConfig(cfg);
    const detCfg = sanitized.apps[0].detectors[0];

    const manifestBody = buildManifest({ zhItems: [ZH_ITEM] });
    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: manifestBody },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector(detCfg);
    const r = await det.detect(makeCtx({ http, arch: "arm64", detCfg }));
    expect(r.version).toBe("1.0.7");
  });

  it("真实 fixture (海外) → 解析正常 (防漂移守护)", async () => {
    // 守护: 确保 fixture 没被误改
    const fixture = JSON.parse(fs.readFileSync(MANIFEST_FIXTURE, "utf-8"));
    expect(fixture.app).toBe("MiniMax Hub");
    expect(fixture.detector).toBe("hilo_changelog_manifest");
    expect(fixture.response.status).toBe(200);

    const http = new MockHttp({
      urlHandlers: [
        {
          match: /changelog\.json/,
          response: { status: 200, body: fixture.response.body },
        },
        {
          match: /latest-mac\.yml/,
          response: {
            status: 200,
            body: fs.readFileSync(YML_FIXTURE, "utf-8"),
          },
        },
      ],
    });
    const det = new HiloChangelogManifestDetector({ urls: [OVERSEAS_URL] });
    const r = await det.detect(makeCtx({ http, arch: "arm64" }));
    expect(r.version).toBe("1.0.7");
    // zh.items[0] 有 changelog 数组
    expect(r.changelog).toContain("macOS 签名证书已更新");
    expect(r.release_url).toContain("MiniMax Hub-1.0.7");
    expect(r.release_url).toContain("arm64-mac.zip");
  });
});
