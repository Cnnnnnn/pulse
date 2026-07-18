/**
 * src/renderer/games/NoteRatingModal.jsx
 *
 * 备注 / 私人评分弹窗（P0-4）。复用 ModalShell（Esc / 点遮罩关闭）。
 * 纯本地：note / rating 仅落 localStorage，代码层无网络出口。
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { ModalShell } from "../components/ModalShell.jsx";
import {
  noteRatingTarget,
  closeNoteRating,
  setNote,
  setRating,
  setEntryRarity,
  addRarityTier,
  rarityTiers,
  wishlist,
} from "./gamesStore.js";
import { StarRating } from "./StarRating.jsx";
import { RarityPicker } from "./RarityPicker.jsx";

export function NoteRatingModal() {
  const target = noteRatingTarget.value;
  const [note, setLocalNote] = useState("");
  const [rating, setLocalRating] = useState(0);
  const textareaRef = useRef(null);

  const entry = target
    ? wishlist.value.find((e) => e.key === target)
    : null;

  // 目标切换时，用条目当前值初始化本地草稿
  useEffect(() => {
    if (target && entry) {
      setLocalNote(entry.note || "");
      setLocalRating(entry.rating || 0);
      // 自动聚焦备注输入框
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.focus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  function handleSave() {
    if (!target) return;
    setNote(target, note);
    setRating(target, rating);
    closeNoteRating();
  }

  return (
    <ModalShell
      open={!!target && !!entry}
      onClose={closeNoteRating}
      title="备注 / 评分"
      footer={
        <>
          <button type="button" class="modal-btn modal-btn--ghost" onClick={closeNoteRating}>
            取消
          </button>
          <button type="button" class="modal-btn modal-btn--primary" onClick={handleSave}>
            保存
          </button>
        </>
      }
    >
      <div class="note-rating">
        <label class="note-rating__label" for="note-rating-textarea">
          备注
        </label>
        <textarea
          id="note-rating-textarea"
          ref={textareaRef}
          class="note-rating__textarea"
          rows={4}
          placeholder="例如：等史低、通关后出 DLC…"
          value={note}
          onInput={(e) => setLocalNote(e.currentTarget.value)}
        />
        <div class="note-rating__rating">
          <span class="note-rating__label">私人评分</span>
          <StarRating value={rating} onChange={setLocalRating} />
        </div>
        <div class="note-rating__rarity">
          <span class="note-rating__label">稀有度</span>
          <RarityPicker
            value={entry ? entry.rarity : null}
            tiers={rarityTiers.value}
            onSelect={(tierId) => {
              if (target) setEntryRarity(target, tierId);
            }}
            onAddTier={(name) => {
              if (target) {
                const id = addRarityTier(name);
                if (id) setEntryRarity(target, id);
              }
            }}
          />
        </div>
      </div>
    </ModalShell>
  );
}

export default NoteRatingModal;
