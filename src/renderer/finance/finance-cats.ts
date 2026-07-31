/**
 * src/renderer/finance/finance-cats.ts
 *
 * 渲染层财经分类辅助。分类体系 / 颜色映射的单一真源在 src/shared/finance-categories.ts。
 * 这里 re-export 供本目录组件复用，并导出分类 tab 定义（含「全部」），
 * 避免 FinanceContent 里再重复一份 CAT_TABS。
 */

import {
  FIN_CATEGORIES,
  catColorVar,
  type FinCategory,
} from "../../shared/finance-categories";
import type { SubtabItem } from "../components/SubtabList.tsx";

export { FIN_CATEGORIES, catColorVar };
export type { FinCategory };

/** 分类 tab（含「全部」）。与单一真源 FIN_CATEGORIES 一致派生，不重复枚举。 */
export const CAT_TABS: SubtabItem[] = [
  { key: "all", label: "全部" },
  ...FIN_CATEGORIES.map((c) => ({ key: c, label: c })),
];
