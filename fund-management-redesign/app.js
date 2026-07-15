/* =====================================================================
   盈策基金 · 基金管理系统 — 应用逻辑
   路由 / 四视图渲染 / 主题 / Toast / 筛选排序分页 / 交易表单 / 实时刷新
   ===================================================================== */
(function () {
  "use strict";

  const D = window.FundData, C = window.Charts;
  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view");
  const app = $("#app");

  /* ---------------- helpers ---------------- */
  const fmtMoney = (v, dp = 2) => "¥" + Number(v).toLocaleString("zh-CN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtNum = (v, dp = 2) => Number(v).toLocaleString("zh-CN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtPct = (v) => (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  const sign = (v) => (v >= 0 ? "pos" : "neg");
  const riskNum = (r) => parseInt(String(r).replace("R", ""), 10) || 1;
  const fmtTime = (d) => d.toLocaleTimeString("zh-CN", { hour12: false });
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const ICON = {
    eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  /* ---------------- state ---------------- */
  const state = {
    route: "dashboard",
    dash: { range: "3M", updated: new Date() },
    funds: { search: "", type: "全部", risk: "全部", sortKey: "cum", sortDir: "desc", page: 1, perPage: 8, loading: false },
    detail: { code: null, range: "6M" },
    trade: { tab: "申购", fund: "", page: 1, perPage: 8, list: D.buildTradeHistory() },
  };

  const RANGE_DAYS = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };

  /* ---------------- toast ---------------- */
  function toast(type, title, msg) {
    const stack = $("#toastStack");
    const el = document.createElement("div");
    el.className = "toast " + type;
    const ico = type === "success" ? ICON.check : type === "error"
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>';
    el.innerHTML = `<span class="t-ico">${ico}</span><div><div class="t-title">${esc(title)}</div>${msg ? `<div class="t-msg">${esc(msg)}</div>` : ""}</div>`;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 3200);
  }

  /* ---------------- theme ---------------- */
  function applyThemeIcons() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const sun = $(".ico-sun"), moon = $(".ico-moon");
    if (sun) sun.style.display = dark ? "none" : "block";
    if (moon) moon.style.display = dark ? "block" : "none";
  }
  $("#themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fm-theme", next); } catch (e) {}
    applyThemeIcons();
    // 重新渲染当前视图以让图表（CSS 变量驱动）即时换肤
    renderView();
  });

  /* ---------------- mobile nav ---------------- */
  $("#menuToggle").addEventListener("click", () => app.classList.toggle("nav-open"));
  $("#scrim").addEventListener("click", () => app.classList.remove("nav-open"));

  /* ---------------- clock ---------------- */
  function tickClock() {
    const c = $("#clock"); if (c) c.textContent = fmtTime(new Date());
  }
  setInterval(tickClock, 1000); tickClock();

  /* ---------------- chart hover ---------------- */
  function bindHover(box) {
    const svg = box.querySelector("svg");
    if (!svg || !svg.dataset.points) return;
    const pts = JSON.parse(svg.dataset.points);
    const vb = (svg.getAttribute("viewBox") || "0 0 720 280").split(" ").map(Number);
    const W = vb[2], H = vb[3];
    const line = svg.querySelector(".hover-line");
    const dot = svg.querySelector(".hover-dot");
    const tip = $("#chartTip");
    const mode = box.dataset.tip || "num";
    box.addEventListener("mousemove", (e) => {
      const rect = box.getBoundingClientRect();
      const vx = ((e.clientX - rect.left) / rect.width) * W;
      let best = pts[0], bd = Infinity;
      for (const p of pts) { const d = Math.abs(p.vx - vx); if (d < bd) { bd = d; best = p; } }
      if (line) { line.setAttribute("x1", best.vx); line.setAttribute("x2", best.vx); line.setAttribute("opacity", "1"); }
      if (dot) { dot.setAttribute("cx", best.vx); dot.setAttribute("cy", best.vy); dot.setAttribute("opacity", "1"); }
      const valStr = mode === "money" ? fmtMoney(best.value, 0) : mode === "nav" ? best.value.toFixed(4) : fmtNum(best.value, 2);
      tip.innerHTML = `<span>${esc(best.label)}</span> · <span class="tip-val">${valStr}</span>`;
      tip.classList.add("show");
      tip.style.left = (rect.left + (best.vx / W) * rect.width) + "px";
      tip.style.top = (rect.top + (best.vy / H) * rect.height) + "px";
    });
    box.addEventListener("mouseleave", () => {
      if (line) line.setAttribute("opacity", "0");
      if (dot) dot.setAttribute("opacity", "0");
      tip.classList.remove("show");
    });
  }

  function applyCardMode() {
    const small = window.matchMedia("(max-width: 560px)").matches;
    document.querySelectorAll("table.data").forEach(t => t.classList.toggle("card-mode", small));
  }

  /* =====================================================================
     VIEW: Dashboard
     ===================================================================== */
  function renderDashboard() {
    const db = D.buildDashboard();
    const rng = state.dash.range;
    const days = RANGE_DAYS[rng] || 90;
    const trend = db.trend.slice(-days);
    const chart = C.area(trend, { w: 720, h: 280 });

    const kpi = (label, ico, val, delta, spark, dcls) => `
      <div class="card card-pad kpi">
        <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-ico">${ico}</span></div>
        <div class="kpi-val num">${val}</div>
        <div class="chart-box kpi-spark">${C.sparkline(spark, { w: 280, h: 36 })}</div>
        <div class="kpi-foot"><span class="num ${dcls}">${delta}</span><span class="faint">较昨日</span></div>
      </div>`;

    const allocation = C.donut(db.allocation, { size: 220, centerTop: D.FUNDS.length + "", centerSub: "只基金" });
    const legend = db.allocation.map((a, i) => {
      const palette = ["var(--brand)", "var(--accent)", "var(--brand-2)", "var(--warn)", "var(--pos)", "var(--neg)"];
      const pct = ((a.value / db.allocation.reduce((s, x) => s + x.value, 0)) * 100).toFixed(1);
      return `<li><span class="sw" style="background:${palette[i % palette.length]}"></span>${esc(a.label)} <span class="num faint">${pct}%</span></li>`;
    }).join("");

    const bench = C.bars(db.benchmark, { w: 520, h: 240 });

    const recentRows = db.recent.map(r => `
      <tr>
        <td data-label="时间">${r.time}</td>
        <td data-label="基金"><span class="fund-name">${esc(r.name)}</span><div class="fund-code">${r.code}</div></td>
        <td data-label="类型"><span class="badge ${r.type === "申购" ? "badge-pos" : "badge-info"}">${r.type}</span></td>
        <td data-label="金额" class="num">${fmtMoney(r.amount, 0)}</td>
        <td data-label="状态"><span class="badge ${r.status === "成功" ? "badge-pos" : "badge-warn"}">${r.status}</span></td>
      </tr>`).join("");

    const riskMeters = [
      ["组合波动率", 12.4, "var(--brand)"], ["最大回撤", -18.6, "var(--neg)"],
      ["夏普比率", 1.82, "var(--pos)"], ["组合贝塔", 0.94, "var(--accent)"],
    ].map(([l, v, col]) => `
      <div class="meter-row"><div class="m-label">${l}</div><div class="m-val num">${v}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.abs(v) / 22 * 100)}%;background:${col}"></div></div></div>`).join("");

    const ranges = ["1M", "3M", "6M", "1Y"].map(r =>
      `<button data-range="dash:${r}" class="${state.dash.range === r ? "active" : ""}">${r}</button>`).join("");

    view.innerHTML = `
      <div class="view-head">
        <div><h1>概览仪表盘</h1><p>数据更新于 ${fmtTime(state.dash.updated)} · 实时行情已连接</p></div>
        <div class="head-tools">
          <button class="btn btn-ghost btn-sm" id="dashRefresh"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg> 同步数据</button>
        </div>
      </div>

      <div class="grid cols-4">
        ${kpi("总资产 (元)", walletIco(), fmtMoney(db.totalAssets, 2), "+0.65%", db.sparkTotal, "pos")}
        ${kpi("当日收益 (元)", trendIco(), fmtMoney(db.dailyPnl, 2), "+0.92%", db.sparkDaily, "pos")}
        ${kpi("累计收益率", starIco(), fmtPct(db.totalReturn), "+1.34%", db.sparkRet, "pos")}
        ${kpi("持仓基金数", layerIco(), db.fundCount + " <span style='font-size:14px;color:var(--text-3)'>只</span>", "本月 +2", db.sparkCount, "muted")}
      </div>

      <div class="grid dash-main mt-5">
        <div class="card">
          <div class="card-head"><div><h3>资产走势</h3><div class="sub">组合总市值</div></div>
            <div class="segmented">${ranges}</div></div>
          <div class="card-pad"><div class="chart-box chart-hover-allow" data-tip="money">${chart.svg}</div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>持仓分布</h3><div class="sub">按类型</div></div>
          <div class="card-pad">
            <div class="chart-box" style="max-width:240px;margin:0 auto">${allocation}</div>
            <ul class="legend">${legend}</ul>
          </div>
        </div>
      </div>

      <div class="grid cols-3 mt-5">
        <div class="card">
          <div class="card-head"><h3>收益对比</h3><div class="sub">本基金 vs 业绩基准 (%)</div></div>
          <div class="card-pad"><div class="chart-box" data-tip="num">${bench}</div>
            <div class="row gap-4 mt-3" style="font-size:12.5px">
              <span class="row gap-2"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:var(--brand)"></span>本基金</span>
              <span class="row gap-2"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:var(--accent)"></span>业绩基准</span>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>最近交易</h3><a class="sub" href="#/trade" style="color:var(--brand)">查看全部 ${ICON.arrow}</a></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>时间</th><th>基金</th><th>类型</th><th>金额</th><th>状态</th></tr></thead>
            <tbody>${recentRows}</tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>风险概览</h3><div class="sub">组合层面</div></div>
          <div class="card-pad">${riskMeters}</div>
        </div>
      </div>`;

    bindHover(view.querySelector('[data-tip="money"]'));
    const rf = $("#dashRefresh");
    if (rf) rf.addEventListener("click", () => doRefresh());
  }

  // inline icons for KPI
  function walletIco() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v0H5a2 2 0 0 0-2 2z"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor"/></svg>'; }
  function trendIco() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 7-8"/><path d="M16 7h4v4"/></svg>'; }
  function starIco() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.1 1-5.8L3.5 9.2l5.9-.9z"/></svg>'; }
  function layerIco() { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>'; }

  /* =====================================================================
     VIEW: Funds list
     ===================================================================== */
  function fundRows() {
    const f = state.funds;
    let list = D.FUNDS.filter(x => {
      if (f.type !== "全部" && x.type !== f.type) return false;
      if (f.risk !== "全部" && x.risk !== f.risk) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        if (!(x.name.toLowerCase().includes(q) || x.code.includes(q) || x.manager.toLowerCase().includes(q))) return false;
      }
      return true;
    });
    const key = f.sortKey, dir = f.sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let av = key === "risk" ? riskNum(a.risk) : a[key];
      let bv = key === "risk" ? riskNum(b.risk) : b[key];
      return (av - bv) * dir;
    });
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / f.perPage));
    f.page = Math.min(f.page, pages);
    const start = (f.page - 1) * f.perPage;
    const pageItems = list.slice(start, start + f.perPage);

    if (!pageItems.length) {
      return `<tr><td colspan="8"><div class="empty">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <p>没有符合条件的基金，试试调整筛选条件。</p></div></td></tr>`;
    }
    return pageItems.map(x => `
      <tr class="clickable" data-fund="${x.code}">
        <td data-label="基金"><span class="fund-name">${esc(x.name)}</span><div class="fund-code">${x.code} · ${esc(x.manager)}</div></td>
        <td data-label="类型"><span class="badge badge-neutral">${x.type}</span></td>
        <td data-label="单位净值" class="num">${x.nav.toFixed(4)}</td>
        <td data-label="日涨跌" class="num ${sign(x.daily)}">${fmtPct(x.daily)}</td>
        <td data-label="近1月" class="num ${sign(x.m1)}">${fmtPct(x.m1)}</td>
        <td data-label="近1年" class="num ${sign(x.y1)}">${fmtPct(x.y1)}</td>
        <td data-label="累计收益" class="num ${sign(x.cum)}">${fmtPct(x.cum)}</td>
        <td data-label="风险"><span class="badge risk-${x.risk}">${x.risk}</span></td>
        <td data-label="操作"><div class="row gap-2">
          <button class="btn btn-soft btn-sm" data-trade="${x.code}">${ICON.plus}申购</button>
          <button class="btn btn-ghost btn-sm" data-fund="${x.code}">${ICON.eye}</button>
        </div></td>
      </tr>`).join("");
  }

  function pagerHtml(total) {
    const f = state.funds;
    const pages = Math.max(1, Math.ceil(total / f.perPage));
    let btns = "";
    for (let i = 1; i <= pages; i++) btns += `<button data-page="${i}" class="${i === f.page ? "active" : ""}">${i}</button>`;
    const from = total === 0 ? 0 : (f.page - 1) * f.perPage + 1;
    const to = Math.min(total, f.page * f.perPage);
    return `<div class="pager-info">显示 ${from}–${to} / 共 ${total} 只基金</div>
      <div class="pager-btns">
        <button data-page="prev" ${f.page === 1 ? "disabled" : ""}>上一页</button>
        ${btns}
        <button data-page="next" ${f.page === pages ? "disabled" : ""}>下一页</button>
      </div>`;
  }

  function totalFiltered() {
    const f = state.funds;
    return D.FUNDS.filter(x => {
      if (f.type !== "全部" && x.type !== f.type) return false;
      if (f.risk !== "全部" && x.risk !== f.risk) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        if (!(x.name.toLowerCase().includes(q) || x.code.includes(q) || x.manager.toLowerCase().includes(q))) return false;
      }
      return true;
    }).length;
  }

  const COLS = [
    ["fund", "基金"], ["type", "类型"], ["nav", "单位净值"], ["daily", "日涨跌"],
    ["m1", "近1月"], ["y1", "近1年"], ["cum", "累计收益"], ["risk", "风险"],
  ];
  function headHtml() {
    const f = state.funds;
    return COLS.map(([k, label]) => {
      const sortable = k !== "type";
      const active = f.sortKey === k;
      const caret = active ? (f.sortDir === "asc" ? "▲" : "▼") : "▾";
      return `<th class="${active ? "sorted" : ""}" ${sortable ? `data-sort="${k}"` : ""}>${label}<span class="sort-caret">${caret}</span></th>`;
    }).join("") + `<th>操作</th>`;
  }

  function renderFunds() {
    const typeOpts = ["全部", ...D.TYPES].map(t => `<option ${state.funds.type === t ? "selected" : ""}>${t}</option>`).join("");
    const riskOpts = ["全部", "R1", "R2", "R3", "R4", "R5"].map(r => `<option ${state.funds.risk === r ? "selected" : ""}>${r}</option>`).join("");

    view.innerHTML = `
      <div class="view-head">
        <div><h1>基金列表</h1><p>共 ${D.FUNDS.length} 只基金 · 按名称、类型、风险多维筛选与排序</p></div>
        <div class="head-tools">
          <button class="btn btn-primary btn-sm" data-trade="">${ICON.plus} 新建交易</button>
        </div>
      </div>

      <div class="filter-bar">
        <input class="input grow" id="fundSearch" placeholder="搜索基金名称 / 代码 / 经理" value="${esc(state.funds.search)}" />
        <select class="select" id="fundType">${typeOpts}</select>
        <select class="select" id="fundRisk">${riskOpts}</select>
        <button class="btn btn-ghost btn-sm" id="fundReset">重置</button>
      </div>

      <div class="card">
        <div class="table-wrap"><table class="data">
          <thead><tr>${headHtml()}</tr></thead>
          <tbody id="fundBody">${state.funds.loading ? skeletonRows(8, 9) : fundRows()}</tbody>
        </table></div>
        <div class="pager" id="fundPager">${pagerHtml(totalFiltered())}</div>
      </div>`;

    // listeners
    const search = $("#fundSearch");
    search.addEventListener("input", debounce(() => { state.funds.search = search.value; state.funds.page = 1; refreshFundsTable(); }, 220));
    $("#fundType").addEventListener("change", e => { state.funds.type = e.target.value; state.funds.page = 1; refreshFundsTable(); });
    $("#fundRisk").addEventListener("change", e => { state.funds.risk = e.target.value; state.funds.page = 1; refreshFundsTable(); });
    $("#fundReset").addEventListener("click", () => {
      state.funds = { search: "", type: "全部", risk: "全部", sortKey: "cum", sortDir: "desc", page: 1, perPage: 8, loading: false };
      renderFunds();
    });
    applyCardMode();
  }

  function refreshFundsTable() {
    // 加载态提示
    const body = $("#fundBody"), pager = $("#fundPager");
    if (body) body.innerHTML = skeletonRows(8, 9);
    if (pager) pager.innerHTML = `<div class="pager-info">加载中…</div>`;
    setTimeout(() => {
      if (body) body.innerHTML = fundRows();
      if (pager) pager.innerHTML = pagerHtml(totalFiltered());
      applyCardMode();
    }, 320);
  }

  function skeletonRows(n, cols) {
    let out = "";
    for (let i = 0; i < n; i++) {
      out += "<tr>" + Array(cols).fill(0).map(() => `<td><div class="skeleton sk-line" style="width:${40 + Math.random() * 60}%"></div></td>`).join("") + "</tr>";
    }
    return out;
  }

  /* =====================================================================
     VIEW: Fund detail
     ===================================================================== */
  function renderDetail(code, range) {
    const fund = D.FUNDS.find(x => x.code === code);
    if (!fund) { view.innerHTML = `<div class="empty"><p>未找到该基金。</p></div>`; return; }
    const days = RANGE_DAYS[range] || 180;
    const full = D.genHistory(fund, 365);
    const hist = full.slice(-days);
    const chart = C.area(hist, { w: 720, h: 280 });
    const holdings = D.genHoldings(fund);
    const trades = D.genTrades(fund, 8);
    const risk = D.genRisk(fund);

    const radar = C.radar([
      { label: "波动率", norm: risk.volatility / 20 },
      { label: "回撤", norm: Math.abs(risk.maxDrawdown) / 30 },
      { label: "夏普", norm: risk.sharpe / 3 },
      { label: "标准差", norm: risk.stddev / 15 },
      { label: "贝塔", norm: risk.beta / 2 },
    ], { size: 240 });

    const meters = [
      ["波动率", risk.volatility + "%", "var(--brand)"],
      ["最大回撤", risk.maxDrawdown + "%", "var(--neg)"],
      ["夏普比率", risk.sharpe, "var(--pos)"],
      ["标准差", risk.stddev + "%", "var(--accent)"],
      ["贝塔系数", risk.beta, "var(--warn)"],
    ].map(([l, v, c]) => `<div class="meter-row"><div class="m-label">${l}</div><div class="m-val num">${v}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.abs(parseFloat(v)) / 22 * 100)}%;background:${c}"></div></div></div>`).join("");

    const holdRows = holdings.map(h => `
      <tr><td data-label="持仓"><span class="fund-name">${esc(h.name)}</span></td>
      <td data-label="占比" class="num">${h.weight}%</td>
      <td data-label="日涨跌" class="num ${sign(h.change)}">${fmtPct(h.change)}</td></tr>`).join("");

    const tradeRows = trades.map(t => `
      <tr><td data-label="日期">${t.date}</td>
      <td data-label="类型"><span class="badge ${t.type === "申购" ? "badge-pos" : "badge-info"}">${t.type}</span></td>
      <td data-label="金额" class="num">${fmtMoney(t.amount, 0)}</td>
      <td data-label="份额" class="num">${fmtNum(t.shares, 2)}</td>
      <td data-label="状态"><span class="badge ${t.status === "成功" ? "badge-pos" : t.status === "失败" ? "badge-neg" : "badge-warn"}">${t.status}</span></td></tr>`).join("");

    const ranges = ["1M", "3M", "6M", "1Y"].map(r =>
      `<button data-range="detail:${r}" class="${state.detail.range === r ? "active" : ""}">${r}</button>`).join("");

    view.innerHTML = `
      <div class="view-head">
        <div><h1>基金详情</h1><p>深度洞察单只基金的表现、持仓与风险</p></div>
        <div class="head-tools">
          <button class="btn btn-soft btn-sm" data-fund="">${ICON.arrow.replace("M5 12h14M13 6l6 6-6 6", "M19 12H5M11 6l-6 6 6 6")} 返回列表</button>
          <button class="btn btn-primary btn-sm" data-trade="${fund.code}">${ICON.plus} 立即申购</button>
        </div>
      </div>

      <div class="card card-pad mb">
        <div class="detail-head">
          <div class="detail-title">
            <div class="detail-emblem" style="background:linear-gradient(140deg,${fund.color},${fund.color2})">${fund.name.charAt(0)}</div>
            <div><div class="row gap-2"><span class="fund-name" style="font-size:18px">${esc(fund.name)}</span>
              <span class="badge badge-neutral">${fund.type}</span><span class="badge risk-${fund.risk}">${fund.risk}</span></div>
              <div class="fund-code">${fund.code} · 经理 ${esc(fund.manager)} · 成立 ${fund.inception} · 规模 ${fund.scale}亿</div></div>
          </div>
          <div class="detail-stats">
            <div class="detail-stat"><div class="ds-label">单位净值</div><div class="ds-val">${fund.nav.toFixed(4)}</div></div>
            <div class="detail-stat"><div class="ds-label">日涨跌</div><div class="ds-val ${sign(fund.daily)}">${fmtPct(fund.daily)}</div></div>
            <div class="detail-stat"><div class="ds-label">近1年</div><div class="ds-val ${sign(fund.y1)}">${fmtPct(fund.y1)}</div></div>
            <div class="detail-stat"><div class="ds-label">累计收益</div><div class="ds-val ${sign(fund.cum)}">${fmtPct(fund.cum)}</div></div>
          </div>
        </div>
      </div>

      <div class="grid detail-grid">
        <div class="card">
          <div class="card-head"><div><h3>历史净值走势</h3><div class="sub">单位净值（元）</div></div>
            <div class="segmented">${ranges}</div></div>
          <div class="card-pad"><div class="chart-box chart-hover-allow" data-tip="nav">${chart.svg}</div></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>风险评级</h3><div class="sub">${fund.risk} 级</div></div>
          <div class="card-pad">
            <div class="chart-box" style="max-width:260px;margin:0 auto">${radar}</div>
            <div class="divider"></div>${meters}
          </div>
        </div>
      </div>

      <div class="grid cols-2 mt-5">
        <div class="card">
          <div class="card-head"><h3>持仓明细</h3><div class="sub">前 ${holdings.length} 大重仓</div></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>持仓</th><th>占比</th><th>日涨跌</th></tr></thead>
            <tbody>${holdRows}</tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>交易记录</h3><div class="sub">本基金份额交易</div></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th>类型</th><th>金额</th><th>份额</th><th>状态</th></tr></thead>
            <tbody>${tradeRows}</tbody></table></div>
        </div>
      </div>`;

    bindHover(view.querySelector('[data-tip="nav"]'));
    applyCardMode();
  }

  /* =====================================================================
     VIEW: Trade management
     ===================================================================== */
  function renderTrade() {
    const t = state.trade;
    const fundOpts = D.FUNDS.map(f => `<option value="${f.code}" ${t.fund === f.code ? "selected" : ""}>${esc(f.name)} (${f.code})</option>`).join("");
    const sel = t.fund || D.FUNDS[0].code;
    const cur = D.FUNDS.find(f => f.code === sel) || D.FUNDS[0];

    const tabs = ["申购", "赎回"].map(x => `<button class="tab ${t.tab === x ? "active" : ""}" data-tab="${x}">${x}</button>`).join("");

    const formHtml = t.tab === "申购" ? `
      <div class="field"><label>选择基金</label><select class="select" id="tfFund">${fundOpts}</select></div>
      <div class="field"><label>申购金额</label>
        <div class="input-affix"><input class="input num" id="tfAmount" inputmode="decimal" placeholder="0.00" /><span class="affix">元</span></div>
        <div class="chip-row">
          <button class="chip" data-quick="10000">1万</button><button class="chip" data-quick="50000">5万</button>
          <button class="chip" data-quick="100000">10万</button><button class="chip" data-quick="200000">20万</button>
        </div>
        <span class="hint" id="tfAmountHint"></span>
      </div>
      <div class="field"><label>付款账户</label><select class="select" id="tfAccount">
        <option>招商银行 (尾号 8821)</option><option>工商银行 (尾号 3340)</option><option>盈策钱包余额</option></select></div>
      <div class="summary-box mt-2">
        <div class="summary-row"><span class="muted">当前净值</span><span class="s-val">${cur.nav.toFixed(4)}</span></div>
        <div class="summary-row"><span class="muted">申购费率</span><span class="s-val">0.15%</span></div>
        <div class="summary-row"><span class="muted">预计确认份额</span><span class="s-val" id="tfShares">—</span></div>
      </div>
      <button class="btn btn-primary btn-block mt-4" id="tfSubmit">${ICON.plus} 提交申购</button>`
      : `
      <div class="field"><label>选择基金</label><select class="select" id="tfFund">${fundOpts}</select></div>
      <div class="field"><label>赎回份额</label>
        <div class="input-affix"><input class="input num" id="tfAmount" inputmode="decimal" placeholder="0.00" /><span class="affix">份</span></div>
        <span class="hint">可赎回份额上限：${fmtNum(cur.scale * 10000, 0)} 份</span>
      </div>
      <div class="field"><label>到账账户</label><select class="select" id="tfAccount">
        <option>招商银行 (尾号 8821)</option><option>工商银行 (尾号 3340)</option><option>盈策钱包余额</option></select></div>
      <div class="summary-box mt-2">
        <div class="summary-row"><span class="muted">当前净值</span><span class="s-val">${cur.nav.toFixed(4)}</span></div>
        <div class="summary-row"><span class="muted">赎回费率</span><span class="s-val">0.00%</span></div>
        <div class="summary-row"><span class="muted">预计到账金额</span><span class="s-val" id="tfShares">—</span></div>
      </div>
      <button class="btn btn-primary btn-block mt-4" id="tfSubmit">提交赎回</button>`;

    const list = t.list;
    const pages = Math.max(1, Math.ceil(list.length / t.perPage));
    t.page = Math.min(t.page, pages);
    const start = (t.page - 1) * t.perPage;
    const pageItems = list.slice(start, start + t.perPage);
    const rows = pageItems.map(r => `
      <tr><td data-label="订单号" class="num">${r.id}</td>
      <td data-label="日期">${r.date}</td>
      <td data-label="基金"><span class="fund-name">${esc(r.name)}</span><div class="fund-code">${r.code}</div></td>
      <td data-label="类型"><span class="badge ${r.type === "申购" ? "badge-pos" : "badge-info"}">${r.type}</span></td>
      <td data-label="金额" class="num">${fmtMoney(r.amount, 0)}</td>
      <td data-label="份额" class="num">${fmtNum(r.shares, 2)}</td>
      <td data-label="状态"><span class="badge ${r.status === "成功" ? "badge-pos" : r.status === "失败" ? "badge-neg" : "badge-warn"}">${r.status}</span></td></tr>`).join("");

    let pbtns = "";
    for (let i = 1; i <= pages; i++) pbtns += `<button data-page="${i}" class="${i === t.page ? "active" : ""}">${i}</button>`;

    view.innerHTML = `
      <div class="view-head">
        <div><h1>交易管理</h1><p>申购 / 赎回操作与交易流水，状态实时同步</p></div>
      </div>
      <div class="grid trade-layout">
        <div class="card">
          <div class="tabs">${tabs}</div>
          <div class="card-pad" id="tradeForm">${formHtml}</div>
        </div>
        <div class="card">
          <div class="card-head"><h3>交易历史</h3><div class="sub">最近 ${list.length} 笔</div></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>订单号</th><th>日期</th><th>基金</th><th>类型</th><th>金额</th><th>份额</th><th>状态</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
          <div class="pager">
            <div class="pager-info">显示 ${start + 1}–${Math.min(list.length, start + t.perPage)} / 共 ${list.length} 笔</div>
            <div class="pager-btns"><button data-page="prev" ${t.page === 1 ? "disabled" : ""}>上一页</button>${pbtns}<button data-page="next" ${t.page === pages ? "disabled" : ""}>下一页</button></div>
          </div>
        </div>
      </div>`;

    bindTradeForm(cur);
    applyCardMode();
  }

  function bindTradeForm(cur) {
    const tab = state.trade.tab;
    const amount = $("#tfAmount");
    const shares = $("#tfShares");
    const hint = $("#tfAmountHint");
    function recalc() {
      const v = parseFloat(amount.value);
      if (!v || v <= 0) { shares.textContent = "—"; if (hint) hint.textContent = ""; amount.classList.remove("invalid"); return; }
      if (tab === "申购") {
        const fee = v * 0.0015;
        const sh = (v - fee) / cur.nav;
        shares.textContent = fmtNum(sh, 2) + " 份";
        if (hint) hint.textContent = `含申购费 ${fmtMoney(fee, 2)}`;
        amount.classList.remove("invalid");
      } else {
        const amt = v * cur.nav;
        shares.textContent = fmtMoney(amt, 2);
        amount.classList.remove("invalid");
      }
    }
    if (amount) {
      amount.addEventListener("input", recalc);
      recalc();
    }
    // quick chips
    document.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => {
      amount.value = b.getAttribute("data-quick"); recalc(); amount.classList.remove("invalid");
    }));
    // fund change updates cur + summary
    const fundSel = $("#tfFund");
    if (fundSel) fundSel.addEventListener("change", () => {
      state.trade.fund = fundSel.value;
      const nf = D.FUNDS.find(f => f.code === fundSel.value) || cur;
      renderTrade();
    });
    const submit = $("#tfSubmit");
    if (submit) submit.addEventListener("click", () => {
      const v = parseFloat(amount.value);
      if (!v || v <= 0) {
        amount.classList.add("invalid");
        toast("error", "请输入有效金额", "金额必须大于 0。");
        return;
      }
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span> 提交中…';
      // 模拟网络请求
      setTimeout(() => {
        const ok = Math.random() > 0.15;
        if (ok) {
          const status = Math.random() > 0.6 ? "处理中" : "成功";
          const rec = {
            id: "T" + (26071499 - state.trade.list.length),
            date: new Date().toISOString().slice(0, 10),
            name: cur.name, code: cur.code, type: tab,
            amount: v, shares: tab === "申购" ? (v / cur.nav) : v, status,
          };
          state.trade.list.unshift(rec);
          state.trade.page = 1;
          toast("success", tab + "提交成功", `${cur.name} · ${fmtMoney(v, 0)} · 状态：${status}`);
          amount.value = "";
          renderTrade();
        } else {
          toast("error", tab + "失败", "系统繁忙，请稍后重试（资金未扣除）。");
          submit.disabled = false;
          submit.innerHTML = tab === "申购" ? ICON.plus + " 提交申购" : "提交赎回";
        }
      }, 850);
    });
  }

  /* =====================================================================
     Router
     ===================================================================== */
  function parseHash() {
    const h = location.hash || "#/dashboard";
    const qIdx = h.indexOf("?");
    const path = qIdx >= 0 ? h.slice(0, qIdx) : h;
    const query = {};
    if (qIdx >= 0) new URLSearchParams(h.slice(qIdx + 1)).forEach((v, k) => query[k] = v);
    return { path, query };
  }

  function renderView() {
    const { path, query } = parseHash();
    app.classList.remove("nav-open");
    let route = "dashboard";
    if (path.startsWith("#/funds")) route = "funds";
    else if (path.startsWith("#/trade")) { route = "trade"; if (query.fund) state.trade.fund = query.fund; }
    else if (path.startsWith("#/fund/")) { route = "fund"; state.detail.code = decodeURIComponent(path.slice("#/fund/".length)); }
    state.route = route;

    document.querySelectorAll(".nav-link").forEach(a => a.classList.toggle("active", a.dataset.route === route || (route === "fund" && a.dataset.route === "funds")));

    if (route === "dashboard") renderDashboard();
    else if (route === "funds") renderFunds();
    else if (route === "fund") renderDetail(state.detail.code, state.detail.range);
    else if (route === "trade") renderTrade();

    $("#main").scrollTo({ top: 0 });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ---------------- delegated clicks ---------------- */
  view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-sort],[data-page],[data-range],[data-fund],[data-trade],[data-tab],[data-quick]");
    if (!t) return;
    if (t.hasAttribute("data-sort")) {
      const k = t.getAttribute("data-sort");
      const f = state.funds;
      if (f.sortKey === k) f.sortDir = f.sortDir === "asc" ? "desc" : "asc";
      else { f.sortKey = k; f.sortDir = k === "risk" || k === "daily" ? "desc" : "desc"; }
      f.page = 1; renderFunds();
    } else if (t.hasAttribute("data-page")) {
      const p = t.getAttribute("data-page");
      if (state.route === "trade") {
        const pages = Math.max(1, Math.ceil(state.trade.list.length / state.trade.perPage));
        if (p === "prev") state.trade.page = Math.max(1, state.trade.page - 1);
        else if (p === "next") state.trade.page = Math.min(pages, state.trade.page + 1);
        else state.trade.page = parseInt(p, 10);
        renderTrade();
      } else {
        if (p === "prev") state.funds.page = Math.max(1, state.funds.page - 1);
        else if (p === "next") state.funds.page = state.funds.page + 1;
        else state.funds.page = parseInt(p, 10);
        const body = $("#fundBody");
        if (body) { body.innerHTML = skeletonRows(8, 9); setTimeout(() => { body.innerHTML = fundRows(); applyCardMode(); }, 260); }
        const pg = $("#fundPager"); if (pg) pg.innerHTML = pagerHtml(totalFiltered());
      }
    } else if (t.hasAttribute("data-range")) {
      const [scope, r] = t.getAttribute("data-range").split(":");
      if (scope === "dash") { state.dash.range = r; renderDashboard(); }
      else if (scope === "detail") { state.detail.range = r; renderDetail(state.detail.code, r); }
    } else if (t.hasAttribute("data-tab")) {
      state.trade.tab = t.getAttribute("data-tab"); renderTrade();
    } else if (t.hasAttribute("data-fund")) {
      e.preventDefault();
      const code = t.getAttribute("data-fund");
      if (code) location.hash = "#/fund/" + code;
      else if (state.route === "fund") location.hash = "#/funds";
    } else if (t.hasAttribute("data-trade")) {
      e.preventDefault();
      const code = t.getAttribute("data-trade");
      location.hash = code ? "#/trade?fund=" + code : "#/trade";
    }
  });

  /* ---------------- refresh ---------------- */
  function doRefresh() {
    const btn = $("#refreshBtn");
    if (btn) { btn.innerHTML = '<span class="spinner"></span>'; }
    setTimeout(() => {
      if (btn) btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
      state.dash.updated = new Date();
      if (state.route === "dashboard") renderDashboard();
      toast("success", "数据已同步", "已拉取最新行情与估值。");
    }, 650);
  }
  $("#refreshBtn").addEventListener("click", doRefresh);

  // 自动同步（实时刷新）：每 30s 轻量更新时间戳
  setInterval(() => {
    state.dash.updated = new Date();
    if (state.route === "dashboard") {
      const p = $(".view-head p"); if (p) p.textContent = `数据更新于 ${fmtTime(state.dash.updated)} · 实时行情已连接`;
    }
  }, 30000);

  /* ---------------- utils ---------------- */
  function debounce(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }

  /* ---------------- boot ---------------- */
  window.addEventListener("hashchange", renderView);
  window.addEventListener("resize", debounce(applyCardMode, 120));
  applyThemeIcons();
  if (!location.hash) location.hash = "#/dashboard";
  renderView();
})();
