/**
 * tests/config/multi-app-detector-fixes.test.js
 *
 * 2026-06-28 三个 app 的 changelog 修复守护:
 *   1. MiniMax Code: html_changelog section_end 改 next-start 模式 +
 *      detector 排第一 (避开 chain 在 electron_yml 处 stop, 让 html_changelog
 *      跑通拿 markdown 内容).
 *   2. Codex: 用户本地 /Applications/ChatGPT.app 实际是 Codex 二进制
 *      (CFBundleIdentifier=com.openai.codex, 版本 26.707.XXXX 格式).
 *      不是真正的 ChatGPT (那种是 1.2026.XXX 格式). 重新加回 Codex entry,
 *      用 codex-app-prod/appcast.xml feed; bundle 字段保留 "ChatGPT.app"
 *      因为用户本地 .app 目录就叫 ChatGPT.app. CodexBar 仍保留.
 *   3. Marvis: 官网当前没有可用的 release changelog 页, 因此只保留官方
 *      macOS DMG / Windows EXE 重定向源, 并按平台隔离, 避免 Windows 误读
 *      macOS DMG 版本. winget 作为 Windows 备用源保留.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve("config.json");
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

describe("MiniMax Code detector order (config.json)", () => {
  const mm = cfg.apps.find((a) => a.name === "MiniMax Code");
  const html = mm && mm.detectors.find((d) => d.type === "html_changelog");

  it("html_changelog detector 存在", () => {
    expect(html).toBeTruthy();
  });

  it("section_end 是 next-start 模式 ('<h2 ') 切到下个 h2", () => {
    expect(html.section_end).toBe("<h2 ");
  });

  it("html_changelog 是第一个 detector (chain 才能 stop 在它, 拿到 changelog)", () => {
    expect(mm.detectors[0].type).toBe("html_changelog");
  });
});

describe("Codex detector (config.json) — 用户本地 ChatGPT.app 实为 Codex 二进制", () => {
  const cx = cfg.apps.find((a) => a.name === "Codex");
  const sp = cx && cx.detectors.find((d) => d.type === "sparkle_appcast");

  it("Codex entry 存在, 用 codex-app-prod/appcast.xml (Codex 真正的 sparkle feed)", () => {
    expect(cx).toBeTruthy();
    expect(sp && sp.url).toBe(
      "https://persistent.oaistatic.com/codex-app-prod/appcast.xml",
    );
  });

  it("bundle 字段保留 'ChatGPT.app' (用户本地 .app 目录就叫 ChatGPT.app)", () => {
    expect(cx && cx.bundle).toBe("ChatGPT.app");
  });

  it("winget_id 是 OpenAI.Codex (Windows 同步)", () => {
    expect(cx && cx.winget_id).toBe("OpenAI.Codex");
  });

  it("没有 name='ChatGPT' 的 entry (那才是真正的 sidekick sparkle, 但用户没装)", () => {
    expect(cfg.apps.some((a) => a.name === "ChatGPT")).toBe(false);
  });
});

describe("Marvis detector (config.json)", () => {
  const mv = cfg.apps.find((a) => a.name === "Marvis");
  const redirects = mv.detectors.filter((d) => d.type === "redirect_filename");

  it("官方 macOS DMG 与 Windows EXE 下载源按平台隔离", () => {
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
  });

  it("release notes 回到当前可访问的官方主页", () => {
    expect(mv.release_notes_url).toBe("https://marvis.qq.com/");
  });

  it("bundle_changelog=true (读 app bundle 内嵌 release notes)", () => {
    expect(mv.bundle_changelog).toBe(true);
  });

  it("darwin redirect_filename 是第一个 detector (chain 主力, 拿 DMG 文件名版本号)", () => {
    expect(mv.detectors[0].type).toBe("redirect_filename");
    expect(mv.detectors[0].platform).toBe("darwin");
  });

  it("winget 备用源按真实 process.platform=win32 配置", () => {
    expect(mv.detectors).toContainEqual({
      type: "winget_show",
      id: "Tencent.Marvis",
      platform: "win32",
    });
  });
});

describe("ZCode detector (config.json)", () => {
  const zc = cfg.apps.find((a) => a.name === "ZCode");
  const zip = zc && zc.detectors.find((d) => d.type === "electron_zip_probe");

  it("electron_zip_probe 优先于 changelog (CDN 常领先官网 changelog 页)", () => {
    expect(zc.detectors[0].type).toBe("electron_zip_probe");
    expect(zip.baseUrl).toContain("cdn-zcode.z.ai");
    expect(zip.path_template).toContain("{version}");
  });
});
