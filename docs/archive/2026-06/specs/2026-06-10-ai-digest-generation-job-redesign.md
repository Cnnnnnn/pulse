# AI Digest Generation Job Redesign

Date: 2026-06-10
Status: Draft for user review

## Problem

The current AI digest flow grew through several UI and behavior patches. It now mixes three different concepts into one `digest` object:

- the full list of sessions available for a day
- the subset selected for one generation
- the generated summary result

That coupling caused visible product failures:

- selecting one session could make the rest of the sessions disappear after generation
- clicking regenerate could appear to do nothing because no durable job state existed
- generated summaries could be hard to trust because output formatting was enforced mostly by prompt text and cleanup
- failure cases such as missing config, auth errors, network failures, and malformed LLM output were not represented as first-class UI states
- future history support would be difficult because a date only had one mutable digest result

The redesign should treat AI digest generation as a trackable job system rather than a single mutable daily blob.

## Goals

- Keep the full session catalog stable, regardless of which sessions are selected for a generation.
- Represent every generation attempt as a durable job with status, selected session ids, model config, progress, result, and error.
- Show immediate UI feedback when a generation starts.
- Store enough history to debug and later expose previous generations.
- Produce per-session structured Chinese summaries with consistent fields.
- Migrate existing `daily_digests` safely without breaking rollback.

## Non-Goals

- Build a full generation history browser in the first implementation pass.
- Add prompt editing or user-custom templates.
- Add streaming token-level LLM output.
- Change detector implementations beyond what is needed to populate the catalog.
- Remove legacy `daily_digests` storage immediately.

## Proposed Data Model

Introduce `daily_digest_v2` in state storage:

```js
daily_digest_v2: {
  [dateKey]: {
    dateKey: "2026-06-10",
    catalog: {
      collectedAt: 1780000000000,
      sessions: [
        {
          sessionId: "session-id",
          appName: "codex",
          startedAt: 1780000000000,
          endedAt: 1780000300000,
          msgCount: 10,
          title: "Task 1 Spec Review",
          jumpTarget: "codex://..."
        }
      ]
    },
    generations: [
      {
        id: "gen_1780000400000_abcd",
        createdAt: 1780000400000,
        startedAt: 1780000400000,
        finishedAt: 1780000500000,
        status: "success",
        selectedSessionIds: ["session-id"],
        provider: "minimax",
        model: "MiniMax-M3",
        results: [
          {
            sessionId: "session-id",
            title: "检查规格实现",
            userGoal: "用户希望核对 Task 1 的实现是否符合指定 spec。",
            outcome: "检查发现脚本分隔符不符合要求，其余测试接入基本匹配。",
            rawText: "### Session 1: ..."
          }
        ],
        error: null
      }
    ],
    activeGenerationId: "gen_1780000400000_abcd"
  }
}
```

The catalog is the source of truth for selectable sessions. A generation result never replaces or shrinks it.

## Status Model

Generation jobs use these statuses:

- `queued`: job was created and persisted but summarization has not started yet
- `running`: LLM calls are in progress
- `success`: all selected sessions completed
- `partial_success`: some sessions completed and some failed
- `failed`: no selected sessions completed
- `canceled`: reserved for a later cancel button

Error codes:

- `missing_config`
- `auth_failed`
- `network_failed`
- `llm_format_invalid`
- `session_read_failed`
- `no_selected_sessions`
- `unknown`

Each job stores `error` at the job level. Individual result entries may also store per-session error metadata when the job is `partial_success`.

## Main Process Flow

### Catalog

Add or rename the current preview behavior into a catalog API:

```js
ai-sessions:get-catalog(dateKey)
```

This endpoint:

- collects sessions through detectors
- maps detector sessions into compact catalog cards
- saves `daily_digest_v2[dateKey].catalog`
- returns the catalog without triggering LLM summarization

The renderer should call this when the drawer opens or when the user refreshes the available sessions.

### Create Generation

Replace `ai-sessions:rerun` as the primary path with:

```js
ai-sessions:create-generation({ dateKey, selectedSessionIds })
```

The handler should:

1. Validate config and selected ids.
2. Ensure a catalog exists for the date.
3. Create a generation with status `queued`.
4. Persist the generation immediately.
5. Emit `ai-digest-job-updated`.
6. Run per-session summarization.
7. Update progress after each session.
8. Persist final `success`, `partial_success`, or `failed`.
9. Emit the final `ai-digest-job-updated`.

The existing `ai-sessions:rerun` IPC can remain as a compatibility wrapper that calls `create-generation`.

### Summarization Output

The LLM prompt should request this fixed shape for each session:

```md
### Session <N>: <中文标题>
- 用户诉求：<目标>
- 处理结果：<结果>
```

The parser should convert that text into structured fields:

```js
{
  title,
  userGoal,
  outcome,
  rawText
}
```

The UI should render `userGoal` and `outcome`, not raw markdown. `rawText` is kept for debugging and export.

## Renderer Flow

The drawer should read three things separately:

- `catalog`: complete list of selectable sessions
- `activeGeneration`: latest or selected generation job
- `generationStatus`: whether a job is queued, running, complete, or failed

Layout:

- Header: date, app count, session count, provider/model, latest job status
- Selection section: complete catalog grouped by app, collapsed by default
- Result section: active generation results, one result card per session
- Footer: primary generate button, settings link, and concise status text

Clicking generate should immediately create local pending UI state. Once IPC returns the persisted job, renderer uses that job id as the active generation.

## Migration

On load, if `daily_digest_v2[dateKey]` does not exist but `daily_digests[dateKey]` exists:

1. Create `daily_digest_v2[dateKey]`.
2. Rebuild catalog from detectors rather than trusting old digest sessions as the catalog.
3. Convert the old digest into one legacy generation:

```js
{
  id: "legacy_<dateKey>",
  status: "success",
  selectedSessionIds: oldDigest.sessionIds || [],
  provider: oldDigest.provider,
  model: oldDigest.model,
  results: parsed old sessions when available,
  error: null,
  legacy: true
}
```

Do not delete `daily_digests` in this pass.

## Testing Strategy

Backend tests:

- catalog collection saves all sessions for a date
- selected generation only summarizes selected ids
- selected generation does not mutate catalog sessions
- job status is persisted before LLM calls start
- success, partial success, and failed states are represented correctly
- legacy digest converts into a v2 generation

Renderer tests:

- drawer uses catalog for selection even after a one-session generation
- generate button immediately shows running state
- active generation result renders separately from selection cards
- failed job displays an actionable error message
- old digest still renders through migration data

IPC tests:

- `create-generation` returns a job id quickly enough for UI state
- progress events update the active job
- compatibility `rerun` calls the new generation path

## Implementation Phases

### Phase 1: Data and IPC

- Add `daily_digest_v2` state helpers.
- Add catalog and generation job storage helpers.
- Add `get-catalog` and `create-generation` IPC handlers.
- Keep `rerun` as compatibility wrapper.
- Add migration helper from legacy digest.

### Phase 2: Runner Refactor

- Split `DailyDigestRunner.runOne()` into smaller operations:
  - collect catalog
  - create generation
  - summarize one selected session
  - finalize generation
- Return structured per-session results.
- Preserve `rawText` for debugging.

### Phase 3: Renderer Refactor

- Replace drawer's mixed `digest` source with separate `catalog` and `activeGeneration` state.
- Keep session groups collapsed by default.
- Render generated results only from active generation results.
- Make failure and partial success states visible.

### Phase 4: Cleanup

- Reduce old `dailyDigest` state usage.
- Keep read-only compatibility for old `daily_digests`.
- Remove prompt-format assumptions from UI rendering.
- Update release notes after behavior is verified.

## Open Decisions

- History UI is data-backed in phase 1 but not visible beyond latest generation.
- Cancel support is reserved by the status model but not implemented initially.
- Export format remains out of scope for this redesign.

