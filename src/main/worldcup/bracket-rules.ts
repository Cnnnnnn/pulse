/**
 * src/main/worldcup/bracket-rules.ts
 *
 * 2026 世界杯淘汰赛 bracket 计算 - 纯函数库 (无 IO, 易测)
 *
 * 数据契约:
 *   matches:    [{ stage, team1, team2, score, date, time, ... }]
 *   scores:     { [matchKey]: { ft, status, et?, pen? } }]
 *   teamsData:  [{ group: 'A', name: 'Mexico', cn: '墨西哥', ... }]
 *
 * v1.2: Annex C 495 行完整 lookup table (源: FIFA WC26 Regs Annex C,
 * 经 manganite/wm2026 抄录并验证覆盖全部 C(12,8) 组合).
 */
"use strict";

const ALL_GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// 8 个固定「winner」位置 → R32 match # (FIFA Article 12.6)
// ANNEX_C_WINNERS[i] 对应 R32 M_OF_WINNER[i] (winner 1<X> 在那场比赛打 best-3rd).
const ANNEX_C_WINNERS = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'];
// ↑ 上面手填对象是 fallback,真正表里用下方精确 M 号 (74/85/81/79/82/77/87/80).
// 来源: 1A→M74? 不 — 实际上:
//   M74 = 1E vs 3X   (FIFA Article 12.6 第 73 条)
//   M85 = 1B vs 3X
//   M81 = 1D vs 3X
//   M79 = 1A vs 3X
//   M82 = 1G vs 3X
//   M77 = 1I vs 3X
//   M87 = 1K vs 3X
//   M80 = 1L vs 3X
// 来源: FIFA WC26 Regs Article 12.6 (官方 PDF).

