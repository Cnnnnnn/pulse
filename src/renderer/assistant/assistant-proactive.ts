/**
 * 助手 Proactive 提示 — 演出降价 / App 更新 / GitHub release.
 */
import { computed, signal } from "@preact/signals";
import {
  concertsSnapshots,
  concertsPrevSnapshots,
  concertsLastFetched,
  concertsWatches,
  computeSessionDeltas,
} from "../concerts/store.ts";
import { apps, results } from "../store/check-store.ts";
import { githubProjects, hasGithubUpdate } from "../store/github-projects-store.ts";
import type { AiChatMessage, AiChatAction, AiChatSystemItem } from "../../shared/ipc-contracts";
import {
  proactiveKindFromMessage,
  syncProactiveSystemMessages,
} from "./assistant-proactive-sync.ts";

const CONCERT_DROPS_SEEN_KEY = "pulse-assistant-concert-drops-seen-at";
const APPS_FP_SEEN_KEY = "pulse-assistant-apps-seen-fp";
const GITHUB_FP_SEEN_KEY = "pulse-assistant-github-seen-fp";

export type ProactiveKind = "concert" | "apps" | "github";

const PROACTIVE_KINDS = new Set<ProactiveKind>(["concert", "apps", "github"]);

/** localStorage 已读标记变化版本，用于驱动队列计数同步刷新。 */
export const proactiveReadRevision = signal(0);

export function isProactiveKind(kind: string | null): kind is ProactiveKind {
  return !!kind && PROACTIVE_KINDS.has(kind as ProactiveKind);
}

function listPendingAppUpdates(): string[] {
  const names: string[] = [];
  const resMap = results.value;
  if (resMap instanceof Map) {
    for (const [name, r] of resMap.entries()) {
      if (r && r.has_update) names.push(String(name));
    }
  }
  return names.sort();
}

function listPendingGithubUpdates(): string[] {
  return (githubProjects.value || [])
    .filter((p: unknown) => hasGithubUpdate(p))
    .map((p: { name?: string; owner?: string; repo?: string }) =>
      p.name || `${p.owner}/${p.repo}`,
    )
    .filter(Boolean)
    .sort() as string[];
}

function fpKey(items: string[]): string {
  return items.join("|");
}

function isUnseenFp(key: string, fp: string): boolean {
  if (!fp) return false;
  try {
    return localStorage.getItem(key) !== fp;
  } catch {
    return true;
  }
}

export function countConcertPriceDrops(): number {
  const current = concertsSnapshots.value;
  const prev = concertsPrevSnapshots.value;
  if (!current || !prev || !Object.keys(prev).length) return 0;
  const deltas = computeSessionDeltas(current, prev);
  let n = 0;
  for (const watchDeltas of Object.values(deltas)) {
    for (const d of Object.values(watchDeltas)) {
      if (d < 0) n++;
    }
  }
  return n;
}

export function unseenConcertDropCount(): number {
  const drops = countConcertPriceDrops();
  if (drops <= 0) return 0;
  const fetched = concertsLastFetched.value || 0;
  if (!fetched) return drops;
  try {
    const seen = Number(localStorage.getItem(CONCERT_DROPS_SEEN_KEY) || 0);
    if (fetched <= seen) return 0;
  } catch {
    /* ponytail: localStorage 不可用时仍显示角标 */
  }
  return drops;
}

export function unseenAppUpdateCount(): number {
  const pending = listPendingAppUpdates();
  if (pending.length === 0) return 0;
  return isUnseenFp(APPS_FP_SEEN_KEY, fpKey(pending)) ? pending.length : 0;
}

export function unseenGithubUpdateCount(): number {
  const pending = listPendingGithubUpdates();
  if (pending.length === 0) return 0;
  return isUnseenFp(GITHUB_FP_SEEN_KEY, fpKey(pending)) ? pending.length : 0;
}

