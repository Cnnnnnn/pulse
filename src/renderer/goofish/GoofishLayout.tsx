/**
 * src/renderer/goofish/GoofishLayout.tsx
 *
 * 闲鱼 web 版嵌入 (v3.3)。guest 是主进程 WebContentsView (goofish-embed.ts 管理):
 *   - 登录: 首次在页面内扫码 (淘系 Havana), cookie 存 persist:goofish 分区, 重启不丢
 *   - 搜索: 顶部快捷框拼 /search?q= 直达 (spike 验证: 搜索必须登录)
 *   - 安全: guest 弹窗/导航由主进程 webview-guard.ts 围栏, 权限请求全拒
 *
 * 为什么不是 <webview>: Electron 43 + macOS 26 上 webview guest 渲染面高度锁死
 * 150px (元素盒尺寸正确, Preact 重渲染重建元素会触发 guest 整页 reload 之外还有
 * 上游 BrowserPlugin 几何同步缺陷)。WebContentsView 由主进程 setBounds, 实测精确生效。
 *
 * 本组件职责:
 *   1. 占位容器 (goofish-frame) — 量出矩形经 goofish:sync 上报主进程
 *   2. 遮挡门控 — WebContentsView 是原生层, 永远在所有 DOM 之上; 任何 DOM 盖到
 *      框上 (NavDrawer 弹出 / portal 抽屉 / 弹窗 / tooltip) 都必须隐藏 guest 让位。
 *      检测 = body 顶层 portal 扫描 + elementFromPoint 采样命中测试 + 矩形漂移轮询,
 *      三路合并, 不枚举具体浮层组件。
 *   3. 工具条 — 搜索 / 首页 / 刷新 / 外部打开
 */

import { useEffect, useRef, useState } from "preact/hooks";
import "./goofish.css";
import { api } from "../api.ts";
import { toggleGlobalChat } from "../assistant/assistant-store.ts";
import { goofishAuthStatus } from "./store.ts";

const GOOFISH_HOME = "https://www.goofish.com/";
const GOOFISH_IM = "https://www.goofish.com/im";