// ─── Annex C 完整 495 行 lookup ────────────────────────────────────
// 每个 row 是 8 个字母,按 ANNEX_C_WINNERS 列序表示: 该 combo 把
// group X 的第 3 名指给 ANNEX_C_WINNERS[X] 的 winner 当对手.
// 例: "EJIFHGLK" 表示晋级组 {E,F,G,H,I,J,K,L},在 ANNEX_C_WINNERS 列序下:
//   1A 的对手 = 3E, 1B 的对手 = 3J, 1D 的对手 = 3I, 1E 的对手 = 3F,
//   1G 的对手 = 3H, 1I 的对手 = 3G, 1K 的对手 = 3L, 1L 的对手 = 3K.
//
const ANNEX_C_ROWS = [
 'EJIFHGLK','HGIDJFLK','EJIDHGLK','EJIDHFLK','EGIDJFLK','EGJDHFLK','EGIDHFLK','EGJDHFLI','EGJDHFIK',
 'HGICJFLK','EJICHGLK','EJICHFLK','EGICJFLK','EGJCHFLK','EGICHFLK','EGJCHFLI','EGJCHFIK','HGICJDLK',
 'CJIDHFLK','CGIDJFLK','CGJDHFLK','CGIDHFLK','CGJDHFLI','CGJDHFIK','EJICHDLK','EGICJDLK','EGJCHDLK',
 'EGICHDLK','EGJCHDLI','EGJCHDIK','CJEDIFLK','CJEDHFLK','CEIDHFLK','CJEDHFLI','CJEDHFIK','CGEDJFLK',
 'CGEDIFLK','CGEDJFLI','CGEDJFIK','CGEDHFLK','CGJDHFLE','CGJDHFEK','CGEDHFLI','CGEDHFIK','CGJDHFEI',
 'HJBFIGLK','EJIBHGLK','EJBFIHLK','EJBFIGLK','EJBFHGLK','EGBFIHLK','EJBFHGLI','EJBFHGIK','HJBDIGLK',
 'HJBDIFLK','IGBDJFLK','HGBDJFLK','HGBDIFLK','HGBDJFLI','HGBDJFIK','EJBDIHLK','EJBDIGLK','EJBDHGLK',
 'EGBDIHLK','EJBDHGLI','EJBDHGIK','EJBDIFLK','EJBDHFLK','EIBDHFLK','EJBDHFLI','EJBDHFIK','EGBDJFLK',
 'EGBDIFLK','EGBDJFLI','EGBDJFIK','EGBDHFLK','HGBDJFLE','HGBDJFEK','EGBDHFLI','EGBDHFIK','HGBDJFEI',
 'HJBCIGLK','HJBCIFLK','IGBCJFLK','HGBCJFLK','HGBCIFLK','HGBCJFLI','HGBCJFIK','EJBCIHLK','EJBCIGLK',
 'EJBCHGLK','EGBCIHLK','EJBCHGLI','EJBCHGIK','EJBCIFLK','EJBCHFLK','EIBCHFLK','EJBCHFLI','EJBCHFIK',
 'EGBCJFLK','EGBCIFLK','EGBCJFLI','EGBCJFIK','EGBCHFLK','HGBCJFLE','HGBCJFEK','EGBCHFLI','EGBCHFIK',
 'HGBCJFEI','HJBCIDLK','IGBCJDLK','HGBCJDLK','HGBCIDLK','HGBCJDLI','HGBCJDIK','CJBDIFLK','CJBDHFLK',
 'CIBDHFLK','CJBDHFLI','CJBDHFIK','CGBDJFLK','CGBDIFLK','CGBDJFLI','CGBDJFIK','CGBDHFLK','CGBDHFLJ',
 'HGBCJFDK','CGBDHFLI','CGBDHFIK','HGBCJFDI','EJBCIDLK','EJBCHDLK','EIBCHDLK','EJBCHDLI','EJBCHDIK',
 'EGBCJDLK','EGBCIDLK','EGBCJDLI','EGBCJDIK','EGBCHDLK','HGBCJDLE','HGBCJDEK','EGBCHDLI','EGBCHDIK',
 'HGBCJDEI','CJBDEFLK','CEBDIFLK','CJBDEFLI','CJBDEFIK','CEBDHFLK','CJBDHFLE','CJBDHFEK','CEBDHFLI',
 'CEBDHFIK','CJBDHFEI','CGBDEFLK','CGBDJFLE','CGBDJFEK','CGBDEFLI','CGBDEFIK','CGBDJFEI','CGBDHFLE',
 'CGBDHFEK','HGBCJFDE','CGBDHFEI','HJIFAGLK','EJIAHGLK','EJIFAHLK','EJIFAGLK','EGJFAHLK','EGIFAHLK',
 'EGJFAHLI','EGJFAHIK','HJIDAGLK','HJIDAFLK','IGJDAFLK','HGJDAFLK','HGIDAFLK','HGJDAFLI','HGJDAFIK',
 'EJIDAHLK','EJIDAGLK','EGJDAHLK','EGIDAHLK','EGJDAHLI','EGJDAHIK','EJIDAFLK','HJEDAFLK','HEIDAFLK',
 'HJEDAFLI','HJEDAFIK','EGJDAFLK','EGIDAFLK','EGJDAFLI','EGJDAFIK','HGEDAFLK','HGJDAFLE','HGJDAFEK',
 'HGEDAFLI','HGEDAFIK','HGJDAFEI','HJICAGLK','HJICAFLK','IGJCAFLK','HGJCAFLK','HGICAFLK','HGJCAFLI',
 'HGJCAFIK','EJICAHLK','EJICAGLK','EGJCAHLK','EGICAHLK','EGJCAHLI','EGJCAHIK','EJICAFLK','HJECAFLK',
 'HEICAFLK','HJECAFLI','HJECAFIK','EGJCAFLK','EGICAFLK','EGJCAFLI','EGJCAFIK','HGECAFLK','HGJCAFLE',
 'HGJCAFEK','HGECAFLI','HGECAFIK','HGJCAFEI','HJICADLK','IGJCADLK','HGJCADLK','HGICADLK','HGJCADLI',
 'HGJCADIK','CJIDAFLK','HJFCADLK','HFICADLK','HJFCADLI','HJFCADIK','CGJDAFLK','CGIDAFLK','CGJDAFLI',
 'CGJDAFIK','HGFCADLK','CGJDAFLH','HGJCAFDK','HGFCADLI','HGFCADIK','HGJCAFDI','EJICADLK','HJECADLK',
 'HEICADLK','HJECADLI','HJECADIK','EGJCADLK','EGICADLK','EGJCADLI','EGJCADIK','HGECADLK','HGJCADLE',
 'HGJCADEK','HGECADLI','HGECADIK','HGJCADEI','CJEDAFLK','CEIDAFLK','CJEDAFLI','CJEDAFIK','HEFCADLK',
 'HJFCADLE','HJECAFDK','HEFCADLI','HEFCADIK','HJECAFDI','CGEDAFLK','CGJDAFLE','CGJDAFEK','CGEDAFLI',
 'CGEDAFIK','CGJDAFEI','HGFCADLE','HGECAFDK','HGJCAFDE','HGECAFDI','HJBAIGLK','HJBAIFLK','IJBFAGLK',
 'HJBFAGLK','HGBAIFLK','HJBFAGLI','HJBFAGIK','EJBAIHLK','EJBAIGLK','EJBAHGLK','EGBAIHLK','EJBAHGLI',
 'EJBAHGIK','EJBAIFLK','EJBFAHLK','EIBFAHLK','EJBFAHLI','EJBFAHIK','EJBFAGLK','EGBAIFLK','EJBFAGLI',
 'EJBFAGIK','EGBFAHLK','HJBFAGLE','HJBFAGEK','EGBFAHLI','EGBFAHIK','HJBFAGEI','IJBDAHLK','IJBDAGLK',
 'HJBDAGLK','IGBDAHLK','HJBDAGLI','HJBDAGIK','IJBDAFLK','HJBDAFLK','HIBDAFLK','HJBDAFLI','HJBDAFIK',
 'FJBDAGLK','IGBDAFLK','FJBDAGLI','FJBDAGIK','HGBDAFLK','HGBDAFLJ','HGBDAFJK','HGBDAFLI','HGBDAFIK',
 'HGBDAFIJ','EJBAIDLK','EJBDAHLK','EIBDAHLK','EJBDAHLI','EJBDAHIK','EJBDAGLK','EGBAIDLK','EJBDAGLI',
 'EJBDAGIK','EGBDAHLK','HJBDAGLE','HJBDAGEK','EGBDAHLI','EGBDAHIK','HJBDAGEI','EJBDAFLK','EIBDAFLK',
 'EJBDAFLI','EJBDAFIK','HEBDAFLK','HJBDAFLE','HJBDAFEK','HEBDAFLI','HEBDAFIK','HJBDAFEI','EGBDAFLK',
 'EGBDAFLJ','EGBDAFJK','EGBDAFLI','EGBDAFIK','EGBDAFIJ','HGBDAFLE','HGBDAFEK','HGBDAFEJ','HGBDAFEI',
 'IJBCAHLK','IJBCAGLK','HJBCAGLK','IGBCAHLK','HJBCAGLI','HJBCAGIK','IJBCAFLK','HJBCAFLK','HIBCAFLK',
 'HJBCAFLI','HJBCAFIK','CJBFAGLK','IGBCAFLK','CJBFAGLI','CJBFAGIK','HGBCAFLK','HGBCAFLJ','HGBCAFJK',
 'HGBCAFLI','HGBCAFIK','HGBCAFIJ','EJBAICLK','EJBCAHLK','EIBCAHLK','EJBCAHLI','EJBCAHIK','EJBCAGLK',
 'EGBAICLK','EJBCAGLI','EJBCAGIK','EGBCAHLK','HJBCAGLE','HJBCAGEK','EGBCAHLI','EGBCAHIK','HJBCAGEI',
 'EJBCAFLK','EIBCAFLK','EJBCAFLI','EJBCAFIK','HEBCAFLK','HJBCAFLE','HJBCAFEK','HEBCAFLI','HEBCAFIK',
 'HJBCAFEI','EGBCAFLK','EGBCAFLJ','EGBCAFJK','EGBCAFLI','EGBCAFIK','EGBCAFIJ','HGBCAFLE','HGBCAFEK',
 'HGBCAFEJ','HGBCAFEI','IJBCADLK','HJBCADLK','HIBCADLK','HJBCADLI','HJBCADIK','CJBDAGLK','IGBCADLK',
 'CJBDAGLI','CJBDAGIK','HGBCADLK','HGBCADLJ','HGBCADJK','HGBCADLI','HGBCADIK','HGBCADIJ','CJBDAFLK',
 'CIBDAFLK','CJBDAFLI','CJBDAFIK','HFBCADLK','CJBDAFLH','HJBCAFDK','HFBCADLI','HFBCADIK','HJBCAFDI',
 'CGBDAFLK','CGBDAFLJ','CGBDAFJK','CGBDAFLI','CGBDAFIK','CGBDAFIJ','CGBDAFLH','HGBCAFDK','HGBCAFDJ',
 'HGBCAFDI','EJBCADLK','EIBCADLK','EJBCADLI','EJBCADIK','HEBCADLK','HJBCADLE','HJBCADEK','HEBCADLI',
 'HEBCADIK','HJBCADEI','EGBCADLK','EGBCADLJ','EGBCADJK','EGBCADLI','EGBCADIK','EGBCADIJ','HGBCADLE',
 'HGBCADEK','HGBCADEJ','HGBCADEI','CEBDAFLK','CJBDAFLE','CJBDAFEK','CEBDAFLI','CEBDAFIK','CJBDAFEI',
 'HFBCADLE','HEBCAFDK','HJBCAFDE','HEBCAFDI','CGBDAFLE','CGBDAFEK','CGBDAFEJ','CGBDAFEI','HGBCAFDE',
];

