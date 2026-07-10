# Pulse AI Digest Drawer · UI Redesign (2026-06-09)

## Problem

The AI digest drawer (Pulse right-side panel) has accumulated6+ interaction/visual
problems across the B6/B7 refactors:

1. **No obvious "rerun" button** — the `↻` icon in drawer header is too subtle;
 users can't find a way to regenerate yesterday's digest after configuring.
2. **Provider card visual** is generic (small rectangular chips with blue border),
 not matching modern form patterns.
3. **"修改 AI 设置" footer link** has weak visual weight — looks like disabled
 text, not a real action.
4. **"重新生成中..." status banner** is faint (pale yellow background, easy
 to miss), users don't know generation is running.
5. **Inconsistent interaction rules** — `↻` button disabled while loading,
 "修改 AI 设置" link also hidden behind footer gating.
6. **Configuration form** has uppercase labels (`PROVIDER`, `MODEL`) and
 cramped inputs that look engineering-grade, not product-grade.

## Goal

Make the AI digest drawer feel like a **product-grade side panel**, not a debug
console. Specifically:
-1 obvious place to **regenerate** today's digest (primary action)
-1 visible but quieter place to **modify settings** (secondary action)
- Loading state that's **impossible to miss**
- Form that feels **native to Pulse** (consistent with other Pulse buttons)

## Design Decisions (Approved in Brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Rerun button location | **C: dual entry** — header ↻ icon + footer primary "↻重新生成" button | Users find it either way; header is fast path, footer is discoverable |
| Button hierarchy | **1: solid blue button + underline text link** | Strong visual weight diff; settings link stays visible |
| Provider card style | **2: large card radio** (◉/○ +3px blue stripe +1px border) | Hint text legible, selected state obvious |
| Drawer width | **2:480px** (current) | Balanced — not cramped, not too wide |
| Loading state | **1: top banner** (spinner + text, semi-transparent blue) | Status visible without blocking old data |
| Session card layout | **2: keep current** (just bump timestamp10→11px + summary wrap) | YAGNI — no new actions |

## Architecture

No new components. Reuse existing `<AIConfigForm />` (from AISettingsModal.jsx)
in `compact` mode. Layered structure inside `AIDigestDrawer.jsx`:

```
<aside class="ai-digest-drawer">
 ├── <header> drawer icon + title + [↻, ×] actions
 ├── <banner> loading-only: "重新生成中..."
 ├── <div class="drawer-body">
 │ ├── <AIConfigForm /> when (!enabled || configMode)
 │ └── SessionCard[]     when (enabled && digest && !configMode)
 └── <footer> timestamp + [↻重新生成] button + 修改 AI 设置 link
```

### State (store.js — existing signals, no new ones)

- `digestDrawerOpen` — drawer visibility
- `digestConfigMode` — toggles between list view and config view (re-introduced,
 was removed in B7h, needed for footer "修改 AI 设置" entry point)
- `aiSessionsEnabled` — derived from cfg (provider + key present)
- `dailyDigest` / `digestLoading` — content + loading state
- `aiSessionsConfig` / `aiKeyStatus` — form field source

## Layout

### Drawer Container (480px, unchanged)

```
┌──────────────────────────────────────────┐ ←480px wide
│ [📅] AI总结 [↻] [×]  │ ← header (52px)
│ ──────────────────────────────────────── │
│ ◐重新生成中... │ ← banner (loading only,32px)
│ ──────────────────────────────────────── │
│ │
│ (body: session cards or form) │
│ │
│ ──────────────────────────────────────── │
│ 生成于2026/6/917:55 [↻重新生成] 修改AI设置│ ← footer
└──────────────────────────────────────────┘
```

### Header actions (right → left)

1. `×` close (24×24, ghost, no border)
2. `↻` rerun (24×24, ghost; **always enabled** when configured, including loading;
 rotates with `is-spin` class when `loading=true`)
3. **No ⚙ gear button** (removed in B7h-final; entry point moved to footer link)

### Footer (dual entry — decision C +1)

```
┌────────────────────────────────────────────────────────────┐
│ 生成于2026/6/917:55:34 [↻重新生成]  修改 AI 设置 │
└────────────────────────────────────────────────────────────┘
```

