/**
 * src/renderer/games/EventBanner.jsx — 限时活动横幅（P1c · D）。
 *
 *  - 读取 eventsConfig（用户活动）+ eventsProgress（完成/领取态）signal，合并内置活动统一展示。
 *  - 进行中（isEventActive）活动以醒目横幅呈现：标题 + 相对时间窗口（进行中 / 已结束）
 *    + current/threshold 进度（ProgressBar）；完成且未领取显示「领取」按钮。
 *  - 已结束（非 active）活动收起至「历史」区，锁存完成/领取状态（来自 eventsProgress）。
 *  - 内置「新增」按钮打开自建设弹窗（复用 ModalShell），可 add/edit/delete 用户活动
 *    （title / startAt / endAt / dimension / target / threshold），领取经 claimEvent 持久化。
 *  - a11y：横幅/历史项带中文 aria-label；按钮可聚焦、≥44px 触控；弹窗 role=dialog。
 */
import { useState } from "preact/hooks";
import { ModalShell } from "../components/ModalShell.jsx";
import { ProgressBar } from "./ProgressBar.jsx";
import { DEFAULT_EVENTS, isEventActive } from "./eventsEngine.js";
import {
  eventsConfig,
  eventsProgress,
  addEvent,
  updateEvent,
  deleteEvent,
  claimEvent,
} from "./gamesStore.js";

const DIMENSIONS = [
  { key: "platform", label: "平台" },
  { key: "tag", label: "标签" },
  { key: "folder", label: "收藏夹" },
  { key: "rarity", label: "稀有度" },
  { key: "merged", label: "合并记录" },
];

function dimLabel(d) {
  return (DIMENSIONS.find((x) => x.key === d) || {}).label || d || "—";
}

/** ISO 时间 → YYYY-MM-DD（本地，纯展示）。 */
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 时间窗口相对措辞（不显示秒级倒计时）。 */
function windowText(cfg, now) {
  if (isEventActive(cfg, now)) return "进行中";
  return "已结束";
}

