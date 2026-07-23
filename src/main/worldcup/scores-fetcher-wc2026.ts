/**
 * src/main/worldcup/scores-fetcher-wc2026.ts
 *
 * 第四层比分源: https://wc-2026.com (免费公开, 抓 HTML, 不用 API key)
 */
"use strict";

const { canonicalTeamName, teamsPairKey } = require("./team-aliases.ts");
const { mainLog } = require("../log.ts");

const SCHEDULE_URL = "https://wc-2026.com/schedule/";

const TEAM_CN_TO_EN: Record<string, string> = {
  南非: "South Africa",
  加拿大: "Canada",
  巴西: "Brazil",
  日本: "Japan",
  德国: "Germany",
  巴拉圭: "Paraguay",
  荷兰: "Netherlands",
  摩洛哥: "Morocco",
  科特迪瓦: "Côte d'Ivoire",
  挪威: "Norway",
  法国: "France",
  瑞典: "Sweden",
  墨西哥: "Mexico",
  厄瓜多尔: "Ecuador",
  英格兰: "England",
  刚果民主共和国: "DR Congo",
  比利时: "Belgium",
  塞内加尔: "Senegal",
  美国: "USA",
  波黑: "Bosnia and Herzegovina",
  西班牙: "Spain",
  奥地利: "Austria",
  葡萄牙: "Portugal",
  克罗地亚: "Croatia",
  瑞士: "Switzerland",
  阿尔及利亚: "Algeria",
  澳大利亚: "Australia",
  埃及: "Egypt",
  阿根廷: "Argentina",
  佛得角: "Cabo Verde",
  哥伦比亚: "Colombia",
  加纳: "Ghana",
  韩国: "Korea Republic",
  捷克: "Czechia",
  喀麦隆: "Cameroon",
  意大利: "Italy",
  土耳其: "Türkiye",
  新西兰: "New Zealand",
  突尼斯: "Tunisia",
  沙特阿拉伯: "Saudi Arabia",
  乌拉圭: "Uruguay",
  伊朗: "IR Iran",
  苏格兰: "Scotland",
  海地: "Haiti",
  巴拿马: "Panama",
  卡塔尔: "Qatar",
  伊拉克: "Iraq",
  约旦: "Jordan",
  乌兹别克斯坦: "Uzbekistan",
  波兰: "Poland",
  丹麦: "Denmark",
  塞尔维亚: "Serbia",
  乌克兰: "Ukraine",
  威尔士: "Wales",
  斯洛伐克: "Slovakia",
  罗马尼亚: "Romania",
  阿尔巴尼亚: "Albania",
  斯洛文尼亚: "Slovenia",
  北马其顿: "North Macedonia",
  格鲁吉亚: "Georgia",
  希腊: "Greece",
  冰岛: "Iceland",
  爱尔兰: "Ireland",
  北爱尔兰: "Northern Ireland",
};

const VENUE_CN_TO_EN: Record<string, string> = {
  墨西哥城: "Mexico City",
  洛杉矶: "Los Angeles (Inglewood)",
  波士顿: "Boston (Foxborough)",
  蒙特雷: "Monterrey (Guadalupe)",
  休斯顿: "Houston",
  "纽约/新泽西": "New York/New Jersey (East Rutherford)",
  达拉斯: "Dallas (Arlington)",
  西雅图: "Seattle",
  旧金山湾区: "San Francisco Bay Area (Santa Clara)",
  亚特兰大: "Atlanta",
  迈阿密: "Miami (Miami Gardens)",
  堪萨斯城: "Kansas City",
  费城: "Philadelphia",
  多伦多: "Toronto",
  温哥华: "Vancouver",
  瓜达拉哈拉: "Guadalajara (Zapopan)",
};

const STAGE_SECTION_MAP: Record<string, string> = {
  "32强": "r32",
  "16强": "r16",
  "1/4决赛": "qf",
  半决赛: "sf",
  决赛: "final",
  季军赛: "third",
};

function _cnToEnTeam(name: any): any {
  if (!name) return null;
  if (TEAM_CN_TO_EN[name]) return TEAM_CN_TO_EN[name];
  return name;
}

function _cnToEnVenue(name: any): any {
  if (!name) return null;
  if (VENUE_CN_TO_EN[name]) return VENUE_CN_TO_EN[name];
  return name;
}

/**
 * 解析 wc-2026.com schedule 页 HTML 文本 → match 列表
 */
