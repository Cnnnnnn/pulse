/**
 * 根据天天基金 FTYPE 推断持仓分类.
 *
 * Phase 5: export-only（renderer 共享，禁止 module.exports）。
 */

export const CATEGORY_LABELS: Record<string, string> = {
  stock: "股票",
  bond: "债券",
  money: "货币",
  qdii: "QDII",
  other: "其他",
};

export function inferCategoryFromFtype(ftype: any) {
  const t = String(ftype || "").toLowerCase();
  if (t.includes("货币")) return "money";
  if (t.includes("qdii")) return "qdii";
  if (
    t.includes("股票") ||
    t.includes("指数") ||
    t.includes("etf") ||
    t.includes("联接")
  )
    return "stock";
  if (t.includes("债券") || t.includes("纯债") || t.startsWith("债"))
    return "bond";
  return "other";
}

export function categoryLabel(id: any) {
  return CATEGORY_LABELS[id] || CATEGORY_LABELS.other;
}
