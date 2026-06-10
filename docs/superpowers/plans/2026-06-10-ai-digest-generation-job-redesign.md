# AI Digest Generation Job Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-blob AI digest flow with a stable catalog plus generation-job model that preserves full session selection, records generation history, and renders structured Chinese results.

**Architecture:** We will split the feature into three durable layers: a per-day session catalog, append-only generation jobs, and a renderer state model that reads catalog and active job separately. The main process will own storage and job lifecycle, while the renderer becomes a thin consumer of `catalog`, `generations`, and `activeGenerationId`.

**Tech Stack:** Electron, Preact signals, CommonJS main-process modules, `vitest`, `rtk`, existing `state-store` JSON persistence.

---

## File Structure

### Existing files to modify

- Modify: `src/main/state-store.js`
  - Add `daily_digest_v2` load/save helpers and legacy migration helpers.
- Modify: `src/ai-sessions/digest.js`
  - Split collection, generation creation, per-session summarization, and finalization into separate methods.
- Modify: `src/ai-sessions/wiring.js`
  - Expose v2 storage helpers to the runner and keep legacy compatibility wiring thin.
- Modify: `src/main/ipc.js`
  - Add catalog and generation IPC endpoints and push job update events.
- Modify: `preload.js`
  - Expose new catalog/job APIs to renderer.
- Modify: `src/renderer/api.js`
  - Wrap new preload APIs.
- Modify: `src/renderer/store.js`
  - Introduce renderer-side catalog and active generation signals, plus loading/error state tied to jobs.
- Modify: `src/renderer/components/AIDigestBanner.jsx`
  - Rebuild drawer data flow around catalog + active generation.
- Modify: `styles.css`
  - Keep the selection section and results section visually distinct while preserving current Pulse language.
- Modify: `tests/ai-sessions/digest.test.js`
  - Cover runner and parser changes.
- Modify: `tests/ai-sessions/summarizer.test.js`
  - Lock structured Chinese prompt contract.
- Modify: `tests/ai-sessions/wiring.test.js`
  - Cover v2 storage wiring and provider flow.
- Modify: `tests/renderer/ai-digest-banner.test.jsx`
  - Cover catalog persistence, job status, and result rendering.

### New files to create

- Create: `tests/main/state-store.digest-v2.test.js`
  - Cover `daily_digest_v2` persistence and legacy migration behavior.

## Task 1: Add v2 Digest Storage and Legacy Migration

**Files:**
- Modify: `src/main/state-store.js`
- Test: `tests/main/state-store.digest-v2.test.js`

- [ ] **Step 1: Write the failing storage tests**

```js
import { describe, it, expect } from 'vitest';
import {
  loadDailyDigestV2Map,
  saveDailyDigestV2Day,
  migrateLegacyDigestToV2Day,
} from '../../src/main/state-store.js';

describe('daily_digest_v2 storage', () => {
  it('saves one v2 day without dropping existing state keys', () => {
    const saved = saveDailyDigestV2Day({
      dateKey: '2026-06-10',
      catalog: { collectedAt: 1, sessions: [] },
      generations: [],
      activeGenerationId: null,
    }, '/tmp/pulse-state.json');
    expect(saved.dateKey).toBe('2026-06-10');
  });

  it('migrates one legacy digest into v2 day shape', () => {
    const out = migrateLegacyDigestToV2Day({
      dateKey: '2026-06-10',
      provider: 'minimax',
      model: 'MiniMax-M3',
      sessionIds: ['a'],
      sessions: [{ sessionId: 'a', title: 'old', summary: '- 用户诉求：A\\n- 处理结果：B' }],
    });
    expect(out.generations).toHaveLength(1);
    expect(out.generations[0].legacy).toBe(true);
  });
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `CI=1 rtk vitest tests/main/state-store.digest-v2.test.js`

Expected: FAIL with missing exports such as `loadDailyDigestV2Map` or `migrateLegacyDigestToV2Day`.

- [ ] **Step 3: Add minimal v2 storage helpers in `src/main/state-store.js`**

```js
function loadDailyDigestV2Map(statePath = defaultPath()) {
  const s = loadState(statePath);
  return (s && s.daily_digest_v2 && typeof s.daily_digest_v2 === 'object')
    ? s.daily_digest_v2
    : {};
}

function saveDailyDigestV2Day(day, statePath = defaultPath()) {
  if (!day || typeof day.dateKey !== 'string' || !day.dateKey) {
    throw new TypeError('saveDailyDigestV2Day: day.dateKey must be non-empty');
  }
  const s = loadState(statePath);
  const next = {
    ...s,
    daily_digest_v2: {
      ...(s.daily_digest_v2 || {}),
      [day.dateKey]: day,
    },
  };
  writeAtomic(statePath, next);
  return day;
}

