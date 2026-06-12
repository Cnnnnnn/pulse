/**
 * 根据天天基金 FTYPE 推断持仓分类.
 */

const CATEGORY_LABELS = {
  stock: "股票",
  bond: "债券",
  money: "货币",
  qdii: "QDII",
  other: "其他",
};

function inferCategoryFromFtype(ftype) {
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

function categoryLabel(id) {
  return CATEGORY_LABELS[id] || CATEGORY_LABELS.other;
}

module.exports = { inferCategoryFromFtype, categoryLabel, CATEGORY_LABELS };
