/**
 * src/renderer/games/MilestoneFx.jsx
 *
 * 里程碑粒子动效（Phase 2.5）。
 * 读取 store.milestoneFx（由收藏引擎 effect 在「完成度越过 25/50/75/100%」时置位）。
 *
 *  - 常态：以卡片中心向四周喷射 N 颗粒子 + 中心文案，1.1s 后自动清除信号。
 *  - reduced-motion：不喷粒子，改为居中静态横幅「完成度 X% 达成！」渐隐，尊重偏好。
 * 纯展示 + 回调（clearMilestoneFx），不持有状态。
 */
import { useEffect } from "preact/hooks";
import { milestoneFx, clearMilestoneFx } from "./gamesStore.js";

const PARTICLES = 16;

/**
 * @param {boolean} [reducedMotion=false]
 */
export function MilestoneFx({ reducedMotion = false }) {
  const fx = milestoneFx.value;

  useEffect(() => {
    if (!fx) return undefined;
    const ms = reducedMotion ? 1800 : 1400;
    const t = setTimeout(() => clearMilestoneFx(), ms);
    return () => clearTimeout(t);
  }, [fx, reducedMotion]);

  if (!fx) return null;
  const pct = Math.round(fx.pct * 100);

  if (reducedMotion) {
    return (
      <div class="milestone-fx milestone-fx--static" aria-hidden="true">
        <div class="milestone-fx__banner">🎉 完成度 {pct}% 达成！</div>
      </div>
    );
  }

  const parts = [];
  for (let i = 0; i < PARTICLES; i += 1) {
    const ang = (Math.PI * 2 * i) / PARTICLES + Math.random() * 0.3;
    const dist = 60 + Math.random() * 70;
    const tx = (Math.cos(ang) * dist).toFixed(1);
    const ty = (Math.sin(ang) * dist).toFixed(1);
    const delay = (Math.random() * 0.12).toFixed(3);
    parts.push(
      <span
        class="milestone-fx__particle"
        style={`--tx:${tx}px;--ty:${ty}px;animation-delay:${delay}s`}
        key={i}
      />,
    );
  }

  return (
    <div class="milestone-fx" aria-hidden="true">
      <div class="milestone-fx__burst">{parts}</div>
      <div class="milestone-fx__label">完成度 {pct}% 达成！</div>
    </div>
  );
}

export default MilestoneFx;
