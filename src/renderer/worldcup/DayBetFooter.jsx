/**
 * src/renderer/worldcup/DayBetFooter.jsx
 *
 * v2.10.0 比赛日底部小卡 — stake + pnl + note
 * 已填显示当前值, 未填显示按钮, 点开行内编辑.
 */
import { useState, useRef, useEffect } from "preact/hooks";
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

export function DayBetFooter({ date, search = "" }) {
  // 搜索态下不渲染 footer (专注比赛卡片, 不打扰)
  if (search) return null;
  const entry = worldcupBets.value[date];
  const [editing, setEditing] = useState(false);
  const [stake, setStake] = useState("");
  const [pnl, setPnl] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const stakeRef = useRef(null);

  useEffect(() => {
    if (editing && stakeRef.current) {
      stakeRef.current.focus();
    }
  }, [editing]);

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
  }

  async function clear() {
    if (typeof window === "undefined" || !window.confirm("清空这一天的体彩记录？")) {
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
    return (
      <div class="day-bet-footer">
        <span class="day-bet-label">体彩</span>
        <span class="day-bet-stake">投入 {fmtMoney(entry.stake)}</span>
        <span class="day-bet-sep">·</span>
        <span class={`day-bet-pnl ${pnlClass}`}>盈亏 {fmtMoney(entry.pnl)}</span>
        {entry.note && <span class="day-bet-note">「{entry.note}」</span>}
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