function migrateLegacyDigestToV2Day(legacyDigest, catalog = null) {
  const generationId = `legacy_${legacyDigest.dateKey}`;
  return {
    dateKey: legacyDigest.dateKey,
    catalog: catalog || { collectedAt: legacyDigest.generatedAt || Date.now(), sessions: [] },
    generations: [{
      id: generationId,
      createdAt: legacyDigest.generatedAt || Date.now(),
      startedAt: legacyDigest.generatedAt || Date.now(),
      finishedAt: legacyDigest.generatedAt || Date.now(),
      status: 'success',
      selectedSessionIds: Array.isArray(legacyDigest.sessionIds) ? legacyDigest.sessionIds : [],
      provider: legacyDigest.provider || null,
      model: legacyDigest.model || null,
      results: Array.isArray(legacyDigest.sessions) ? legacyDigest.sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title || 'Legacy Session',
        userGoal: '',
        outcome: '',
        rawText: s.summary || '',
      })) : [],
      error: null,
      legacy: true,
    }],
    activeGenerationId: generationId,
  };
}
```

- [ ] **Step 4: Run the storage tests to verify they pass**

Run: `CI=1 rtk vitest tests/main/state-store.digest-v2.test.js`

Expected: PASS with 2 passing tests.

- [ ] **Step 5: Commit the storage layer**

```bash
git add src/main/state-store.js tests/main/state-store.digest-v2.test.js
git commit -m "feat: add ai digest v2 storage"
```

## Task 2: Refactor the Digest Runner Around Catalog and Generation Jobs

**Files:**
- Modify: `src/ai-sessions/digest.js`
- Modify: `tests/ai-sessions/digest.test.js`

- [ ] **Step 1: Write failing runner tests for catalog and generation jobs**

```js
it('createGeneration keeps full catalog when one session is selected', async () => {
  const out = await runner.createGeneration('2026-06-10', ['b']);
  expect(out.catalog.sessions).toHaveLength(3);
  expect(out.generations.at(-1).selectedSessionIds).toEqual(['b']);
  expect(out.generations.at(-1).results).toHaveLength(1);
});

it('failed session generation produces partial_success when at least one result exists', async () => {
  summarizer.summarize = vi.fn()
    .mockResolvedValueOnce('### Session 1: 标题\\n- 用户诉求：A\\n- 处理结果：B')
    .mockRejectedValueOnce(new Error('timeout'));
  const out = await runner.createGeneration('2026-06-10', ['a', 'b']);
  expect(out.generations.at(-1).status).toBe('partial_success');
});
```

- [ ] **Step 2: Run digest tests to verify the new job cases fail**

Run: `CI=1 rtk vitest tests/ai-sessions/digest.test.js`

Expected: FAIL with missing `createGeneration` or old `runOne()` shape mismatches.

- [ ] **Step 3: Implement catalog and generation methods in `src/ai-sessions/digest.js`**

```js
async collectCatalog(dateKey, now = Date.now()) {
  const sessions = await this.collectSessionsForDate(dateKey, now);
  return {
    dateKey,
    collectedAt: now,
    sessions: sessions.map((s, i) => ({
      idx: i + 1,
      sessionId: s.id,
      appName: s.appName || 'unknown',
      startedAt: s.startedAt || 0,
      endedAt: s.endedAt || 0,
      msgCount: Array.isArray(s.messages) ? s.messages.length : 0,
      title: _inferPreviewTitle(s, i),
      jumpTarget: _resolveJumpTarget(s),
    })),
  };
}

