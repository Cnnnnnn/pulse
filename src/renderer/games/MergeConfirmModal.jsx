/**
 * src/renderer/games/MergeConfirmModal.jsx
 *
 * 跨平台合并确认弹窗（P0-6）。
 * - 展示候选各平台当前价（tabular-nums）。
 * - 已知映射命中（openMerge(keys,false)）：候选已全选，仅确认/调整。
 * - 手动合并（openMerge([self],true)）：额外列出其它收藏供勾选，并提示「映射未知请自确认」。
 * - 确认 → mergeEntries(keys, primaryKey)；取消 → closeMerge。
 * 纯本地，无网络。
 */
import { useEffect, useState } from "preact/hooks";
import { ModalShell } from "../components/ModalShell.jsx";
import {
  mergeCandidateKeys,
  mergeIsUnknown,
  closeMerge,
  mergeEntries,
  wishlist,
  currentPriceOf,
} from "./gamesStore.js";
import { PLATFORM_LABEL, fmtPrice } from "./format.js";

export function MergeConfirmModal() {
  const keys = mergeCandidateKeys.value;
  const unknown = mergeIsUnknown.value;
  const [selected, setSelected] = useState(new Set());
  const [primary, setPrimary] = useState(null);

  // 打开（候选变化）时初始化：候选全选，主记录默认第一个
  useEffect(() => {
    if (keys.length) {
      setSelected(new Set(keys));
      setPrimary(keys[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  // 候选基础条目
  const byKey = new Map(wishlist.value.map((e) => [e.key, e]));
  const baseList = keys.map((k) => byKey.get(k)).filter(Boolean);

  // 手动合并时，列出其它可勾选的收藏
  const others = unknown
    ? wishlist.value.filter(
        (e) => !keys.includes(e.key) && !(e.mergedMembers && e.mergedMembers.length),
      )
    : [];

  const allRows = unknown ? [...baseList, ...others] : baseList;

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    const sel = [...selected];
    if (sel.length < 2) return;
    mergeEntries(sel, primary || sel[0]);
    closeMerge();
  }

  const canConfirm = selected.size >= 2;

  return (
    <ModalShell
      open={keys.length > 0}
      onClose={closeMerge}
      title="合并为同一条收藏"
      footer={
        <>
          <button type="button" class="modal-btn modal-btn--ghost" onClick={closeMerge}>
            取消
          </button>
          <button
            type="button"
            class="modal-btn modal-btn--primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            确认合并
          </button>
        </>
      }
    >
      <div class="merge-modal">
        <p class="merge-modal__hint">
          把跨平台的同一游戏合并为一条主记录，便于统一管理进度与价格。
        </p>

        {unknown && (
          <div class="merge-modal__warn" role="alert">
            ⚠️ 映射未知，请自行确认这些收藏是否为同一游戏。
          </div>
        )}

        <ul class="merge-modal__list">
          {allRows.map((e) => {
            const isSel = selected.has(e.key);
            const cur = currentPriceOf(e);
            const curCode = e.currentCurrency || e.currency;
            return (
              <li key={e.key} class={`merge-modal__row${isSel ? " is-sel" : ""}`}>
                <label class="merge-modal__check">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(e.key)}
                  />
                  <span class="merge-modal__plat">
                    {PLATFORM_LABEL[e.platform] || e.platform}
                  </span>
                  <span class="merge-modal__title">{e.title}</span>
                  <span class="merge-modal__price">{fmtPrice(cur, curCode)}</span>
                </label>
                <label class="merge-modal__primary">
                  <input
                    type="radio"
                    name="merge-primary"
                    checked={primary === e.key}
                    onChange={() => setPrimary(e.key)}
                  />
                  <span>主记录</span>
                </label>
              </li>
            );
          })}
        </ul>

        {!canConfirm && (
          <p class="merge-modal__tip">请至少选择 2 条收藏进行合并。</p>
        )}
      </div>
    </ModalShell>
  );
}

export default MergeConfirmModal;