- **Left**: timestamp (11px, monospace, opacity0.7)
- **Right**:
 - `↻重新生成` button — solid blue (primary), `padding:6px14px`, `border-radius:6px`,
 `font-weight:500`. **Always clickable**, including during loading (allows
 forced re-trigger).
 - `修改 AI 设置` — text link, blue underline,12px, `gap:14px` from button.
 Click sets `digestConfigMode.value = true` → body swaps to form.

### Loading Banner (decision1)

```
◐重新生成中... [×]
```

- Height32px, `background: rgba(0,122,255,0.08)`, `border-bottom:1px solid rgba(0,0,0,0.06)`
- Left: spinner (`border:2px solid #007aff; border-top-color: transparent; border-radius:50%; animation: spin0.8s linear infinite`)
- Text: "重新生成中..." (13px, color #007aff)
- Right: `×` cancel button (cancel = no-op for now; main process has no abort
 endpoint; **TODO** to add cancel IPC)
- `role="status"` `aria-live="polite"`

### Provider Cards (decision2)

```
Provider
┌──────────────────────────────────┐
│ ◉ DeepSeek │ ← selected
│ DeepSeek-V3.1 ·128K上下文 │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ ○ MiniMax │ ← unselected
│ 最新 M3 · 中文优化 │
└──────────────────────────────────┘
```

- Height ~62px, `padding:12px16px`, `border-radius:10px`
- **Unselected**: `border:1px solid rgba(0,0,0,0.12)`, background white, `○` icon
 (gray)
- **Selected**:
 - `border:1px solid #007aff`
 - `background: rgba(0,122,255,0.08)`
 - `box-shadow:001px4px rgba(0,122,255,0.15)` (subtle glow)
 - `◉` icon (blue)
 - **3px blue stripe** on left edge via `::before` (positioned absolutely,
 `left:0; top:8px; bottom:8px; width:3px; background: #007aff;
 border-radius:02px2px0`)
- Provider name13px, weight600, color `#333`
- Hint text11px, color `#999`, line-height1.3

### Form Labels (verified from B7h-final)

- **NO uppercase** (removed `text-transform: uppercase` from `.ai-settings-label`)
- `font-size:13px`, `font-weight:600`, `color: #333`
- Spacing between row elements: `gap:6px`, row margin-bottom `14px`

### Form Inputs

- `padding:9px12px`, `border-radius:8px`, `border:1px solid rgba(0,0,0,0.12)`
- Focus: `border-color: #007aff`, `box-shadow:001px2px rgba(0,122,255,0.25)`,
 `outline: none`

### Session Cards (decision2 — keep + tune)

```
┌──────────────────────────────────────────┐
│ ▌ CURSOR12:33 –11:10 ·60 msgs │
│ │
│ SFC组件提取与新 CC接入 │
│ │
│ 用户基于 'sfc-component-extraction' skill,│
│持续把 admin-component-center... │
│ │
│ 查看原始 → │
└──────────────────────────────────────────┘
```

Tuning vs current:
- timestamp10px →11px, opacity0.7
- summary font-size13px, line-height1.5, opacity0.8 (allow wrap)
- title font-weight600 (was500)
- card spacing10px →8px (slightly tighter)

App pill colors unchanged:
- cursor `#7C3AED`, codex `#10B981`, minimax-code `#F59E0B`

## Key Interaction Flows

### Cold Start (no config yet)

1. User clicks 📅 (Header) → `digestDrawerOpen = true`
2. Drawer renders: header + (no banner) + body=`<AIConfigForm />` (because `!enabled`)
3. User picks MiniMax card (radio2), fills model + base URL + API key
4. Click "保存配置" → `saveAISessionsConfig` → `aiSessionsEnabled = true` →
 `rerunDigest` (per existing AIConfigForm `onSaved` callback)
5. Drawer body swaps to session cards; banner shows "重新生成中..." while loading

### Already Configured User Wants to Change Settings

1. User clicks 📅 → drawer opens, body = session cards (B7h-final)
2. User clicks footer **"修改 AI 设置"** → `digestConfigMode = true` →
 body swaps to `<AIConfigForm />`
3. User edits provider/model/key → click "保存配置"
4. `onSaved` callback in AIConfigForm: `digestConfigMode = false` +
 `rerunDigest()` → body back to session cards

### Force Regenerate While Loading

1. User already in list view, clicks footer **"↻重新生成"** while loading is true
2. `rerunDigest` called → another `runOne()` triggers in main process (overlap
 allowed, main decides how to handle)
3. Banner keeps showing "重新生成中..." (idempotent UI)

### Modify Key While Loading (Failure Recovery)

1. Generation is running, fails with `auth_401`
2. (Existing) `showToast` shows "API key 无效,请在设置里更新"
3. User clicks footer **"修改 AI 设置"** (still clickable during loading) →
 enters form
4. User updates key → save → `rerunDigest` runs again with new key

## Implementation Targets

Files to change:

- `src/renderer/components/AIDigestBanner.jsx` — drawer body conditional logic,
 footer dual entry, banner element, header ↻ always enabled
- `src/renderer/components/AISettingsModal.jsx` — no change (compact form
 reused as-is)
- `styles.css` — `.ai-digest-drawer-banner`, `.drawer-footer-btn-primary`,
 `.drawer-footer-text-link`, `.provider-card` updates (◉/○ radio +3px stripe),
 session card tuning
- `tests/renderer/ai-digest-banner.test.jsx` — add8 new test cases
- (No main process changes — all state/logic lives in renderer; main
 cancel-rerun IPC is **deferred** with TODO comment)

## Testing

### Existing tests (keep)

36 cases in `ai-digest-banner.test.jsx` (B7h-final):
- Button mount, drawer open/close, session card structure
- B7h config mode (footer link, drawer-footer-btn selector)
- Compact mode backfill button gating
- rerun `disabled=!enabled` (not loading)

### New tests (add8)

1. Footer dual entry: enabled state shows both "↻重新生成" button and
 "修改 AI 设置" text link in correct visual order (button first, link after)
2. Click footer "↻重新生成" → `onRerun` callback fires
3. Click footer "修改 AI 设置" → `digestConfigMode=true`, drawer-body has
 `.ai-config-form`, session cards hidden
4. Loading=true → banner element rendered with `.ai-digest-drawer-banner`
 class, has `role="status"` `aria-live="polite"`
5. Loading=true → footer rerun button **still** has `disabled=false`
 (forced re-trigger works)
6. Loading=true → footer "修改 AI 设置" link **still** clickable, transitions
 to config mode
7. Provider cards use radio semantics: `.provider-card.selected` has `◉` symbol,
 unselected has `○` symbol (use `textContent` contains check)
8. Provider card click → switch from DeepSeek to MiniMax → model input value
 becomes `MiniMax-M3` (auto-fills default model)

### Manual QA checklist

1. Fresh install → open drawer → form shows directly (no needs-setup placeholder)
2. Fill MiniMax key → save → auto rerun → cards display
3. List state → click footer "↻重新生成" → banner appears, content stays
4. Loading state → click footer "修改 AI 设置" → enters form, can change key
5. Change key, save → auto rerun → cards update
6. ESC closes drawer; `×` closes drawer; overlay click closes drawer

## Error Handling

Reuse existing handlers, no new ones:

- `rerunDigest` failure (auth/network): `showToast` (existing B7b.1)
- `saveAISessionsConfig` failure: form status row shows error (existing)
- `setAIKey` failure (safeStorage unavailable): form hint shows warning (existing)
- Health check failure: `.ai-settings-test-result.fail` displays reason (existing)

## Accessibility

- All buttons: `aria-label` complete (header ↻/×, footer buttons, banner ×)
- Drawer: `role="dialog"` `aria-label="AI总结"` `aria-hidden={!open}`
- Form inputs: label associated
- Loading banner: `role="status"` `aria-live="polite"`

## Out of Scope

- **Cancel rerun** — main process has no abort endpoint for in-flight
 `runOne()`; TODO comment in code, deferred until main-side IPC is added
- **Multiple simultaneous reruns** — overlapping calls allowed; main handles
 serialization (already in `wiring.js`)
- **Drawer position / drag** — fixed right edge, no resize
- **Mobile / narrow screen** — Pulse is macOS menubar app only

## Open Questions

None — all design decisions approved in brainstorming.
