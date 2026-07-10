/**
 * src/renderer/hooks/useBrushRange.js
 *
 * 趋势图「区间刷选缩放」的状态机 + 像素↔索引换算工具。
 * 纯 UI 状态，与具体数据无关，可被任意序列图表复用。
 *
 * 约定:
 *   - range: [startIdx, endIdx]（含端点，闭区间），null = 全量（未刷选）。
 *   - visible: 当前生效可见区间（range 存在时即 range，否则 [0, length-1]）。
 *   - indexFromX / xForIndex: 把 plot 区域的像素坐标与序列索引互转，
 *     供 minimap 手柄拖拽与十字游标定位使用。
 */

import { useCallback, useMemo, useState } from "preact/hooks";

/**
 * @param {number} length 序列长度
 */
export function useBrushRange(length) {
  const [range, setRange] = useState(/** @type {[number, number]|null} */ (null));

  const clampIdx = useCallback(
    (i) => Math.max(0, Math.min(length - 1, i)),
    [length]
  );

  /** 设置刷选区间；区间过窄（<2 点）视为取消。 */
  const setBrush = useCallback(
    (start, end) => {
      if (start == null || end == null || length <= 1) {
        setRange(null);
        return;
      }
      const s = clampIdx(Math.min(start, end));
      const e = clampIdx(Math.max(start, end));
      if (e - s < 1) {
        setRange(null);
        return;
      }
      setRange([s, e]);
    },
    [clampIdx, length]
  );

  const reset = useCallback(() => setRange(null), []);

  const visible = useMemo(
    () => (range ? range : [0, Math.max(0, length - 1)]),
    [range, length]
  );

  /**
   * 像素 X（相对 plot 区域左缘）→ 序列索引。
   * @param {number} x 相对 plot 左缘的像素
   * @param {number} plotLeft plot 区域左缘像素
   * @param {number} plotWidth plot 区域宽度像素
   */
  const indexFromX = useCallback(
    (x, plotLeft, plotWidth) => {
      if (plotWidth <= 0 || length <= 1) return 0;
      const ratio = (x - plotLeft) / plotWidth;
      return clampIdx(Math.round(ratio * (length - 1)));
    },
    [clampIdx, length]
  );

  /**
   * 序列索引 → 像素 X（相对 plot 区域左缘）。
   */
  const xForIndex = useCallback(
    (i, plotLeft, plotWidth) => {
      if (length <= 1) return plotLeft;
      return plotLeft + (i / (length - 1)) * plotWidth;
    },
    [length]
  );

  return { range, setBrush, reset, visible, indexFromX, xForIndex, clampIdx };
}
