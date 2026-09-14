/**
 * src/main/goofish-embed.ts
 *
 * 闲鱼嵌入的 guest 视图管理 (v3.3)。
 *
 * 为什么是 WebContentsView 而不是 <webview> tag:
 *   Electron 43 + macOS 26 上 <webview> 的 guest 渲染面高度锁死在默认 150px
 *   (元素盒尺寸正确、宽度能跟随、sandbox 开关/动态 resize/窗口 resize 均无效,
 *   中性页面同样复现) — BrowserPlugin 的几何同步坏了。WebContentsView 由主进程
 *   直接 setBounds, 无此问题 (spike 实测 900x520 精确生效)。
 *
 * 分工:
 *   - renderer (GoofishLayout): 保留一个占位容器, ResizeObserver 量出矩形经
 *     goofish:sync IPC 上报; 挂载/卸载与浮层遮挡门控也在 renderer 侧决策
 *   - 本模块: 创建/附着/设界/显隐/导航 guest, 并把 URL 变化推回 renderer
 *
 * 后台消息 / 系统通知:
 *   - guest warm-start 屏外保活（续 cookie / 浏览态）
 *   - 未读通知改由 goofish/notify-service.ts 走 session.sync（协议层）
 *   - 本模块 DOM/标题轮询仅作侧栏徽标兜底，不再弹系统通知
 *
 * 安全: guest 围栏 (弹窗全拒 + 导航白名单) 见 webview-guard.applyGoofishGuestFence;
 * 分区 session 加固 (UA 伪装 + 权限全拒) 见 webview-guard.hardenGoofishSession。
 */

import type * as electronType from "electron";
import type { GoofishNavPayload, GoofishSyncPayload } from "../shared/ipc-contracts";

const GOOFISH_HOME = "https://www.goofish.com/";
const GOOFISH_PARTITION = "persist:goofish";
/** 屏外停靠: 保持 guest 存活 (JS/WS), 又不挡主窗口 */
const PARK_BOUNDS = { x: -12000, y: 0, width: 1280, height: 800 };

let view: electronType.WebContentsView | null = null;
let attachedWin: electronType.BrowserWindow | null = null;
let loggedFirstSync = false;
let lastUnread = 0;
/** 首次采信的未读只作基线, 不弹通知 (避免每次启动对存量未读刷屏) */
let unreadSeeded = false;
/** 用户正在看嵌入页 (tab 可见且未被浮层遮挡) — 此时不弹系统通知 */
let userViewing = false;

function embedLog(msg: string): void {
  try {
    const { mainLog } = require("./log.ts");
    mainLog.info(`[goofish-embed] ${msg}`);
  } catch {
    /* noop */
  }
}

