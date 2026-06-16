#!/usr/bin/env node
/**
 * scripts/render-windows-icons.js
 *
 * P4: Render Windows ICO assets.
 *
 * macOS uses `setTemplateImage(true)` on a single black SVG — Electron flips
 * it for light/dark menu bar automatically. Windows has no equivalent
 * runtime API, so we ship TWO static SVG variants (light + dark) and
 * rasterize each into multi-size ICOs.
 *
 * Outputs (all in assets/):
 *   icon.ico              — App icon, 16/32/48/256 layers
 *   iconTray.ico          — Tray light, 16/32 layers
 *   iconTrayDark.ico      — Tray dark, 16/32 layers
 *   iconBadge.ico         — Sample badge (digit "1"), 16/32 layers
 *
 * Source strategies:
 *   - icon.ico: 直接 reuse iconApp-1024.png → 用 resvg 重新渲染多尺寸
 *   - iconTray*.ico: 用 ECG 路径 inline 在 SVG 里 (跟 render-icons.js 一致)
 *   - iconBadge.ico: inline SVG (红圈 + 数字 "1")
 *
 * macOS 端用 iconTemplate@2x.png (黑色 + template image) 不动, 跟 Windows 资源
 * 完全解耦. Windows 端走 ICO (Task 6 tray.js Windows 分支会按 `nativeTheme`
 * 选 iconTray.ico vs iconTrayDark.ico).
 *
 * Run:  node scripts/render-windows-icons.js
 */

const { Resvg } = require('@resvg/resvg-js');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

const RESVG_OPTS = {
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'Helvetica',
  },
};

function renderSvgToPngBuffer(svgString, size) {
  const resvg = new Resvg(svgString, {
    ...RESVG_OPTS,
    fitTo: { mode: 'width', value: size },
  });
  return resvg.render().asPng();
}

function readAppPngAsSvgWrapped(size) {
  // 把 iconApp-1024.png 以 <image> tag 嵌入 SVG, resvg 渲出来
  // 这样我们不用 sharp. PNG -> base64 -> SVG -> resvg -> PNG.
  const src = path.join(ASSETS, 'iconApp-1024.png');
  const buf = fs.readFileSync(src);
  const b64 = buf.toString('base64');
  return `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <image x="0" y="0" width="1024" height="1024" href="data:image/png;base64,${b64}"/>
</svg>`;
}

async function buildIco(pngBuffers, outPath) {
  const icoBuf = await pngToIco(pngBuffers);
  fs.writeFileSync(outPath, icoBuf);
  return icoBuf.length;
}

async function buildAppIcon() {
  const sizes = [16, 32, 48, 256];
  // 注意: 1024x1024 源 + resvg 渲 256 已经 256x256; 渲 16/32/48 也 OK
  // 但 resvg 不支持从非 SVG 源缩放, 所以我们把 PNG 包成 SVG 再 resvg.
  const wrappedSvg = readAppPngAsSvgWrapped();
  const bufs = sizes.map((s) => renderSvgToPngBuffer(wrappedSvg, s));
  const out = path.join(ASSETS, 'icon.ico');
  const bytes = await buildIco(bufs, out);
  return ['icon.ico', `${sizes.join('/')} layers`, bytes];
}

async function buildTrayIcon() {
  // 重新生成 light + dark SVG (不污染原 iconTemplate.svg, 那是 macOS 用的)
  const ecgPath = 'M 1.5 8 L 5.5 8 L 7 2 L 9 14 L 10.5 8 L 15 8';
  const lightSvg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="${ecgPath}" fill="none" stroke="#000000" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const darkSvg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="${ecgPath}" fill="none" stroke="#ffffff" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const sizes = [16, 32];
  const lightBufs = sizes.map((s) => renderSvgToPngBuffer(lightSvg, s));
  const darkBufs = sizes.map((s) => renderSvgToPngBuffer(darkSvg, s));
  const out1 = path.join(ASSETS, 'iconTray.ico');
  const out2 = path.join(ASSETS, 'iconTrayDark.ico');
  const b1 = await buildIco(lightBufs, out1);
  const b2 = await buildIco(darkBufs, out2);
  return [
    ['iconTray.ico', `${sizes.join('/')} layers (light)`, b1],
    ['iconTrayDark.ico', `${sizes.join('/')} layers (dark)`, b2],
  ];
}

async function buildBadgeIcon() {
  // 用一个示例 "1" badge SVG (跟 render-icons.js badgeSvg 同款, 但走 32x32 viewBox)
  const ecgPath = 'M 3 16 L 11 16 L 14 4 L 18 28 L 21 16 L 30 16';
  const svg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="${ecgPath}" fill="none" stroke="#000000" stroke-width="1.0"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="8" r="7" fill="#e85d3a"/>
  <text x="24" y="11.4" font-family="Helvetica" font-size="10"
        font-weight="700" fill="#ffffff" text-anchor="middle">1</text>
</svg>`;
  const sizes = [16, 32];
  const bufs = sizes.map((s) => renderSvgToPngBuffer(svg, s));
  const out = path.join(ASSETS, 'iconBadge.ico');
  const bytes = await buildIco(bufs, out);
  return ['iconBadge.ico', `${sizes.join('/')} layers (sample digit 1)`, bytes];
}

async function main() {
  console.log(`[render-windows-icons] Reading sources from ${ASSETS}`);

  const results = [];
  try {
    results.push(await buildAppIcon());
  } catch (err) {
    console.error(`[render-windows-icons] buildAppIcon FAILED:`, err.message);
    throw err;
  }
  try {
    results.push(...await buildTrayIcon());
  } catch (err) {
    console.error(`[render-windows-icons] buildTrayIcon FAILED:`, err.message);
    throw err;
  }
  try {
    results.push(await buildBadgeIcon());
  } catch (err) {
    console.error(`[render-windows-icons] buildBadgeIcon FAILED:`, err.message);
    throw err;
  }

  console.log(`\n[render-windows-icons] Generated ${results.length} ICOs:`);
  let total = 0;
  for (const [name, desc, bytes] of results) {
    total += bytes;
    console.log(`  ${name.padEnd(20)}  ${desc.padEnd(30)}  ${bytes} bytes`);
  }
  console.log(`\n[render-windows-icons] Total: ${total} bytes (${(total / 1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[render-windows-icons] FATAL:', err);
    process.exit(1);
  });
}

module.exports = { buildAppIcon, buildTrayIcon, buildBadgeIcon };