function authLabel(status: string): { text: string; tone: string } {
  switch (status) {
    case "ok":
      return { text: "已登录", tone: "ok" };
    case "logged_out":
      return { text: "未登录 · 请扫码", tone: "warn" };
    case "auth_expired":
      return { text: "登录过期 · 请重新扫码", tone: "warn" };
    case "risk":
      return { text: "风控拦截", tone: "err" };
    case "error":
      return { text: "消息同步异常", tone: "err" };
    default:
      return { text: "检测登录中…", tone: "muted" };
  }
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** body 顶层除 #app / #titlebar / script 外的子节点都是 portal 浮层 (v3.2.1 起抽屉全 portal 化) */
function bodyOverlayActive(): boolean {
  const body = typeof document === "undefined" ? null : document.body;
  if (!body) return false;
  for (const el of Array.from(body.children)) {
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") continue;
    const id = el.id;
    if (id === "app" || id === "titlebar") continue;
    return true;
  }
  return false;
}

/**
 * 框上是否压着别的 DOM (NavDrawer 弹出 / portal 抽屉 / 弹窗 / tooltip)。
 * 采样网格 3 列 × 5 行, 全部避开四角 — 框有 12px 圆角, 角上采样会穿透到父级
 * 容器造成误判; 祖先命中 (圆角缺口透出的父级背景) 也不算遮挡。
 */
function domCoveringFrame(frame: HTMLElement): boolean {
  const r = frame.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return true;
  const cols = [0.03, 0.5, 0.97];
  const rows = [0.12, 0.25, 0.5, 0.75, 0.88];
  for (const gx of cols) {
    for (const gy of rows) {
      const el = document.elementFromPoint(r.x + r.width * gx, r.y + r.height * gy);
      if (!el) continue;
      if (frame.contains(el) || el.contains(frame)) continue;
      return true;
    }
  }
  return false;
}

export function GoofishLayout(_props: { onCheck?: () => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [currentUrl, setCurrentUrl] = useState(GOOFISH_HOME);
  const [query, setQuery] = useState("");
  const [frozenUrl, setFrozenUrl] = useState<string | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    if (!api || typeof api.goofishSync !== "function") return undefined;

    let raf = 0;
    let lastKey = "";
    let disposed = false;
    let live = true; // 嵌入视图当前是否在显示 (与 frozen 对应)
    const frozenRef = { url: null as string | null };

    const send = (rect: Rect, visible: boolean) => {
      api
        .goofishSync({ rect, visible })
        .catch(() => {
          /* noop */
        });
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (disposed) return;
        const r = frame.getBoundingClientRect();
        const covered = domCoveringFrame(frame) || bodyOverlayActive();
        const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}|${covered ? 1 : 0}|${frozenRef.url ? 1 : 0}`;
        if (key === lastKey) return; // 无变化不上报
        lastKey = key;
        const rect = { x: r.x, y: r.y, width: r.width, height: r.height };
        if (covered) {
          // 有浮层压框: 先抓当前画面冻结到 DOM 里, 再隐藏原生视图 →
          // 抽屉/弹窗浮在上面, 视觉上页面"停住"而不是变成空白
          if (frozenRef.url) {
            send(rect, false);
            return;
          }
          if (typeof api.goofishSnapshot !== "function") {
            send(rect, false);
            return;
          }
          api
            .goofishSnapshot()
            .then((s: { ok: boolean; dataUrl?: string }) => {
              if (disposed) return;
              if (s && s.ok && s.dataUrl) {
                frozenRef.url = s.dataUrl;
                setFrozenUrl(s.dataUrl);
              }
              send(rect, false);
            })
            .catch(() => {
              send(rect, false);
            });
        } else {
          // 遮挡消失: 先恢复原生视图, 再撤掉冻结图
          if (frozenRef.url) {
            frozenRef.url = null;
            setFrozenUrl(null);
          }
          send(rect, true);
        }
      });
    };

    sync();
    // 快路径: frame 尺寸变 / 窗口 resize / DOM 结构变
    const ro = new ResizeObserver(sync);
    ro.observe(frame);
    window.addEventListener("resize", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    // 慢路径兜底: 纯位置漂移 (布局位移不改尺寸) 与任何漏网场景, 300ms 对账
    const iv = setInterval(sync, 300);

    const unsub =
      typeof api.onGoofishUrl === "function"
        ? api.onGoofishUrl((url: string) => {
            if (typeof url === "string" && url) setCurrentUrl(url);
          })
        : null;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      clearInterval(iv);
      window.removeEventListener("resize", sync);
      if (unsub) unsub();
      // 切走面板: 隐藏 guest (页面状态保留在主进程视图里, 切回来不重载)
      api.goofishSync({ rect: null, visible: false }).catch(() => {
        /* noop */
      });
    };
  }, []);

  const doSearch = () => {
    const q = query.trim();
    if (!q) return;
    api
      .goofishNav({
        action: "load",
        url: `https://www.goofish.com/search?q=${encodeURIComponent(q)}`,
      })
      .catch(() => {
        /* noop */
      });
  };

  const openExternal = () => {
    const url = currentUrl || GOOFISH_HOME;
    if (api && typeof api.openUrl === "function") {
      api.openUrl(url).catch(() => {
        /* noop */
      });
    }
  };

  useEffect(() => {
    // 进入闲鱼页：对齐一次未读 + 拉 auth
    if (typeof api.goofishCheckNow === "function") {
      api.goofishCheckNow().catch(() => {});
    }
    return undefined;
  }, []);

  const reLogin = () => {
    api.goofishNav({ action: "home" }).catch(() => {});
  };

  const openIm = () => {
    api.goofishNav({ action: "load", url: GOOFISH_IM }).catch(() => {});
  };

  const auth = authLabel(goofishAuthStatus.value);

  return (
    <div class="goofish-layout">
      <div class="goofish-header">
        <div class="goofish-header__left">
          <div class="goofish-header__title">
            闲鱼
            <span class={`goofish-header__auth goofish-header__auth--${auth.tone}`}>
              {auth.text}
            </span>
            <span class="goofish-header__meta">
              web 版嵌入 · 消息通知走会话接口，登录态本机保留
            </span>
          </div>
        </div>
        <div class="goofish-header__actions">
          {(goofishAuthStatus.value === "logged_out" ||
            goofishAuthStatus.value === "auth_expired") && (
            <button class="goofish-btn goofish-btn--accent" onClick={reLogin} title="打开首页重新扫码登录">
              重新登录
            </button>
          )}
          <button class="goofish-btn" onClick={openIm} title="打开消息列表">
            消息
          </button>
          <button
            class="goofish-btn"
            onClick={() => toggleGlobalChat()}
            title="AI 助手 (⌘⇧J) — 嵌入页上悬浮球由 WebContentsView 遮挡, 入口移至此处"
          >
            ✦ AI 助手
          </button>
          <button
            class="goofish-btn"
            onClick={() => api.goofishNav({ action: "home" }).catch(() => {})}
            title="回闲鱼首页"
          >
            ⌂ 首页
          </button>
          <button
            class="goofish-btn"
            onClick={() => api.goofishNav({ action: "reload" }).catch(() => {})}
            title="刷新页面"
          >
            ↻ 刷新
          </button>
          <button class="goofish-btn" onClick={openExternal} title="在系统浏览器打开当前页">
            ↗ 外部打开
          </button>
        </div>
      </div>
      <div class="goofish-toolbar">
        <input
          class="goofish-toolbar__input"
          type="text"
          placeholder="在闲鱼搜索二手好物…"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doSearch();
          }}
        />
        <button class="goofish-toolbar__go" onClick={doSearch}>
          搜索
        </button>
      </div>
      <div class="goofish-frame" ref={frameRef}>
        {frozenUrl && <img class="goofish-frame__freeze" src={frozenUrl} alt="" />}
      </div>
    </div>
  );
}

export default GoofishLayout;