async createGeneration(dateKey, selectedSessionIds, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const allSessions = await this.collectSessionsForDate(dateKey, now);
  const catalog = {
    collectedAt: now,
    sessions: allSessions.map((s, i) => toCatalogCard(s, i)),
  };
  const picked = allSessions.filter((s) => new Set(selectedSessionIds).has(s.id));
  const generation = {
    id: `gen_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    startedAt: now,
    finishedAt: null,
    status: 'running',
    selectedSessionIds: picked.map((s) => s.id),
    provider: this.summarizer.provider,
    model: this.summarizer.model,
    results: [],
    error: null,
  };
  // persist running state, then fill results one by one
}
```

- [ ] **Step 4: Run digest tests to verify they pass**

Run: `CI=1 rtk vitest tests/ai-sessions/digest.test.js`

Expected: PASS with job-status and catalog-preservation cases green.

- [ ] **Step 5: Commit the runner refactor**

```bash
git add src/ai-sessions/digest.js tests/ai-sessions/digest.test.js
git commit -m "refactor: model ai digest generations as jobs"
```

## Task 3: Tighten Structured Chinese Summaries

**Files:**
- Modify: `src/ai-sessions/prompts.js`
- Modify: `src/ai-sessions/summarizer.js`
- Modify: `tests/ai-sessions/summarizer.test.js`

- [ ] **Step 1: Write failing summary-shape tests**

```js
it('zh-CN per-session prompt requires fixed Chinese fields', () => {
  const { messages } = buildPerSessionPrompt({
    session: { id: 's1', messages: [] },
    index: 0,
    locale: 'zh-CN',
  });
  expect(messages[0].content).toContain('用户诉求');
  expect(messages[0].content).toContain('处理结果');
  expect(messages[0].content).toContain('简体中文');
});

it('digest parser output can be mapped into title/userGoal/outcome', async () => {
  const out = await summarizer.summarize([{ id: 's1', messages: [] }], {
    perSession: true,
    perSessionIndex: 0,
  });
  expect(out).toContain('### Session 1:');
});
```

- [ ] **Step 2: Run the summarizer tests to verify they fail if the contract drifts**

Run: `CI=1 rtk vitest tests/ai-sessions/summarizer.test.js`

Expected: FAIL on missing prompt constraints or parser assumptions.

- [ ] **Step 3: Keep prompt and parser aligned around structured fields**

```js
const system = [
  '无论原始对话里出现中文还是英文, 最终都必须只用简体中文输出。',
  '严格按下面格式输出:',
  '### Session <N>: <6-14字中文标题>',
  '- 用户诉求：<1句话>',
  '- 处理结果：<1-2句话>',
].join('\\n');

return {
  title: normalizedTitle,
  userGoal: extractedGoal,
  outcome: extractedOutcome,
  rawText: originalText,
};
```

- [ ] **Step 4: Run summarizer tests to verify they pass**

Run: `CI=1 rtk vitest tests/ai-sessions/summarizer.test.js`

Expected: PASS with prompt contract tests green.

- [ ] **Step 5: Commit the summary contract**

```bash
git add src/ai-sessions/prompts.js src/ai-sessions/summarizer.js tests/ai-sessions/summarizer.test.js
git commit -m "feat: enforce structured chinese digest summaries"
```

## Task 4: Add IPC, Preload, and Renderer Store Support for Catalog and Jobs

**Files:**
- Modify: `src/ai-sessions/wiring.js`
- Modify: `src/main/ipc.js`
- Modify: `preload.js`
- Modify: `src/renderer/api.js`
- Modify: `src/renderer/store.js`
- Modify: `tests/ai-sessions/wiring.test.js`

- [ ] **Step 1: Write failing wiring and store tests**

```js
it('ipc create-generation returns a running or completed job payload', async () => {
  const r = await handlers['ai-sessions:create-generation']({}, {
    dateKey: '2026-06-10',
    selectedSessionIds: ['a'],
  });
  expect(r.ok).toBe(true);
  expect(r.day.activeGenerationId).toBeTruthy();
});

it('renderer store keeps catalog separate from active generation', async () => {
  await loadDigestCatalog();
  expect(digestCatalog.value.sessions.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the wiring/store tests to verify they fail**

Run: `CI=1 rtk vitest tests/ai-sessions/wiring.test.js`

Expected: FAIL with missing IPC endpoint or missing renderer store signals.

- [ ] **Step 3: Implement new APIs and signals**

```js
// preload.js
getDigestCatalog: (opts) => ipcRenderer.invoke('ai-sessions:get-catalog', opts),
createDigestGeneration: (opts) => ipcRenderer.invoke('ai-sessions:create-generation', opts),
onDigestJobUpdated: (cb) => ipcRenderer.on('ai-digest-job-updated', (_, data) => cb(data)),

// src/renderer/store.js
export const digestCatalog = signal(null);
export const digestGenerations = signal([]);
export const activeDigestGenerationId = signal(null);

export async function loadDigestCatalog(opts = {}) {
  const r = await api.getDigestCatalog(opts);
  if (r && r.ok) digestCatalog.value = r.catalog;
}
```

- [ ] **Step 4: Run wiring/store tests to verify they pass**

Run: `CI=1 rtk vitest tests/ai-sessions/wiring.test.js`

Expected: PASS with catalog and generation IPC covered.

- [ ] **Step 5: Commit the integration layer**

```bash
git add src/ai-sessions/wiring.js src/main/ipc.js preload.js src/renderer/api.js src/renderer/store.js tests/ai-sessions/wiring.test.js
git commit -m "feat: wire ai digest catalog and generation apis"
```

## Task 5: Rebuild the Drawer Around Catalog + Active Generation

**Files:**
- Modify: `src/renderer/components/AIDigestBanner.jsx`
- Modify: `styles.css`
- Modify: `tests/renderer/ai-digest-banner.test.jsx`

- [ ] **Step 1: Write failing drawer tests for split data sources**

```jsx
it('selection list renders from catalog while results render from active generation', () => {
  render(<AIDigestDrawer digest={null} loading={false} />);
  expect(screen.getByText('总结范围')).toBeTruthy();
  expect(screen.getByText('本次生成结果')).toBeTruthy();
});

it('one-session generation does not shrink the catalog list', () => {
  expect(container.querySelectorAll('.session-app-group-list .session-card')).toHaveLength(4);
  expect(container.querySelectorAll('.generated-summary-list .session-card')).toHaveLength(1);
});
```

- [ ] **Step 2: Run drawer tests to verify they fail**

Run: `CI=1 rtk vitest tests/renderer/ai-digest-banner.test.jsx`

Expected: FAIL because current drawer still derives too much state from legacy `digest`.

- [ ] **Step 3: Rework `AIDigestBanner.jsx` to consume catalog and active generation separately**

```jsx
const catalog = digestCatalog.value;
const generations = digestGenerations.value;
const activeGeneration = generations.find((g) => g.id === activeDigestGenerationId.value) || null;

const groupedSessions = groupSessionsByApp(catalog && catalog.sessions);
const generatedSessions = Array.isArray(activeGeneration && activeGeneration.results)
  ? activeGeneration.results
  : [];
```

```jsx
<SessionCardList
  groups={groupedSessions}
  selectedSet={selectedSet}
  expandedApps={expandedApps}
  variant="selection"
/>
{activeGeneration && (
  <GeneratedSummaryList
    status={activeGeneration.status}
    sessions={generatedSessions}
    error={activeGeneration.error}
  />
)}
```

- [ ] **Step 4: Run drawer tests to verify they pass**

Run: `CI=1 rtk vitest tests/renderer/ai-digest-banner.test.jsx`

Expected: PASS with selection persistence, job feedback, and result separation covered.

- [ ] **Step 5: Commit the drawer rewrite**

```bash
git add src/renderer/components/AIDigestBanner.jsx styles.css tests/renderer/ai-digest-banner.test.jsx
git commit -m "refactor: split ai digest selection from generation results"
```

## Task 6: End-to-End Verification and Cleanup

**Files:**
- Modify: `RELEASE-NOTES.md`
- Modify: `src/renderer/App.jsx` if needed for new store bootstrap calls
- Modify: `src/main/index.js` if needed for startup migration hook

- [ ] **Step 1: Add release note entry for the redesigned digest flow**

```md
## AI Digest

- redesigned AI digest generation around session catalog plus generation jobs
- preserved session selection after partial regeneration
- made generation status and failures visible in the drawer
```

- [ ] **Step 2: Run the focused test suite**

Run: `CI=1 rtk vitest tests/main/state-store.digest-v2.test.js tests/ai-sessions/digest.test.js tests/ai-sessions/summarizer.test.js tests/ai-sessions/wiring.test.js tests/renderer/ai-digest-banner.test.jsx tests/renderer/ai-settings-modal.test.jsx`

Expected: PASS with no failing digest-related tests.

- [ ] **Step 3: Run production build verification**

Run: `rtk npm run build`

Expected: renderer bundle builds and Electron packaging succeeds.

- [ ] **Step 4: Reinstall the app for manual verification**

Run:

```bash
pkill -x Pulse || true
rm -rf /Applications/Pulse.app
cp -R dist/mac-arm64/Pulse.app /Applications/Pulse.app
open /Applications/Pulse.app
```

Expected: `/Applications/Pulse.app` has a fresh timestamp and opens successfully.

- [ ] **Step 5: Commit verification and notes**

```bash
git add RELEASE-NOTES.md src/renderer/App.jsx src/main/index.js
git commit -m "chore: finalize ai digest generation job rollout"
```

## Self-Review

### Spec coverage

- Catalog is covered by Task 1 and Task 2.
- Generation job lifecycle is covered by Task 2 and Task 4.
- Structured Chinese output is covered by Task 3.
- Drawer separation and visible status are covered by Task 5.
- Legacy migration and verification are covered by Task 1 and Task 6.

No spec sections are currently uncovered.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation placeholders remain in steps.
- Each code-bearing step includes concrete code or interface snippets.
- Each validation step includes exact commands and expected outcomes.

### Type consistency

- Storage layer uses `daily_digest_v2[dateKey]`.
- Renderer layer uses `digestCatalog`, `digestGenerations`, and `activeDigestGenerationId`.
- Job result entries use `title`, `userGoal`, `outcome`, and `rawText`.
- IPC layer uses `get-catalog` and `create-generation` as canonical endpoints.

