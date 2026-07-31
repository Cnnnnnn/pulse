/**
 * src/shared/finance-categories.ts
 *
 * 财经分类体系 — 单一真源（renderer + main 共用）。
 * 之前分类列表在 main/config.ts、renderer 的 CAT_TABS 两处重复，
 * 分类色在 CSS 里用 [data-cat="..."] 逐条枚举 —— 三者极易漂移。
 * 现统一在此：
 *   - FIN_CATEGORIES / FinCategory：分类取值唯一真源；
 *   - CAT_COLOR_VAR / catColorVar：分类 → CSS 颜色变量名映射；
 *   - 组件改用内联 `--cat: var(<映射>)` 自定义属性，CSS 只需 `var(--cat, var(--cat-other))`，
 *     新增分类只需在此补一对，无需改 CSS / 无需改主进程 / 无需改列表 tab。
 */

export type FinCategory = "股市" | "基金" | "债券" | "宏观" | "全球";

export const FIN_CATEGORIES: FinCategory[] = [
  "股市",
  "基金",
  "债券",
  "宏观",
  "全球",
];

/** 分类 → CSS 颜色变量名（变量本身定义在 styles.css 中）。 */
export const CAT_COLOR_VAR: Record<string, string> = {
  "股市": "--cat-stock",
  "基金": "--cat-fund",
  "债券": "--cat-bond",
  "宏观": "--cat-macro",
  "全球": "--cat-qdii",
};

/** 未知 / 缺省分类的回退色。 */
export const CAT_COLOR_VAR_DEFAULT = "--cat-other";

/** 解析某分类对应的 CSS 颜色变量名（带回退）。 */
export function catColorVar(cat?: string): string {
  return (cat && CAT_COLOR_VAR[cat]) || CAT_COLOR_VAR_DEFAULT;
}
