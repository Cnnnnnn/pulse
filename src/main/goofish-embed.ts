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
 *   - guest warm-start 屏外停在 /im（官方 IM WS 只在此页建连）
 *   - 未读徽标与系统通知由 goofish/notify-service.ts（session.sync + WS chat）
 *   - guest 内钩住官方 IM WebSocket：门铃触发 sync；chat 帧可直接弹通知
 *   - 本模块不再做 title/DOM 未读轮询，避免双写抢徽标
 *
 * 安全: guest 围栏 (弹窗全拒 + 导航白名单) 见 webview-guard.applyGoofishGuestFence;
 * 分区 session 加固 (UA 伪装 + 权限全拒) 见 webview-guard.hardenGoofishSession。
 */

import type * as electronType from "electron";
import type { GoofishNavPayload, GoofishSyncPayload } from "../shared/ipc-contracts";

const GOOFISH_HOME = "https://www.goofish.com/";
/** 消息保活页：官方 IM WebSocket 只在 /im 建连；首页不会挂长连 */
const GOOFISH_IM = "https://www.goofish.com/im";
const GOOFISH_PARTITION = "persist:goofish";
/** 屏外停靠: 保持 guest 存活 (JS/WS), 又不挡主窗口 */
const PARK_BOUNDS = { x: -12000, y: 0, width: 1280, height: 800 };

let view: electronType.WebContentsView | null = null;
let attachedWin: electronType.BrowserWindow | null = null;
let loggedFirstSync = false;
/** 用户正在看嵌入页 (tab 可见且未被浮层遮挡) */
let userViewing = false;
/**
 * guest 当前停在 /im 只是为了后台挂 WS，并非用户主动进消息页。
 * 用户再次打开闲鱼 tab 时应回到首页，避免「一打开就是消息」。
 */
let imKeepaliveOnly = false;

function embedLog(msg: string): void {
  try {
    const { mainLog } = require("./log.ts");
    mainLog.info(`[goofish-embed] ${msg}`);
  } catch {
    /* noop */
  }
}

