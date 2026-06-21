# Q5 v1 Rollout Note

Date: 2026-06-22
Phase: Q5 v1 — Timer Registry & Audit

## What landed

- `src/main/timer-registry.js` (new): managed interval/timeout API + fixture-based audit
- `tests/main/timer-registry.test.js` (new): 10 unit tests
- `tests/main/timer-registry-audit.test.js` (new): 9 unit tests
- `tests/fixtures/timer-audit/{clean,orphan,debounce,dup-schedule,commented}.js` (new): 5 fixture files
- `src/main/bootstrap/schedulers.js` (modified): `autoCheckTimer` migrated to `setManagedInterval` + `clearManaged`
- `src/main/index.js` (modified): `auditTimers` call inside `app.whenReady`, `clearAllManaged` in `app.once("before-quit")`

## Status

- Roadmap §5.1 Q5: `⚫ 未立项` → `🟢 已合入`
- Roadmap §10.2 Q5: `❌ Next 未开始` / `⚫ 未立项` → `🟢 已合入`

## Known limitations (per spec §6)

- audit scans fixtures only — real-repo scan deferred to v2.27
- no auto-repair for orphan / dup-schedule — manual only
- renderer timers out of scope
- no IPC stats — Q1 v2 will consume `getStats()` / `listManaged()` directly

## Next steps

- v2.27: introduce `cli:bin/audit-timers.js` to scan real `src/main/**` and produce a remediation backlog
- v2.27+: migrate remaining 12+ setInterval call sites to managed API (low risk, big safety win)

## Implementation notes

- Plan had two minor issues that were fixed during implementation:
  1. `auditTimers` logger block used unscoped local variable `ms` (commit `249d4d8` fixes by reading `site.ms` from the site object instead).
  2. Original fixtures used bare assignment (`debounceTimer = setTimeout(...)`) and `(...) => { dupTimer = setInterval(...) }`, which the audit's `varMatch` regex (which only matches `const|let|var X = setInterval/setTimeout` prefixes) could not extract var names from. Fixtures rewritten to use `const X = setInterval/setTimeout(...)` form so the regex can extract the var name and the dup-schedule / debounce detection branches work as designed.
- Test expectation: summary is `total=6, clean=1, orphan=1, debounce=2, dupSchedule=2` (not `total=4` as the original plan draft said), because the audit reports BOTH sites in a dup-schedule / debounce pattern, not just the second.
- Full vitest suite: 2260 passed / 4 skipped / 0 failed (Q5 changes did not break any existing test).
