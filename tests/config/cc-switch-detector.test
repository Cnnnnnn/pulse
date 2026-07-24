/**
 * tests/config/cc-switch-detector.test.js
 *
 * 2026-06-28 回归守护:
 *   CC Switch 官方仓库是 github.com/farion1231/cc-switch (config.json 之前误填为
 *   johnhomides/cc-switch, 那个仓库不是 CC Switch 项目). 同时 ccswitch.io 站点是 SPA,
 *   html_changelog 抓不到内容, 改用 github_release 拿 changelog.
 *
 * 这个测试守: 1) 仓库地址必须指向 farion1231; 2) 用 github_release detector
 * 而非 html_changelog. 任何回归都会在 CI 阶段被拦下, 避免错仓库/坏 detector 漂回去.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve("config.json");

describe("CC Switch detector (config.json)", () => {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const ccSwitch = raw.apps.find((a) => a.name === "CC Switch");

  it("CC Switch app config 存在", () => {
    expect(ccSwitch).toBeTruthy();
  });

  it("仓库地址指向 farion1231/cc-switch (官方仓库, 不是 johnhomides)", () => {
    const gh = ccSwitch.detectors.find((d) => d.type === "github_release");
    expect(gh).toBeTruthy();
    expect(gh.url).toContain("farion1231/cc-switch");
    expect(gh.url).not.toContain("johnhomides");
  });

  it("不再用 html_changelog detector (ccswitch.io 是 SPA, html_changelog 抓不到内容)", () => {
    const html = ccSwitch.detectors.find((d) => d.type === "html_changelog");
    expect(html).toBeUndefined();
  });

  it("release_notes_url 指向 ccswitch.io 官方 changelog", () => {
    expect(ccSwitch.release_notes_url).toBe("https://ccswitch.io/zh/changelog");
  });
});
