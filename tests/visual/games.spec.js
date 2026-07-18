/**
 * tests/visual/games.spec.js — 游戏优惠聚合（Games）视觉回归基线 (ESM)
 *
 * 复用 visual.spec.js 的静态服务 + IPC stub 范式（scripts/visual-serve.cjs 上跑，不接 Electron）。
 * 关键差异：games 模块通过 api.getGameDeals 拉数据，而 stubIpc 默认返 {} 会让网格空态。
 * 这里在 init script 里把 getGameDeals 覆盖成返回内置 fixture（含 示例/史低/免费/折扣/评分
 * 各类徽标），让 GamesPage 渲染出有代表性的卡片网格，锁定 P0–P3 整改后的视觉。
 *
 * baseline（首次生成用 npm run test:visual:update，日常 PR 跑 npm run test:visual）：
 *   - games-deals-light          折扣列表 · 浅色（上下文条 + 统一选中胶囊 + 毛玻璃徽标 + 等宽数字）
 *   - games-deals-dark           折扣列表 · 暗色（验证压暗语义色对比 + 暗色主题）
 *   - games-compare-light        比价模式 · 浅色（平台 Tab 转多选 group + 上下文条列出参与平台）
 *
 * 注：cards 缩略图故意留空 → GameThumb 走 emoji 占位（onError 兜底），避免依赖外网图床，
 * 保证 baseline 跨环境稳定。
 */
import { test, expect } from "@playwright/test";

// 覆盖 api.getGameDeals 返回 fixture；其余 IPC 仍走 stubIpc 默认（async () => ({})）。
const GAMES_FIXTURE = {
  ok: true,
  mode: "deals",
  platform: "all",
  items: [
    {
      id: "steam-1", platform: "steam", title: "Hollow Knight",
      salePrice: 3.99, normalPrice: 14.99, currency: "USD", savings: 73,
      rating: 4.8, lowestPrice: 3.99, source: "live", dealUrl: "https://store.steampowered.com/app/1",
    },
    {
      id: "epic-1", platform: "epic", title: "Civilization VI",
      salePrice: 5.99, normalPrice: 29.99, currency: "USD", savings: 80,
      rating: 4.5, lowestPrice: 4.49, source: "live", dealUrl: "https://store.epicgames.com",
    },
    {
      id: "xbox-1", platform: "xbox", title: "Forza Horizon 5",
      salePrice: 29.99, normalPrice: 59.99, currency: "USD", savings: 50,
      rating: 4.7, source: "live", dealUrl: "https://www.xbox.com",
    },
    {
      id: "ps-1", platform: "playstation", title: "Ghost of Tsushima",
      salePrice: 39.99, normalPrice: 69.99, currency: "USD", savings: 43,
      rating: 4.9, lowestPrice: 39.99, source: "live", dealUrl: "https://store.playstation.com",
    },
    {
      id: "switch-1", platform: "switch", title: "Super Mario Odyssey",
      salePrice: 41.99, normalPrice: 59.99, currency: "USD", savings: 30,
      rating: 4.8, source: "sample", dealUrl: "https://www.nintendo.com",
    },
    {
      id: "steam-2", platform: "steam", title: "Stardew Valley",
      salePrice: 4.49, normalPrice: 14.99, currency: "USD", savings: 70,
      rating: 4.9, lowestPrice: 4.49, source: "live", dealUrl: "https://store.steampowered.com/app/2",
    },
    {
      id: "epic-2", platform: "epic", title: "Limbo",
      isFree: true, salePrice: 0, currency: "USD", promotionType: "free",
      freeUntil: "2026-07-25", source: "live", dealUrl: "https://store.epicgames.com/free",
    },
    {
      id: "xbox-2", platform: "xbox", title: "Hellblade II",
      salePrice: 29.99, normalPrice: 49.99, currency: "USD", savings: 40,
      rating: 4.4, lowestPrice: 29.99, source: "live", dealUrl: "https://www.xbox.com/2",
    },
  ],
  sources: { steam: "live", epic: "live", xbox: "live", playstation: "live", switch: "sample" },
  psDriver: null,
  fetchedAt: "2026-07-18T10:30:00.000Z",
  fx: { rates: { USD: 7.2 }, date: "2026-07-18", fetchedAt: "2026-07-18T00:00:00.000Z", stale: false },
};

const stubAndPatchGames = `
  (function stubAndPatchGames() {
    const noop = () => {};
    const empty = async () => ({});
    const emptyArr = async () => [];
    const apiStub = new Proxy({}, {
      get(_, key) {
        if (typeof key === "symbol") return undefined;
        if (/^on[A-Z]/.test(key) || key.startsWith("subscribe")) return noop;
        if (key === "getGameDeals") {
          return async () => (${JSON.stringify(GAMES_FIXTURE)});
        }
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
  })();
`;

test.beforeEach(async ({ context }) => {
  await context.addInitScript(stubAndPatchGames);
});

async function navigateToGames(page, theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((pref) => {
    try {
      localStorage.setItem("app-theme-preference", pref);
    } catch {}
  }, theme);
  await page.goto("/");
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const nav = page.locator('li[data-nav="games"]').first();
  if (await nav.count()) {
    await nav.click();
  }
  await page.waitForSelector(".games-grid .game-card", { timeout: 15_000 });
  await page.waitForTimeout(400);
}

test("games deals — light theme baseline", async ({ page }) => {
  await navigateToGames(page, "light");
  await expect(page).toHaveScreenshot("games-deals-light.png", { fullPage: false });
});

test("games deals — dark theme baseline", async ({ page }) => {
  await navigateToGames(page, "dark");
  await expect(page).toHaveScreenshot("games-deals-dark.png", { fullPage: false });
});

test("games compare — light theme baseline (平台多选 Tab)", async ({ page }) => {
  await navigateToGames(page, "light");
  const compareChip = page.locator(".games-chip", { hasText: "比价" }).first();
  if (await compareChip.count()) {
    await compareChip.click();
    await page.waitForTimeout(400);
  }
  await expect(page).toHaveScreenshot("games-compare-light.png", { fullPage: false });
});

test("games deals — search filter baseline", async ({ page }) => {
  await navigateToGames(page, "light");
  const search = page.locator("#games-search-input");
  await search.waitFor({ state: "visible", timeout: 10_000 });
  await search.fill("Hollow");
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot("games-search-light.png", { fullPage: false });
});

test("games deals — price-drop badge baseline", async ({ page }) => {
  // 预设心愿单：steam-1 关注价 9.99，当前 fixture salePrice 3.99 → 命中降价角标
  await page.addInitScript(() => {
    try {
      localStorage.setItem("pulse.games.wishlist.v1", JSON.stringify([
        {
          key: "steam-1", platform: "steam", id: "steam-1",
          title: "Hollow Knight", thumb: null,
          addedPrice: 9.99, currency: "USD",
          addedAt: "2026-07-18T00:00:00.000Z",
        },
      ]));
    } catch {}
  });
  await navigateToGames(page, "light");
  await page.waitForSelector(".game-card__drop", { timeout: 10_000 });
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("games-drop-light.png", { fullPage: false });
});
