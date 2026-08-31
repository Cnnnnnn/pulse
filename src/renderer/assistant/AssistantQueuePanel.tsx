import { useState } from "preact/hooks";
import type {
  AiChatAction,
  AiChatSystemItem,
} from "../../shared/ipc-contracts.ts";
import {
  IconBell,
  IconCheck,
  IconChevronDown,
  IconGithub,
  IconPackage,
  IconTag,
} from "../components/icons.tsx";
import { results } from "../store/check-store.ts";
import { executeRendererAction } from "./assistant-actions.ts";
import {
  ackProactiveSignals,
  buildConcertDropSystemMessage,
  buildGithubUpdateSystemMessage,
  proactiveReadRevision,
  unseenAppUpdateCount,
} from "./assistant-proactive.ts";
import {
  buildAssistantQueueGroups,
  type AssistantQueueAppInput,
  type AssistantQueueGroup,
  type AssistantQueueItem,
  type AssistantQueueKind,
  type AssistantQueueSignalInput,
} from "./assistant-queue-data.ts";

function readPendingApps(): AssistantQueueAppInput[] {
  const pending: AssistantQueueAppInput[] = [];
  const resultMap = results.value;
  if (!(resultMap instanceof Map)) return pending;
  for (const [name, raw] of resultMap.entries()) {
    const result = raw as AssistantQueueAppInput;
    if (!result?.has_update) continue;
    pending.push({ ...result, name: result.name || String(name) });
  }
  return pending.sort((a, b) => a.name.localeCompare(b.name));
}

function readSystemItems(
  kind: Exclude<AssistantQueueKind, "apps">,
  items: AiChatSystemItem[] | undefined,
): AssistantQueueSignalInput[] {
  return (items || []).map((item, index) => ({
    id: `${kind}-${index}-${item.text}`,
    text: item.text,
    meta: kind === "concert" ? "演出票价下降" : "有新 release",
    action: item.action,
  }));
}

export function getAssistantQueueGroups(): AssistantQueueGroup[] {
  void proactiveReadRevision.value;
  const concertMessage = buildConcertDropSystemMessage();
  const githubMessage = buildGithubUpdateSystemMessage();
  return buildAssistantQueueGroups({
    apps: unseenAppUpdateCount() > 0 ? readPendingApps() : [],
    concerts: readSystemItems("concert", concertMessage?.systemItems),
    github: readSystemItems("github", githubMessage?.systemItems),
  });
}

function actionLabel(item: AssistantQueueItem): string {
  if (item.kind === "apps") return "更新";
  return "查看";
}

function groupIcon(kind: AssistantQueueKind) {
  if (kind === "apps") return IconBell;
  if (kind === "concert") return IconTag;
  return IconGithub;
}

function itemIcon(kind: AssistantQueueKind) {
  if (kind === "apps") return IconPackage;
  if (kind === "concert") return IconTag;
  return IconGithub;
}

function actionForDetail(item: AssistantQueueItem): AiChatAction | null {
  if (item.kind === "apps") {
    return { tool: "navigate", params: { nav: "versions" } };
  }
  return item.action || null;
}