/** 闲鱼 web 端未读数走标题前缀: "(2) 闲鱼 - ..." / "（3）..." / "【1】..."（单测保留） */
export function parseUnreadFromTitle(title: unknown): number {
  const m = String(title ?? "").match(/^\s*[(（【]\s*(\d+)\s*[)）】]/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function parkOffscreen(): void {
  if (!view) return;
  try {
    view.setBounds(PARK_BOUNDS);
    // 关键: 必须 visible=true, 否则 Chromium 可能冻住 guest → WS/轮询停摆
    view.setVisible(true);
    ensureImKeepalive();
  } catch {
    /* noop */
  }
}

/**
 * 后台必须停在 /im 才能挂官方 IM WS。用户切走 tab 后若停在首页，长连会断。
 * 已在 /im 时只软唤醒（visibility/focus），避免整页 reload 打断长连。
 * 登录/扫码页不动。
 */
function ensureImKeepalive(): void {
  try {
    if (!view || view.webContents.isDestroyed() || userViewing) return;
    const url = String(view.webContents.getURL() || "");
    if (!/goofish\.com/i.test(url)) return;
    if (/login|passport|havana|qrcode/i.test(url)) return;
    if (/\/im(?:\?|$|#)/i.test(url)) {
      void view.webContents
        .executeJavaScript(VISIBILITY_SPOOF, true)
        .then(() => embedLog("keepalive soft-wake /im"))
        .catch(() => {});
      return;
    }
    imKeepaliveOnly = true;
    void view.webContents.loadURL(GOOFISH_IM).catch(() => {});
    embedLog("keepalive → /im");
  } catch {
    /* noop */
  }
}

/** 用户打开闲鱼面板时：若只是保活态 /im，退回首页 */
function maybeLeaveKeepaliveIm(): void {
  try {
    if (!imKeepaliveOnly || !view || view.webContents.isDestroyed()) return;
    const url = String(view.webContents.getURL() || "");
    imKeepaliveOnly = false;
    // 深链会话保留；裸 /im 才回首页
    if (/\/im(?:\?|$|#)/i.test(url) && !/[?&]peerUserId=/i.test(url)) {
      void view.webContents.loadURL(GOOFISH_HOME).catch(() => {});
      embedLog("user open → home (leave keepalive /im)");
    }
  } catch {
    /* noop */
  }
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

/** guest 隐藏/失焦后闲鱼可能自行暂停 IM；伪装成前台可见 */
const VISIBILITY_SPOOF = `(() => {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    try {
      Document.prototype.hasFocus = function () { return true; };
    } catch (e1) {}
    try {
      Object.defineProperty(document, 'hasFocus', {
        value: function () { return true; },
        configurable: true,
      });
    } catch (e2) {}
    document.dispatchEvent(new Event('visibilitychange'));
    try { window.dispatchEvent(new Event('focus')); } catch (e3) {}
  } catch (e) {}
})()`;

/**
 * 钩住官方 IM WebSocket：
 *   1) 门铃：有流量 console 打标，主进程防抖后 session.sync（保留兜底）
 *   2) spike：sync 推送帧原文（截断+限频）转发主进程，验证帧格式可稳定解析
 * 不解析协议、不代发消息 —— 复用页面已建好的长连。
 */
const WS_WAKE_HOOK = `(() => {
  if (window.__gfWsWakeHook) return;
  window.__gfWsWakeHook = true;
  const Orig = window.WebSocket;
  if (!Orig) return;
  function u8B64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function Wrapped(url, protocols) {
    const ws = protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
    try {
      const u = String(url || '');
      if (/goofish|dingtalk/i.test(u)) {
        ws.addEventListener('open', function () {
          if (window.__gfWsOpenAt && Date.now() - window.__gfWsOpenAt < 30000) return;
          window.__gfWsOpenAt = Date.now();
          console.info('__GOOFISH_WS_OPEN__' + u.slice(0, 120));
        });
        ws.addEventListener('message', function (ev) {
          var now = Date.now();
          if (window.__gfWsLast && now - window.__gfWsLast < 1500) return;
          window.__gfWsLast = now;
          console.info('__GOOFISH_WS__');
        });
        ws.addEventListener('message', function (ev) {
          try {
            var d = ev.data;
            var now = Date.now();
            if (window.__gfWsFrameLast && now - window.__gfWsFrameLast < 2000) return;
            if (typeof d === 'string') {
              if (d.indexOf('syncPushPackage') === -1) return;
              window.__gfWsFrameLast = now;
              console.info('__GOOFISH_WS_FRAME__' + d.slice(0, 32768));
              return;
            }
            // 二进制帧（Blob/ArrayBuffer）：页面协商二进制时外层是 msgpack，
            // 文本检查永远不命中 —— base64 转发主进程解
            var u8 = null;
            if (d && typeof Blob !== 'undefined' && d instanceof Blob) {
              d.arrayBuffer().then(function (buf) {
                try {
                  var u8b = new Uint8Array(buf);
                  var now2 = Date.now();
                  if (window.__gfWsBinLast && now2 - window.__gfWsBinLast < 2000) return;
                  window.__gfWsBinLast = now2;
                  console.info('__GOOFISH_WS_BIN__' + u8B64(u8b.subarray(0, 24576)));
                } catch (e) {}
              }).catch(function () {});
              return;
            }
            if (d instanceof ArrayBuffer) {
              u8 = new Uint8Array(d);
              window.__gfWsFrameLast = now;
              console.info('__GOOFISH_WS_BIN__' + u8B64(u8.subarray(0, 24576)));
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
    return ws;
  }
  Wrapped.prototype = Orig.prototype;
  Wrapped.CONNECTING = Orig.CONNECTING;
  Wrapped.OPEN = Orig.OPEN;
  Wrapped.CLOSING = Orig.CLOSING;
  Wrapped.CLOSED = Orig.CLOSED;
  window.WebSocket = Wrapped;
})()`;
const WS_FRAME_MARKER = "__GOOFISH_WS_FRAME__";
const WS_BIN_MARKER = "__GOOFISH_WS_BIN__";

/**
 * 读站点右侧「消息」角标。先伪装可见并 focus。
 *
 * - /im 保活页可能没有「发闲置」，不能只靠该文案判定侧栏
 * - 角标只认「消息」节点邻近的短数字；99 单独两轮确认，避免闪一下
 */
const RAIL_UNREAD_PROBE = `(() => new Promise((resolve) => {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  } catch (e) {}
  setTimeout(() => {
    const t = String(document.title || '');
    const tm = t.match(/^\\s*[(（【]\\s*(\\d{1,2})\\+?/);
    const titleCount = tm ? Math.min(99, parseInt(tm[1], 10) || 0) : 0;
    let railCount = 0;
    let rail99 = false;

    function readBadgeText(el) {
      const raw = String((el && el.textContent) || '').trim();
      if (raw === '99+') return 99;
      if (!/^\\d{1,2}$/.test(raw)) return 0;
      const v = parseInt(raw, 10);
      return !Number.isNaN(v) && v > 0 ? v : 0;
    }

    function isRightRailLabel(n) {
      try {
        const r = n.getBoundingClientRect();
        if (r.width > 0 && r.left > window.innerWidth * 0.72) return true;
      } catch (e) {}
      for (let p = n.parentElement, i = 0; p && i < 8; i++, p = p.parentElement) {
        const tx = p.textContent || '';
        if (tx.indexOf('发闲置') !== -1 || tx.indexOf('APP内打开') !== -1) return true;
        try {
          const st = window.getComputedStyle(p);
          if (st.position === 'fixed') {
            const right = parseInt(st.right, 10);
            if (st.right === '0px' || (!Number.isNaN(right) && right <= 48)) return true;
          }
        } catch (e2) {}
      }
      return false;
    }

    function badgeNearMessage(msgNode) {
      let best = 0;
      let saw99 = false;
      const anchors = [msgNode.parentElement, msgNode.parentElement && msgNode.parentElement.parentElement].filter(Boolean);
      for (const scope of anchors) {
        const cands = scope.querySelectorAll('[class*="badge" i], [class*="count" i], [class*="red" i], span, div, i, em');
        for (const b of cands) {
          if (b.childElementCount > 0) continue;
          // 必须挂在「消息」同一小枝上（向上 ≤4 层碰到 msg 父级）
          let close = false;
          for (let x = b, k = 0; x && k < 5; k++, x = x.parentElement) {
            if (x === msgNode || x === msgNode.parentElement) { close = true; break; }
          }
          if (!close) continue;
          const v = readBadgeText(b);
          if (v === 99) { saw99 = true; continue; }
          if (v > 0 && v < 99) best = Math.max(best, v);
        }
      }
      return { best: best, saw99: saw99 };
    }

    for (const n of document.querySelectorAll('div,span,a')) {
      if (n.childElementCount !== 0) continue;
      if ((n.textContent || '').trim() !== '消息') continue;
      if (!isRightRailLabel(n)) continue;
      const hit = badgeNearMessage(n);
      if (hit.best > 0) railCount = hit.best;
      if (hit.saw99) rail99 = true;
      break;
    }
    // 只有附近没读到 1～98 时才考虑 99+（仍由主进程两轮确认）
    if (!railCount && rail99) railCount = 99;
    resolve(JSON.stringify({ t: titleCount, r: railCount }));
  }, 280);
}))()`;

let railPollTimer: ReturnType<typeof setInterval> | null = null;
let railProbeInflight = false;
let lastAppliedRail = -1;
/** 下降或可疑跳变（如误读 99）需两轮确认 */
let pendingRailConfirm: number | null = null;
let lastRailKickAt = 0;

function applyRailProbeResult(raw: unknown): void {
  let titleCount = 0;
  let railCount = 0;
  try {
    const parsed = JSON.parse(String(raw));
    titleCount = Number(parsed.t) || 0;
    railCount = Number(parsed.r) || 0;
  } catch {
    return;
  }
  if (railCount > 99) railCount = 99;
  if (titleCount > 99) titleCount = 99;
  const unread = Math.max(titleCount, railCount);

  const baseline = lastAppliedRail < 0 ? 0 : lastAppliedRail;
  // 只有「飙到 99 / 一次跳 ≥8」才两轮确认；下降（含清零）立刻同步
  const jumped =
    unread >= 99 || (unread > baseline && unread - baseline >= 8);

  if (unread === lastAppliedRail) {
    pendingRailConfirm = null;
    return;
  }

  if (jumped) {
    if (unread !== pendingRailConfirm) {
      pendingRailConfirm = unread;
      return;
    }
    pendingRailConfirm = null;
  } else {
    pendingRailConfirm = null;
  }

  lastAppliedRail = unread;
  // keepalive（/im 后台挂载 / 用户没在切到闲鱼 tab）下，DOM 探测会读到 /im 上
  // 不存在的右栏角标 → 0；盲目覆盖 lastBadge 反而把用户在首页上看到的真实值
  // 冲掉。仅在用户实际打开闲鱼 tab（userViewing=true）时 push 给 renderer；
  // 后台 keepalive 期间只更新 lastAppliedRail，等用户切回时按新值重新对齐。
  if (!userViewing) return;
  try {
    const { goofishNotifyOnDomRail } = require("./goofish/notify-service.ts");
    goofishNotifyOnDomRail(unread);
  } catch {
    /* noop */
  }
}

function probeRailUnreadNow(): void {
  try {
    if (!view || view.webContents.isDestroyed() || railProbeInflight) return;
    railProbeInflight = true;
    void view.webContents
      .executeJavaScript(RAIL_UNREAD_PROBE, true)
      .then((raw: unknown) => {
        try {
          const parsed = JSON.parse(String(raw));
          // 低频打点，方便确认探测是否读到 0
          if (Math.random() < 0.08) {
            embedLog(`rail-probe t=${parsed.t} r=${parsed.r}`);
          }
        } catch {
          /* noop */
        }
        applyRailProbeResult(raw);
      })
      .catch(() => {})
      .finally(() => {
        railProbeInflight = false;
      });
  } catch {
    railProbeInflight = false;
  }
}

/** WS/门铃触发时立刻读一次角标（限频，避免帧风暴） */
export function goofishEmbedKickRailProbe(): void {
  const now = Date.now();
  if (now - lastRailKickAt < 800) return;
  lastRailKickAt = now;
  probeRailUnreadNow();
}

function startRailUnreadPoll(): void {
  if (railPollTimer) return;
  // 首探尽快，后续 2s 一轮（上涨立刻生效，不必等双确认）
  setTimeout(() => probeRailUnreadNow(), 1_200);
  railPollTimer = setInterval(() => {
    probeRailUnreadNow();
  }, 2_000);
}

function isGoofishImWsUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return /goofish|dingtalk|idle|im\.|wss?:\/\//i.test(u);
}

/**
 * CDP Network 直接嗅探官方 IM WebSocket。
 * 页内 hook 在生产环境经常挂不上（脚本早于注入 / Worker 建连），
 * 实测 3.3.5 整段会话零 `[goofish-ws]` —— 改走 debugger 旁路。
 */
function installCdpWsSniffer(wc: electronType.WebContents): void {
  const self = wc as unknown as { __gfCdpWsSniffer?: boolean };
  if (self.__gfCdpWsSniffer) return;
  self.__gfCdpWsSniffer = true;

  const onDebuggerMessage = (
    _event: unknown,
    method: string,
    params: Record<string, any>,
  ) => {
    try {
      if (method === "Network.webSocketCreated") {
        const url = String(params?.url || "");
        if (!isGoofishImWsUrl(url)) return;
        const { handleGoofishWsOpen } = require("./goofish/ws-frames.ts");
        handleGoofishWsOpen(`cdp:${url}`);
        return;
      }
      if (method === "Network.webSocketFrameReceived") {
        const urlHint = String(params?.response?.payloadData || "");
        const opcode = Number(params?.response?.opcode);
        const payload = params?.response?.payloadData;
        if (opcode === 1 && typeof payload === "string") {
          // 文本帧：门铃 + 有 syncPush 则解析
          try {
            const { goofishNotifyOnWsWake } = require("./goofish/notify-service.ts");
            goofishNotifyOnWsWake();
          } catch {
            /* noop */
          }
          if (payload.includes("syncPushPackage") || payload.includes("lwp")) {
            const { handleGoofishWsFrame } = require("./goofish/ws-frames.ts");
            handleGoofishWsFrame(payload);
          }
          return;
        }
        if (opcode === 2 && typeof payload === "string") {
          // 二进制帧：CDP 给 base64
          try {
            const { goofishNotifyOnWsWake } = require("./goofish/notify-service.ts");
            goofishNotifyOnWsWake();
          } catch {
            /* noop */
          }
          const { handleGoofishWsBinFrame } = require("./goofish/ws-frames.ts");
          handleGoofishWsBinFrame(payload);
          return;
        }
        void urlHint;
      }
      if (method === "Network.webSocketClosed") {
        embedLog("cdp ws closed");
      }
    } catch {
      /* noop */
    }
  };

  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach("1.3");
    }
    wc.debugger.removeListener("message", onDebuggerMessage as any);
    wc.debugger.on("message", onDebuggerMessage as any);
    void wc.debugger
      .sendCommand("Network.enable", {
        maxResourceBufferSize: 1_048_576,
        maxPostDataSize: 65_536,
      })
      .then(() => embedLog("cdp Network.enable ok"))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        embedLog(`cdp Network.enable fail: ${msg}`);
      });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    embedLog(`cdp attach fail: ${msg}`);
  }
}

