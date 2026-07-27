/**
 * tests/_setup/mock-react-virtuoso.ts
 *
 * 全局 mock react-virtuoso 的 TableVirtuoso / Virtuoso 为简单透传组件.
 *
 * 背景 (vitest 4 + vite 8 升级):
 *   react-virtuoso 是 React 编写的虚拟滚动库, 内部大量用 hooks (useReducer 等).
 *   在 vitest 4 + vite 8 + preact/compat 下, hooks 解析出现双实例问题 (preact/hooks
 *   被加载两次), 报 "Cannot read properties of undefined (reading '__H')".
 *
 *   happy-dom 测试环境本来就没有真实 viewport / scroll, react-virtuoso 的虚拟滚动
 *   在这里也没意义 — 测试只关心渲染出来的 DOM 结构. 直接 mock 成透传组件更稳定.
 *
 * 仅影响测试, 不影响 production bundle (production 走 esbuild 不经 vitest).
 */
import { vi } from "vitest";
import { h } from "preact";

// ponytail: TableVirtuoso 的 props 含 totalCount / data / itemContent / components 等.
//   测试只关心 children 渲染. 简单实现: 用一个 <div> 包所有 itemContent 输出.
vi.mock("react-virtuoso", () => ({
  TableVirtuoso: (props: any) => {
    const { data, totalCount, itemContent: ItemContent, components, fixedHeaderContent, ...rest } = props || {};
    const items = Array.isArray(data)
      ? data
      : Array.from({ length: typeof totalCount === "number" ? totalCount : 0 });
    const Table = components?.Table || ((p: any) => h("table", { class: "ai-lb-table", ...p }));
    const TableHead = components?.TableHead || ((p: any) => h("thead", p));
    const TableBody = components?.TableBody || ((p: any) => h("tbody", p));
    const TableRow = components?.TableRow || ((p: any) => h("tr", p));
    // fixedHeaderContent 可能是 JSX 元素也可能是 function 返回 JSX
    const headerContent = typeof fixedHeaderContent === "function" ? fixedHeaderContent() : fixedHeaderContent;
    return h(Table, rest,
      headerContent ? h(TableHead, {}, headerContent) : null,
      h(TableBody, {},
        items.map((item, idx) =>
          h(TableRow, { key: idx },
            // react-virtuoso itemContent 签名: (index, item) => ReactNode
            ItemContent ? ItemContent(idx, item) : null,
          ),
        ),
      ),
    );
  },
  Virtuoso: (props: any) => {
    const { data, totalCount, itemContent: ItemContent, ...rest } = props || {};
    const items = Array.isArray(data)
      ? data
      : Array.from({ length: typeof totalCount === "number" ? totalCount : 0 });
    return h(
      "div",
      { class: "virtuoso-mock", ...(rest as any) },
      items.map((item, idx) =>
        ItemContent ? h(ItemContent, { index: idx, item }) : null,
      ),
    );
  },
  VirtuosoHandle: {},
}));
