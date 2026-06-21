// tests/fixtures/timer-audit/orphan.js
// Pattern: setInterval with NO clearInterval — expected to be flagged orphan.
const orphanTimer = setInterval(() => {
  // leaks forever
}, 30000);

module.exports = { orphanTimer };
