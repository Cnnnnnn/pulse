/**
 * src/renderer/games/games-check-scheduler.js
 *
 * 后台定时检查各平台免费活动 + 桌面通知。
 *
 * 架构决策：完全镜像 github-check-scheduler.js —— games 数据走 IPC 拉取，
 * 但调度状态（已通知过的免费活动 id 集合）存在 renderer localStorage，主进程读不到，
 * 故调度器放 renderer（应用开着才跑——合理预期）。通知用 HTML5 Notification API。
 *
 * 设计：
 *   - createGamesCheckScheduler() 工厂
 *   - start()：autoCheck=true 时启 setInterval，首次延迟 60s 避免启动即打扰
 *   - checkOnce()：拉全平台 free 列表，与已通知集合 diff，有新条目时通知 + 置红点
 *   - stop()/restart()：幂等
 *   - 幂等 start（重复调不启多个 interval）
 */

import { api } from "../api.js";
import {
  gamesAutoCheck,
  gamesAutoCheckIntervalMin,
  gamesNotifyOnFree,
  gamesNotifyOnDrop,
  gamesHasNewFree,
  gamesHasNewDrop,
  wishlist,
  loadSeenFreeIds,
  saveSeenFreeIds,
  loadSeenDropKeys,
  saveSeenDropKeys,
  setPlatformAndMode,
  setMode,
} from "./gamesStore.js";
import { PLATFORM_LABEL, promotionTypeLabel, fmtPrice } from "./format.js";
import { setActiveNav } from "../worldcup/navStore.js";

const INITIAL_DELAY_MS = 60 * 1000; // 首次延迟 60s，避免启动即检查打扰
const MAX_SEEN_IDS = 200; // 已通知免费活动集合上限，防止无限增长
const MAX_SEEN_DROPS = 200; // 已通知降价集合上限，防止无限增长

export function createGamesCheckScheduler() {
  let intervalHandle = null;
  let initialTimer = null;
  let started = false;

  async function checkOnce() {
    try {
      await _checkFreeEvents();
    } catch {
      /* 免费检查失败不影响降价检查 */
    }
    try {
      await checkWishlistDrops();
    } catch {
      /* 降价检查失败不打扰 */
    }
  }

  async function _checkFreeEvents() {
    const res = await api.getGameDeals({ platform: "all", mode: "free" });
    if (!res || !res.ok || !Array.isArray(res.items)) return;

    const seen = loadSeenFreeIds();
    const fresh = res.items.filter((it) => !seen.has(it.id));
    if (fresh.length === 0) return;

    // 更新已通知集合（合并新旧，超出上限截断旧的）
    const merged = new Set([...seen, ...res.items.map((it) => it.id)]);
    if (merged.size > MAX_SEEN_IDS) {
      const arr = [...merged].slice(merged.size - MAX_SEEN_IDS);
      saveSeenFreeIds(new Set(arr));
    } else {
      saveSeenFreeIds(merged);
    }

    // 标记未读红点
    gamesHasNewFree.value = true;

    if (gamesNotifyOnFree.value) {
      _notifyNewFreeGames(fresh);
    }
  }

  /**
   * 心愿单降价检查：拉全平台 deals，按 ${platform}:${id} 精确匹配，
   * currentPrice < addedPrice 即降价，seenDrop 去重后置红点 + 通知。
   */
  async function checkWishlistDrops() {
    const list = wishlist.value;
    if (!Array.isArray(list) || list.length === 0) return;

    const res = await api.getGameDeals({ platform: "all", mode: "deals" });
    if (!res || !res.ok || !Array.isArray(res.items)) return;

    const currents = new Map();
    for (const item of res.items) {
      currents.set(`${item.platform}:${item.id}`, item);
    }

    const seen = loadSeenDropKeys();
    const drops = [];
    for (const wish of list) {
      const matched = currents.get(wish.key);
      if (!matched) continue; // 不在当前 deals 中，保留心愿单不动
      const currentPrice = Number(matched.salePrice);
      const addedPrice = Number(wish.addedPrice);
      if (!Number.isFinite(currentPrice) || !Number.isFinite(addedPrice)) continue;
      if (currentPrice < addedPrice) {
        const seenKey = `${wish.key}:${currentPrice}`;
        if (!seen.has(seenKey)) {
          drops.push({ wish, current: matched, seenKey });
        }
      }
    }

    if (drops.length === 0) return;

    const merged = new Set([...seen, ...drops.map((d) => d.seenKey)]);
    if (merged.size > MAX_SEEN_DROPS) {
      const arr = [...merged].slice(merged.size - MAX_SEEN_DROPS);
      saveSeenDropKeys(new Set(arr));
    } else {
      saveSeenDropKeys(merged);
    }

    gamesHasNewDrop.value = true;
    if (gamesNotifyOnDrop.value) {
      _notifyDrops(drops);
    }
  }

  function clear() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (initialTimer) {
      clearTimeout(initialTimer);
      initialTimer = null;
    }
  }

  function start() {
    if (started) return; // 幂等
    if (!gamesAutoCheck.value) return; // 用户关闭了自动检查
    started = true;
    initialTimer = setTimeout(() => {
      initialTimer = null;
      checkOnce();
      const intervalMs = (gamesAutoCheckIntervalMin.value || 360) * 60 * 1000;
      intervalHandle = setInterval(() => {
        checkOnce();
      }, intervalMs);
    }, INITIAL_DELAY_MS);
  }

  function stop() {
    started = false;
    clear();
  }

  function restart() {
    stop();
    start();
  }

  return { start, stop, restart, checkOnce };
}

