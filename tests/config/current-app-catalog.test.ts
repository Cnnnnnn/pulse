import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sanitizeConfig } from "../../src/config/schema.ts";

const config = JSON.parse(
  fs.readFileSync(path.resolve("config.json"), "utf8"),
);

describe("current app catalog", () => {
  it("uses the current MiniMax Design bundle and keeps the legacy Hub alias", () => {
    const app = config.apps.find((item: any) => item.name === "MiniMax Design");

    expect(app).toMatchObject({
      name: "MiniMax Design",
      bundle: "MiniMax Design.app",
      bundle_aliases: ["MiniMax Hub.app"],
      win_bundle: "MiniMax Hub",
      winget_id: "MiniMax.MiniMaxHub",
    });
    expect(config.apps.some((item: any) => item.name === "MiniMax Hub")).toBe(false);
  });

  it("keeps the MiniMax bundle alias through runtime config sanitization", () => {
    const app = sanitizeConfig(config).apps.find(
      (item: any) => item.name === "MiniMax Design",
    );

    expect(app).toMatchObject({
      bundle: "MiniMax Design.app",
      bundle_aliases: ["MiniMax Hub.app"],
    });
  });

  it("keeps Marvis official downloads platform-scoped", () => {
    const app = config.apps.find((item: any) => item.name === "Marvis");
    const redirects = app.detectors.filter(
      (item: any) => item.type === "redirect_filename",
    );

    expect(app.release_notes_url).toBe("https://marvis.qq.com/");
    expect(redirects).toEqual([
      {
        type: "redirect_filename",
        url: "https://marvis.qq.com/download/dmg",
        platform: "darwin",
      },
      {
        type: "redirect_filename",
        url: "https://marvis.qq.com/download/exe",
        platform: "win32",
      },
    ]);
    expect(app.detectors).toContainEqual({
      type: "winget_show",
      id: "Tencent.Marvis",
      platform: "win32",
    });
    expect(
      app.detectors.some((item: any) => item.url === "https://marvis.qq.com/changelog"),
    ).toBe(false);
  });
});
