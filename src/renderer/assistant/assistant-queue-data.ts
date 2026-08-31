import type { AiChatAction } from "../../shared/ipc-contracts.ts";

export type AssistantQueueKind = "apps" | "concert" | "github";

export type AssistantQueueAppInput = {
  name: string;
  installed_version?: string;
  current_version?: string;
  latest_version?: string;
  remote_version?: string;
  has_update?: boolean;
  update_type?: string;
  risk?: string;
};

export type AssistantQueueSignalInput = {
  id: string;
  text: string;
  meta?: string;
  action?: AiChatAction;
};

export type AssistantQueueItem = {
  id: string;
  kind: AssistantQueueKind;
  title: string;
  subtitle: string;
  meta: string;
  status: "unread" | "ready";
  app?: AssistantQueueAppInput;
  action?: AiChatAction;
};

export type AssistantQueueGroup = {
  kind: AssistantQueueKind;
  label: string;
  items: AssistantQueueItem[];
};

type AssistantQueueInput = {
  apps: AssistantQueueAppInput[];
  concerts: AssistantQueueSignalInput[];
  github: AssistantQueueSignalInput[];
};

function buildAppItems(apps: AssistantQueueAppInput[]): AssistantQueueItem[] {
  return apps
    .filter((app) => app.has_update && app.name)
    .map((app) => {
      const current = app.installed_version || app.current_version || "未知";
      const latest = app.latest_version || app.remote_version || "未知";
      return {
        id: `app:${app.name}`,
        kind: "apps",
        title: app.name,
        subtitle: `${current} → ${latest}`,
        meta: app.update_type || "新版本可用",
        status: "unread",
        app,
        action: {
          tool: "upgrade_app",
          params: { appName: app.name },
        },
      };
    });
}

function buildSignalItems(
  kind: Exclude<AssistantQueueKind, "apps">,
  signals: AssistantQueueSignalInput[],
  fallbackMeta: string,
): AssistantQueueItem[] {
  return signals.map((signal) => ({
    id: `${kind}:${signal.id}`,
    kind,
    title: signal.text,
    subtitle: signal.meta || fallbackMeta,
    meta: signal.meta || fallbackMeta,
    status: "unread",
    action: signal.action,
  }));
}

export function buildAssistantQueueGroups({
  apps,
  concerts,
  github,
}: AssistantQueueInput): AssistantQueueGroup[] {
  const candidates: AssistantQueueGroup[] = [
    {
      kind: "apps",
      label: "应用更新",
      items: buildAppItems(apps),
    },
    {
      kind: "concert",
      label: "演出票价下降",
      items: buildSignalItems("concert", concerts, "演出票价下降"),
    },
    {
      kind: "github",
      label: "GitHub 新 release",
      items: buildSignalItems("github", github, "有新 release"),
    },
  ];
  return candidates.filter((group) => group.items.length > 0);
}