/** 闲鱼 web 端未读数走标题前缀: "(2) 闲鱼 - ..." / "（3）..." / "【1】..." */
export function parseUnreadFromTitle(title: unknown): number {
  const m = String(title ?? "").match(/^\s*[(（【]\s*(\d+)\s*[)）】]/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function pushUnread(unread: number): void {
  lastUnread = unread;
  try {
    if (attachedWin && !attachedWin.isDestroyed()) {
      attachedWin.webContents.send("goofish:unread", unread);
    }
  } catch {
    /* noop */
  }
}

/** 采信未读变化: 仅更新侧栏徽标。系统通知改由 goofish/notify-service（session.sync）负责。 */
function applyUnread(unread: number, source: string): void {
  if (!unreadSeeded) {
    unreadSeeded = true;
    pushUnread(unread);
    embedLog(`seed unread=${unread} (${source}) [badge-only]`);
    return;
  }
  if (unread === lastUnread) return;
  embedLog("unread " + lastUnread + " -> " + unread + " (" + source + ") [badge-only]");
  pushUnread(unread);
}

function parkOffscreen(): void {
  if (!view) return;
  try {
    view.setBounds(PARK_BOUNDS);
    // 关键: 必须 visible=true, 否则 Chromium 可能冻住 guest → WS/轮询停摆
    view.setVisible(true);
  } catch {
    /* noop */
  }
}

// 系统通知已迁到 goofish/notify-service.ts（session.sync 协议层）


/** guest 页内轮询脚本: 每次先模拟一次「切回标签页」(visibilitychange + focus,
 *  闲鱼只在此时刷新未读数 — 用户 Chrome 实测), 800ms 后再读标题前缀 + 右侧栏
 *  「消息」角标数。右侧栏特征 = 消息元素向上 4 层内存在同时含「发闲置」的祖先
 *  容器, 防止在 IM 页等其它含「消息」文案的界面误匹配聊天列表数字。 */
const UNREAD_PROBE = `(() => new Promise((resolve) => {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  } catch (e) {}
  setTimeout(() => {
    const t = String(document.title || '');
    const m = t.match(/^\\s*[(（【]\\s*(\\d+)/);
    const titleCount = m ? parseInt(m[1], 10) || 0 : 0;
    let railCount = 0;
    for (const n of document.querySelectorAll('div,span,a')) {
      if (n.childElementCount !== 0) continue;
      if ((n.textContent || '').trim() !== '消息') continue;
      let p = n.parentElement;
      let hit = false;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        if ((p.textContent || '').indexOf('发闲置') === -1) continue;
        hit = true;
        const b = p.querySelector('[class*="badge" i], [class*="count" i], [class*="red" i], [class*="num" i]');
        if (b) {
          const v = parseInt((b.textContent || '').trim(), 10);
          if (!Number.isNaN(v) && v > 0) railCount = v;
        }
        break;
      }
      if (hit) break;
    }
    // IM 探针页 (隐藏 iframe /im): 会话角标求和 = 未读消息总数, 同会话多条也会涨
    let imSum = 0;
    let imSeen = 0;
    try {
      const f = document.getElementById('gf-im-probe');
      const d = f && f.contentDocument;
      if (d && d.body) {
        Object.defineProperty(d, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(d, 'visibilityState', { get: () => 'visible', configurable: true });
        d.dispatchEvent(new Event('visibilitychange'));
        d.querySelectorAll('[class*="badge" i], [class*="count" i], [class*="red" i], [class*="num" i]').forEach((b) => {
          const v = parseInt((b.textContent || '').trim(), 10);
          if (!Number.isNaN(v) && v > 0 && v <= 99) { imSum += v; imSeen++; }
        });
      }
    } catch (e) {}
    resolve(JSON.stringify({ t: titleCount, r: railCount, m: imSeen > 0 ? imSum : -1 }));
  }, 800);
}))()`;

let unreadPollTimer: ReturnType<typeof setInterval> | null = null;
let pendingUnread: number | null = null;

/**
 * 每 5s 轮询 guest 未读 (标题 + 页内角标取大), 变化时推送徽标并按需通知。
 * 防抖: 选择器宽松 (class 模糊匹配), 需要 连续两次轮询一致 才采信, 且 99 封顶
 * (更大数值几乎必然是页内其它数字元素被误匹配)。
 */
function startUnreadPoll(): void {
  if (unreadPollTimer) return;
  unreadPollTimer = setInterval(() => {
    try {
      if (!view || !attachedWin || attachedWin.isDestroyed()) return;
      void view.webContents
        .executeJavaScript(UNREAD_PROBE, true)
        .then((raw: unknown) => {
          let titleCount = 0;
          let railCount = 0;
          let imSum = -1; // -1 = IM 探针页未就绪
          try {
            const parsed = JSON.parse(String(raw));
            titleCount = Number(parsed.t) || 0;
            railCount = Number(parsed.r) || 0;
            if (parsed.m !== undefined && parsed.m !== null) {
              imSum = Number(parsed.m);
            }
          } catch {
            return;
          }
          if (railCount > 99) railCount = 99;
          const imCount = imSum >= 0 ? Math.min(imSum, 999) : 0;
          const unread = Math.max(titleCount, railCount, imCount);
          if (unread === lastUnread && unreadSeeded) {
            pendingUnread = null;
            return;
          }
          if (unread !== pendingUnread) {
            pendingUnread = unread; // 第一次见到该值, 等下一轮确认
            return;
          }
          pendingUnread = null;
          applyUnread(
            unread,
            "poll title=" + titleCount + " rail=" + railCount + " im=" + imSum,
          );
        })
        .catch(() => {});
    } catch {
      /* noop */
    }
  }, 5000);
}

function isSafeGoofishLoadUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "goofish.com" || host.endsWith(".goofish.com");
  } catch {
    return false;
  }
}

/** guest 隐藏后闲鱼可能自行暂停消息同步 (检查 document.hidden), 伪装成可见 */
const VISIBILITY_SPOOF = `(() => {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  } catch (e) {}
})()`;

/**
 * 注入隐藏 IM 探针页: 同源 iframe 加载 /im 会话列表 (1280px 桌面布局, 移出视口)。
 * 未读消息总数 = 会话列表里每个会话角标之和 — 右侧栏角标只数会话, 同一会话里
 * 再来消息不会 +1, 逐条通知必须靠这里。
 */