/**
 * 发系统通知：发现新免费活动。首次请求权限；权限被拒或不支持则静默回退。
 * 点击通知 → 聚焦窗口 + 跳转到游戏优惠的「免费活动」tab。
 */
function _notifyNewFreeGames(fresh) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    const count = fresh.length;
    const titles = fresh.slice(0, 2).map((g) => g.title);
    const body =
      count === 1
        ? `${PLATFORM_LABEL[fresh[0].platform] || fresh[0].platform} · ${
            promotionTypeLabel(fresh[0].promotionType)
          }：${fresh[0].title}`
        : `发现 ${count} 个游戏免费活动（${titles.join("、")} 等）`;
    const send = () => {
      try {
        const n = new Notification("游戏免费活动 · 发现新活动", {
          body,
          silent: false,
        });
        n.onclick = () => {
          try {
            window.focus();
            setActiveNav("games");
            setPlatformAndMode(fresh[0].platform, "free");
          } catch {
            /* noop */
          }
        };
      } catch {
        /* Notification 不可用时静默 */
      }
    };
    if (Notification.permission === "granted") {
      send();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") send();
      });
    }
  } catch {
    /* 整个通知链路失败不打扰 */
  }
}

/**
 * 发系统通知：心愿单游戏降价。权限处理模式同 _notifyNewFreeGames。
 * 点击通知 → 聚焦窗口 + 跳转到游戏优惠的「心愿单」tab。
 */
function _notifyDrops(drops) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    const count = drops.length;
    const titles = drops.slice(0, 2).map((d) => d.wish.title);
    const body =
      count === 1
        ? `${PLATFORM_LABEL[drops[0].wish.platform] || drops[0].wish.platform} · ${
            drops[0].wish.title
          }：${fmtPrice(Number(drops[0].wish.addedPrice), drops[0].wish.currency)} → ${
            fmtPrice(Number(drops[0].current.salePrice), drops[0].current.currency)
          }`
        : `发现 ${count} 款关注游戏降价（${titles.join("、")} 等）`;
    const send = () => {
      try {
        const n = new Notification(`游戏降价 · 发现 ${count} 款关注游戏降价`, {
          body,
          silent: false,
        });
        n.onclick = () => {
          try {
            window.focus();
            setActiveNav("games");
            setMode("wishlist");
          } catch {
            /* noop */
          }
        };
      } catch {
        /* Notification 不可用时静默 */
      }
    };
    if (Notification.permission === "granted") {
      send();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") send();
      });
    }
  } catch {
    /* 整个通知链路失败不打扰 */
  }
}
