/**
 * tests/config/schema-enrich-only.test.js
 *
 * 回归测试: sanitizeConfig 必须保留 detector 的 enrich_only 字段.
 *
 * 历史 bug (2026-07-15): detector 白名单里漏了 enrich_only, 导致
 * config.json 里 WorkBuddy 的 html_changelog(enrich_only:true) 在
 * loadConfig → sanitizeConfig 时被静默丢弃, 运行期 enrich_only 永远为
 * false → 多源聚合 / enrich_fallback 整条链路不生效. 单测直接构造 appCfg
 * 时又会带上 enrich_only, 于是"单测绿、集成挂".
 */
import { describe, it, expect } from "vitest";
import { sanitizeConfig } from "../../src/config/schema.js";
import fs from "fs";
import path from "path";

describe("schema: enrich_only 透传", () => {
  it("sanitize 保留 enrich_only: true", () => {
    const cfg = {
      apps: [
        {
          name: "Foo",
          bundle: "Foo.app",
          detectors: [
            {
              type: "html_changelog",
              url: "https://example.com/changelog",
              enrich_only: true,
            },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    expect(s.apps[0].detectors[0].enrich_only).toBe(true);
  });

  it("enrich_only: false / 缺省 不强制写入", () => {
    const withFalse = sanitizeConfig({
      apps: [
        {
          name: "Foo",
          bundle: "Foo.app",
          detectors: [{ type: "api_json", url: "x", enrich_only: false }],
        },
      ],
    });
    expect(withFalse.apps[0].detectors[0].enrich_only).toBeUndefined();

    const absent = sanitizeConfig({
      apps: [
        {
          name: "Foo",
          bundle: "Foo.app",
          detectors: [{ type: "api_json", url: "x" }],
        },
      ],
    });
    expect(absent.apps[0].detectors[0].enrich_only).toBeUndefined();
  });

  it("真实 config.json: WorkBuddy 的 html_changelog 保留 enrich_only", () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "config.json"),
      "utf-8",
    );
    const s = sanitizeConfig(JSON.parse(raw));
    const wb = s.apps.find((a) => a.name === "WorkBuddy");
    expect(wb).toBeDefined();
    const html = wb.detectors.find((d) => d.type === "html_changelog");
    expect(html).toBeDefined();
    expect(html.enrich_only).toBe(true);
  });
});
