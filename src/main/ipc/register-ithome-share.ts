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

const newsStore = require("../ithome/news-store.ts");
const { createShareCardPng } = require("../ithome/share-card-renderer.ts");
const { writePngToClipboard } = require("../ithome/clipboard-image.ts");
const { mainLog } = require("../log.ts");

function registerIthomeShareHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("ithome:share-card", async (_evt, payload) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }

    const article = newsStore.getArticle(id);
    if (!article) return { ok: false, reason: "article_not_found" };

    // summary 存在 newsStore.ithome_news.summaries
    const all = newsStore.loadAll();
    const summary = all.summaries && all.summaries[id];
    if (!summary || !summary.text) {
      return { ok: false, reason: "no_summary" };
    }

    try {
      const pngBuffer = await createShareCardPng({ article, summary });
      writePngToClipboard(pngBuffer);
      return { ok: true, bytes: pngBuffer.length };
    } catch (err) {
      mainLog.warn("[ithome:share-card] failed", {
        id,
        msg: err && err.message,
      });
      return { ok: false, reason: "render_failed", error: err && err.message };
    }
  });
}

module.exports = { registerIthomeShareHandlers };
