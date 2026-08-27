/** 热映里按评分取今晚值得看；无评分的排最后。 */
export function pickTonightMovies(list: any[], n = 3): any[] {
  if (!Array.isArray(list) || n <= 0) return [];
  return [...list]
    .sort((a, b) => {
      const ra = typeof a?.rating === "number" ? a.rating : -1;
      const rb = typeof b?.rating === "number" ? b.rating : -1;
      return rb - ra;
    })
    .slice(0, Math.min(n, list.length));
}
