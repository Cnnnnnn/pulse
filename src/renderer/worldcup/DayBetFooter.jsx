/**
 * src/renderer/worldcup/DayBetFooter.jsx
 *
 * v2.10.0 比赛日底部小卡 — stake + pnl + note
 * 已填显示当前值, 未填显示按钮, 点开行内编辑.
 *
 * v2.10.1 polish:
 *   - Fix 8: 保存成功后 footer 闪绿 1s
 *   - Fix 9: note 加 title tooltip (鼠标 hover 看全)
 *   - Fix 10: 盈亏符号 (PnlSignIcon 盈 / IconX 亏 / — 0)
 */
import { useState, useRef, useEffect } from "preact/hooks";
import { openConfirm } from "../confirmStore.js";
import { PnlSignIcon } from "../components/icons.jsx";
import {
  worldcupBets,
  upsertWorldcupBet,
  removeWorldcupBet,
} from "./betsStore.js";

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(n * 100) / 100)}`;
}

function pnlSign(n) {
  if (!Number.isFinite(n) || n === 0) return null;
  return <PnlSignIcon value={n} size={14} />;
}

export function DayBetFooter({ date, search = "" }) {
  const entry = worldcupBets.value[date];
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState("");
  const [pnl, setPnl] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [flashing, setFlashing] = useState(false);
  const flashTimerRef = useRef(null);
  const stakeRef = useRef(null);

  useEffect(() => {
    if (editing && stakeRef.current) {
      stakeRef.current.focus();
    }
  }, [editing]);

  // 卸载时清理 flash timer (避免 setState on unmounted)
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // 搜索态下不渲染 footer (专注比赛卡片, 不打扰). early-return 必须在所有 hook 之后,
  // 否则 hook 数量在不同渲染间不一致, 触发 react-hooks/rules-of-hooks runtime 错误.
  if (search) return null;

  function openEdit() {
    setStake(entry ? String(entry.stake) : "");
    setPnl(entry ? String(entry.pnl) : "");
    setNote(entry ? entry.note || "" : "");
    setErr("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setErr("");
  }

  function triggerFlash() {
    setFlashing(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashing(false), 1000);
  }

  async function save() {
    const s = parseFloat(stake);
    const p = parseFloat(pnl);
    if (Number.isNaN(s) || s < 0) {
      setErr("投入需为非负数");
      return;
    }
    if (Number.isNaN(p)) {
      setErr("盈亏需为数字");
      return;
    }
    const r = await upsertWorldcupBet({ date, stake: s, pnl: p, note });
    if (!r || !r.ok) {
      setErr("保存失败: " + ((r && r.reason) || "unknown"));
      return;
    }
    setEditing(false);
    triggerFlash(); // Fix 8
  }

  async function clear() {
    if (
      !(await openConfirm({
        title: "清空体彩记录",
        message: "清空这一天的体彩记录？",
        confirmText: "清空",
        cancelText: "再想想",
      }))
    ) {
      return;
    }
    await removeWorldcupBet(date);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") cancel();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
  }

  if (editing) {
    return (
      <div class="day-bet-form" onKeyDown={onKeyDown}>
        <div class="day-bet-form-row">
          <label>
            投入 ¥
            <input
              ref={stakeRef}
              type="number"
              min="0"
              step="0.01"
              value={stake}
              onInput={(e) => setStake(e.currentTarget.value)}
            />
          </label>
          <label>
            盈亏 ¥
            <input
              type="number"
              step="0.01"
              value={pnl}
              onInput={(e) => setPnl(e.currentTarget.value)}
            />
          </label>
        </div>
        <textarea
          class="day-bet-form-note"
          placeholder="备注 (可选, ≤ 200 字)"
          maxLength={200}
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
        />
        {err && <div class="day-bet-form-err">{err}</div>}
        <div class="day-bet-form-actions">
          <button onClick={save}>保存 (⌘↵)</button>
          <button onClick={cancel}>取消 (Esc)</button>
        </div>
      </div>
    );
  }

  if (entry) {
    const pnlClass = entry.pnl >= 0 ? "positive" : "negative";
    const flashClass = flashing ? "day-bet-flash" : "";
    return (
      <div class={`day-bet-footer ${flashClass}`}>
        <span class="day-bet-label">体彩</span>
        <span class="day-bet-stake">投入 {fmtMoney(entry.stake)}</span>
        <span class="day-bet-sep">·</span>
        <span class={`day-bet-pnl ${pnlClass}`}>
          {pnlSign(entry.pnl) ?? "—"} 盈亏 {fmtMoney(entry.pnl)}
        </span>
        {entry.note && (
          <span class="day-bet-note" title={entry.note}>
            「{entry.note}」
          </span>
        )}
        <span class="day-bet-actions">
          <button onClick={openEdit}>编辑</button>
          <button onClick={clear}>清空</button>
        </span>
      </div>
    );
  }

  return (
    <div class="day-bet-footer day-bet-footer-empty">
      <span class="day-bet-label">体彩</span>
      <button class="day-bet-unfilled-btn" onClick={openEdit}>
        未填 →
      </button>
    </div>
  );
}