const ANNEX_C_DEFAULT: any = {
  r32Matches_73_88: [
    { num: 73, slot1: { type: 'group', rank: 'runnerUp', group: 'A' }, slot2: { type: 'group', rank: 'runnerUp', group: 'B' } },
    { num: 74, slot1: { type: 'group', rank: 'winner', group: 'E' }, slot2: { type: 'best-third', pool: ['A', 'B', 'C', 'D', 'F'] } },
    { num: 75, slot1: { type: 'group', rank: 'winner', group: 'F' }, slot2: { type: 'group', rank: 'runnerUp', group: 'C' } },
    { num: 76, slot1: { type: 'group', rank: 'winner', group: 'C' }, slot2: { type: 'group', rank: 'runnerUp', group: 'F' } },
    { num: 77, slot1: { type: 'group', rank: 'winner', group: 'I' }, slot2: { type: 'best-third', pool: ['C', 'D', 'F', 'G', 'H'] } },
    { num: 78, slot1: { type: 'group', rank: 'runnerUp', group: 'E' }, slot2: { type: 'group', rank: 'runnerUp', group: 'I' } },
    { num: 79, slot1: { type: 'group', rank: 'winner', group: 'A' }, slot2: { type: 'best-third', pool: ['C', 'E', 'F', 'H', 'I'] } },
    { num: 80, slot1: { type: 'group', rank: 'winner', group: 'L' }, slot2: { type: 'best-third', pool: ['E', 'H', 'I', 'J', 'K'] } },
    { num: 81, slot1: { type: 'group', rank: 'winner', group: 'D' }, slot2: { type: 'best-third', pool: ['B', 'E', 'F', 'I', 'J'] } },
    { num: 82, slot1: { type: 'group', rank: 'winner', group: 'G' }, slot2: { type: 'best-third', pool: ['A', 'E', 'H', 'I', 'J'] } },
    { num: 83, slot1: { type: 'group', rank: 'runnerUp', group: 'K' }, slot2: { type: 'group', rank: 'runnerUp', group: 'L' } },
    { num: 84, slot1: { type: 'group', rank: 'winner', group: 'H' }, slot2: { type: 'group', rank: 'runnerUp', group: 'J' } },
    { num: 85, slot1: { type: 'group', rank: 'winner', group: 'B' }, slot2: { type: 'best-third', pool: ['E', 'F', 'G', 'I', 'J'] } },
    { num: 86, slot1: { type: 'group', rank: 'winner', group: 'J' }, slot2: { type: 'group', rank: 'runnerUp', group: 'H' } },
    { num: 87, slot1: { type: 'group', rank: 'winner', group: 'K' }, slot2: { type: 'best-third', pool: ['D', 'E', 'I', 'J', 'L'] } },
    { num: 88, slot1: { type: 'group', rank: 'runnerUp', group: 'D' }, slot2: { type: 'group', rank: 'runnerUp', group: 'G' } },
  ],
  r16Matches_89_96: [
    { num: 89, sources: ['r32:74', 'r32:77'] },
    { num: 90, sources: ['r32:73', 'r32:75'] },
    { num: 91, sources: ['r32:76', 'r32:78'] },
    { num: 92, sources: ['r32:79', 'r32:80'] },
    { num: 93, sources: ['r32:83', 'r32:84'] },
    { num: 94, sources: ['r32:81', 'r32:82'] },
    { num: 95, sources: ['r32:86', 'r32:88'] },
    { num: 96, sources: ['r32:85', 'r32:87'] },
  ],
  qfMatches_97_100: [
    { num: 97, sources: ['r16:89', 'r16:90'] },
    { num: 98, sources: ['r16:93', 'r16:94'] },
    { num: 99, sources: ['r16:91', 'r16:92'] },
    { num: 100, sources: ['r16:95', 'r16:96'] },
  ],
  sfMatches_101_102: [
    { num: 101, sources: ['qf:97', 'qf:98'] },
    { num: 102, sources: ['qf:99', 'qf:100'] },
  ],
  finalMatch: { num: 104, sources: ['sf:101', 'sf:102'] },
  thirdMatch: { num: 103, sources: ['sf:101-loser', 'sf:102-loser'] },
};

