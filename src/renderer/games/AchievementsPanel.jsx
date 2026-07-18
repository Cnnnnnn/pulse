/**
 * src/renderer/games/AchievementsPanel.jsx — 成就系统面板（P1c · C）。
 *
 *  - 读取 achievementsDef（用户成就）+ achievementsProgress（解锁态）signal，合并内置成就统一展示。
 *  - 已解锁 / 未解锁双态（复用 BadgeWall 视觉语言）：已解锁高亮，未解锁置灰并提示条件。
 *  - 每条成就用 ProgressBar 展示 current / threshold（tabular-nums）。
 *  - 内置「新增」按钮打开自建设弹窗（复用 ModalShell），可 add/edit/delete 用户成就
 *    （dimension / target / threshold / name），经 store action 持久化。
 *  - a11y：条目带中文 aria-label；按钮可聚焦、≥44px 触控；弹窗 role=dialog。
 */
import { useState } from "preact/hooks";
import { ModalShell } from "../components/ModalShell.jsx";
import { ProgressBar } from "./ProgressBar.jsx";
import { DEFAULT_ACHIEVEMENTS } from "./achievementsEngine.js";
import {
  achievementsDef,
  achievementsProgress,
  addAchievement,
  updateAchievement,
  deleteAchievement,
} from "./gamesStore.js";

/** 维度 → 中文标签。 */
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

/** 成就达成条件中文描述。 */
function describe(def) {
  switch (def.dimension) {
    case "platform": return `在 ${def.target} 平台收藏满 ${def.threshold} 款`;
    case "tag": return `收藏 ${def.threshold} 款含「${def.target}」标签的游戏`;
    case "folder": return `收藏夹内收藏满 ${def.threshold} 款`;
    case "rarity": return `拥有 ${def.threshold} 款「${def.target}」稀有度`;
    case "merged": return `完成 ${def.threshold} 次合并`;
    default: return `达成 ${def.threshold}`;
  }
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

export function AchievementsPanel() {
  const defs = [...DEFAULT_ACHIEVEMENTS, ...achievementsDef.value];
  const progress = achievementsProgress.value || {};
  const userIds = new Set(achievementsDef.value.map((u) => u.id));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    dimension: "platform",
    target: "steam",
    threshold: 1,
  });

  const unlockedCount = defs.filter((d) => progress[d.id] && progress[d.id].unlocked).length;

  function openAdd() {
    setEditing(null);
    setForm({ name: "", dimension: "platform", target: "steam", threshold: 1 });
    setModalOpen(true);
  }

  function openEdit(def) {
    setEditing(def);
    setForm({
      name: def.name,
      dimension: def.dimension,
      target: def.target == null ? "" : String(def.target),
      threshold: def.threshold,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSave() {
    const name = form.name.trim();
    if (!name) return;
    const payload = {
      name,
      dimension: form.dimension,
      target: form.dimension === "merged" ? null : (form.target.trim() || null),
      threshold: Math.max(1, Math.floor(Number(form.threshold) || 1)),
    };
    if (editing) {
      updateAchievement(editing.id, payload);
    } else {
      addAchievement(payload);
    }
    closeModal();
  }

  return (
    <section class="achievements" aria-label="成就系统">
      <div class="achievements__head">
        <h3 class="achievements__title">成就</h3>
        <span class="achievements__count" aria-hidden="true">
          {unlockedCount}/{defs.length}
        </span>
        <button
          type="button"
          class="achievements__add"
          onClick={openAdd}
          aria-haspopup="dialog"
        >
          ＋ 新增
        </button>
      </div>

      {defs.length === 0 ? (
        <p class="achievements__empty">暂无成就。</p>
      ) : (
        <ul class="achievements__grid">
          {defs.map((def) => {
            const p = progress[def.id] || { unlocked: false, unlockedAt: null, current: 0 };
            const isUnlocked = !!p.unlocked;
            const percent = def.threshold > 0 ? Math.min(100, Math.round((p.current / def.threshold) * 100)) : 0;
            const isUser = userIds.has(def.id);
            return (
              <li
                class={`achievements__item ${isUnlocked ? "is-unlocked" : "is-locked"}`}
                key={def.id}
                aria-label={`${isUnlocked ? "已解锁成就" : "未解锁成就"}：${def.name}，${describe(def)}，进度 ${p.current} / ${def.threshold}`}
              >
                <div class="achievements__row">
                  <span class="achievements__name">{def.name}</span>
                  {!isUser && <span class="achievements__badge" title="系统内置成就">内置</span>}
                </div>
                <p class="achievements__goal">{describe(def)}</p>
                <ProgressBar percent={percent} label={`${p.current} / ${def.threshold}`} />
                <div class="achievements__meta">
                  <span class="achievements__progress-num" aria-hidden="true">
                    {p.current} / {def.threshold}
                  </span>
                  {isUnlocked && (
                    <span class="achievements__date">解锁于 {fmtDate(p.unlockedAt)}</span>
                  )}
                  {isUser && (
                    <span class="achievements__actions">
                      <button
                        type="button"
                        class="achievements__edit"
                        onClick={() => openEdit(def)}
                        aria-label={`编辑成就 ${def.name}`}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        class="achievements__del"
                        onClick={() => deleteAchievement(def.id)}
                        aria-label={`删除成就 ${def.name}`}
                      >
                        删除
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <ModalShell
          open={modalOpen}
          onClose={closeModal}
          title={editing ? "编辑成就" : "新增成就"}
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
            <label class="ach-form__label" for="ach-name">名称</label>
            <input
              id="ach-name"
              class="ach-form__input"
              type="text"
              value={form.name}
              onInput={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="成就名称"
            />

            <label class="ach-form__label" for="ach-dim">维度</label>
            <select
              id="ach-dim"
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
                <label class="ach-form__label" for="ach-target">目标</label>
                <input
                  id="ach-target"
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

            <label class="ach-form__label" for="ach-threshold">达成数量</label>
            <input
              id="ach-threshold"
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

export default AchievementsPanel;
