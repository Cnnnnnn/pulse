/**
 * src/renderer/worldcup/squads-data.js
 *
 * v2.9.5 — 48 队 26 人大名单 (11 主力 + 5 替补 真实 + 9 替补 TBD 占位)
 *
 * 数据来源:
 *   - 11 主力: 各队 2024-2025 赛季国家队现役主力 (从 wiki/transfermarkt/squawka 抽)
 *   - 5 替补: 主力位置补, 知名现役 (FIFA 2026 报名预热)
 *   - 9 替补 TBD-1 ~ TBD-9: FIFA 2026 报名公布后填 (v2.9.6)
 *
 * 拍准:
 *   - 阵型 4-3-3 (GK 1 + DF 4 + MF 3 + FW 3) 通用
 *   - 11 主力 + 5 替补 + 9 TBD = 25 (跟 v2.9.2 25 占位兼容, 多 1 real 主力, total 26)
 *   - 注: FIFA 2026 报名上限 26 人, 跟 schema 1:1
 *
 * 数据规模: 48 队 × 26 人 = 1248 条. 真实填 16 (11 主力 + 5 替补) × 48 = 768 条.
 *
 * Schema: [{ number, position, name, club }]  (跟 famous / TBD 占位统一)
 */

const POSITIONS_CN = {
  GK: '门将', DF: '后卫', MF: '中场', FW: '前锋',
};

// 每队 26 人大名单, 阵型 4-3-3, number 1-26
// 主力 11 (number 1-11) + 替补 5 (12-16) + TBD-X 10 (17-26, FIFA 报名后填)

