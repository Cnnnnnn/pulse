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
 *   3. Marvis: 移除坏 html_changelog detector (指向主页, 不是 changelog 页),
 *      release_notes_url 改为主页, 加 bundle_changelog=true 拿 app bundle 内
 *      嵌 release notes (跟 QoderWork 同款).
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

  it("没有 html_changelog detector (主页不是 changelog 页, 之前配错)", () => {
    expect(
      mv.detectors.find((d) => d.type === "html_changelog"),
    ).toBeUndefined();
  });

  it("bundle_changelog=true (读 app bundle 内嵌 release notes)", () => {
    expect(mv.bundle_changelog).toBe(true);
  });
});
