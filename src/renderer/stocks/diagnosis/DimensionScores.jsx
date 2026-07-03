const DIMS = [
  ["fundamental", "基本面"],
  ["valuation", "估值"],
  ["capital", "资金"],
  ["tech", "技术"],
  ["risk", "风险"],
];
const COLOR = (s) => (s == null ? "#ddd" : s >= 7 ? "#34c759" : s >= 5 ? "#007aff" : s >= 3 ? "#ff9500" : "#ff3b30");

export function DimensionScores({ scores }) {
  const dims = scores?.dimensions || {};
  return (
    <div class="dimension-scores">
      {DIMS.map(([k, label]) => {
        const s = dims[k];
        return (
          <div class="dim" key={k}>
            <div class="dim-bar" style={{ width: `${(s ?? 0) * 10}%`, background: COLOR(s) }} />
            <div class="dim-label">{label}</div>
            <div class="dim-score">{s == null ? "—" : s}</div>
          </div>
        );
      })}
    </div>
  );
}

export default DimensionScores;
