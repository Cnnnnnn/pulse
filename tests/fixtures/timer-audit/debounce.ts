// tests/fixtures/timer-audit/debounce.js
// Pattern: setTimeout assigned to same var multiple times (debounce).
// Each assignment uses `const X = setTimeout(...)` form so the audit's
// varMatch regex can extract the var name; without that prefix the
// site is anonymous and falls through to the orphan branch.
//
// To exercise the debounce branch (same var name ≥2 setTimeout sites
// in the file) we declare two consts with the same name in different
// scopes — wait, that's not how the audit counts sites. The audit
// counts ALL sites in the file with the same var name. The fixture
// uses one `debounceTimer` var name across two functions.

function schedule(fn) {
  const debounceTimer = setTimeout(fn, 200);
  return debounceTimer;
}

function scheduleLater(fn, ms) {
  const debounceTimer = setTimeout(fn, ms);
  return debounceTimer;
}
module.exports = { schedule, scheduleLater };