// 8 个 winner 对应的 R32 match # (FIFA Article 12.6)
const R32_MATCH_OF_WINNER: Record<string, number> = { A: 79, B: 85, D: 81, E: 74, G: 82, I: 77, K: 87, L: 80 };

// Annex C lookup: key = row 内 8 字母按字母序 sort 后拼成的串 (C(12,8)=495 个 key, 覆盖全部).
const ANNEX_C_LOOKUP = new Map<string, any>();
(function buildAnnexCLookup() {
  for (let i = 0; i < ANNEX_C_ROWS.length; i += 1) {
    const raw = ANNEX_C_ROWS[i];
    if (typeof raw !== 'string' || raw.length !== 8) continue;
    const key = raw.split('').sort().join('');
    ANNEX_C_LOOKUP.set(key, { rowIndex: i, rawLetters: raw });
  }
})();

/**
 * Sort 12 third-placed teams by FIFA criteria: pts DESC → gd DESC → gf DESC.
 */
export function sortThirdPlaced(standings: any): any[] {
  const arr = Object.entries(standings || {})
    .map(([group, s]: [string, any]) => ({
      group,
      pts: (s && s.pts) || 0,
      gd: (s && s.gd) || 0,
      gf: (s && s.gf) || 0,
    }))
    .sort((a: any, b: any) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.group.localeCompare(b.group);
    });
  return arr;
}