const IM_FRAME_INJECT = `(() => {
  if (window.__gfImFrame || location.pathname === '/im') return;
  window.__gfImFrame = true;
  const f = document.createElement('iframe');
  f.id = 'gf-im-probe';
  f.src = 'https://www.goofish.com/im';
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:800px;border:0;opacity:0;pointer-events:none;';
  f.addEventListener('load', () => {
    try {
      const d = f.contentDocument;
      Object.defineProperty(d, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(d, 'visibilityState', { get: () => 'visible', configurable: true });
    } catch (e) {}
  });
  (document.body || document.documentElement).appendChild(f);
})()`;

function ensureView(win: electronType.BrowserWindow): electronType.WebContentsView | null {
  try {
    const { WebContentsView: WCV } = require("electron") as typeof electronType;
    if (!WCV || !win) return null;
    if (!view) {
      view = new WCV({
        webPreferences: {
          partition: GOOFISH_PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          // 关键: guest 隐藏 (切到别的 tab) 时不能被后台节流, 否则闲鱼页面的
          // websocket/定时器被冻结 → 实时消息收不到 → 未读轮询读到陈旧数据
          backgroundThrottling: false,
        },
      });
      const { applyGoofishGuestFence } = require("./webview-guard.ts");
      applyGoofishGuestFence(view.webContents);
      view.webContents.setBackgroundThrottling(false);
      // 推送走模块级 attachedWin (窗口重建后仍指向当前窗口)
      const onNav = (_e: unknown, url: unknown) => {
        if (attachedWin && !attachedWin.isDestroyed()) {
          try {
            attachedWin.webContents.send("goofish:url", String(url));
          } catch {
            /* noop */
          }
        }
      };
      view.webContents.on("did-navigate", onNav);
      view.webContents.on("did-navigate-in-page", onNav);
      // 每个新文档注入可见性伪装 + IM 探针页 (dom-ready 每次导航都会触发)
      view.webContents.on("dom-ready", () => {
        try {
          void view?.webContents.executeJavaScript(
            VISIBILITY_SPOOF + IM_FRAME_INJECT,
            true,
          ).catch(() => {});
        } catch {
          /* noop */
        }
      });
      // 未读消息: 闲鱼 web 端把未读数写在 document.title 前缀里, 解析后
      // 推给 renderer (侧栏徽标) + 需要时发系统通知
      view.webContents.on("page-title-updated", (_e, title) => {
        applyUnread(parseUnreadFromTitle(title), "title");
      });
      // 首次创建即加载首页 — 视图没有 src 概念, 不主动 load 就是白板
      embedLog("guest view created, loading home");
      // 先停靠屏外, 等 goofish:sync 给真实矩形再亮出来 — 避免 warm-start / 创建瞬间闪屏
      parkOffscreen();
      view.webContents
        .loadURL(GOOFISH_HOME)
        .then(() => embedLog("guest home loaded"))
        .catch(() => {});
      startUnreadPoll();
      view.webContents.on("did-fail-load", (_e, code, desc, url) => {
        if (code === -3) return; // ERR_ABORTED: 导航被打断, 非错误
        try {
          const { mainLog } = require("./log.ts");
          mainLog.warn(`[goofish-embed] guest load failed ${code} ${desc} ${url}`);
        } catch {
          /* noop */
        }
      });
    }
    if (attachedWin !== win) {
      // 窗口切换 (dev 下单实例, 主要是窗口重建场景): 从旧窗摘下再挂新窗
      if (attachedWin && !attachedWin.isDestroyed()) {
        try {
          attachedWin.contentView.removeChildView(view);
        } catch {
          /* noop */
        }
      }
      win.contentView.addChildView(view);
      attachedWin = win;
      win.once("closed", () => {
        attachedWin = null;
        // view 保留 (session/页面状态在分区里), 仅解除引用
      });
    }
    return view;
  } catch {
    return null;
  }
}

/**
 * 启动后预热: 分区里已有淘系/闲鱼 cookie 时创建 guest 并停靠屏外。
 * 这样即使用户本会话没点开「闲鱼」tab, 也能收 WS + 弹系统通知。
 */
