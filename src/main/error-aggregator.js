/**
 * src/main/error-aggregator.js
 *
 * Phase Q6: pure error aggregator.
 *
 * Stores one JSONL file per day under <logsDir>/errors-YYYY-MM-DD.jsonl.
 * API: createAggregator({ logsDir, retentionDays, now }) → { append, query, cleanup }
 *
 * - append(entry): resolves to { id, ts, ...entry }
 * - query({ since?, limit?, level? }): resolves to { entries, stats }
 * - cleanup(): resolves to count of removed files
 */

const fs = require('fs');
const path = require('path');

function defaultYmd(d) {
  return d.toISOString().slice(0, 10);
}

function makeId(ts, counter) {
  const d = new Date(ts);
  const ymd = defaultYmd(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `err_${ymd}_${hh}${mm}${ss}_${counter.toString(36).slice(-4)}`;
}

function deserializeSafe(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function createAggregator(opts) {
  const logsDir = opts.logsDir;
  const retentionDays = typeof opts.retentionDays === 'number' ? opts.retentionDays : 30;
  const now = opts.now || (() => Date.now());

  fs.mkdirSync(logsDir, { recursive: true });

  let writeChain = Promise.resolve();
  let counter = 0;

  function enqueueWrite(file, line) {
    const next = writeChain.then(async () => {
      try {
        await fs.promises.appendFile(file, line + '\n', 'utf-8');
      } catch (err) {
        try {
          console.error(`[error-aggregator] appendFile failed: ${err && err.message}`);
        } catch { /* swallow */ }
        throw err;
      }
    });
    writeChain = next.catch(() => {});
    return next;
  }

  async function append(input) {
    const ts = (typeof input.ts === 'number') ? input.ts : (now() instanceof Date ? now().getTime() : now());
    counter += 1;
    const id = input.id || makeId(ts, counter);
    const entry = { id, ts, ...input };
    const todayFile = path.join(logsDir, `errors-${defaultYmd(new Date(ts))}.jsonl`);
    await enqueueWrite(todayFile, JSON.stringify(entry));
    return entry;
  }

  async function query(filter = {}) {
    const { since, limit, level } = filter;
    const cap = typeof limit === 'number' && limit > 0 ? limit : Infinity;

    let files;
    try {
      files = fs.readdirSync(logsDir).filter((f) => /^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
    } catch {
      return { entries: [], stats: { total: 0, byLevel: {}, skipped: 0 } };
    }
    files.sort();

    const entries = [];
    let skipped = 0;

    outer: for (const f of files) {
      let content;
      try {
        content = fs.readFileSync(path.join(logsDir, f), 'utf-8');
      } catch {
        continue;
      }
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const parsed = deserializeSafe(line);
        if (!parsed) { skipped += 1; continue; }
        if (typeof since === 'number' && parsed.ts < since) continue;
        if (level && parsed.level !== level) continue;
        entries.push(parsed);
        if (entries.length >= cap) break outer;
      }
    }

    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const byLevel = {};
    for (const e of entries) {
      const l = e.level || 'unknown';
      byLevel[l] = (byLevel[l] || 0) + 1;
    }

    return { entries, stats: { total: entries.length, byLevel, skipped } };
  }

  async function cleanup() {
    let removed = 0;
    let files;
    try {
      files = fs.readdirSync(logsDir).filter((f) => /^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
    } catch {
      return 0;
    }
    const todayDate = (now() instanceof Date) ? now() : new Date(now());
    const cutoffMs = todayDate.getTime() - retentionDays * 86400_000;
    for (const f of files) {
      const m = f.match(/^errors-(\d{4})-(\d{2})-(\d{2})\.jsonl$/);
      if (!m) continue;
      const fileMs = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      if (fileMs < cutoffMs) {
        try {
          fs.unlinkSync(path.join(logsDir, f));
          removed += 1;
        } catch { /* swallow */ }
      }
    }
    return removed;
  }

  return { append, query, cleanup, logsDir };
}

module.exports = { createAggregator };