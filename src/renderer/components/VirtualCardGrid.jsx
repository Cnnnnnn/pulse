/**
 * src/renderer/components/VirtualCardGrid.jsx
 *
 * 简单窗口化网格: 只渲染 scrollTop 附近的 ROWS, 上下各加 buffer.
 * ponytail: < 100 行不启用 (LibraryPage 已 gate). 自实现, 不引依赖.
 */
import { useState, useEffect, useRef } from "preact/hooks";
import { results } from "../store.js";
import { AppCard } from "./AppCard.jsx";

const ROW_HEIGHT = 130;     // Card 高度 (含 gap)
const BUFFER_ROWS = 3;      // 上下多渲染几行
const COLS = 4;             // 桌面默认 4 列

export function VirtualCardGrid() {
  const scrollRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const allNames = Array.from(results.value.keys());

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    function onScroll() { setScrollTop(el.scrollTop); }
    function onResize() { setContainerHeight(el.clientHeight); }
    el.addEventListener("scroll", onScroll, { passive: true });
    setContainerHeight(el.clientHeight);
    window.addEventListener("resize", onResize);
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, []);

  const totalRows = Math.ceil(allNames.length / COLS);
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const visibleEnd = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS);
  const visibleNames = [];
  for (let r = visibleStart; r < visibleEnd; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (idx < allNames.length) visibleNames.push(allNames[idx]);
    }
  }

  const offsetY = visibleStart * ROW_HEIGHT;
  const totalHeight = totalRows * ROW_HEIGHT;

  return (
    <div class="virtual-card-scroll" ref={scrollRef}>
      <div class="virtual-card-spacer" style={{ height: `${totalHeight}px`, paddingTop: `${offsetY}px` }}>
        <div class="app-card-grid">
          {visibleNames.map((n) => <AppCard key={n} name={n} />)}
        </div>
      </div>
    </div>
  );
}

export default VirtualCardGrid;