export function parseScheduleHtml(html: string): any[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const out: any[] = [];
  const lines = html.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(
      /^(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})\s+·\s+北京时间\s+(.+?)\s+(\d+)(?:\s*\((\d+)\))?\s+(.+?)\s+(\d+)(?:\s*\((\d+)\))?\s+(\S+)\s+(32强|16强|1\/4决赛|半决赛|决赛|季军赛)$/,
    );
    if (!m) continue;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const hour = parseInt(m[3], 10);
    const min = parseInt(m[4], 10);
    const team1 = _cnToEnTeam(m[5].trim());
    const ft1 = parseInt(m[6], 10);
    const pen1 = m[7] ? parseInt(m[7], 10) : null;
    const team2 = _cnToEnTeam(m[8].trim());
    const ft2 = parseInt(m[9], 10);
    const pen2 = m[10] ? parseInt(m[10], 10) : null;
    const venue = _cnToEnVenue(m[11]);
    const stage = STAGE_SECTION_MAP[m[12]] || m[12];

    if (Number.isNaN(month) || Number.isNaN(day)) continue;
    if (Number.isNaN(ft1) || Number.isNaN(ft2)) continue;

    let utcH = hour - 8;
    let utcDay = day;
    let utcMonth = month;
    if (utcH < 0) {
      utcH += 24;
      utcDay -= 1;
      if (utcDay < 1) {
        utcMonth -= 1;
        if (utcMonth < 1) {
          utcMonth = 12;
        }
        utcDay = 30;
      }
    }
    const date = `2026-${String(utcMonth).padStart(2, "0")}-${String(utcDay).padStart(2, "0")}`;
    const time = `${String(utcH).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

    const pen =
      pen1 != null && pen2 != null && pen1 !== pen2 ? [pen1, pen2] : null;
    out.push({
      date,
      time,
      timezone: "UTC+0",
      team1,
      team2,
      venue,
      stage,
      ft: [ft1, ft2],
      pen,
    });
  }
  return out;
}

export function indexWc2026ByMatchNum(wc2026Matches: any, bracketSnapshot: any): Map<number, any> {
  const out = new Map<number, any>();
  if (!bracketSnapshot) return out;
  const allMatches: any[] = [];
  for (const k of ["r32", "r16", "qf", "sf"]) {
    for (const m of bracketSnapshot[k] || []) allMatches.push(m);
  }
  if (bracketSnapshot.final) allMatches.push(bracketSnapshot.final);
  if (bracketSnapshot.third) allMatches.push(bracketSnapshot.third);

  for (const m of allMatches) {
    if (!m || typeof m.matchNum !== "number") continue;
    const raw1 = m.slot1 && m.slot1.team && m.slot1.team.name;
    const raw2 = m.slot2 && m.slot2.team && m.slot2.team.name;
    if (!raw1 || !raw2) continue;
    const t1 = _tailName(raw1);
    const t2 = _tailName(raw2);
    const pair = teamsPairKey(t1, t2);
    if (!pair) continue;

    const candidates = wc2026Matches.filter((w: any) => {
      const wp = teamsPairKey(w.team1, w.team2);
      if (wp !== pair) return false;
      const mDate = m.kickoff && m.kickoff.date;
      if (!mDate) return true;
      return Math.abs(_dateDeltaDays(mDate, w.date)) <= 1;
    });
    if (candidates.length === 0) continue;

    const scoreFt = m.score && Array.isArray(m.score.ft) ? m.score.ft : null;
    let best: any = null;
    for (const c of candidates) {
      if (scoreFt && (c.ft[0] !== scoreFt[0] || c.ft[1] !== scoreFt[1]))
        continue;
      best = c;
      break;
    }
    if (!best) best = candidates[0];
    out.set(m.matchNum, {
      ft: best.ft,
      pen: best.pen,
    });
  }
  return out;
}

function _tailName(raw: any): any {
  if (!raw || typeof raw !== "string") return raw;
  const hasPollution = /a\.e\.t\.|pen\.?/i.test(raw);
  if (!hasPollution) return raw;
  const lastPen = raw.toLowerCase().lastIndexOf("pen.");
  if (lastPen >= 0) {
    const after = raw.slice(lastPen + 4).trim();
    const m = after.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,40})/);
    if (m) return m[1].trim();
  }
  const lastAet = raw.toLowerCase().lastIndexOf("a.e.t.");
  if (lastAet >= 0) {
    const after = raw.slice(lastAet + 6);
    const m = after.match(/\)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,40})/);
    if (m) return m[1].trim();
  }
  return raw;
}

function _dateDeltaDays(a: any, b: any): number {
  const pa = String(a).split("-").map(Number);
  const pb = String(b).split("-").map(Number);
  if (pa.length !== 3 || pb.length !== 3) return 999;
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 999;
  return Math.round((ta - tb) / 86400000);
}

export async function fetchWc2026Schedule(http: any): Promise<any> {
  try {
    const r = await http.get(SCHEDULE_URL, { timeout: 15000, follow: true });
    if (!r || r.error || !r.body) {
      mainLog.warn("[worldcup/scores-fetcher-wc2026] fetch failed", {
        error: r && r.error,
      });
      return { ok: false, matches: [] };
    }
    if (r.status && r.status >= 400) {
      mainLog.warn("[worldcup/scores-fetcher-wc2026] bad status", {
        status: r.status,
      });
      return { ok: false, matches: [] };
    }
    const matches = parseScheduleHtml(r.body);
    return { ok: true, matches };
  } catch (err: any) {
    mainLog.warn("[worldcup/scores-fetcher-wc2026] threw", {
      msg: err && err.message,
    });
    return { ok: false, matches: [] };
  }
}

module.exports = {
  SCHEDULE_URL,
  parseScheduleHtml,
  indexWc2026ByMatchNum,
  fetchWc2026Schedule,
  TEAM_CN_TO_EN,
  VENUE_CN_TO_EN,
  STAGE_SECTION_MAP,
};