export function EventBanner() {
  const now = Date.now();
  const configs = [...DEFAULT_EVENTS, ...eventsConfig.value];
  const progress = eventsProgress.value || {};

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    title: "",
    startAt: "",
    endAt: "",
    dimension: "platform",
    target: "steam",
    threshold: 1,
  });

  const active = configs.filter((c) => isEventActive(c, now));
  const history = configs.filter((c) => !isEventActive(c, now));

  function openAdd() {
    setEditing(null);
    setForm({
      title: "",
      startAt: toLocalInput(new Date(now - 0).toISOString()),
      endAt: toLocalInput(new Date(now + 7 * 86400000).toISOString()),
      dimension: "platform",
      target: "steam",
      threshold: 1,
    });
    setModalOpen(true);
  }

  function openEdit(cfg) {
    setEditing(cfg);
    setForm({
      title: cfg.title,
      startAt: toLocalInput(cfg.startAt),
      endAt: toLocalInput(cfg.endAt),
      dimension: cfg.dimension,
      target: cfg.target == null ? "" : String(cfg.target),
      threshold: cfg.threshold,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSave() {
    const title = form.title.trim();
    if (!title) return;
    const payload = {
      title,
      startAt: fromLocalInput(form.startAt),
      endAt: fromLocalInput(form.endAt),
      dimension: form.dimension,
      target: form.dimension === "merged" ? null : (form.target.trim() || null),
      threshold: Math.max(1, Math.floor(Number(form.threshold) || 1)),
    };
    if (!payload.startAt || !payload.endAt) return; // 时间非法 → 不保存
    if (editing) {
      updateEvent(editing.id, payload);
    } else {
      addEvent(payload);
    }
    closeModal();
  }

  function handleClaim(id) {
    claimEvent(id);
  }

  return (
    <section class="event-banner-section" aria-label="限时活动">
      <div class="event-banner__head">
        <h3 class="event-banner__title">限时活动</h3>
        <button
          type="button"
          class="event-banner__add"
          onClick={openAdd}
          aria-haspopup="dialog"
        >
          ＋ 新增
        </button>
      </div>

      {/* 进行中活动横幅 */}
      {active.length === 0 ? (
        <p class="event-banner__empty">当前没有进行中的活动。</p>
      ) : (
        <div class="event-banner__list">
          {active.map((cfg) => {
            const p = progress[cfg.id] || { claimed: false, completed: false, progress: 0 };
            const percent = cfg.threshold > 0 ? Math.min(100, Math.round((p.progress / cfg.threshold) * 100)) : 0;
            const canClaim = p.completed && !p.claimed;
            return (
              <article
                class="event-banner"
                key={cfg.id}
                aria-label={`进行中活动：${cfg.title}，目标 ${dimLabel(cfg.dimension)} ${cfg.target || ""} ${cfg.threshold} 款，进度 ${p.progress} / ${cfg.threshold}`}
              >
                <div class="event-banner__top">
                  <span class="event-banner__name">{cfg.title}</span>
                  <span class="event-banner__status event-banner__status--active">进行中</span>
                </div>
                <p class="event-banner__window">
                  {fmtDate(cfg.startAt)} ~ {fmtDate(cfg.endAt)}
                </p>
                <ProgressBar percent={percent} label={`${p.progress} / ${cfg.threshold}`} />
                <div class="event-banner__foot">
                  <span class="event-banner__progress-num" aria-hidden="true">
                    {p.progress} / {cfg.threshold}
                  </span>
                  {p.claimed ? (
                    <span class="event-banner__claimed">已领取</span>
                  ) : canClaim ? (
                    <button
                      type="button"
                      class="event-banner__claim"
                      onClick={() => handleClaim(cfg.id)}
                      aria-label={`领取奖励：${cfg.title}`}
                    >
                      领取奖励
                    </button>
                  ) : (
                    <span class="event-banner__hint">继续收集以达成目标</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 历史活动（已结束，锁存状态） */}
      {history.length > 0 && (
        <div class="event-history">
          <h4 class="event-history__title">历史活动</h4>
          <ul class="event-history__list">
            {history.map((cfg) => {
              const p = progress[cfg.id] || { claimed: false, completed: false, progress: 0 };
              const percent = cfg.threshold > 0 ? Math.min(100, Math.round((p.progress / cfg.threshold) * 100)) : 0;
              const canClaim = p.completed && !p.claimed;
              return (
                <li
                  class="event-history__item"
                  key={cfg.id}
                  aria-label={`历史活动：${cfg.title}，已结束，进度 ${p.progress} / ${cfg.threshold}${p.completed ? "，已完成" : ""}${p.claimed ? "，已领取" : ""}`}
                >
                  <div class="event-history__row">
                    <span class="event-history__name">{cfg.title}</span>
                    <span class="event-history__status">已结束</span>
                  </div>
                  <ProgressBar percent={percent} label={`${p.progress} / ${cfg.threshold}`} />
                  <div class="event-history__foot">
                    <span class="event-history__progress-num" aria-hidden="true">
                      {p.progress} / {cfg.threshold}
                    </span>
                    {p.completed && <span class="event-history__done">已完成</span>}
                    {p.claimed && <span class="event-history__done">已领取</span>}
                    {canClaim && (
                      <button
                        type="button"
                        class="event-history__claim"
                        onClick={() => handleClaim(cfg.id)}
                        aria-label={`领取奖励：${cfg.title}`}
                      >
                        领取奖励
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {modalOpen && (
        <ModalShell
          open={modalOpen}
          onClose={closeModal}
          title={editing ? "编辑活动" : "新增活动"}
          footer={
            <>
              <button type="button" class="modal-btn modal-btn--ghost" onClick={closeModal}>
                取消
              </button>
              <button type="button" class="modal-btn modal-btn--primary" onClick={handleSave}>
                保存
              </button>
            </>
          }
        >
          <div class="ach-form">
            <label class="ach-form__label" for="ev-title">标题</label>
            <input
              id="ev-title"
              class="ach-form__input"
              type="text"
              value={form.title}
              onInput={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="活动标题"
            />

            <label class="ach-form__label" for="ev-start">开始时间</label>
            <input
              id="ev-start"
              class="ach-form__input"
              type="datetime-local"
              value={form.startAt}
              onInput={(e) => setForm({ ...form, startAt: e.target.value })}
            />

            <label class="ach-form__label" for="ev-end">结束时间</label>
            <input
              id="ev-end"
              class="ach-form__input"
              type="datetime-local"
              value={form.endAt}
              onInput={(e) => setForm({ ...form, endAt: e.target.value })}
            />

            <label class="ach-form__label" for="ev-dim">维度</label>
            <select
              id="ev-dim"
              class="ach-form__select"
              value={form.dimension}
              onChange={(e) => setForm({ ...form, dimension: e.target.value })}
            >
              {DIMENSIONS.map((d) => (
                <option value={d.key} key={d.key}>{d.label}</option>
              ))}
            </select>

            {form.dimension !== "merged" && (
              <>
                <label class="ach-form__label" for="ev-target">目标</label>
                <input
                  id="ev-target"
                  class="ach-form__input"
                  type="text"
                  value={form.target}
                  onInput={(e) => setForm({ ...form, target: e.target.value })}
                  placeholder={
                    form.dimension === "platform"
                      ? "如 steam"
                      : form.dimension === "rarity"
                        ? "如 legendary"
                        : "目标值"
                  }
                />
              </>
            )}

            <label class="ach-form__label" for="ev-threshold">达成数量</label>
            <input
              id="ev-threshold"
              class="ach-form__input"
              type="number"
              min="1"
              value={form.threshold}
              onInput={(e) => setForm({ ...form, threshold: e.target.value })}
            />
          </div>
        </ModalShell>
      )}
    </section>
  );
}

/** ISO → datetime-local 输入值（YYYY-MM-DDTHH:mm，本地时区）。 */
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 输入值 → ISO（无效返回 null）。 */
function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default EventBanner;