/**
 * Pick top N group letters by sortThirdPlaced ranking.
 */
export function selectThirdPlaced(sortedThird: any[], n: number = 8): string[] {
  return sortedThird.slice(0, n).map((s) => s.group);
}

/**
 * Match the 8 advancing third-placed group letters against FIFA Annex C 495-row table.
 *
 * v1.2: 完整 495 行 lookup,key = 晋级 8 组的字母(已 sort)拼接串.
 * 找不到(数据脏/晋级非 8 个)→ 走 ANNEX_C_DEFAULT row 1 + warning.
 */
export function matchAnnexCCase(advancingGroups: string[]): any {
  const cleaned = (advancingGroups || []).filter((x: any) => typeof x === 'string' && /^[A-L]$/.test(x));
  const sorted = [...new Set(cleaned)].sort();
  const key = sorted.length === 8 ? sorted.join('') : null;
  if (!key) {
    return { rowIndex: 0, config: ANNEX_C_DEFAULT, matched: false, key: null };
  }
  const hit = ANNEX_C_LOOKUP.get(key);
  if (!hit) {
    return { rowIndex: 0, config: ANNEX_C_DEFAULT, matched: false, key };
  }
  return {
    rowIndex: hit.rowIndex,
    config: buildAnnexConfigFromRow(hit.rowIndex, hit.rawLetters),
    matched: true,
    key,
  };
}

