/**
 * src/renderer/worldcup/WorldcupView.jsx
 *
 * v2.9.0 世界杯专栏 — 主 view (section by day, 你拍 view_section_by_day)
 *
 * 数据流:
 *   1) mount 时 loadWorldcupFixtures() (并发守卫)
 *   2) 失败 → error card + 重试按钮
 *   3) 成功 → groupMatchesByDate(matches) → section by day 渲染
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import MatchCard from './MatchCard.jsx';
import SquadModal from './SquadModal.jsx';
import { groupMatchesByDate } from './groupByDate.js';
import { displayTeam } from './teams-data.js';
import {
  worldcupMatches,
  worldcupLoading,
  worldcupError,
  loadWorldcupFixtures,
  clearWorldcupError,
} from './store.js';
import { WorldcupBetsStats } from './WorldcupBetsStats.jsx';
import { trackWorldcupMatchView } from '../recent/track.js';
import { DayBetFooter } from './DayBetFooter.jsx';

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatDateLabel(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${y}-${m}-${d}`;
}

function formatWeekday(date) {
  if (!date) return '';
  const dt = new Date(date + 'T00:00:00Z');
  const idx = dt.getUTCDay();
  return WEEKDAYS_CN[idx] || '';
}

export function WorldcupView({ search = '', focusMatchKey = null, onFocusMatchConsumed }) {
  const data = worldcupMatches.value;
  const loading = worldcupLoading.value;
  const error = worldcupError.value;
  const [squadMatch, setSquadMatch] = useState(null);

  const dayGroups = useMemo(() => {
    if (!data || !Array.isArray(data.matches)) return [];
    let matches = data.matches;
    if (search) {
      const q = search.toLowerCase();
      matches = matches.filter((m) => {
        const d1 = displayTeam(m.team1);
        const d2 = displayTeam(m.team2);
        return (
          (m.team1 && m.team1.toLowerCase().includes(q)) ||
          (m.team2 && m.team2.toLowerCase().includes(q)) ||
          (d1.cn && d1.cn.includes(q)) ||
          (d2.cn && d2.cn.includes(q)) ||
          (m.venue && m.venue.toLowerCase().includes(q))
        );
      });
    }
    return groupMatchesByDate(matches);
  }, [data, search]);

  useEffect(() => {
    if (!focusMatchKey) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-match-key="${(focusMatchKey || "").replace(/"/g, '\\"')}"]`,
      );
      if (!el) {
        console.warn(`[worldcup] focus-match: element not found: ${focusMatchKey}`);
        if (typeof onFocusMatchConsumed === "function") onFocusMatchConsumed();
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("match-row-highlight");
      setTimeout(() => {
        try { el.classList.remove("match-row-highlight"); } catch { /* noop */ }
        if (typeof onFocusMatchConsumed === "function") onFocusMatchConsumed();
      }, 3000);
    });
  }, [focusMatchKey]);

  // 错误态
  if (error) {
    return (
      <div class="worldcup-view worldcup-error">
        <div class="worldcup-error-card">
          <div class="worldcup-error-icon">⚠️</div>
          <div class="worldcup-error-msg">赛程加载失败: {error}</div>
          <button
            class="btn btn-primary btn-sm"
            onClick={() => {
              clearWorldcupError();
              loadWorldcupFixtures();
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 加载态
  if (loading && !data) {
    return (
      <div class="worldcup-view worldcup-loading">
        <div class="worldcup-loading-card">
          <span class="spinner"></span>
          <span>加载世界杯赛程...</span>
        </div>
      </div>
    );
  }

  // 空态
  if (!data || !data.matches || data.matches.length === 0) {
    return (
      <div class="worldcup-view worldcup-empty">
        <p>暂无赛程</p>
      </div>
    );
  }

  return (
    <div class="worldcup-view">
      {squadMatch && <SquadModal match={squadMatch} onClose={() => setSquadMatch(null)} />}
      <p class="worldcup-meta worldcup-fixtures-meta">
        共 {data.matches.length} 场赛事 · {dayGroups.length} 个比赛日
      </p>
      <WorldcupBetsStats allDates={dayGroups.map((d) => d.date)} />
      <div class="worldcup-day-list">
        {dayGroups.map((g) => (
          <section key={g.date} class="worldcup-day-section">
            <header class="worldcup-day-header">
              <span class="worldcup-day-date">{formatDateLabel(g.date)}</span>
              <span class="worldcup-day-weekday">{formatWeekday(g.date)}</span>
              <span class="worldcup-day-count">{g.matches.length} 场</span>
            </header>
            <div class="worldcup-day-matches">
              {g.matches.map((m, idx) => (
                <MatchCard
                  key={`${g.date}-${m.time || ''}-${idx}`}
                  match={m}
                  onClick={(mm) => {
                    trackWorldcupMatchView(mm);
                    setSquadMatch(mm);
                  }}
                />
              ))}
            </div>
            <DayBetFooter date={g.date} search={search} />
          </section>
        ))}
      </div>
    </div>
  );
}

export default WorldcupView;
