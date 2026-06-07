#!/usr/bin/env node
/**
 * scripts/render-icons.js
 *
 * Phase 28: Render Pulse tray icons from SVG source.
 *
 * Inputs:
 *   assets/iconTemplate.svg  — ECG line, 32x32 viewBox
 *
 * Outputs (all in assets/):
 *   iconTemplate.png         16x16  (1x display)
 *   iconTemplate@2x.png      32x32  (Retina)
 *   iconBadge-{1..9}.png     32x16  (1x badge, with red circle + white digit)
 *   iconBadge-{1..9}@2x.png  64x32  (Retina)
 *   iconBadge-9plus.png      32x16  (count >= 10, shows "9+")
 *   iconBadge-9plus@2x.png   64x32
 *
 * 22 PNGs total. Runtime tray.js just loads by path.
 *
 * Why static assets, not runtime rendering:
 *   - Tray icon is set 100x/day on average (badge updates). Rasterize at build time = 0ms runtime.
 *   - Pixel-perfect across 1x / 2x displays (Electron picks the right one).
 *   - No canvas / nativeImage complexity in production code.
 *
 * Run:  node scripts/render-icons.js
 */

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const TEMPLATE_SVG_PATH = path.join(ASSETS, 'iconTemplate.svg');

// Badge SVG template — ECG in left 16x16, red circle + digit in right 16x16.
// iconTemplate 32x32 path: M 3 16 L 11 16 L 14 4 L 18 28 L 21 16 L 30 16
// Scaled 0.5 → 32x16 viewBox: M 1.5 8 L 5.5 8 L 7 2 L 9 14 L 10.5 8 L 15 8
const ECG_BADGE_PATH = 'M 1.5 8 L 5.5 8 L 7 2 L 9 14 L 10.5 8 L 15 8';

function badgeSvg(digit, isMultiChar) {
  const fontSize = isMultiChar ? 6.5 : 9;
  // Vertical baseline offset tuned for visual center (font baseline = y attr)
  const yBaseline = isMultiChar ? 10.8 : 11.4;
  return `<svg viewBox="0 0 32 16" xmlns="http://www.w3.org/2000/svg">
  <path d="${ECG_BADGE_PATH}" fill="none" stroke="#000000" stroke-width="1.0"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="8" r="5.5" fill="#e85d3a"/>
  <text x="24" y="${yBaseline}" font-family="Helvetica" font-size="${fontSize}"
        font-weight="700" fill="#ffffff" text-anchor="middle">${digit}</text>
</svg>`;
}

const RESVG_OPTS = {
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'Helvetica',
  },
};

function renderToFile(svgString, width, outPath) {
  const resvg = new Resvg(svgString, {
    ...RESVG_OPTS,
    fitTo: { mode: 'width', value: width },
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
  return png.length;
}

function renderTemplate() {
  const svg = fs.readFileSync(TEMPLATE_SVG_PATH, 'utf-8');
  const a = renderToFile(svg, 16, path.join(ASSETS, 'iconTemplate.png'));
  const b = renderToFile(svg, 32, path.join(ASSETS, 'iconTemplate@2x.png'));
  return [
    ['iconTemplate.png', 16, a],
    ['iconTemplate@2x.png', 32, b],
  ];
}

function renderBadge(digit, isMultiChar) {
  const svg = badgeSvg(digit, isMultiChar);
  const safe = digit === '9+' ? '9plus' : digit;
  const a = renderToFile(svg, 32, path.join(ASSETS, `iconBadge-${safe}.png`));
  const b = renderToFile(svg, 64, path.join(ASSETS, `iconBadge-${safe}@2x.png`));
  return [
    [`iconBadge-${safe}.png`, 32, a],
    [`iconBadge-${safe}@2x.png`, 64, b],
  ];
}

function main() {
  console.log(`[render-icons] Reading template from ${TEMPLATE_SVG_PATH}`);
  const results = [];

  // Template
  results.push(...renderTemplate());

  // Badges 1-9
  for (let n = 1; n <= 9; n++) {
    results.push(...renderBadge(String(n), false));
  }
  // 9+ (used for count >= 10)
  results.push(...renderBadge('9+', true));

  // Summary
  console.log(`\n[render-icons] Generated ${results.length} PNGs:`);
  let totalBytes = 0;
  for (const [name, size, bytes] of results) {
    totalBytes += bytes;
    const sizeStr = size >= 100 ? `${size / 2}x${size / 4}` : `${size}x${size}`;
    console.log(`  ${name.padEnd(28)}  ${sizeStr}  ${bytes} bytes`);
  }
  console.log(`\n[render-icons] Total: ${totalBytes} bytes (${(totalBytes / 1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  main();
}

module.exports = { badgeSvg, ECG_BADGE_PATH };
