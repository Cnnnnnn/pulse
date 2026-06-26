/**
 * src/renderer/worldcup/flags.jsx
 *
 * 世界杯参赛队国旗 — 彩色真实国旗 SVG (4:3 viewBox 60x40).
 *
 * 设计:
 *  - 统一容器 viewBox="0 0 60 40" (4:3), 跟世界各国国旗主流比例接近.
 *  - 用各国官方配色的简化几何 path (矩形分块 + 基本符号), 在 12px 小尺寸下
 *    仍能靠主色块辨识 (世界杯 UI 里 TeamFlag 渲染尺寸 12-24px).
 *  - 彩色填充 (fill 写死), 不依赖 currentColor — 国旗必须用真实配色才可辨识.
 *  - inline 内联, 0 网络, 跨平台一致 (解决 Windows 上 Unicode 国旗 emoji
 *    渲染为字母的硬伤).
 *
 * 数据来源: 各国国旗官方几何规格的简化版 (公共 domain), 仅保留主色块 + 关键符号.
 * 47 个 ISO alpha-2 code 覆盖 2026 世界杯全部参赛队.
 */

/**
 * 国旗 SVG path 表. key = ISO alpha-2 code (大写), value = JSX children.
 * viewBox 统一 "0 0 60 40".
 */
const FLAG_SVGS = {
  // —— 南美 ——
  AR: (
    <>
      <rect width="60" height="40" fill="#74acdf" />
      <rect y="13" width="60" height="14" fill="#fff" />
      {/* 中央太阳 (5月太阳简化) */}
      <circle cx="30" cy="20" r="4" fill="#f6b40e" />
    </>
  ),
  BR: (
    <>
      <rect width="60" height="40" fill="#009c3b" />
      <polygon points="30,6 54,20 30,34 6,20" fill="#ffdf00" />
      <circle cx="30" cy="20" r="6" fill="#002776" />
    </>
  ),
  CO: (
    <>
      <rect width="60" height="20" fill="#fcd116" />
      <rect y="20" width="60" height="10" fill="#003893" />
      <rect y="30" width="60" height="10" fill="#ce1126" />
    </>
  ),
  EC: (
    <>
      <rect width="60" height="26" fill="#ffd100" />
      <rect y="26" width="60" height="8" fill="#003893" />
      <rect y="34" width="60" height="6" fill="#ce1126" />
    </>
  ),
  PY: (
    <>
      <rect width="60" height="13" fill="#d52b1e" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#0038a8" />
      <circle cx="30" cy="20" r="4" fill="#0038a8" />
    </>
  ),
  UY: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect width="24" height="16" fill="#0038a8" />
      {/* 九条纹 (4 白 5 蓝), 简化为条纹 */}
      <rect y="16" width="60" height="3" fill="#0038a8" />
      <rect y="22" width="60" height="3" fill="#0038a8" />
      <rect y="28" width="60" height="3" fill="#0038a8" />
      <rect y="34" width="60" height="3" fill="#0038a8" />
    </>
  ),

  // —— 中北美加勒比 ——
  CA: (
    <>
      <rect width="60" height="40" fill="#d80621" />
      <rect x="25" width="10" height="40" fill="#fff" />
      {/* 枫叶简化 */}
      <polygon points="30,14 32,19 38,19 33,22 35,28 30,24 25,28 27,22 22,19 28,19" fill="#d80621" />
    </>
  ),
  CW: (
    <>
      <rect width="60" height="40" fill="#006eb3" />
      <rect y="20" width="60" height="6" fill="#ffd700" />
    </>
  ),
  HT: (
    <>
      <rect width="30" height="40" fill="#00327c" />
      <rect x="30" width="30" height="40" fill="#d21034" />
      <rect x="26" width="8" height="40" fill="#fff" />
    </>
  ),
  MX: (
    <>
      <rect width="20" height="40" fill="#006847" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#ce1126" />
      {/* 蛇鹰简化居中 */}
      <circle cx="30" cy="20" r="3.5" fill="#006847" />
    </>
  ),
  PA: (
    <>
      <rect width="60" height="20" fill="#fff" />
      <rect y="20" width="60" height="20" fill="#fff" />
      <rect width="30" height="20" fill="#005eb3" />
      <rect x="30" y="20" width="30" height="20" fill="#d21034" />
      <rect x="30" width="30" height="20" fill="#005eb3" opacity="0" />
    </>
  ),
  US: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect y="3" width="60" height="3.5" fill="#b22234" />
      <rect y="9.5" width="60" height="3.5" fill="#b22234" />
      <rect y="16" width="60" height="3.5" fill="#b22234" />
      <rect y="22.5" width="60" height="3.5" fill="#b22234" />
      <rect y="29" width="60" height="3.5" fill="#b22234" />
      <rect y="35.5" width="60" height="3.5" fill="#b22234" />
      <rect width="24" height="22" fill="#3c3b6e" />
    </>
  ),

  // —— 欧洲 ——
  AT: (
    <>
      <rect width="60" height="13" fill="#ed2939" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#ed2939" />
    </>
  ),
  BA: (
    <>
      {/* 波黑: 右上蓝三角, 左下黄三角, 沿主对角线分, 黄区沿斜边一排白星 */}
      <rect width="60" height="40" fill="#0000ff" />
      <polygon points="0,40 60,0 60,40" fill="#f9d616" />
      <polygon points="42,28 43.3,30.5 46,30.5 43.8,32.1 44.6,34.7 42,33.1 39.4,34.7 40.2,32.1 38,30.5 40.7,30.5" fill="#fff" />
    </>
  ),
  BE: (
    <>
      <rect width="20" height="40" fill="#000" />
      <rect x="20" width="20" height="40" fill="#fdda24" />
      <rect x="40" width="20" height="40" fill="#ef3340" />
    </>
  ),
  CH: (
    <>
      <rect width="60" height="40" fill="#d52b1e" />
      <rect x="26" y="8" width="8" height="24" fill="#fff" />
      <rect x="18" y="16" width="24" height="8" fill="#fff" />
    </>
  ),
  CZ: (
    <>
      <rect width="60" height="20" fill="#fff" />
      <rect y="20" width="60" height="20" fill="#d7141a" />
      <polygon points="0,0 30,20 0,40" fill="#11457e" />
    </>
  ),
  DE: (
    <>
      <rect width="60" height="13" fill="#000" />
      <rect y="13" width="60" height="14" fill="#dd0000" />
      <rect y="27" width="60" height="13" fill="#ffce00" />
    </>
  ),
  ES: (
    <>
      <rect width="60" height="10" fill="#c60b1e" />
      <rect y="10" width="60" height="20" fill="#ffc400" />
      <rect y="30" width="60" height="10" fill="#c60b1e" />
    </>
  ),
  FR: (
    <>
      <rect width="20" height="40" fill="#0055a4" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#ef4135" />
    </>
  ),
  GB: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <rect width="60" height="40" fill="#012169" />
      <polygon points="0,0 60,40 60,36 4,0" fill="#fff" />
      <polygon points="0,40 60,0 60,4 4,40" fill="#fff" />
      <polygon points="0,0 60,40 60,37 3,0" fill="#c8102e" />
      <polygon points="0,40 60,0 60,3 3,40" fill="#c8102e" />
      <rect x="25" width="10" height="40" fill="#fff" />
      <rect width="60" height="10" y="15" fill="#fff" />
      <rect x="27" width="6" height="40" fill="#c8102e" />
      <rect width="60" height="6" y="17" fill="#c8102e" />
    </>
  ),
  HR: (
    <>
      <rect width="60" height="13" fill="#ff0000" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#171796" />
      {/* 盾牌格纹简化 (居中) */}
      <rect x="24" y="13" width="12" height="14" fill="#171796" opacity="0.25" />
    </>
  ),
  NL: (
    <>
      <rect width="60" height="13" fill="#ae1c28" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#21468b" />
    </>
  ),
  NO: (
    <>
      <rect width="60" height="40" fill="#ed2939" />
      <rect x="18" width="8" height="40" fill="#fff" />
      <rect y="16" width="60" height="8" fill="#fff" />
      <rect x="20" width="4" height="40" fill="#002664" />
      <rect y="18" width="60" height="4" fill="#002664" />
    </>
  ),
  PT: (
    <>
      <rect width="24" height="40" fill="#006600" />
      <rect x="24" width="36" height="40" fill="#ff0000" />
      <circle cx="24" cy="20" r="4.5" fill="#ffcc00" stroke="#006600" strokeWidth="1" />
    </>
  ),
  SE: (
    <>
      <rect width="60" height="40" fill="#005b99" />
      <rect x="18" width="8" height="40" fill="#fecc00" />
      <rect y="16" width="60" height="8" fill="#fecc00" />
    </>
  ),
  TR: (
    <>
      <rect width="60" height="40" fill="#e30a17" />
      <circle cx="22" cy="20" r="7" fill="#fff" />
      <circle cx="24.5" cy="20" r="5.5" fill="#e30a17" />
      {/* 五角星简化 */}
      <polygon points="32,20 33.5,21.2 32.9,19.4 34.4,18.2 32.5,18.2 32,16.4 31.5,18.2 29.6,18.2 31.1,19.4 30.5,21.2" fill="#fff" />
    </>
  ),

  // —— 非洲 ——
  CI: (
    <>
      <rect width="20" height="40" fill="#009e60" />
      <rect x="20" width="20" height="40" fill="#fff" />
      <rect x="40" width="20" height="40" fill="#f77f00" />
    </>
  ),
  CV: (
    <>
      <rect width="60" height="20" fill="#003893" />
      <rect y="20" width="60" height="10" fill="#fff" />
      <rect y="30" width="60" height="10" fill="#003893" />
      <rect y="10" width="60" height="3" fill="#cf142b" />
      <rect y="27" width="60" height="3" fill="#cf142b" />
    </>
  ),
  CD: (
    <>
      <rect width="20" height="40" fill="#0085ca" fillOpacity="0" />
      <rect width="60" height="40" fill="#007fff" />
      <rect y="18" width="60" height="4" fill="#fcd116" />
      <polygon points="0,0 18,18 0,18" fill="#ce1126" />
    </>
  ),
  DZ: (
    <>
      <rect width="30" height="40" fill="#fff" />
      <rect x="30" width="30" height="40" fill="#006233" />
      <circle cx="30" cy="20" r="7" fill="#d21034" />
    </>
  ),
  EG: (
    <>
      <rect width="60" height="13" fill="#ce1126" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#000" />
      <circle cx="30" cy="20" r="4" fill="#c0a060" />
    </>
  ),
  GH: (
    <>
      <rect width="60" height="13" fill="#ce1126" />
      <rect y="13" width="60" height="14" fill="#fcd116" />
      <rect y="27" width="60" height="13" fill="#006b3f" />
      <polygon points="30,14 32,18 36,18 32.5,20.5 34,24.5 30,22 26,24.5 27.5,20.5 24,18 28,18" fill="#000" />
    </>
  ),
  MA: (
    <>
      <rect width="60" height="40" fill="#c1272d" />
      <polygon points="30,12 32,17 37,17 33,20.5 34.5,25.5 30,22.5 25.5,25.5 27,20.5 23,17 28,17" fill="none" stroke="#006233" strokeWidth="1.5" />
    </>
  ),
  SN: (
    <>
      <rect width="20" height="40" fill="#00853f" />
      <rect x="20" width="20" height="40" fill="#fdef42" />
      <rect x="40" width="20" height="40" fill="#e31b23" />
      <polygon points="30,13 32,18 37,18 33,21 34.5,26 30,23 25.5,26 27,21 23,18 28,18" fill="#00853f" />
    </>
  ),
  TN: (
    <>
      <rect width="60" height="40" fill="#e70013" />
      <circle cx="30" cy="20" r="8" fill="#fff" />
      <circle cx="32" cy="20" r="6" fill="#e70013" />
      <polygon points="36,20 37.5,21.2 36.9,19.4 38.4,18.2 36.5,18.2 36,16.4 35.5,18.2 33.6,18.2 35.1,19.4 34.5,21.2" fill="#fff" />
    </>
  ),
  ZA: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect y="0" width="60" height="13" fill="#000" />
      <rect y="27" width="60" height="13" fill="#0033a0" />
      <polygon points="0,0 30,20 0,40" fill="#fff" />
      <polygon points="0,2 26,20 0,38" fill="#fff" />
      <polygon points="0,4 24,20 0,36" fill="#007749" />
      <polygon points="0,0 0,40 24,20" fill="#ffb612" />
      <polygon points="0,0 0,40 18,20" fill="#de3831" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="0" width="60" height="13" fill="#000" />
      <rect y="27" width="60" height="13" fill="#0033a0" />
      <polygon points="0,0 18,20 0,40" fill="#de3831" />
    </>
  ),

  // —— 亚洲 ——
  AU: (
    <>
      <rect width="60" height="40" fill="#00008b" />
      {/* 米字 (左上) */}
      <rect x="0" width="30" height="20" fill="#00008b" />
      <polygon points="0,0 30,20 30,17 3,0" fill="#fff" />
      <polygon points="0,20 30,0 30,3 3,20" fill="#fff" />
      <polygon points="0,0 30,20 30,18 2,0" fill="#ff0000" />
      <polygon points="0,20 30,0 30,2 2,20" fill="#ff0000" />
      <rect x="12" width="6" height="20" fill="#fff" />
      <rect y="7" width="30" height="6" fill="#fff" />
      <rect x="13" width="4" height="20" fill="#ff0000" />
      <rect y="8" width="30" height="4" fill="#ff0000" />
      {/* 南十字 (右半, 简化) */}
      <polygon points="45,8 46,11 49,11 46.5,13 47.5,16 45,14 42.5,16 43.5,13 41,11 44,11" fill="#fff" />
      <polygon points="50,18 51,20.5 53.5,20.5 51.5,22 52.5,24.5 50,23 47.5,24.5 48.5,22 46.5,20.5 49,20.5" fill="#fff" />
      <polygon points="40,22 40.8,24 42.8,24 41.2,25.2 41.8,27.2 40,26 38.2,27.2 38.8,25.2 37.2,24 39.2,24" fill="#fff" />
      <polygon points="52,28 52.8,30 54.8,30 53.2,31.2 53.8,33.2 52,32 50.2,33.2 50.8,31.2 49.2,30 51.2,30" fill="#fff" />
    </>
  ),
  IR: (
    <>
      <rect width="60" height="13" fill="#239f40" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#da0000" />
      <polygon points="30,14 32,18 36,18 32.5,20.5 34,24.5 30,22 26,24.5 27.5,20.5 24,18 28,18" fill="#da0000" />
    </>
  ),
  IQ: (
    <>
      <rect width="60" height="13" fill="#ce1126" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#000" />
      <polygon points="30,14 32,18 36,18 32.5,20.5 34,24.5 30,22 26,24.5 27.5,20.5 24,18 28,18" fill="#007a3d" />
    </>
  ),
  JO: (
    <>
      <rect width="60" height="13" fill="#000" />
      <rect y="13" width="60" height="14" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#007a3d" />
      <polygon points="12,2 13.5,6.5 18,6.5 14.3,9.2 15.8,13.7 12,11 8.2,13.7 9.7,9.2 6,6.5 10.5,6.5" fill="#fff" />
    </>
  ),
  JP: (
    <>
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="9" fill="#bc002d" />
    </>
  ),
  KR: (
    <>
      <rect width="60" height="40" fill="#fff" />
      {/* 太极 */}
      <circle cx="30" cy="20" r="9" fill="#cd2e3a" />
      <path d="M 30 11 A 9 9 0 0 1 30 29 A 4.5 4.5 0 0 0 30 20 A 4.5 4.5 0 0 1 30 11 Z" fill="#0047a0" />
      {/* 四卦简化 (角落短线) */}
      <rect x="12" y="8" width="8" height="1.5" fill="#000" />
      <rect x="12" y="11" width="8" height="1.5" fill="#000" />
      <rect x="40" y="28" width="8" height="1.5" fill="#000" />
      <rect x="40" y="31" width="8" height="1.5" fill="#000" />
      <rect x="40" y="6" width="8" height="1.5" fill="#000" />
      <rect x="40" y="9" width="8" height="1.5" fill="#000" />
      <rect x="40" y="12" width="8" height="1.5" fill="#000" />
      <rect x="12" y="28" width="8" height="1.5" fill="#000" />
      <rect x="12" y="33" width="8" height="1.5" fill="#000" />
    </>
  ),
  NZ: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <rect x="0" width="30" height="20" fill="#012169" />
      <polygon points="0,0 30,20 30,17 3,0" fill="#fff" />
      <polygon points="0,20 30,0 30,3 3,20" fill="#fff" />
      <rect x="12" width="6" height="20" fill="#fff" />
      <rect y="7" width="30" height="6" fill="#fff" />
      <polygon points="0,0 30,20 30,18 2,0" fill="#c8102e" />
      <polygon points="0,20 30,0 30,2 2,20" fill="#c8102e" />
      <rect x="13" width="4" height="20" fill="#c8102e" />
      <rect y="8" width="30" height="4" fill="#c8102e" />
      <polygon points="48,10 49,13 52,13 49.5,15 50.5,18 48,16 45.5,18 46.5,15 44,13 47,13" fill="#fff" />
      <polygon points="42,22 43,25 46,25 43.5,27 44.5,30 42,28 39.5,30 40.5,27 38,25 41,25" fill="#fff" />
      <polygon points="54,24 55,27 58,27 55.5,29 56.5,32 54,30 51.5,32 52.5,29 50,27 53,27" fill="#fff" />
      <polygon points="44,32 45,34.5 47.5,34.5 45.5,36 46.5,38.5 44,37 41.5,38.5 42.5,36 40.5,34.5 43,34.5" fill="#fff" />
    </>
  ),
  QA: (
    <>
      <rect width="60" height="40" fill="#8d1b3d" />
      <rect width="18" height="40" fill="#fff" />
      <rect width="5" height="40" fill="#8d1b3d" />
      <rect x="8" width="3" height="40" fill="#8d1b3d" />
      <rect x="13" width="3" height="40" fill="#8d1b3d" />
    </>
  ),
  SA: (
    <>
      <rect width="60" height="40" fill="#006c35" />
      <rect y="0" width="60" height="6" fill="#fff" />
      <rect y="34" width="60" height="6" fill="#fff" />
    </>
  ),
  UZ: (
    <>
      <rect width="60" height="13" fill="#1eb53a" />
      <rect y="27" width="60" height="13" fill="#0099b5" />
      <rect y="11" width="60" height="3" fill="#fff" />
      <rect y="26" width="60" height="3" fill="#fff" />
      <rect y="14" width="60" height="12" fill="#fff" />
      <circle cx="13" cy="7" r="3" fill="#fff" />
    </>
  ),
};

export { FLAG_SVGS };
