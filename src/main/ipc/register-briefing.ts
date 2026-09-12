/**
 * src/main/ipc/register-briefing.ts
 *
 * v3.0 alpha: 早报 (digest) 设置 + 预览 IPC.
 *
 * Channels:
 *   - briefing:fetch-config  → { ok, config }   读 v3 DailyDigestConfig
 *   - briefing:save-config   → { ok }           patch + 写盘
 *   - briefing:preview       → { ok, date, sections, lines }  跑 aggregate(已订阅)
 *
 * 复用:
 *   - stateStore.loadDailyDigestConfig / saveDailyDigestConfig (v3 shape)
 *   - aggregate(state, { now, subscribed })  (v3.0 加的 subscribed 参数)
 *   - getCachedState (ctx)
 */

import type {} from "electron";
import type { IpcChannelMap } from "../../shared/ipc-contracts";
import type {
  DailyDigestConfig,
  DigestConfigResponse,
  DigestPreviewResponse,
} from "../../shared/digest-types";

import {
  loadDailyDigestConfig,
  saveDailyDigestConfig,
  loadBriefingSnapshot,
  saveBriefingSnapshot,
  saveGithubReleasesDigest,
} from "../state-store";
import { aggregate } from "../digest/aggregate";
import { briefHtmlShell } from "../digest/brief-html";
import { app, shell } from "electron";
import * as pathType from "node:path";
import * as fsType from "node:fs";

// ponytail: require electron + node fs lazily (测试环境下 app 可能 undefined).
const _path: typeof pathType = require("path");
const _fs: typeof fsType = require("fs");

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
// (duplicate removed)

export function registerBriefingHandlers(ctx: any) {
  const { safeHandle, getCachedState } = ctx;
  if (typeof safeHandle !== "function") return;

  safeHandle(
    "briefing:fetch-config",
    async (_evt: unknown, _opts: IpcChannelMap["briefing:fetch-config"]["args"][0]) => {
      try {
        const config = loadDailyDigestConfig() as DailyDigestConfig;
        const resp: DigestConfigResponse = { ok: true, config };
        return resp;
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  safeHandle(
    "briefing:save-config",
    async (
      _evt: unknown,
      opts: IpcChannelMap["briefing:save-config"]["args"][0],
    ) => {
      try {
        const patch =
          opts && typeof opts === "object" && !Array.isArray(opts)
            ? opts
            : {};
        const next = saveDailyDigestConfig(patch);
        return { ok: true, config: next.daily_digest };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  safeHandle(
    "briefing:preview",
    async (_evt: unknown, _opts: IpcChannelMap["briefing:preview"]["args"][0]) => {
      try {
        const state =
          typeof getCachedState === "function" ? getCachedState() : null;
        const config = loadDailyDigestConfig() as DailyDigestConfig;
        const result = aggregate(state || {}, {
          now: new Date(),
          subscribed: config.subscribed_sections,
        });
        const resp: DigestPreviewResponse = {
          ok: true,
          date: result.date,
          sections: result.sections as DigestPreviewResponse["sections"],
          lines: result.lines,
        };
        return resp;
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  // v3.0 beta: 读最近一次推送的 BriefingSnapshot — Drawer 离线打开 / tray quick look 用
  safeHandle(
    "briefing:snapshot:fetch",
    async (
      _evt: unknown,
      _opts: IpcChannelMap["briefing:snapshot:fetch"]["args"][0],
    ) => {
      try {
        const snap = loadBriefingSnapshot();
        return { ok: true, snapshot: snap };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  // v3.0 beta: 导出当前 snapshot (或现场 aggregate) 为 HTML 文件
  safeHandle(
    "briefing:export",
    async (
      _evt: unknown,
      opts: IpcChannelMap["briefing:export"]["args"][0],
    ) => {
      try {
        // 拿 snapshot: 优先用盘上的, 否则现场跑 aggregate
        const stored = loadBriefingSnapshot();
        let snapshot = stored;
        if (!snapshot || (opts && opts.regenerate === true)) {
          const state =
            typeof getCachedState === "function" ? getCachedState() : null;
          const config = loadDailyDigestConfig() as DailyDigestConfig;
          const r = aggregate(state || {}, {
            now: new Date(),
            subscribed: config.subscribed_sections,
          });
          snapshot = {
            date: r.date,
            generatedAt: Date.now(),
            sections: r.sections,
            lines: r.lines,
            rewritten: false,
          };
          // 同时把新 snapshot 写盘 (后面 Drawer 打开能看到)
          try {
            saveBriefingSnapshot(snapshot);
          } catch {
            /* noop */
          }
        }
        if (!snapshot || !snapshot.sections || snapshot.sections.length === 0) {
          return { ok: false, reason: "empty_snapshot" };
        }
        const html = briefHtmlShell(snapshot);
        // 落盘到 userData/briefings/
        let userDataDir = "";
        try {
          if (app && typeof app.getPath === "function") {
            userDataDir = app.getPath("userData");
          }
        } catch {
          /* vitest 环境下 app 不存在, 用 cwd */
          userDataDir = process.cwd();
        }
        const dir = _path.join(userDataDir, "briefings");
        try {
          _fs.mkdirSync(dir, { recursive: true });
        } catch {
          /* noop */
        }
        const filename = `pulse-briefing-${snapshot.date}.html`;
        const outPath = _path.join(dir, filename);
        _fs.writeFileSync(outPath, html, "utf-8");
        return {
          ok: true,
          path: outPath,
          filename,
          snapshot,
        };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  // v3.1: renderer GitHub 收录检查完 release 后推送「有更新」的项目清单,
  // 落盘 state.github_releases_digest 供早报 aggregate 读 (github 数据在 renderer
  // localStorage, 主进程拿不到, 只能靠 ingest).
  safeHandle(
    "briefing:ingest-github-releases",
    async (
      _evt: unknown,
      items: IpcChannelMap["briefing:ingest-github-releases"]["args"][0],
    ) => {
      try {
        if (!Array.isArray(items)) {
          return { ok: false, reason: "bad_items" };
        }
        const clean = items
          .filter(
            (it: any) =>
              it && typeof it === "object" &&
              typeof it.repo === "string" && it.repo &&
              typeof it.latest_version === "string" && it.latest_version,
          )
          .slice(0, 20)
          .map((it: any) => ({
            name: typeof it.name === "string" ? it.name : "",
            owner: typeof it.owner === "string" ? it.owner : "",
            repo: it.repo,
            latest_version: it.latest_version,
            published_at: typeof it.published_at === "number" ? it.published_at : 0,
          }));
        saveGithubReleasesDigest(clean);
        return { ok: true, count: clean.length };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );

  // v3.0 beta: 在 Finder / Explorer 中显示导出的 HTML
  safeHandle(
    "briefing:show-in-folder",
    async (
      _evt: unknown,
      opts: IpcChannelMap["briefing:show-in-folder"]["args"][0],
    ) => {
      try {
        if (!opts || typeof opts.path !== "string") {
          return { ok: false, reason: "missing_path" };
        }
        if (typeof shell === "undefined" || typeof shell.showItemInFolder !== "function") {
          return { ok: false, reason: "shell_unavailable" };
        }
        shell.showItemInFolder(opts.path);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, reason: "threw", error: errMsg(err) };
      }
    },
  );
}