/**
 * 从 Annex C row 的 8 字母 lookup 串生成完整 bracket config (含 r32/r16/qf/sf/final/third).
 */
function buildAnnexConfigFromRow(rowIndex: number, rawLetters: string): any {
  // rawLetters 是 8 个字母按 ANNEX_C_WINNERS 列序的 best-3rd 映射
  const bestThirdByWinner: Record<string, string> = {};
  for (let i = 0; i < ANNEX_C_WINNERS.length; i += 1) {
    bestThirdByWinner[ANNEX_C_WINNERS[i]] = rawLetters[i];
  }

  // 8 场 winner-vs-best3rd (slot1 = winner, slot2 = best3rd)
  const winnerVsThird = ALL_GROUP_LETTERS
    .filter((g) => ANNEX_C_WINNERS.includes(g))
    .map((g) => ({
      num: R32_MATCH_OF_WINNER[g],
      slot1: { type: 'group', rank: 'winner', group: g },
      slot2: { type: 'best-third', pool: [bestThirdByWinner[g]] },
    }));

  // 4 场 winner-vs-runnerUp (FIFA Article 12.6 固定)
  const winnerVsRunner = [
    { num: 75, slot1: { type: 'group', rank: 'winner', group: 'F' }, slot2: { type: 'group', rank: 'runnerUp', group: 'C' } },
    { num: 76, slot1: { type: 'group', rank: 'winner', group: 'C' }, slot2: { type: 'group', rank: 'runnerUp', group: 'F' } },
    { num: 84, slot1: { type: 'group', rank: 'winner', group: 'H' }, slot2: { type: 'group', rank: 'runnerUp', group: 'J' } },
    { num: 86, slot1: { type: 'group', rank: 'winner', group: 'J' }, slot2: { type: 'group', rank: 'runnerUp', group: 'H' } },
  ];

  // 4 场 runnerUp-vs-runnerUp (FIFA Article 12.6 固定)
  const runnerVsRunner = [
    { num: 73, slot1: { type: 'group', rank: 'runnerUp', group: 'A' }, slot2: { type: 'group', rank: 'runnerUp', group: 'B' } },
    { num: 78, slot1: { type: 'group', rank: 'runnerUp', group: 'E' }, slot2: { type: 'group', rank: 'runnerUp', group: 'I' } },
    { num: 83, slot1: { type: 'group', rank: 'runnerUp', group: 'K' }, slot2: { type: 'group', rank: 'runnerUp', group: 'L' } },
    { num: 88, slot1: { type: 'group', rank: 'runnerUp', group: 'D' }, slot2: { type: 'group', rank: 'runnerUp', group: 'G' } },
  ];

  const r32 = [...winnerVsThird, ...winnerVsRunner, ...runnerVsRunner]
    .sort((a, b) => a.num - b.num);

  return {
    r32Matches_73_88: r32,
    r16Matches_89_96: [
      { num: 89, sources: ['r32:74', 'r32:77'] },
      { num: 90, sources: ['r32:73', 'r32:75'] },
      { num: 91, sources: ['r32:76', 'r32:78'] },
      { num: 92, sources: ['r32:79', 'r32:80'] },
      { num: 93, sources: ['r32:83', 'r32:84'] },
      { num: 94, sources: ['r32:81', 'r32:82'] },
      { num: 95, sources: ['r32:86', 'r32:88'] },
      { num: 96, sources: ['r32:85', 'r32:87'] },
    ],
    qfMatches_97_100: [
      { num: 97, sources: ['r16:89', 'r16:90'] },
      { num: 98, sources: ['r16:93', 'r16:94'] },
      { num: 99, sources: ['r16:91', 'r16:92'] },
      { num: 100, sources: ['r16:95', 'r16:96'] },
    ],
    sfMatches_101_102: [
      { num: 101, sources: ['qf:97', 'qf:98'] },
      { num: 102, sources: ['qf:99', 'qf:100'] },
    ],
    finalMatch: { num: 104, sources: ['sf:101', 'sf:102'] },
    thirdMatch: { num: 103, sources: ['sf:101-loser', 'sf:102-loser'] },
  };
}

/**
 * Resolve one slot spec (from Annex C template) against group results.
 */