export function AssistantQueuePanel() {
  const groups = getAssistantQueueGroups();
  const items = groups.flatMap((group) => group.items);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedKinds, setCollapsedKinds] = useState<Set<AssistantQueueKind>>(
    new Set(),
  );
  const [actionBusy, setActionBusy] = useState(false);
  const selected = items.find((item) => item.id === selectedId) || items[0] || null;

  function toggleGroup(kind: AssistantQueueKind) {
    setCollapsedKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  async function runAction(action: AiChatAction | null) {
    if (!action || actionBusy) return;
    setActionBusy(true);
    try {
      await executeRendererAction(action);
    } finally {
      setActionBusy(false);
    }
  }

  function markAllRead() {
    ackProactiveSignals();
    setSelectedId(null);
  }

  return (
    <section class="assistant-queue-panel" aria-label="待处理队列">
      <div class="assistant-queue-panel__toolbar">
        <span class="assistant-queue-panel__count">
          {items.length > 0 ? `${items.length} 项待处理` : "暂无待处理"}
        </span>
        {items.length > 0 && (
          <button
            type="button"
            class="assistant-queue-panel__mark-read"
            disabled={actionBusy}
            onClick={markAllRead}
          >
            <IconCheck size={13} />
            全部标记已读
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div class="assistant-queue-panel__empty">
          <IconCheck size={24} />
          <strong>所有提醒都处理好了</strong>
          <span>新的应用、票价和 release 会出现在这里</span>
        </div>
      ) : (
        <div class="assistant-queue-panel__split">
          <div class="assistant-queue-panel__list">
            {groups.map((group) => {
              const GroupIcon = groupIcon(group.kind);
              const collapsed = collapsedKinds.has(group.kind);
              return (
                <section class="assistant-queue-group" key={group.kind}>
                  <button
                    type="button"
                    class="assistant-queue-group__header"
                    onClick={() => toggleGroup(group.kind)}
                    aria-expanded={!collapsed}
                  >
                    <GroupIcon size={14} />
                    <span>{group.label}</span>
                    <span class="assistant-queue-group__count">{group.items.length}</span>
                    <IconChevronDown size={13} />
                  </button>
                  {!collapsed && (
                    <div class="assistant-queue-group__items">
                      {group.items.map((item) => {
                        const ItemIcon = itemIcon(item.kind);
                        const isSelected = selected?.id === item.id;
                        return (
                          <div
                            class={`assistant-queue-item${isSelected ? " is-selected" : ""}`}
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedId(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedId(item.id);
                              }
                            }}
                          >
                            <span class="assistant-queue-item__unread" aria-hidden="true" />
                            <span class={`assistant-queue-item__icon assistant-queue-item__icon--${item.kind}`}>
                              <ItemIcon size={15} />
                            </span>
                            <span class="assistant-queue-item__content">
                              <strong>{item.title}</strong>
                              <span>{item.subtitle}</span>
                            </span>
                            <span class="assistant-queue-item__meta">{item.meta}</span>
                            <button
                              type="button"
                              class="assistant-queue-item__action"
                              disabled={actionBusy}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedId(item.id);
                                void runAction(item.action || null);
                              }}
                            >
                              {actionLabel(item)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {selected && (
            <aside class="assistant-queue-detail" aria-label="待处理详情">
              <div class="assistant-queue-detail__header">
                <div class={`assistant-queue-detail__icon assistant-queue-detail__icon--${selected.kind}`}>
                  {(() => {
                    const DetailIcon = itemIcon(selected.kind);
                    return <DetailIcon size={18} />;
                  })()}
                </div>
                <div>
                  <span class="assistant-queue-detail__eyebrow">{selected.meta}</span>
                  <h3>{selected.title}</h3>
                  <p>{selected.subtitle}</p>
                </div>
                <span class="assistant-queue-detail__status">未处理</span>
              </div>

              {selected.app ? (
                <div class="assistant-queue-detail__body">
                  <div class="assistant-queue-detail__facts">
                    <div>
                      <span>当前版本</span>
                      <strong>{selected.app.installed_version || selected.app.current_version || "未知"}</strong>
                    </div>
                    <div>
                      <span>最新版本</span>
                      <strong>{selected.app.latest_version || selected.app.remote_version || "未知"}</strong>
                    </div>
                    <div>
                      <span>更新类型</span>
                      <strong>{selected.app.update_type || "新版本可用"}</strong>
                    </div>
                    <div>
                      <span>风险级别</span>
                      <strong>{selected.app.risk || "待确认"}</strong>
                    </div>
                  </div>
                  <p class="assistant-queue-detail__hint">选择要执行的操作，升级前会再次向你确认。</p>
                  <div class="assistant-queue-detail__actions">
                    <button
                      type="button"
                      class="assistant-queue-detail__primary"
                      disabled={actionBusy}
                      onClick={() => void runAction(selected.action || null)}
                    >
                      {actionBusy ? "处理中…" : "更新"}
                    </button>
                    <button
                      type="button"
                      class="assistant-queue-detail__secondary"
                      disabled={actionBusy}
                      onClick={() => void runAction(actionForDetail(selected))}
                    >
                      查看版本页
                    </button>
                  </div>
                </div>
              ) : (
                <div class="assistant-queue-detail__body">
                  <p class="assistant-queue-detail__description">{selected.title}</p>
                  <div class="assistant-queue-detail__actions">
                    <button
                      type="button"
                      class="assistant-queue-detail__primary"
                      disabled={actionBusy || !selected.action}
                      onClick={() => void runAction(selected.action || null)}
                    >
                      查看详情
                    </button>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
