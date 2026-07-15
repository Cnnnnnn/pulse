/* =====================================================================
   Mock data layer — 基金管理系统
   确定性（seeded）生成，保证刷新前后结构稳定；实时刷新时由 app.js 做抖动。
   ===================================================================== */
(function (global) {
  "use strict";

  // --- seeded PRNG (mulberry32) ---
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const round = (n, d = 2) => { const p = 10 ** d; return Math.round(n * p) / p; };

  // --- fund metadata ---
  const META = [
    ["110011", "易方达优质精选混合", "混合型", "R4", "陈皓", "2018-09-05"],
    ["161725", "招商中证白酒指数", "指数型", "R4", "侯昊", "2017-03-12"],
    ["005827", "易方达蓝筹精选混合", "混合型", "R4", "张坤", "2018-09-05"],
    ["001714", "工银瑞信文体产业股票", "股票型", "R4", "袁芳", "2015-12-25"],
    ["003096", "中欧医疗健康混合", "混合型", "R5", "葛兰", "2016-09-29"],
    ["260108", "景顺长城新兴成长混合", "混合型", "R4", "刘彦春", "2016-03-18"],
    ["519674", "银河创新成长混合", "混合型", "R5", "郑巍山", "2010-12-29"],
    ["001632", "天弘中证食品饮料指数", "指数型", "R4", "沙川", "2015-07-28"],
    ["000961", "天弘沪深300指数", "指数型", "R3", "杨超", "2015-01-20"],
    ["100038", "富国低碳环保混合", "混合型", "R4", "李元博", "2011-08-10"],
    ["519005", "海富通股票混合", "股票型", "R4", "周雪军", "2005-07-29"],
    ["202003", "南方稳健成长混合", "混合型", "R3", "应帅", "2003-12-18"],
    ["100018", "富国天利增长债券", "债券型", "R2", "黄纪亮", "2005-04-06"],
    ["050027", "博时信用债纯债", "债券型", "R2", "过钧", "2012-09-07"],
    ["003376", "广发中债7-10年指数", "债券型", "R2", "王予柯", "2016-11-16"],
    ["000509", "广发钱袋子货币", "货币型", "R1", "任爽", "2013-06-18"],
    ["000198", "天弘余额宝货币", "货币型", "R1", "王登峰", "2013-05-29"],
    ["003871", "华泰柏瑞货币", "货币型", "R1", "郑青", "2015-09-21"],
    ["000934", "国富大中华精选混合", "QDII", "R4", "徐成", "2015-12-21"],
    ["161226", "国投瑞银白银期货", "QDII", "R5", "赵建", "2015-08-06"],
    ["012348", "华夏纳斯达克100指数", "QDII", "R4", "赵宗庭", "2021-04-12"],
    ["004997", "广发高端制造股票", "股票型", "R5", "郑澄然", "2017-09-01"],
    ["001856", "前海开源国家比较优势", "混合型", "R4", "曲扬", "2015-05-08"],
    ["004432", "鹏华股息精选混合", "混合型", "R3", "袁航", "2017-05-23"],
  ];

  const EMBLEM_COLORS = [
    ["#0ea5a4", "#0ea5e9"], ["#0d9488", "#14b8a6"], ["#0891b2", "#22d3ee"],
    ["#0284c7", "#38bdf8"], ["#0f766e", "#10b981"], ["#0369a1", "#0ea5e9"],
  ];

  const TYPE_RISK_DEFAULT = { "货币型": "R1", "债券型": "R2", "指数型": "R3", "股票型": "R4", "混合型": "R4", "QDII": "R4" };

  const FUNDS = META.map((m, i) => {
    const seed = 1000 + i * 37;
    const r = rng(seed);
    const emb = EMBLEM_COLORS[i % EMBLEM_COLORS.length];
    const isMoney = m[2] === "货币型";
    const nav = isMoney ? round(1 + r() * 0.3, 4) : round(0.8 + r() * 5.6, 4);
    const daily = round((r() - 0.46) * (isMoney ? 0.08 : 6.8), 2);
    const m1 = round((r() - 0.42) * (isMoney ? 0.6 : 22), 2);
    const y1 = round((r() - 0.38) * (isMoney ? 2.2 : 78), 2);
    const cum = round((r() - 0.25) * (isMoney ? 30 : 230), 2);
    const scale = round(8 + r() * 560, 1);
    return {
      code: m[0], name: m[1], type: m[2], risk: m[3] || TYPE_RISK_DEFAULT[m[2]],
      manager: m[4], inception: m[5],
      nav, daily, m1, y1, cum, scale,
      color: emb[0], color2: emb[1],
    };
  });

  // --- net value history per fund ---
  function genHistory(fund, days) {
    const seed = parseInt(fund.code, 10) + days;
    const r = rng(seed);
    const vol = fund.type === "货币型" ? 0.0006 : fund.type === "债券型" ? 0.004 : 0.013;
    const drift = fund.y1 / 100 / 240;
    let v = fund.nav * (1 - drift * days * 0.6);
    const out = [];
    const today = new Date("2026-07-14");
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const shock = (r() - 0.5) * 2 * vol;
      v = Math.max(0.2, v * (1 + drift + shock));
      out.push({
        date: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        nav: round(v, 4),
      });
    }
    out[out.length - 1].nav = fund.nav; // anchor last point to current NAV
    return out;
  }

  // --- holdings (top positions) ---
  const HOLDING_POOL = ["贵州茅台", "宁德时代", "招商银行", "美的集团", "隆基绿能", "比亚迪", "五粮液", "中国平安", "伊利股份", "中信证券", "恒瑞医药", "立讯精密", "泸州老窖", "兴业银行", "海康威视", "东方财富"];
  function genHoldings(fund) {
    const seed = parseInt(fund.code, 10) + 7;
    const r = rng(seed);
    const n = fund.type === "货币型" ? 5 : 8;
    const picks = [...HOLDING_POOL].sort(() => r() - 0.5).slice(0, n);
    let rem = 100; const rows = [];
    picks.forEach((name, i) => {
      const w = i === n - 1 ? round(rem, 1) : round(r() * (rem / (n - i)) * 1.5 + 2, 1);
      rem = Math.max(0, rem - w);
      rows.push({ name, weight: Math.min(99, w), change: round((r() - 0.45) * 9, 2) });
    });
    return rows.sort((a, b) => b.weight - a.weight);
  }

  // --- trade records for a fund ---
  function genTrades(fund, n) {
    const seed = parseInt(fund.code, 10) + 21;
    const r = rng(seed);
    const out = [];
    const today = new Date("2026-07-14");
    const statuses = ["成功", "成功", "成功", "处理中", "失败"];
    for (let i = 0; i < n; i++) {
      const d = new Date(today); d.setDate(d.getDate() - Math.floor(r() * 180) - i * 3);
      const type = r() > 0.5 ? "申购" : "赎回";
      const amount = round(1000 + r() * 99000, 0);
      const shares = round(amount / fund.nav, 2);
      const status = statuses[Math.floor(r() * statuses.length)];
      out.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        type, amount, shares, status,
      });
    }
    return out;
  }

  // --- risk metrics ---
  function genRisk(fund) {
    const seed = parseInt(fund.code, 10) + 3;
    const r = rng(seed);
    const base = { "R1": 1, "R2": 2.4, "R3": 4, "R4": 6, "R5": 9 }[fund.risk] || 5;
    return {
      volatility: round(base + r() * 4, 1),       // 波动率 %
      maxDrawdown: round(-(base * 1.6 + r() * 8), 1), // 最大回撤 %
      sharpe: round(0.6 + r() * 1.8, 2),          // 夏普比率
      stddev: round(base * 0.9 + r() * 3, 1),     // 标准差 %
      beta: round(0.4 + r() * 1.1, 2),            // 贝塔
    };
  }

  // --- dashboard aggregates ---
  function buildDashboard() {
    const totalAssets = 2847693.52;
    const dailyPnl = 18432.18;
    const totalReturn = 23.74;
    const fundCount = FUNDS.length;

    // asset trend (90d) — portfolio value
    const r = rng(99);
    let v = totalAssets * 0.82;
    const trend = [];
    const today = new Date("2026-07-14");
    for (let i = 179; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      v = v * (1 + (r() - 0.46) * 0.012 + 0.0011);
      trend.push({ date: `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, value: Math.round(v) });
    }
    trend[trend.length - 1].value = totalAssets;

    // allocation by type
    const byType = {};
    FUNDS.forEach(f => { byType[f.type] = (byType[f.type] || 0) + f.scale; });
    const allocation = Object.entries(byType).map(([type, val]) => ({ label: type, value: round(val, 0) }))
      .sort((a, b) => b.value - a.value);

    // benchmark comparison (last 6 months return %)
    const benchmark = [
      { label: "本月", fund: 3.2, bench: 1.8 },
      { label: "3月", fund: 8.6, bench: 5.1 },
      { label: "6月", fund: 14.2, bench: 9.7 },
      { label: "本年", fund: 23.7, bench: 15.4 },
    ];

    // recent trades
    const recent = [
      { time: "09:32", name: "易方达蓝筹精选混合", code: "005827", type: "申购", amount: 50000, status: "成功" },
      { time: "昨天 14:08", name: "招商中证白酒指数", code: "161725", type: "赎回", amount: 22000, status: "成功" },
      { time: "昨天 10:51", name: "中欧医疗健康混合", code: "003096", type: "申购", amount: 30000, status: "处理中" },
      { time: "07-12", name: "广发钱袋子货币", code: "000509", type: "申购", amount: 80000, status: "成功" },
    ];

    // kpi sparklines
    const spark = (seed, n) => { const rr = rng(seed); let x = 50; const a = []; for (let i = 0; i < n; i++) { x = Math.max(5, x + (rr() - 0.45) * 14); a.push(round(x, 1)); } return a; };

    return {
      totalAssets, dailyPnl, totalReturn, fundCount,
      trend, allocation, benchmark, recent,
      sparkTotal: spark(11, 24), sparkRet: spark(22, 24), sparkDaily: spark(33, 24), sparkCount: spark(44, 24),
    };
  }

  // --- global trade history (for 交易管理) ---
  function buildTradeHistory() {
    const r = rng(2024);
    const today = new Date("2026-07-14");
    const statuses = ["成功", "成功", "成功", "成功", "处理中", "失败"];
    const out = [];
    for (let i = 0; i < 46; i++) {
      const d = new Date(today); d.setDate(d.getDate() - Math.floor(r() * 240) - i);
      const f = FUNDS[Math.floor(r() * FUNDS.length)];
      const type = r() > 0.5 ? "申购" : "赎回";
      const amount = round(1000 + r() * 99000, 0);
      const shares = round(amount / f.nav, 2);
      const status = statuses[Math.floor(r() * statuses.length)];
      out.push({
        id: "T" + (26071400 - i),
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        name: f.name, code: f.code, type, amount, shares, status,
      });
    }
    return out;
  }

  global.FundData = {
    FUNDS, TYPES: ["股票型", "混合型", "指数型", "债券型", "货币型", "QDII"],
    genHistory, genHoldings, genTrades, genRisk,
    buildDashboard, buildTradeHistory, round,
  };
})(window);
