/**
 * src/renderer/goofish/store.ts
 *
 * 闲鱼嵌入的全局信号 (v3.3): 未读消息数 + 登录探测状态 + 通知偏好。
 */

import { signal } from "@preact/signals";
import { api } from "../api.ts";
import { setActiveNav } from "../nav/navStore.ts";
import { showToast } from "../store/toast-store.ts";

/** 闲鱼未读消息数 */
export const goofishUnreadBadge = signal(0);

/** 协议层登录探测: unknown | ok | logged_out | auth_expired | risk | error */
export const goofishAuthStatus = signal("unknown");

/** 系统通知开关（与 state.goofish.notify_enabled 同步） */
export const goofishNotifyEnabled = signal(true);

/** 仅真人会话（与 state.goofish.humans_only 同步） */
export const goofishHumansOnly = signal(true);

export function clearGoofishUnreadBadge() {
  goofishUnreadBadge.value = 0;
}

const GOOFISH_IM = "https://www.goofish.com/im";

function openGoofishUrl(url: string) {
  setActiveNav("goofish");
  if (typeof api.goofishNav === "function") {
    api.goofishNav({ action: "load", url: url || GOOFISH_IM }).catch(() => {});
  }
  if (typeof api.goofishCheckNow === "function") {
    setTimeout(() => {
      api.goofishCheckNow().catch(() => {});
    }, 3500);
  }
}

let installed = false;

/**
 * 订阅主进程的未读 / 认证 / 打开请求。全局装一次。
 */
export function installGoofishUnreadWatch() {
  if (installed) return;
  if (!api || typeof api.onGoofishUnread !== "function") return;
  installed = true;

  api.onGoofishUnread((count: number) => {
    goofishUnreadBadge.value = Number(count) || 0;
  });

  if (typeof api.onGoofishOpenRequest === "function") {
    api.onGoofishOpenRequest((payload: { url?: string } = {}) => {
      openGoofishUrl((payload && payload.url) || GOOFISH_IM);
    });
  }

  if (typeof api.onGoofishAlert === "function") {
    api.onGoofishAlert((payload: { title?: string; body?: string; url?: string }) => {
      const msg =
        (payload && payload.body) ||
        (payload && payload.title) ||
        "闲鱼有新消息";
      showToast(msg, "info", 6000);
    });
  }

  if (typeof api.onGoofishAuth === "function") {
    api.onGoofishAuth((payload: { status?: string }) => {
      if (payload && payload.status) goofishAuthStatus.value = payload.status;
    });
  }

  if (typeof api.goofishGetPrefs === "function") {
    api
      .goofishGetPrefs()
      .then(
        (r: {
          ok?: boolean;
          prefs?: { notify_enabled?: boolean; humans_only?: boolean };
        }) => {
          if (!r || !r.ok || !r.prefs) return;
          if (typeof r.prefs.notify_enabled === "boolean") {
            goofishNotifyEnabled.value = r.prefs.notify_enabled;
          }
          if (typeof r.prefs.humans_only === "boolean") {
            goofishHumansOnly.value = r.prefs.humans_only;
          }
        },
      )
      .catch(() => {});
  }
  if (typeof api.goofishGetAuth === "function") {
    api
      .goofishGetAuth()
      .then((r: { ok?: boolean; status?: string }) => {
        if (r && r.ok && r.status) goofishAuthStatus.value = r.status;
      })
      .catch(() => {});
  }
}

export async function setGoofishNotifyEnabled(enabled: boolean): Promise<boolean> {
  goofishNotifyEnabled.value = !!enabled;
  if (!api || typeof api.goofishSetPrefs !== "function") return false;
  try {
    const r = await api.goofishSetPrefs({ notify_enabled: !!enabled });
    if (r && r.ok && r.prefs && typeof r.prefs.notify_enabled === "boolean") {
      goofishNotifyEnabled.value = r.prefs.notify_enabled;
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}

export async function setGoofishHumansOnly(enabled: boolean): Promise<boolean> {
  goofishHumansOnly.value = !!enabled;
  if (!api || typeof api.goofishSetPrefs !== "function") return false;
  try {
    const r = await api.goofishSetPrefs({ humans_only: !!enabled });
    if (r && r.ok && r.prefs && typeof r.prefs.humans_only === "boolean") {
      goofishHumansOnly.value = r.prefs.humans_only;
      // 偏好变更后立刻对齐徽标口径
      if (typeof api.goofishCheckNow === "function") {
        api.goofishCheckNow().catch(() => {});
      }
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}