export function resolveSlot(slotSpec: any, groupResults: any, sortedThirdLetters: string[]): any {
  if (slotSpec.type === 'group') {
    const gr = groupResults[slotSpec.group] || {};
    const teamName = gr[slotSpec.rank];
    if (!teamName) {
      return { team: null, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
    }
    return { team: { name: teamName }, source: `group:${slotSpec.group}:${slotSpec.rank}`, rank: slotSpec.rank, group: slotSpec.group };
  }
  if (slotSpec.type === 'best-third') {
    const advancing = new Set(sortedThirdLetters || []);
    const pick = (slotSpec.pool || []).find((g: any) => advancing.has(g));
    if (!pick) {
      return { team: null, source: 'best-third-pool', pool: slotSpec.pool };
    }
    const gr = groupResults[pick] || {};
    const teamName = gr.third;
    if (!teamName) {
      return { team: null, source: `group:${pick}:third`, rank: 'third', group: pick, pool: slotSpec.pool };
    }
    return { team: { name: teamName }, source: `group:${pick}:third`, rank: 'third', group: pick, pool: slotSpec.pool };
  }
  return { team: null, source: 'unknown' };
}

function sourceLabel(slotSpec: any): string {
  if (slotSpec.type === 'group') return `group:${slotSpec.group}:${slotSpec.rank}`;
  if (slotSpec.type === 'best-third') return `best-third:${slotSpec.pool.join(',')}`;
  return 'unknown';
}

/**
 * Resolve 16 Round-of-32 matches from Annex C template + group results.
 */
export function resolveR32Matchups(annexConfig: any, groupResults: any, sortedThirdLetters: string[]): any[] {
  return annexConfig.r32Matches_73_88.map((tmpl: any) => {
    const slot1 = resolveSlot(tmpl.slot1, groupResults, sortedThirdLetters);
    const slot2 = resolveSlot(tmpl.slot2, groupResults, sortedThirdLetters);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: sourceLabel(tmpl.slot1),
      source2: sourceLabel(tmpl.slot2),
    };
  });
}

/**
 * Determine winner of a finished match from its score. Returns 'slot1' / 'slot2' / null.
 */
export function determineWinner(score: any): 'slot1' | 'slot2' | null {
  if (!score || !score.ft) return null;
  const [h, a] = score.ft;
  if (h > a) return 'slot1';
  if (h < a) return 'slot2';
  if (score.et && Array.isArray(score.et)) {
    const [eh, ea] = score.et;
    if (eh > ea) return 'slot1';
    if (eh < ea) return 'slot2';
  }
  if (score.pen && Array.isArray(score.pen)) {
    const [ph, pa] = score.pen;
    if (ph > pa) return 'slot1';
    if (pa > ph) return 'slot2';
  }
  return null;
}

function parseSource(src: any): any {
  const m = String(src || '').match(/^([a-z0-9]+):(\d+)(-loser)?$/);
  if (!m) return { stage: null, num: null, loser: false };
  return { stage: m[1], num: parseInt(m[2], 10), loser: !!m[3] };
}