export function goofishEmbedWarmStart(
  win: electronType.BrowserWindow | null,
): Promise<void> {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return (async () => {
    try {
      if (view) {
        // 已有 guest: 用户正在看则不乱动；否则停靠 + 轻刷续 cookie
        if (userViewing) return;
        parkOffscreen();
        try {
          const url = String(view.webContents.getURL() || "");
          if (!url.includes("goofish.com")) {
            await view.webContents.loadURL(GOOFISH_HOME);
          } else {
            view.webContents.reload();
            await new Promise<void>((resolve) => {
              const done = () => {
                view?.webContents.removeListener("did-finish-load", done);
                resolve();
              };
              view?.webContents.once("did-finish-load", done);
              setTimeout(done, 8000);
            });
          }
        } catch {
          /* noop */
        }
        return;
      }
      const { session } = require("electron") as typeof electronType;
      const sess = session.fromPartition(GOOFISH_PARTITION);
      const cookies = await sess.cookies.get({});
      const loggedIn = cookies.some((c) => {
        const d = String(c.domain || "").toLowerCase();
        return (
          (d.includes("goofish.com") ||
            d.includes("taobao.com") ||
            d.includes("alibaba.com") ||
            d.includes("alipay.com")) &&
          !!c.value
        );
      });
      if (!loggedIn) {
        embedLog("warm-start skip: no login cookies");
        return;
      }
      if (!ensureView(win)) {
        embedLog("warm-start failed: view_unavailable");
        return;
      }
      userViewing = false;
      parkOffscreen();
      embedLog(`warm-start parked (${cookies.length} cookies)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      embedLog(`warm-start error: ${msg}`);
    }
  })();
}

/** renderer 上报几何/可见性 */
export function goofishEmbedSync(
  win: electronType.BrowserWindow | null,
  payload: GoofishSyncPayload,
): { ok: boolean; reason?: string } {
  if (!win || win.isDestroyed()) return { ok: true }; // 窗口已关, 无事可做
  try {
    const rect = payload && payload.rect;
    const visible = !!(payload && payload.visible && rect);
    if (!loggedFirstSync) {
      loggedFirstSync = true;
      embedLog(`first sync: visible=${visible} rect=${JSON.stringify(rect)}`);
    }
    if (!visible && payload.debug) {
      embedLog(`hidden: ${payload.debug}`);
    }
    if (!visible || !rect || rect.width <= 0 || rect.height <= 0) {
      userViewing = false;
      if (rect && rect.width > 0 && rect.height > 0) {
        // 仍在闲鱼 tab, 但浮层压住嵌入框 — 必须藏原生层, 否则盖不住
        if (view) view.setVisible(false);
      } else if (view) {
        // 切走 tab / 卸面板: 屏外停靠保活 (勿 setVisible(false))
        parkOffscreen();
      }
      return { ok: true };
    }
    const v = ensureView(win);
    if (!v) return { ok: false, reason: "view_unavailable" };
    userViewing = true;
    v.setBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    v.setVisible(true);
    return { ok: true };
  } catch {
    return { ok: false, reason: "sync_failed" };
  }
}

/** 导航指令: home / reload / load(限 goofish.com 域) */
export function goofishEmbedNav(
  win: electronType.BrowserWindow | null,
  payload: GoofishNavPayload,
): { ok: boolean; reason?: string } {
  try {
    if (!win || win.isDestroyed()) return { ok: false, reason: "no_window" };
    const target = ensureView(win);
    if (!target) return { ok: false, reason: "view_unavailable" };
    const action = payload && payload.action;
    if (action === "home") {
      target.webContents.loadURL(GOOFISH_HOME).catch(() => {});
    } else if (action === "reload") {
      target.webContents.reload();
    } else if (action === "load") {
      if (!isSafeGoofishLoadUrl(payload.url)) {
        return { ok: false, reason: "unsafe_url" };
      }
      target.webContents.loadURL(String(payload.url)).catch(() => {});
    } else {
      return { ok: false, reason: "unknown_action" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "nav_failed" };
  }
}

/** guest 当前画面快照 (遮挡冻结用): 无视图/截取失败返回 ok:false */
export async function goofishEmbedSnapshot(): Promise<{
  ok: boolean;
  dataUrl?: string;
}> {
  try {
    if (!view || !attachedWin || attachedWin.isDestroyed()) return { ok: false };
    const img = await view.webContents.capturePage();
    if (!img || img.isEmpty()) return { ok: false };
    return { ok: true, dataUrl: img.toDataURL() };
  } catch {
    return { ok: false };
  }
}

/** 测试/卸载兜底: 屏外停靠 (保活) */
export function goofishEmbedHide(): void {
  userViewing = false;
  parkOffscreen();
}

/** 测试专用: 重置模块态 */
export function __resetGoofishEmbedForTest(): void {
  lastUnread = 0;
  pendingUnread = null;
  unreadSeeded = false;
  userViewing = false;
  loggedFirstSync = false;
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
  view = null;
  attachedWin = null;
}