export function ackProactiveKind(kind: ProactiveKind) {
  if (typeof localStorage === "undefined") return;
  try {
    switch (kind) {
      case "concert": {
        const fetched = concertsLastFetched.value;
        if (fetched) {
          localStorage.setItem(CONCERT_DROPS_SEEN_KEY, String(fetched));
        }
        break;
      }
      case "apps": {
        const fp = fpKey(listPendingAppUpdates());
        if (fp) localStorage.setItem(APPS_FP_SEEN_KEY, fp);
        else localStorage.removeItem(APPS_FP_SEEN_KEY);
        break;
      }
      case "github": {
        const fp = fpKey(listPendingGithubUpdates());
        if (fp) localStorage.setItem(GITHUB_FP_SEEN_KEY, fp);
        else localStorage.removeItem(GITHUB_FP_SEEN_KEY);
        break;
      }
      default: {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }
    proactiveReadRevision.value += 1;
  } catch {
    /* noop */
  }
}

export function ackProactiveSignals() {
  ackProactiveKind("concert");
  ackProactiveKind("apps");
  ackProactiveKind("github");
}

/** @deprecated use ackProactiveSignals */
export function ackConcertDrops() {
  ackProactiveSignals();
}

export function buildProactiveHint(): string | null {
  const parts: string[] = [];
  const concertDrops = unseenConcertDropCount();
  if (concertDrops > 0) {
    parts.push(
      concertDrops === 1
        ? "1 处演出票价下降"
        : `${concertDrops} 处演出票价下降`,
    );
  }
  const appN = unseenAppUpdateCount();
  if (appN > 0) parts.push(`${appN} 个应用待更新`);
  const ghN = unseenGithubUpdateCount();
  if (ghN > 0) parts.push(`${ghN} 个 GitHub 有新 release`);
  if (parts.length === 0) return null;
  return `检测到 ${parts.join("，")}`;
}

export function buildConcertDropSystemMessage(): AiChatMessage | null {
  const fetched = concertsLastFetched.value;
  if (!fetched || unseenConcertDropCount() <= 0) return null;
  const current = concertsSnapshots.value;
  const prev = concertsPrevSnapshots.value;
  if (!current || !prev) return null;
  const deltas = computeSessionDeltas(current, prev);
  const systemItems: AiChatSystemItem[] = [];
  for (const watch of concertsWatches.value || []) {
    const watchDeltas = watch?.id ? deltas[watch.id] : null;
    if (!watchDeltas) continue;
    const snap = current[watch.id];
    const title = snap?.title || watch.id;
    for (const [sessionId, delta] of Object.entries(watchDeltas)) {
      if (delta >= 0) continue;
      const session = (snap?.sessions || []).find(
        (s: { id?: string }) => s?.id === sessionId,
      );
      const label = session?.name || sessionId;
      systemItems.push({
        text: `${title} · ${label}：降价 ${Math.abs(delta)} 元`,
        action: { tool: "navigate", params: { nav: "concerts" } },
      });
    }
  }
  if (systemItems.length === 0) return null;
  const footer = `（刷新于 ${new Date(fetched).toLocaleString("zh-CN")}）`;
  return {
    role: "system",
    content: `[pulse-proactive:concert:${fetched}]\n📉 演出票价下降提醒\n${footer}`,
    systemItems,
    systemAction: { tool: "navigate", params: { nav: "concerts" } },
  };
}

export function buildAppUpdateSystemMessage(): AiChatMessage | null {
  const pending = listPendingAppUpdates();
  if (pending.length === 0 || unseenAppUpdateCount() === 0) return null;
  const resMap = results.value;
  const systemItems: AiChatSystemItem[] = [];
  for (const name of pending.slice(0, 8)) {
    const r = resMap instanceof Map ? resMap.get(name) : undefined;
    const ver =
      (r as { latest_version?: string; remote_version?: string } | undefined)
        ?.latest_version ||
      (r as { remote_version?: string } | undefined)?.remote_version;
    systemItems.push({
      text: `${name}${ver ? ` → ${ver}` : ""}`,
      message: `${name} 需要更新吗？`,
    });
  }
  const extra =
    pending.length > 8 ? `…另有 ${pending.length - 8} 个` : "";
  const fp = fpKey(pending);
  return {
    role: "system",
    content: `[pulse-proactive:apps:${fp}]\n📱 应用更新提醒${extra ? `\n${extra}` : ""}`,
    systemItems,
    systemAction: { tool: "navigate", params: { nav: "versions" } },
  };
}

export function buildGithubUpdateSystemMessage(): AiChatMessage | null {
  const pending = listPendingGithubUpdates();
  if (pending.length === 0 || unseenGithubUpdateCount() === 0) return null;
  const systemItems: AiChatSystemItem[] = pending.slice(0, 8).map((name) => ({
    text: name,
    action: { tool: "navigate", params: { nav: "github" } },
  }));
  const extra =
    pending.length > 8 ? `…另有 ${pending.length - 8} 个` : "";
  const fp = fpKey(pending);
  return {
    role: "system",
    content: `[pulse-proactive:github:${fp}]\n🐙 GitHub 新 release 提醒${extra ? `\n${extra}` : ""}`,
    systemItems,
    systemAction: { tool: "navigate", params: { nav: "github" } },
  };
}

function buildFreshProactiveMessages(): AiChatMessage[] {
  const out: AiChatMessage[] = [];
  for (const build of [
    buildConcertDropSystemMessage,
    buildAppUpdateSystemMessage,
    buildGithubUpdateSystemMessage,
  ]) {
    const msg = build();
    if (msg) out.push(msg);
  }
  return out;
}

/** @deprecated use syncProactiveSystemMessages via injectProactiveSystemMessage */
export function collectProactiveSystemMessages(
  messages: AiChatMessage[],
): AiChatMessage[] {
  void messages;
  return buildFreshProactiveMessages();
}

export function injectProactiveSystemMessage(messages: AiChatMessage[]) {
  return syncProactiveSystemMessages(messages, buildFreshProactiveMessages);
}

export { proactiveKindFromMessage };

/** 抽屉打开时订阅：演出/应用/GitHub 信号变化 */
export const proactiveSignalToken = computed(() => {
  void proactiveReadRevision.value;
  void apps.value;
  void concertsLastFetched.value;
  void concertsSnapshots.value;
  void concertsPrevSnapshots.value;
  void results.value;
  void githubProjects.value;
  return [
    concertsLastFetched.value || 0,
    fpKey(listPendingAppUpdates()),
    fpKey(listPendingGithubUpdates()),
    countConcertPriceDrops(),
  ].join("|");
});

export function getProactiveHintActions(): Array<{
  id: string;
  label: string;
  message?: string;
  action?: AiChatAction;
}> {
  const out: Array<{
    id: string;
    label: string;
    message?: string;
    action?: AiChatAction;
  }> = [];
  if (unseenConcertDropCount() > 0) {
    out.push({
      id: "concert",
      label: "演出",
      message: "我监控的演出票价怎样？",
    });
  }
  if (unseenAppUpdateCount() > 0) {
    out.push({
      id: "apps",
      label: "应用",
      message: "有哪些应用需要更新？",
    });
  }
  if (unseenGithubUpdateCount() > 0) {
    out.push({
      id: "github",
      label: "GitHub",
      action: { tool: "navigate", params: { nav: "github" } },
    });
  }
  return out;
}

export const chatFabBadge = computed(() => {
  let appUpdates = 0;
  const resMap = results.value;
  if (resMap instanceof Map) {
    for (const r of resMap.values()) {
      if (r && r.has_update) appUpdates++;
    }
  }
  const ghUpdates = (githubProjects.value || []).filter((p: unknown) =>
    hasGithubUpdate(p),
  ).length;
  const concertDrops = unseenConcertDropCount();
  const total = appUpdates + ghUpdates + concertDrops;
  return total > 0 ? total : 0;
});

export const chatFabHint = computed(() => {
  const parts: string[] = [];
  const resMap = results.value;
  let appUpdates = 0;
  if (resMap instanceof Map) {
    for (const r of resMap.values()) {
      if (r && r.has_update) appUpdates++;
    }
  }
  const ghUpdates = (githubProjects.value || []).filter((p: unknown) =>
    hasGithubUpdate(p),
  ).length;
  const concertDrops = unseenConcertDropCount();
  if (appUpdates > 0) parts.push(`${appUpdates} 个应用待更新`);
  if (ghUpdates > 0) parts.push(`${ghUpdates} 个 GitHub 有新 release`);
  if (concertDrops > 0) parts.push(`${concertDrops} 处演出降价`);
  if (parts.length === 0) return null;
  return parts.join("，");
});

// ponytail: apps 仅用于触发 computed 依赖 apps signal
void apps.value;
