/**
 * src/main/ipc/register-ithome-share.js
 *
 * IPC handler: ithome:share-card
 * 入参: { id }
 * 出参: { ok: true, bytes } | { ok: false, reason }
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).

import type {} from "electron";


// ponytail: IPC glue; catch stays unknown. Ceiling: any deps until typed IpcCtx.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import * as newsStore from "../ithome/news-store";
const _ns: any = newsStore;
import { createShareCardPng } from "../ithome/share-card-renderer";
import { writePngToClipboard } from "../ithome/clipboard-image";
import { mainLog } from "../log";
import type { IpcChannelMap } from "../../shared/ipc-contracts";

export function registerIthomeShareHandlers(ctx: any) {
  const { safeHandle } = ctx;

  safeHandle(
    "ithome:share-card",
    async (
      _evt: unknown,
      payload: IpcChannelMap["ithome:share-card"]["args"][0],
    ) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }

    const article = _ns.getArticle(id);
    if (!article) return { ok: false, reason: "article_not_found" };

    // summary 存在 newsStore.ithome_news.summaries
    const all = _ns.loadAll();
    const summary = all.summaries && all.summaries[id];
    if (!summary || !summary.text) {
      return { ok: false, reason: "no_summary" };
    }

    try {
      const pngBuffer = await createShareCardPng({ article, summary });
      writePngToClipboard(pngBuffer);
      return { ok: true, bytes: pngBuffer.length };
    } catch (err: any) {
      mainLog.warn("[ithome:share-card] failed", {
        id,
        msg: errMsg(err),
      });
      return { ok: false, reason: "render_failed", error: errMsg(err) };
    }
    },
  );
}

module.exports = { registerIthomeShareHandlers };
