/**
 * tests/config/schema-p2.test.js
 *
 * 新 detector types (winget_show / github_release) + win_bundle/winget_id 字段
 * 通过 schema 验证 + sanitize.
 */
import { describe, it, expect } from "vitest";
import {
  validateConfig,
  sanitizeConfig,
  VALID_DETECTOR_TYPES,
} from "../../src/config/schema.js";

describe("schema P2: new detector types + win fields", () => {
  it("VALID_DETECTOR_TYPES 含 winget_show / github_release / hilo_changelog_manifest", () => {
    expect(VALID_DETECTOR_TYPES.has("winget_show")).toBe(true);
    expect(VALID_DETECTOR_TYPES.has("github_release")).toBe(true);
    expect(VALID_DETECTOR_TYPES.has("hilo_changelog_manifest")).toBe(true);
  });

  it("validate 接受 winget_show detector", () => {
    const cfg = {
      apps: [
        {
          name: "Cursor",
          bundle: "Cursor.app",
          detectors: [
            {
              type: "winget_show",
              id: "Anysphere.Cursor",
              platform: "win",
            },
          ],
        },
      ],
    };
    const v = validateConfig(cfg);
    expect(v.valid).toBe(true);
  });

  it("sanitize 保留 win_bundle / winget_id 字段", () => {
    const cfg = {
      apps: [
        {
          name: "Cursor",
          bundle: "Cursor.app",
          win_bundle: "Cursor",
          winget_id: "Anysphere.Cursor",
          detectors: [{ type: "github_release", url: "x" }],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    const app = s.apps[0];
    expect(app.win_bundle).toBe("Cursor");
    expect(app.winget_id).toBe("Anysphere.Cursor");
  });

  it("sanitize 保留 detector 的 platform + id 字段", () => {
    const cfg = {
      apps: [
        {
          name: "X",
          bundle: "X.app",
          detectors: [
            { type: "winget_show", id: "X.Id", platform: "win" },
            { type: "brew_formulae", cask: "x", platform: "mac" },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    expect(s.apps[0].detectors).toHaveLength(2);
    expect(s.apps[0].detectors[0].platform).toBe("win");
    expect(s.apps[0].detectors[0].id).toBe("X.Id");
  });

  // hilo_changelog_manifest detector 走 urls: [...] 数组; sanitize 必须透传,
  // 否则 detector 在 runtime 拿不到 urls → 报 NO_VERSION ("no urls configured").
  it("sanitize 保留 hilo_changelog_manifest.urls 数组", () => {
    const cfg = {
      apps: [
        {
          name: "MiniMax Hub",
          bundle: "MiniMax Hub.app",
          detectors: [
            {
              type: "hilo_changelog_manifest",
              urls: [
                "https://file.cdn.minimax.io/.../overseas/changelog.json",
                "https://filecdn.minimax.chat/.../domestic/changelog.json",
              ],
              timeout: 4000,
            },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    const det = s.apps[0].detectors[0];
    expect(det.type).toBe("hilo_changelog_manifest");
    expect(det.urls).toEqual([
      "https://file.cdn.minimax.io/.../overseas/changelog.json",
      "https://filecdn.minimax.chat/.../domestic/changelog.json",
    ]);
    expect(det.timeout).toBe(4000);
  });

  it("sanitize 过滤掉非字符串 urls 数组项", () => {
    const cfg = {
      apps: [
        {
          name: "X",
          bundle: "X.app",
          detectors: [
            {
              type: "hilo_changelog_manifest",
              urls: [
                "https://a.example/changelog.json",
                null,
                "",
                42,
                "https://b.example/changelog.json",
              ],
            },
          ],
        },
      ],
    };
    const s = sanitizeConfig(cfg);
    const det = s.apps[0].detectors[0];
    expect(det.urls).toEqual([
      "https://a.example/changelog.json",
      "https://b.example/changelog.json",
    ]);
  });
});
