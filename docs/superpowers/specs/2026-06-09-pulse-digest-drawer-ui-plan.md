# Pulse AI Digest Drawer · Implementation Plan

> Generated from spec `2026-06-09-pulse-digest-drawer-ui-design.md`.
> Brainstorming → writing-plans. Tasks ordered by dependency; each task is small
> enough to implement and test independently.

## Tasks (8 total)

### Task1 · Add banner element + loading state styles

**File**: `src/renderer/components/AIDigestBanner.jsx`, `styles.css`

**Change**:
- Insert `<div class="ai-digest-drawer-banner" role="status" aria-live="polite">`
 between `<header>` and `<div class="drawer-body">`
- Conditionally render: `{loading && (...)}`
- Contents: spinner SVG + "重新生成中..." text + optional `×` cancel button
 (no-op for now, TODO comment for main-side abort IPC)
- CSS: `.ai-digest-drawer-banner` — height32px, `background: rgba(0,122,255,0.08)`,
 `border-bottom:1px solid rgba(0,0,0,0.06)`, `display:flex; align-items:center;
 padding:016px; gap:8px`

**Verify**:
- `npm test tests/renderer/ai-digest-banner.test.jsx` — existing36 tests still pass
- Manual: trigger rerun → banner appears → disappears when done

**Status**: ⬜ pending

---

### Task2 · Rerun button: always-clickable in header + footer

**File**: `src/renderer/components/AIDigestBanner.jsx`

**Change**:
- Header ↻ button: change `disabled={!enabled}` (already done in B7h-final),
 keep `disabled={loading || !enabled}` removed
- Add `class="drawer-icon-btn-rerun"` and SVG class `is-spin` when `loading=true`
- CSS `.drawer-icon-btn-rerun svg.is-spin` — `animation: spin0.8s linear infinite`
- Footer "↻重新生成" button: add `<button class="drawer-footer-btn-primary">`
 element, `onClick={onRerun}`, **NOT disabled** when loading

**Verify**:
- Manual: loading state → click rerun → another rerun fires
- Manual: loading state → click footer rerun → still works

**Status**: ⬜ pending

---

### Task3 · Footer dual entry: timestamp + rerun button + settings link

**File**: `src/renderer/components/AIDigestBanner.jsx`, `styles.css`

**Change**:
- Footer block restructure:
 ```jsx
 {!configMode && enabled && (
 <footer class="drawer-footer">
 <span class="drawer-footer-time">{timestamp}</span>
 <button class="drawer-footer-btn-primary" onClick={onRerun}>↻重新生成</button>
 <button class="drawer-footer-text-link" onClick={() => digestConfigMode = true}>
 修改 AI 设置
 </button>
 </footer>
 )}
 ```
- CSS:
 - `.drawer-footer` — flexbox, justify-content space-between
 - `.drawer-footer-time` —11px, monospace, opacity0.7
 - `.drawer-footer-btn-primary` — solid blue, `background:#007aff; color:white;
 padding:6px14px; border-radius:6px; font-weight:500`
 - `.drawer-footer-text-link` — `color:#007aff; text-decoration:underline;
 font-size:12px; background:transparent; border:0; cursor:pointer; padding:6px0`
 - `gap:14px` between button + link

**Verify**:
- Manual: footer shows time +2 actions (button left, link right)
- Manual: click link → drawer body swaps to form (configMode=true)

**Status**: ⬜ pending

---

### Task4 · Provider card radio style + ◉/○ + blue stripe

**File**: `styles.css`, `src/renderer/components/AISettingsModal.jsx` (form part)

**Change**:
- `.provider-card` — increase padding to12px16px, border-radius10px
- Selected state adds `::before` blue stripe:
 ```css
 .provider-card.selected::before {
 content: '';
 position: absolute;
 left:0; top:8px; bottom:8px;
 width:3px; background: #007aff;
 border-radius:02px2px0;
 }
 .provider-card { position: relative; }
 ```
- Selected adds `box-shadow:001px4px rgba(0,122,255,0.15)`
- Add `◉` / `○` indicator character at start of `.provider-card-name`:
 - Unselected: prepend `○ ` to name (e.g., `○ MiniMax`)
 - Selected: prepend `◉ ` (e.g., `◉ DeepSeek`)
