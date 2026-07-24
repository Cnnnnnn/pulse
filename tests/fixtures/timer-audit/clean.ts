// tests/fixtures/timer-audit/clean.js
// Pattern: setInterval followed by a clearInterval within 50 lines.
const cleanTimer = setInterval(() => {
  // do work
}, 60000);

function stopClean() {
  clearInterval(cleanTimer);
}

module.exports = { stopClean };