function installGuestWakeBridge(wc: electronType.WebContents): void {
  const inject = () => {
    try {
      void wc.executeJavaScript(VISIBILITY_SPOOF + WS_WAKE_HOOK, true).catch(() => {});
    } catch {
      /* noop */
    }
  };
  wc.on("dom-ready", inject);
  // 尽量赶在页面脚本建连前注入；CDP Network 作主路径
  try {
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach("1.3");
    }
    void wc.debugger
      .sendCommand("Page.enable")
      .then(() =>
        wc.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {
          source: VISIBILITY_SPOOF + WS_WAKE_HOOK,
        }),
      )
      .catch(() => {
        /* 无 debugger 权限时靠 dom-ready */
      });
  } catch {
    /* noop */
  }
  installCdpWsSniffer(wc);
  wc.on("console-message", (...args: any[]) => {
    try {
      let msg = "";
      if (args[0] && typeof args[0] === "object" && args[0].message != null) {
        msg = String(args[0].message);
      } else if (typeof args[2] === "string") {
        msg = args[2];
      }
      if (msg.startsWith(WS_BIN_MARKER)) {
        try {
          const { handleGoofishWsBinFrame } = require("./goofish/ws-frames.ts");
          handleGoofishWsBinFrame(msg.slice(WS_BIN_MARKER.length));
        } catch {
          /* noop */
        }
      }
      if (msg.startsWith(WS_FRAME_MARKER)) {
        try {
          const { handleGoofishWsFrame } = require("./goofish/ws-frames.ts");
          handleGoofishWsFrame(msg.slice(WS_FRAME_MARKER.length));
        } catch {
          /* noop */
        }
      }
      if (msg.startsWith("__GOOFISH_WS_OPEN__")) {
        try {
          const { handleGoofishWsOpen } = require("./goofish/ws-frames.ts");
          handleGoofishWsOpen(msg.slice("__GOOFISH_WS_OPEN__".length));
        } catch {
          /* noop */
        }
      }
      if (!msg.includes("__GOOFISH_WS__")) return;
      const { goofishNotifyOnWsWake } = require("./goofish/notify-service.ts");
      goofishNotifyOnWsWake();
    } catch {
      /* noop */
    }
  });
}

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
      // 页面 loadURL 完成（包括 /im → 首页切换）立刻读一次右侧「消息」角标，
      // 否则定时器最快也要 ~1.2s+0.28s 后才同步，期间有 WS 帧到达也会因新页 DOM
      // 没出来读到陈旧值。
      const onFinishLoad = () => {
        // 250ms 后让首屏把右侧栏 mount 出来再读；kick 内部限频 800ms 容忍重入
        setTimeout(() => probeRailUnreadNow(), 250);
      };
      view.webContents.on("did-finish-load", onFinishLoad);
      // 未读：session.sync + WS + 右侧栏「消息」DOM 角标（站点真值，不是协议 57）
      // 首次停在 /im —— 官方 IM WebSocket 只在消息页建连，首页挂不住长连。
      installGuestWakeBridge(view.webContents);
      startRailUnreadPoll();
      embedLog("guest view created, loading /im (keepalive)");
      // 先停靠屏外, 等 goofish:sync 给真实矩形再亮出来 — 避免 warm-start / 创建瞬间闪屏
      parkOffscreen();
      imKeepaliveOnly = true;
      view.webContents
        .loadURL(GOOFISH_IM)
        .then(() => embedLog("guest /im loaded"))
        .catch(() => {});
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
        // 已有 guest: 用户正在看则不乱动；否则仅屏外保活（认证恢复改走 soft-refresh，避免狂 reload）
        if (userViewing) return;
        parkOffscreen();
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
    maybeLeaveKeepaliveIm();
    // 打开面板时立刻对一下角标（已读后应尽快降下来）
    goofishEmbedKickRailProbe();
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
      imKeepaliveOnly = false;
      target.webContents.loadURL(GOOFISH_HOME).catch(() => {});
    } else if (action === "reload") {
      target.webContents.reload();
    } else if (action === "load") {
      if (!isSafeGoofishLoadUrl(payload.url)) {
        return { ok: false, reason: "unsafe_url" };
      }
      imKeepaliveOnly = false;
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

/**
 * 软续活：不整页 reload（reload 风暴会把仍在线的会话赶到扫码页）。
 * 无 guest 时才走 warm-start 创建。
 */
export function goofishEmbedSoftRefresh(
  win: electronType.BrowserWindow | null,
): Promise<void> {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return (async () => {
    try {
      if (!view) {
        await goofishEmbedWarmStart(win);
        return;
      }
      if (userViewing) {
        embedLog("soft-refresh skip: user viewing");
        return;
      }
      parkOffscreen();
      try {
        await view.webContents.executeJavaScript(
          `fetch("https://www.goofish.com/im",{credentials:"include",cache:"no-store"}).catch(()=>{})`,
          true,
        );
        embedLog("soft-refresh ping /im");
      } catch {
        /* noop */
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      embedLog(`soft-refresh error: ${msg}`);
    }
  })();
}

/**
 * 软唤醒 guest：伪装可见 + focus，促使闲鱼页处理积压推送。
 * 限频，避免每帧都 executeJavaScript。
 */
let lastSoftWakeAt = 0;
export function goofishEmbedSoftWake(): void {
  try {
    if (!view || view.webContents.isDestroyed()) return;
    const now = Date.now();
    if (now - lastSoftWakeAt < 2_000) return;
    lastSoftWakeAt = now;
    void view.webContents.executeJavaScript(VISIBILITY_SPOOF, true).catch(() => {});
  } catch {
    /* noop */
  }
}

/** 供通知服务页内 sync */
export function goofishEmbedGetWebContents(): electronType.WebContents | null {
  try {
    if (!view || view.webContents.isDestroyed()) return null;
    return view.webContents;
  } catch {
    return null;
  }
}

/** 测试/卸载兜底: 屏外停靠 (保活) */
export function goofishEmbedHide(): void {
  userViewing = false;
  parkOffscreen();
}

/** 测试专用: 重置模块态 */
export function __resetGoofishEmbedForTest(): void {
  userViewing = false;
  loggedFirstSync = false;
  imKeepaliveOnly = false;
  view = null;
  attachedWin = null;
}
