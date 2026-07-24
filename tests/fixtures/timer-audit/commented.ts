// tests/fixtures/timer-audit/commented.js
// The setInterval / setTimeout below is on a commented line — audit
// must skip it (not count it in total).
// const x = setInterval(() => {}, 1000);
//   setTimeout(() => {}, 2000);
const real = 42;
module.exports = { real };
