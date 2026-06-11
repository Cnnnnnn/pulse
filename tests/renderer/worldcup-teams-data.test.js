/**
 * tests/renderer/worldcup-teams-data.test.js
 *
 * v2.9.5 teams-data 单测 — 适配 26 人 squad (16 真实 + 10 TBD)
 *
 * 数据 integrity:
 *   - 48 队 (12 group × 4)
 *   - 字段完整 (name / cn / code / group / flag / famous / squad 26)
 *   - G1 (4 队) 有 16 真实人, 10 TBD 占位
 *   - flagFromCode 拼 regional indicator 正确
 */

import { describe, it, expect } from 'vitest';
import { TEAMS, listTeams, lookupTeam, flagFromCode } from '../../src/renderer/worldcup/teams-data.js';

describe('teams-data 静态数据 integrity', () => {
  it('48 队 (12 group × 4)', () => {
    expect(Object.keys(TEAMS)).toHaveLength(48);
    const groups = Object.values(TEAMS).map((t) => t.group);
    const uniqueGroups = Array.from(new Set(groups));
    expect(uniqueGroups).toHaveLength(12);
    for (const g of uniqueGroups) {
      const teamsInGroup = groups.filter((x) => x === g);
      expect(teamsInGroup).toHaveLength(4);
    }
  });

  it('每队字段完整 (name / cn / code / group / flag / famous / squad 26)', () => {
    for (const t of Object.values(TEAMS)) {
      expect(t.name).toBeTruthy();
      expect(t.cn).toBeTruthy();
      expect(t.code).toHaveLength(2);
      expect(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']).toContain(t.group);
      expect(t.flag.length).toBeGreaterThan(0);
      expect(t.famous).toHaveLength(1);
      expect(t.famous[0].name).toBeTruthy();
      expect(t.famous[0].position).toBeTruthy();
      expect(t.famous[0].club).toBeTruthy();
      // v2.9.5: squad 26 人 (11 主力 + 5 替补 + 10 TBD)
      expect(t.squad).toHaveLength(26);
      // number 1-26 连续
      for (let i = 0; i < 26; i += 1) {
        expect(t.squad[i].number).toBe(i + 1);
        expect(t.squad[i].name).toBeTruthy();
        expect(t.squad[i].position).toBeTruthy();
        expect(t.squad[i].club).toBeTruthy();
      }
    }
  });

  it('G1 4 队 (Mexico/South Africa/Korea/Czechia) 有 真实 squad 数据', () => {
    const g1Teams = ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'];
    for (const name of g1Teams) {
      const t = TEAMS[name];
      expect(t, `${name} 应该在 TEAMS`).toBeDefined();
      const realCount = t.squad.filter((p) => !p.name.startsWith('TBD-')).length;
      const tbdCount = t.squad.filter((p) => p.name.startsWith('TBD-')).length;
      // 16 真实 (11 主力 + 5 替补) + 10 TBD
      expect(realCount, `${name} 应有 16 真实`).toBe(16);
      expect(tbdCount, `${name} 应有 10 TBD`).toBe(10);
    }
  });

  it('G2-G12 降级到 TBD 占位 (待 v2.9.6 填)', () => {
    const g1Teams = new Set(['Mexico', 'South Africa', 'Korea Republic', 'Czechia']);
    for (const t of Object.values(TEAMS)) {
      if (g1Teams.has(t.name)) continue;
      const realCount = t.squad.filter((p) => !p.name.startsWith('TBD-')).length;
      expect(realCount, `${t.name} (G${t.group}) 暂无真实数据, 应 0`).toBe(0);
      // 26 TBD 占位
      for (let i = 0; i < 26; i += 1) {
        expect(t.squad[i].name).toBe(`TBD-${i + 1}`);
        expect(t.squad[i].position).toBe('TBD');
        expect(t.squad[i].club).toBe('TBD');
      }
    }
  });

  it('国名 跟 openfootball TXT group 行 1:1 (FIFA 官方名)', () => {
    // 关键 7 个改名 (TXT trivia 注释确认)
    const renames = {
      'Korea Republic': 'South Korea',  // TXT trivia: => Korea Republic
      'IR Iran': 'Iran',
      'Cabo Verde': 'Cape Verde',
      'Congo DR': 'DR Congo',
      "Côte d'Ivoire": 'Ivory Coast',
      'Czechia': 'Czech Republic',
      'Türkiye': 'Turkey',
    };
    for (const [official, txtName] of Object.entries(renames)) {
      expect(TEAMS[official], `TXT group 行 "${txtName}" 应映射到 key "${official}"`).toBeDefined();
    }
  });
});

describe('listTeams', () => {
  it('返 48 队数组', () => {
    expect(listTeams()).toHaveLength(48);
  });

  it('按 group 升序 + 名字', () => {
    const t = listTeams();
    for (let i = 1; i < t.length; i += 1) {
      const prev = t[i - 1];
      const cur = t[i];
      if (prev.group === cur.group) {
        expect(prev.name < cur.name).toBe(true);
      } else {
        expect(prev.group < cur.group).toBe(true);
      }
    }
  });
});

describe('lookupTeam', () => {
  it('已知队 (FIFA 官方名) → 返 flag / cn / group', () => {
    const t = lookupTeam('Mexico');
    expect(t.name).toBe('Mexico');
    expect(t.cn).toBe('墨西哥');
    expect(t.flag).toBeTruthy();
    expect(t.group).toBe('A');
  });

  it('未知队 (e.g. "W101" Final 占位) → 返 null', () => {
    expect(lookupTeam('W101')).toBeNull();
    expect(lookupTeam('L102')).toBeNull();
    expect(lookupTeam(null)).toBeNull();
  });
});

describe('flagFromCode', () => {
  it('MX → 🇲🇽', () => {
    expect(flagFromCode('MX')).toBe('🇲🇽');
  });

  it('US → 🇺🇸', () => {
    expect(flagFromCode('US')).toBe('🇺🇸');
  });

  it('空 / 非法 → 🏳️', () => {
    expect(flagFromCode('')).toBe('🏳️');
    expect(flagFromCode(null)).toBe('🏳️');
    expect(flagFromCode('USA')).toBe('🏳️');  // 3 字符不合法
  });
});