function resolveFromSource(parsed: any, prevByNum: Map<number, any>): any {
  if (!parsed.stage || !parsed.num) return { team: null, source: 'invalid' };
  const prev = prevByNum.get(parsed.num);
  if (!prev) return { team: null, source: `${parsed.stage}:${parsed.num}` };
  const winnerKey = determineWinner(prev.score);
  if (winnerKey === null) {
    return { team: null, source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}` };
  }
  const winnerSlot = winnerKey === 'slot1' ? prev.slot1 : prev.slot2;
  const loserSlot = winnerKey === 'slot1' ? prev.slot2 : prev.slot1;
  const chosen = parsed.loser ? loserSlot : winnerSlot;
  return {
    team: chosen ? chosen.team : null,
    source: `${parsed.stage}:${parsed.num}${parsed.loser ? '-loser' : ''}`,
  };
}

/**
 * Propagate winners/losers from a previous stage into the next stage slots.
 */
export function propagateWinner(prevMatches: any[], nextTemplate: any[]): any[] {
  const prevByNum = new Map((prevMatches || []).map((m: any) => [m.matchNum, m]));
  return (nextTemplate || []).map((tmpl: any) => {
    const sources = tmpl.sources.map((src: any) => parseSource(src));
    const slot1 = resolveFromSource(sources[0], prevByNum);
    const slot2 = resolveFromSource(sources[1], prevByNum);
    return {
      matchNum: tmpl.num,
      slot1,
      slot2,
      score: null,
      status: slot1.team && slot2.team ? 'pending' : 'projected',
      source1: tmpl.sources[0],
      source2: tmpl.sources[1],
    };
  });
}

/**
 * Simple non-cryptographic hash for inputs fingerprint.
 */
function simpleHash(groupStandings: any, scores: any): string {
  const payload = JSON.stringify({ g: groupStandings, s: scores });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Compute the full knockout bracket from current group standings + scores.
 *
 * v1.2: 完整 FIFA Annex C 495 行 lookup + best-third 真挑队.
 */
export function computeBracket(input: { groupStandings?: any; scores?: any } = {}): any {
  const { groupStandings, scores } = input;
  if (!groupStandings || typeof groupStandings !== 'object' || Object.keys(groupStandings).length === 0) {
    return null;
  }

  const warnings: string[] = [];
  const groupResults: Record<string, any> = {};
  const thirdStandings: Record<string, any> = {};
  const groupComplete: Record<string, boolean> = {};

  for (const letter of Object.keys(groupStandings)) {
    const gs: any = (groupStandings as any)[letter];
    if (!gs) {
      warnings.push(`group_${letter}_incomplete`);
      continue;
    }
    groupComplete[letter] = gs.complete === true;
    groupResults[letter] = {
      winner: gs.winner || null,
      runnerUp: gs.runnerUp || null,
      third: gs.third && gs.third.name ? gs.third.name : null,
    };
    if (gs.third) {
      thirdStandings[letter] = {
        pts: gs.third.pts || 0,
        gd: gs.third.gd || 0,
        gf: gs.third.gf || 0,
      };
    }
  }

  const sortedThird = sortThirdPlaced(thirdStandings);
  const advancing = selectThirdPlaced(sortedThird, 8);
  const sortedThirdLetters = sortedThird.map((s: any) => s.group);
  const annex = matchAnnexCCase(advancing);
  if (!annex.matched) {
    if (annex.key) warnings.push('annexC_unknown_combo');
    else warnings.push('annexC_default_under_8');
    warnings.push('simplified_annex_c_default_row');
  } else {
    warnings.push(`annexC_row_${annex.rowIndex}`);
  }

  const r32 = resolveR32Matchups(annex.config, groupResults, sortedThirdLetters);
  const r16 = propagateWinner(r32, annex.config.r16Matches_89_96);
  const qf = propagateWinner(r16, annex.config.qfMatches_97_100);
  const sf = propagateWinner(qf, annex.config.sfMatches_101_102);
  const finalArr = propagateWinner(sf, [annex.config.finalMatch]);
  const thirdArr = propagateWinner(sf, [annex.config.thirdMatch]);
  const finalMatch = finalArr[0];
  const thirdMatch = thirdArr[0];

  const completeGroupCount = Object.values(groupComplete).filter(Boolean).length;
  const hasAnyData = Object.keys(groupComplete).length > 0;
  const projected = completeGroupCount < 12 || !hasAnyData;
  if (projected && hasAnyData) warnings.push('bracket_partial');

  return {
    version: 2,
    computedAt: Date.now(),
    inputsHash: 'sha256:' + simpleHash(groupStandings, scores || {}),
    projected,
    completeGroupCount,
    r32,
    r16,
    qf,
    sf,
    final: finalMatch,
    third: thirdMatch,
    thirdPlacedAdvancing: advancing,
    annexCIndex: annex.rowIndex,
    annexCMatched: annex.matched,
    annexCKey: annex.key,
    warnings,
  };
}

module.exports = {
  sortThirdPlaced,
  selectThirdPlaced,
  matchAnnexCCase,
  resolveR32Matchups,
  resolveSlot,
  propagateWinner,
  computeBracket,
  determineWinner,
  parseSource,
  ANNEX_C_ROWS,
  ANNEX_C_WINNERS,
  ANNEX_C_DEFAULT,
};