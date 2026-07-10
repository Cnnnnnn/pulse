import { test, expect } from "@playwright/test";

const stubIpc = `
  (function stubIpc() {
    const noop = () => {};
    const empty = async () => ({});
    const emptyArr = async () => [];
    const apiStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        return empty;
      },
    });
    const pulseStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        if (key === "getFunds" || key === "getAlerts") return emptyArr;
        if (key === "getSettings") return empty;
        return empty;
      },
    });
    const metalsStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        return empty;
      },
    });
    window.api = apiStub;
    window.pulse = pulseStub;
    window.metalsApi = metalsStub;
    window.platformInfo = { platform: "darwin" };

    // 给 IT 新闻 + 微博热搜 stub 一些 fixture, 让单页不是全空态
    window.__newsFixtures = true;
  })();
`;

test.beforeEach(async ({ context }) => {
  await context.addInitScript(stubIpc);
});

test("news tab (P-N+ 合并后单层 header) — light", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("app-theme-preference", "light");
      // Stub IT 新闻 fixture — 5 天数据 + 一些文章
      const articles = {};
      const today = new Date();
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const k = d.toISOString().slice(0, 10);
        articles[k] = [
          { id: `${k}-1`, title: `示例 IT 文章 1 (${k})`, category: "科技", excerpt: "摘要", url: "https://example.com/1", time: "10:00", summarized: true },
          { id: `${k}-2`, title: `示例 IT 文章 2 (${k})`, category: "数码", excerpt: "摘要", url: "https://example.com/2", time: "11:00", summarized: false },
          { id: `${k}-3`, title: `示例 IT 文章 3 (${k})`, category: "AI", excerpt: "摘要", url: "https://example.com/3", time: "12:00", summarized: true },
        ];
      }
      const origLoad = window.api.ithomeLoad;
      window.api.ithomeLoad = async () => ({ articles, dayStats: {}, favorites: {}, ts: Date.now() });
      window.api.ithomeLoadRead = async () => ({});
      window.api.wechatHotLoad = async () => ({
        items: Array.from({ length: 20 }, (_, i) => ({
          rank: i + 1,
          title: `微博热搜示例 ${i + 1} — 一个比较长的标题用来测试 UI 排版`,
          url: `https://example.com/wb/${i + 1}`,
        })),
      });
      window.api.wechatHotLoadRead = async () => ({});
    } catch {}
  });
  await page.goto("/");
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 15_000 });
  await page.waitForTimeout(500);
  const newsNav = page.locator('li[data-nav="news"]').first();
  if (await newsNav.count()) {
    await newsNav.click();
    await page.waitForTimeout(800);
  }
  await expect(page).toHaveScreenshot("/tmp/news-tab-light.png", { fullPage: false });
});