- Or alternatively use a CSS `::before` content rule

**Verify**:
- Visual: provider cards render with ◉/○ and blue stripe on selected
- Manual: click unselected card → it shows ◉ and stripe

**Status**: ⬜ pending

---

### Task5 · Session card tuning (timestamp10→11px, summary wrap, title weight)

**File**: `styles.css`

**Change**:
- `.session-card` `.session-time` — `font-size:11px; opacity:0.7`
- `.session-summary` — `font-size:13px; line-height:1.5; opacity:0.8;
 white-space: normal` (allow wrap)
- `.session-title` — `font-weight:600` (was500)
- `.session-card-list` — `gap:8px` (was10px, tighter)

**Verify**:
- Manual: long summary wraps within card
- Visual: timestamp is more readable

**Status**: ⬜ pending

---

### Task6 · Add8 new tests to ai-digest-banner.test.jsx

**File**: `tests/renderer/ai-digest-banner.test.jsx`

**Change**: Add new test block (after existing tests):

```jsx
describe('<AIDigestDrawer /> —2026-06-09 UI redesign', () => {
 it('footer dual entry: enabled state shows both rerun button + settings link', () => {...});
 it('click footer "↻重新生成" → onRerun fires', () => {...});
 it('click footer "修改 AI 设置" → digestConfigMode=true + form shown', () => {...});
 it('loading=true → banner renders with .ai-digest-drawer-banner role=status', () => {...});
 it('loading=true → footer rerun button still enabled', () => {...});
 it('loading=true → footer settings link still clickable', () => {...});
 it('provider cards use radio: ◉/○ + blue stripe on selected', () => {...});
 it('provider card click → switch provider → model input auto-fills default', () => {...});
});
```

**Verify**:
- `npm test tests/renderer/ai-digest-banner.test.jsx` —36 +8 =44 cases pass
- `npm test` — all62 files /998+8 =1006 tests pass

**Status**: ⬜ pending

---

### Task7 · Build + visual smoke test

**File**: (no source change)

**Change**:
- `npm run build:renderer` → must succeed, no syntax errors
- `npm run build` → electron-builder produces updated `dist/Pulse-2.6.5-arm64.dmg`

**Verify**:
- Bundle size: target ~278-282kb (current278kb + new CSS +8 tests = expect ~285kb)

**Status**: ⬜ pending

---

### Task8 · Install + restart Pulse + visual QA

**File**: (deployment only)

**Change**:
- Replace `/Applications/Pulse.app` with newly built dmg contents
- Kill old Pulse process, restart with new asar
- Open drawer manually:
1. Check footer shows timestamp + blue button + underline link
2. Click footer button → banner appears
3. Click footer link → form appears
4. Trigger rerun during loading → see banner persist
5. Click settings link during loading → form still enters

**Verify**:
- All6 manual flows in spec QA checklist pass

**Status**: ⬜ pending

---

## Execution Order

Tasks have **linear dependencies**:
- Task1 (banner) → independent, can do first
- Task2 (rerun always-clickable) → independent
- Task3 (footer dual entry) → depends on Task2 (rerun button exists)
- Task4 (provider radio) → independent
- Task5 (session card tune) → independent
- Task6 (tests) → depends on Tasks1-5 (test what's built)
- Task7 (build) → depends on Tasks1-5
- Task8 (install + QA) → depends on Task7

**Suggested parallelization**: Tasks1,2,4,5 are independent (all touch
different files / sections). Can be done in any order. Task3 needs Task2
done. Tests (6) and build (7) come last.

## Out of Plan (Spec scope keeps these out)

- **Cancel rerun** IPC — main-side work deferred (no abort endpoint yet)
- **Drawer resize / drag** — fixed right edge
- **Multi-window / mobile** — not Pulse scope

## Estimated Effort

- Task1,2:30 min each
- Task3:45 min (CSS + JSX)
- Task4:30 min (CSS only)
- Task5:15 min (CSS only)
- Task6:60 min (8 test cases)
- Task7:5 min (npm run)
- Task8:10 min (manual)

**Total**: ~3.5 hours
