// tests/fixtures/timer-audit/dup-schedule.js
// Pattern: same var setInterval'd twice with no clear between.
// First call has no clear, second call also has no clear before it
// reassigns — flagged as dup-schedule.
//
// Note: we use `const X = setInterval(...)` form (not bare `X = ...`)
// so the audit's varMatch regex can extract the var name; otherwise
// the site is anonymous and falls through to the orphan branch.

const startFirst = () => {
  const dupTimer = setInterval(() => {}, 5000);
  return dupTimer;
};
const startSecond = () => {
  // No clearInterval before reassign — leak.
  const dupTimer = setInterval(() => {}, 10000);
  return dupTimer;
};
module.exports = { startFirst, startSecond };
