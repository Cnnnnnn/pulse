/**
 * src/main/webview-guard.ts
 *
 * 闲鱼嵌入 guest 安全围栏 (v3.3)。
 *
 * guest 内容 (goofish.com) 是远程不可信页面, 围栏两层:
 *   1. setWindowOpenHandler — guest 一切弹窗拒绝; http(s) 目标转系统浏览器
 *   2. will-navigate — 顶栏导航白名单 (闲鱼/淘宝/天猫/支付宝交易链路),
 *      白名单外 preventDefault + 转系统浏览器
 *
 * 围栏应用到两类载体:
 *   - <webview> tag guest (web-contents-created, type === "webview")
 *   - goofish-embed.ts 创建的 WebContentsView (直接调用 applyGoofishGuestFence)
 *
 * 另含 persist:goofish 分区 session 加固: UA 伪装标准 Chrome (去 Electron 标记),
 * 权限请求 (通知/定位/摄像头/剪贴板读取等) 一律拒绝。
 */

import type * as electronType from "electron";

/** 闲鱼嵌入专用持久分区 — 扫码登录 cookie 独立存放, 不污染 default session */
const GOOFISH_PARTITION = "persist:goofish";

/** 与 spike 验证一致的 Chrome/macOS UA (去掉 Electron/x.y 标记) */
const GOOFISH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * webview 内允许顶栏导航的域名后缀白名单。
 * goofish.com 站内 + 淘系账号体系 (扫码登录) + 交易收银台。
 */
const NAV_ALLOWED_HOST_SUFFIXES = [
  "goofish.com",
  "taobao.com",
  "tmall.com",
  "alipay.com",
];

function isAllowedGoofishNavUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return NAV_ALLOWED_HOST_SUFFIXES.some(
      (s) => host === s || host.endsWith("." + s),
    );
  } catch {
    return false;
  }
}

function openExternalIfSafe(url: string): void {
  try {
    const { isSafeExternalUrl } = require("./security/open-targets.ts");
    if (!isSafeExternalUrl(url)) return;
    const { shell } = require("electron") as typeof electronType;
    void shell.openExternal(url).catch(() => {});
  } catch {
    /* noop */
  }
}

/**
 * 给单个 guest webContents 挂围栏。幂等 — 用内部标记防重复挂。
 */
export function applyGoofishGuestFence(contents: electronType.WebContents): void {
  if (!contents || typeof contents.setWindowOpenHandler !== "function") return;
  const self = contents as unknown as { __goofishFenceApplied?: boolean };
  if (self.__goofishFenceApplied) return;
  self.__goofishFenceApplied = true;

  // 1) guest 弹窗分流:
  //    - 白名单域 (goofish/taobao/tmall/alipay) → 取消弹窗, 在 guest 内部接管导航
  //      (闲鱼「消息」IM 是 target=_blank 打开的同域页, 不接管会被甩到系统浏览器)
  //    - 其余 http(s) → 转系统浏览器 (复用 open-url 白名单语义)
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedGoofishNavUrl(url)) {
      try {
        const { mainLog } = require("./log.ts");
        mainLog.info(`[goofish-embed] popup takeover in-guest: ${url}`);
      } catch {
        /* noop */
      }
      try {
        void contents.loadURL(url).catch(() => {});
      } catch {
        /* noop */
      }
      return { action: "deny" };
    }
    openExternalIfSafe(url);
    return { action: "deny" };
  });

  // 2) 顶栏导航白名单; 白名单外 preventDefault + 系统浏览器兜底
  contents.on("will-navigate", (event, url) => {
    if (isAllowedGoofishNavUrl(url)) return;
    event.preventDefault();
    openExternalIfSafe(String(url));
  });
}

/** 单例守卫 — index.ts 在 app 模块加载期调用一次 (<webview> tag 载体) */
let _installed = false;
export function installWebviewGuard(): void {
  if (_installed) return;
  const { app } = require("electron") as typeof electronType;
  if (!app || typeof app.on !== "function") return;
  _installed = true;

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    applyGoofishGuestFence(contents);
  });
}

/** app.whenReady 后调用一次: 闲鱼分区 session 加固 */
export function hardenGoofishSession(): void {
  const { session } = require("electron") as typeof electronType;
  if (!session || typeof session.fromPartition !== "function") return;
  try {
    const sess = session.fromPartition(GOOFISH_PARTITION);
    // 统一 UA — 页面文档 + subresource + SW 一致, 避免风控看到 Electron UA
    sess.setUserAgent(GOOFISH_UA);
    // 权限请求 (通知/定位/媒体/clipboard-read 等) 默认全拒
    sess.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
    sess.setPermissionCheckHandler(() => false);
  } catch {
    /* noop — vitest 环境无真实 session */
  }
}

export const GOOFISH_PARTITION_NAME = GOOFISH_PARTITION;
