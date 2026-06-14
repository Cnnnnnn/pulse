/**
 * src/renderer/hooks/useNowTick.jsx
 *
 * 返回当前 Date.now(), 每 `intervalMs` 更新一次. unmount 时自动 clear.
 * 用于倒计时 / 相对时间显示.
 *
 * @param {number} [intervalMs=1000]
 * @returns {number} epoch ms
 */

import { useEffect, useState } from "preact/hooks";

export function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
