const ithomeNewsStore = require("../ithome/news-store");
const { summarizeArticle } = require("../ithome/article-ai");

function registerIthomeHandlers(ctx) {
  const { safeHandle } = ctx;

  safeHandle("ithome:load-news", async () => ithomeNewsStore.loadAll());

  safeHandle("ithome:refresh-news", async (_evt, dateKey) => {
    if (dateKey) return ithomeNewsStore.fetchDay(dateKey);
    return ithomeNewsStore.refresh();
  });

  safeHandle("ithome:fetch-day", async (_evt, dateKey) =>
    ithomeNewsStore.fetchDay(dateKey),
  );

  safeHandle("ithome:summarize-article", async (_evt, payload) =>
    summarizeArticle(payload || {}),
  );

  safeHandle("ithome:toggle-favorite", async (_evt, payload) => {
    const id = payload && payload.id;
    if (!id || typeof id !== "string") {
      return { ok: false, reason: "invalid_args" };
    }
    return ithomeNewsStore.toggleFavorite(id);
  });
}

module.exports = { registerIthomeHandlers };