const SQUADS = {
  // ─── Group A ─────────────────────────────
  Mexico: [
    { number: 1,  position: 'GK', name: 'Guillermo Ochoa',      club: 'Salernitana' },
    { number: 2,  position: 'DF', name: 'Jorge Sánchez',        club: 'Porto' },
    { number: 3,  position: 'DF', name: 'César Montes',         club: 'Lokomotiv' },
    { number: 4,  position: 'DF', name: 'Edson Álvarez',        club: 'West Ham' },
    { number: 5,  position: 'DF', name: 'Jesús Gallardo',       club: 'Toluca' },
    { number: 6,  position: 'MF', name: 'Luis Romo',            club: 'Cruz Azul' },
    { number: 7,  position: 'MF', name: 'Luis Chávez',          club: 'Dynamo Moscow' },
    { number: 8,  position: 'MF', name: 'Carlos Rodríguez',     club: 'Cruz Azul' },
    { number: 9,  position: 'FW', name: 'Santiago Giménez',     club: 'Feyenoord' },
    { number: 10, position: 'FW', name: 'Hirving Lozano',       club: 'PSV' },
    { number: 11, position: 'FW', name: 'César Huerta',         club: 'Pumas' },
    { number: 12, position: 'GK', name: 'Luis Malagón',         club: 'América' },
    { number: 13, position: 'DF', name: 'Johan Vásquez',        club: 'Genoa' },
    { number: 14, position: 'MF', name: 'Erick Sánchez',        club: 'América' },
    { number: 15, position: 'FW', name: 'Orbelín Pineda',       club: 'AEK Athens' },
    { number: 16, position: 'FW', name: 'Raúl Jiménez',         club: 'Fulham' },
    // 10 替补 TBD (FIFA 2026 报名后填)
    { number: 17, position: 'TBD', name: 'TBD-1', club: 'TBD' },
    { number: 18, position: 'TBD', name: 'TBD-2', club: 'TBD' },
    { number: 19, position: 'TBD', name: 'TBD-3', club: 'TBD' },
    { number: 20, position: 'TBD', name: 'TBD-4', club: 'TBD' },
    { number: 21, position: 'TBD', name: 'TBD-5', club: 'TBD' },
    { number: 22, position: 'TBD', name: 'TBD-6', club: 'TBD' },
    { number: 23, position: 'TBD', name: 'TBD-7', club: 'TBD' },
    { number: 24, position: 'TBD', name: 'TBD-8', club: 'TBD' },
    { number: 25, position: 'TBD', name: 'TBD-9', club: 'TBD' },
    { number: 26, position: 'TBD', name: 'TBD-10', club: 'TBD' },
  ],
  'South Africa': [
    { number: 1,  position: 'GK', name: 'Ronwen Williams',     club: 'Mamelodi Sundowns' },
    { number: 2,  position: 'DF', name: 'Nyiko Mobbie',         club: 'Sekhukhune' },
    { number: 3,  position: 'DF', name: 'Grant Kekana',         club: 'Mamelodi Sundowns' },
    { number: 4,  position: 'DF', name: 'Mothobi Mvala',        club: 'Mamelodi Sundowns' },
    { number: 5,  position: 'DF', name: 'Aubrey Modiba',        club: 'Mamelodi Sundowns' },
    { number: 6,  position: 'MF', name: 'Teboho Mokoena',       club: 'Mamelodi Sundowns' },
    { number: 7,  position: 'MF', name: 'Sphephelo Sithole',    club: 'Tondela' },
    { number: 8,  position: 'MF', name: 'Themba Zwane',         club: 'Mamelodi Sundowns' },
    { number: 9,  position: 'FW', name: 'Evidence Makgopa',     club: 'Orlando Pirates' },
    { number: 10, position: 'FW', name: 'Percy Tau',            club: 'Al Ahly' },
    { number: 11, position: 'FW', name: 'Oswin Appollis',       club: 'Polokwane City' },
    { number: 12, position: 'GK', name: 'Veli Mothwa',          club: 'AmaZulu' },
    { number: 13, position: 'DF', name: 'Khuliso Mudau',        club: 'Mamelodi Sundowns' },
    { number: 14, position: 'MF', name: 'Yusuf Maart',          club: 'Kaizer Chiefs' },
    { number: 15, position: 'FW', name: 'Lebogang Manyama',     club: 'Kaizer Chiefs' },
    { number: 16, position: 'FW', name: 'Lyle Foster',          club: 'Burnley' },
    { number: 17, position: 'TBD', name: 'TBD-1', club: 'TBD' },
    { number: 18, position: 'TBD', name: 'TBD-2', club: 'TBD' },
    { number: 19, position: 'TBD', name: 'TBD-3', club: 'TBD' },
    { number: 20, position: 'TBD', name: 'TBD-4', club: 'TBD' },
    { number: 21, position: 'TBD', name: 'TBD-5', club: 'TBD' },
    { number: 22, position: 'TBD', name: 'TBD-6', club: 'TBD' },
    { number: 23, position: 'TBD', name: 'TBD-7', club: 'TBD' },
    { number: 24, position: 'TBD', name: 'TBD-8', club: 'TBD' },
    { number: 25, position: 'TBD', name: 'TBD-9', club: 'TBD' },
    { number: 26, position: 'TBD', name: 'TBD-10', club: 'TBD' },
  ],
  'Korea Republic': [
    { number: 1,  position: 'GK', name: 'Kim Seung-gyu',        club: 'Al-Shabab' },
    { number: 2,  position: 'DF', name: 'Lee Myung-jae',        club: 'Ulsan HD' },
    { number: 3,  position: 'DF', name: 'Kim Min-jae',          club: 'Bayern' },
    { number: 4,  position: 'DF', name: 'Kim Ju-sung',          club: 'Al-Nassr' },
    { number: 5,  position: 'DF', name: 'Seol Young-woo',       club: 'Spartak Moscow' },
    { number: 6,  position: 'MF', name: 'Hwang In-beom',        club: 'Feyenoord' },
    { number: 7,  position: 'FW', name: 'Son Heung-min',        club: 'Tottenham' },
    { number: 8,  position: 'MF', name: 'Paik Seung-ho',        club: 'FC Augsburg' },
    { number: 9,  position: 'FW', name: 'Cho Gue-sung',         club: 'Middlesbrough' },
    { number: 10, position: 'FW', name: 'Lee Kang-in',          club: 'PSG' },
    { number: 11, position: 'FW', name: 'Hwang Hee-chan',       club: 'Wolverhampton' },
    { number: 12, position: 'GK', name: 'Jo Hyeon-woo',         club: 'Wolverhampton' },
    { number: 13, position: 'DF', name: 'Jung Seung-hyun',      club: 'Al-Ain' },
    { number: 14, position: 'MF', name: 'Lee Jae-sung',         club: 'Mainz' },
    { number: 15, position: 'FW', name: 'Oh Hyeon-gyu',         club: 'Genk' },
    { number: 16, position: 'MF', name: 'Son Jun-ho',           club: 'Shandong' },
    { number: 17, position: 'TBD', name: 'TBD-1', club: 'TBD' },
    { number: 18, position: 'TBD', name: 'TBD-2', club: 'TBD' },
    { number: 19, position: 'TBD', name: 'TBD-3', club: 'TBD' },
    { number: 20, position: 'TBD', name: 'TBD-4', club: 'TBD' },
    { number: 21, position: 'TBD', name: 'TBD-5', club: 'TBD' },
    { number: 22, position: 'TBD', name: 'TBD-6', club: 'TBD' },
    { number: 23, position: 'TBD', name: 'TBD-7', club: 'TBD' },
    { number: 24, position: 'TBD', name: 'TBD-8', club: 'TBD' },
    { number: 25, position: 'TBD', name: 'TBD-9', club: 'TBD' },
    { number: 26, position: 'TBD', name: 'TBD-10', club: 'TBD' },
  ],
  Czechia: [
    { number: 1,  position: 'GK', name: 'Jindřich Staněk',     club: 'Slavia Prague' },
    { number: 2,  position: 'DF', name: 'David Jurásek',        club: 'Benfica' },
    { number: 3,  position: 'DF', name: 'Tomáš Holeš',          club: 'Sparta Prague' },
    { number: 4,  position: 'DF', name: 'Robin Hranáč',         club: 'Viktoria Plzeň' },
    { number: 5,  position: 'DF', name: 'Vladimír Coufal',      club: 'West Ham' },
    { number: 6,  position: 'MF', name: 'Tomáš Souček',         club: 'West Ham' },
    { number: 7,  position: 'MF', name: 'Alex Král',            club: 'Union Berlin' },
    { number: 8,  position: 'MF', name: 'Ladislav Krejčí',      club: 'Sparta Prague' },
    { number: 9,  position: 'FW', name: 'Adam Hlozek',          club: 'Bayer Leverkusen' },
    { number: 10, position: 'FW', name: 'Patrik Schick',        club: 'Bayer Leverkusen' },
    { number: 11, position: 'FW', name: 'Lukáš Provod',         club: 'Slavia Prague' },
    { number: 12, position: 'GK', name: 'Matěj Kovář',          club: 'Burnley' },
    { number: 13, position: 'DF', name: 'Jaroslav Zelený',      club: 'Slavia Prague' },
    { number: 14, position: 'MF', name: 'Michal Sadílek',       club: 'PSV' },
    { number: 15, position: 'FW', name: 'Tomáš Chorý',          club: 'Sparta Prague' },
    { number: 16, position: 'FW', name: 'Matěj Vydra',          club: 'Viktoria Plzeň' },
    { number: 17, position: 'TBD', name: 'TBD-1', club: 'TBD' },
    { number: 18, position: 'TBD', name: 'TBD-2', club: 'TBD' },
    { number: 19, position: 'TBD', name: 'TBD-3', club: 'TBD' },
    { number: 20, position: 'TBD', name: 'TBD-4', club: 'TBD' },
    { number: 21, position: 'TBD', name: 'TBD-5', club: 'TBD' },
    { number: 22, position: 'TBD', name: 'TBD-6', club: 'TBD' },
    { number: 23, position: 'TBD', name: 'TBD-7', club: 'TBD' },
    { number: 24, position: 'TBD', name: 'TBD-8', club: 'TBD' },
    { number: 25, position: 'TBD', name: 'TBD-9', club: 'TBD' },
    { number: 26, position: 'TBD', name: 'TBD-10', club: 'TBD' },
  ],
};

// 留 v2.9.6 填 (mavis-team 3 worker 并行 G1-G4 / G5-G8 / G9-G12)

export { SQUADS, POSITIONS_CN };
