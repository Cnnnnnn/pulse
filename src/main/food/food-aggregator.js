/**
 * src/main/food/food-aggregator.js
 *
 * 合并高德 POI + 大众点评评分, fuzzy match 店名, 排序.
 *
 * ponytail:
 *   - fuzzy match: Levenshtein ≤ 2 OR includes — 不引入 fuzzy 库, 50 行就够.
 *     升级路径: 若未来需要更精确, 用 fast-fuzzy npm.
 *   - 排序: 默认 distance asc, 可切 rating desc (null 排最后).
 */

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 店名匹配: includes 优先 (店名带分店后缀), 否则 Levenshtein ≤ 2. */
function fuzzyMatchName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aa = String(a).toLowerCase();
  const bb = String(b).toLowerCase();
  if (aa.includes(bb) || bb.includes(aa)) return true;
  return levenshtein(aa, bb) <= 2;
}

/**
 * @param {Array<object>} pois — 高德 POI: {id, name, address, location:{lat,lng}, distance, type}
 * @param {Array<object>} ratings — 大众点评: {name, rating, reviewCount, avgPrice}
 * @param {{sortBy?: 'distance'|'rating', limit?: number, locationLabel?: string}} [opts]
 */
function mergeFoodData(pois, ratings, opts = {}) {
  const sortBy = opts.sortBy ?? "distance";
  const limit = opts.limit ?? 30;

  const merged = (pois || []).map((p) => {
    const matched = (ratings || []).find((r) => fuzzyMatchName(p.name, r.name));
    return {
      id: p.id,
      name: p.name,
      address: p.address,
      location: p.location,
      distance: p.distance,
      type: p.type,
      rating: matched ? matched.rating : null,
      reviewCount: matched ? matched.reviewCount : null,
      avgPrice: matched ? matched.avgPrice : null,
    };
  });

  merged.sort((a, b) => {
    if (sortBy === "rating") {
      const ra = a.rating == null ? -1 : a.rating;
      const rb = b.rating == null ? -1 : b.rating;
      if (ra !== rb) return rb - ra;
    }
    return a.distance - b.distance;
  });

  return {
    list: merged.slice(0, limit),
    locationLabel: opts.locationLabel ?? "",
  };
}

module.exports = { mergeFoodData, fuzzyMatchName, levenshtein };
