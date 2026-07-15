/* =====================================================================
   Charts — hand-rolled inline SVG (no deps)
   重要：SVG 呈现属性里 var() 多数浏览器不解析，故渲染时用 getComputedStyle
   把主题色解析为具体色值再写入；主题切换会触发重渲染，深浅色自动跟随。
   ===================================================================== */
(function (global) {
  "use strict";

  let UID = 0;
  const uid = () => "c" + (++UID);
  const esc = (s) => String(s).replace(/"/g, "&quot;");

  // 解析 CSS 变量为具体颜色（带安全回退）
  function cv(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function scaleY(val, min, max, top, bottom) {
    if (max === min) return (top + bottom) / 2;
    return bottom - ((val - min) / (max - min)) * (bottom - top);
  }

  // ---------- Sparkline ----------
  function sparkline(values, opts) {
    opts = opts || {};
    const W = opts.w || 120, H = opts.h || 36, p = 3;
    const min = Math.min(...values), max = Math.max(...values);
    const step = (W - p * 2) / (values.length - 1);
    const pts = values.map((v, i) => [p + i * step, scaleY(v, min, max, p, H - p)]);
    const line = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
    const area = line + ` L${(W - p).toFixed(1)} ${H} L${p} ${H} Z`;
    const up = values[values.length - 1] >= values[0];
    const stroke = up ? cv("--pos", "#16a34a") : cv("--neg", "#dc2626");
    const id = uid();
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="趋势">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  // ---------- Area / line chart with hover points ----------
  function area(series, opts) {
    opts = opts || {};
    const W = opts.w || 720, H = opts.h || 280;
    const padL = 8, padR = 8, padT = 18, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const cBrand = cv("--brand", "#0d9488");
    const cBorder = cv("--border", "#e2e8f0");
    const cText3 = cv("--text-3", "#94a3b8");
    const cBrandLine = cv("--brand-line", "#99f6e4");
    const cSurface = cv("--surface", "#ffffff");

    const vals = series.map(d => d.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    min -= span * 0.12; max += span * 0.12;
    const n = series.length;
    const step = plotW / (n - 1);
    const points = series.map((d, i) => {
      const vx = padL + i * step;
      const vy = scaleY(d.value, min, max, padT, padT + plotH);
      return { vx, vy, value: d.value, label: d.date || d.label || "" };
    });
    const line = points.map((q, i) => (i ? "L" : "M") + q.vx.toFixed(1) + " " + q.vy.toFixed(1)).join(" ");
    const areaPath = line + ` L${points[n - 1].vx.toFixed(1)} ${(padT + plotH)} L${points[0].vx.toFixed(1)} ${(padT + plotH)} Z`;
    const id = uid();
    const grid = 4;
    let gridSvg = "";
    for (let g = 0; g <= grid; g++) {
      const y = padT + (plotH / grid) * g;
      const val = max - ((max - min) / grid) * g;
      gridSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${cBorder}" stroke-width="1"/>
        <text x="${padL + 2}" y="${(y - 4).toFixed(1)}" font-size="10.5" fill="${cText3}" font-family="ui-monospace, monospace">${Math.round(val).toLocaleString()}</text>`;
    }
    let xlab = "";
    const xticks = Math.min(6, n);
    for (let t = 0; t < xticks; t++) {
      const idx = Math.round((n - 1) * (t / (xticks - 1)));
      const p = points[idx];
      xlab += `<text x="${p.vx.toFixed(1)}" y="${H - 10}" font-size="10.5" fill="${cText3}" text-anchor="middle">${esc(p.label)}</text>`;
    }
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="走势图" data-points='${esc(JSON.stringify(points.map(p => ({ vx: p.vx, vy: p.vy, value: p.value, label: p.label }))))}'>
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${cBrand}" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="${cBrand}" stop-opacity="0"/></linearGradient></defs>
      ${gridSvg}
      <path d="${areaPath}" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="${cBrand}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      <line class="hover-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="${cBrandLine}" stroke-width="1" opacity="0"/>
      <circle class="hover-dot" r="4.5" fill="${cBrand}" stroke="${cSurface}" stroke-width="2.5" opacity="0"/>
      ${xlab}
    </svg>`;
    return { svg, points, W, H };
  }

  // ---------- Donut ----------
  function donut(segments, opts) {
    opts = opts || {};
    const size = opts.size || 220, r = size / 2 - 16, cx = size / 2, cy = size / 2;
    const stroke = opts.stroke || 22;
    const total = segments.reduce((s, d) => s + d.value, 0) || 1;
    const C = 2 * Math.PI * r;
    const palette = [cv("--brand", "#0d9488"), cv("--accent", "#0ea5e9"), cv("--brand-2", "#0891b2"), cv("--warn", "#f59e0b"), cv("--pos", "#16a34a"), cv("--neg", "#dc2626")];
    const cText = cv("--text", "#0f172a");
    const cText3 = cv("--text-3", "#94a3b8");
    let acc = 0, arcs = "";
    segments.forEach((seg, i) => {
      const frac = seg.value / total;
      const len = frac * C;
      const color = seg.color || palette[i % palette.length];
      arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
      acc += len;
    });
    const centerTop = opts.centerTop || "";
    const centerSub = opts.centerSub || "";
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="占比分布">
      ${arcs}
      ${centerTop ? `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" font-weight="700" fill="${cText}" font-family="ui-monospace, monospace">${esc(centerTop)}</text>` : ""}
      ${centerSub ? `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="11.5" fill="${cText3}">${esc(centerSub)}</text>` : ""}
    </svg>`;
  }

  // ---------- Grouped bars ----------
  function bars(groups, opts) {
    opts = opts || {};
    const W = opts.w || 520, H = opts.h || 240;
    const padL = 10, padR = 10, padT = 22, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const cBrand = cv("--brand", "#0d9488");
    const cAccent = cv("--accent", "#0ea5e9");
    const cText = cv("--text", "#0f172a");
    const cText3 = cv("--text-3", "#94a3b8");
    const cBorder = cv("--border", "#e2e8f0");
    const all = groups.flatMap(g => [g.fund, g.bench]);
    const max = Math.max(...all) * 1.15 || 1;
    const gw = plotW / groups.length;
    const bw = Math.min(26, gw / 3.2);
    let svg = "";
    groups.forEach((g, i) => {
      const gx = padL + gw * i + gw / 2;
      const yF = padT + plotH - (g.fund / max) * plotH;
      const yB = padT + plotH - (g.bench / max) * plotH;
      svg += `<rect x="${(gx - bw - 3).toFixed(1)}" y="${yF.toFixed(1)}" width="${bw}" height="${(padT + plotH - yF).toFixed(1)}" rx="4" fill="${cBrand}"/>
        <text x="${(gx - 3).toFixed(1)}" y="${(yF - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${cText}" font-family="ui-monospace, monospace">${g.fund}</text>`;
      svg += `<rect x="${(gx + 3).toFixed(1)}" y="${yB.toFixed(1)}" width="${bw}" height="${(padT + plotH - yB).toFixed(1)}" rx="4" fill="${cAccent}"/>
        <text x="${(gx + 3 + bw).toFixed(1)}" y="${(yB - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${cText}" font-family="ui-monospace, monospace">${g.bench}</text>`;
      svg += `<text x="${gx.toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${cText3}">${esc(g.label)}</text>`;
    });
    svg += `<line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="${cBorder}" stroke-width="1"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="收益对比">${svg}</svg>`;
  }

  // ---------- Radar (risk) ----------
  function radar(metrics, opts) {
    opts = opts || {};
    const size = opts.size || 260, cx = size / 2, cy = size / 2, R = size / 2 - 34;
    const cBorder = cv("--border", "#e2e8f0");
    const cText2 = cv("--text-2", "#475569");
    const cBrand = cv("--brand", "#0d9488");
    const n = metrics.length;
    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
    const pt = (i, rad) => [cx + Math.cos(angle(i)) * rad, cy + Math.sin(angle(i)) * rad];
    let rings = "", axes = "", labels = "", poly = "";
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const p = metrics.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(",")).join(" ");
      rings += `<polygon points="${p}" fill="none" stroke="${cBorder}" stroke-width="1"/>`;
    });
    metrics.forEach((m, i) => {
      const [x, y] = pt(i, R);
      axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${cBorder}" stroke-width="1"/>`;
      const [lx, ly] = pt(i, R + 18);
      labels += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="${cText2}">${esc(m.label)}</text>`;
    });
    const vals = metrics.map((m, i) => pt(i, R * Math.max(0.05, Math.min(1, m.norm))));
    poly = `<polygon points="${vals.map(v => v.map(x => x.toFixed(1)).join(",")).join(" ")}" fill="${cBrand}" fill-opacity="0.18" stroke="${cBrand}" stroke-width="2"/>`;
    const dots = vals.map(v => `<circle cx="${v[0].toFixed(1)}" cy="${v[1].toFixed(1)}" r="3" fill="${cBrand}"/>`).join("");
    return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="风险雷达">${rings}${axes}${poly}${dots}${labels}</svg>`;
  }

  global.Charts = { sparkline, area, donut, bars, radar };
})(window);
