# Product Design QA — Native Toolbar Bridge

## Source visual truth

- Source image: `/Users/shien.liang/.codex/generated_images/019fdbbe-d74c-7081-89db-dfbca1e5ba79/exec-1dcee3fa-1b6c-481a-802c-e48a400284d6.png`
- Selected ideation result: option 2 from the Product Design ideation set.
- Direction: keep the native macOS traffic lights in place, let the navigation share the titlebar row, and start the dashboard from one clean content grid below it.

## Implementation evidence

- Implementation screenshot: `/Users/shien.liang/.codex/visualizations/2026/08/07/019fdbbe-d74c-7081-89db-dfbca1e5ba79/toolbar-bridge-implementation-source-size-final.png`
- System drawer screenshot: `/Users/shien.liang/.codex/visualizations/2026/08/07/019fdbbe-d74c-7081-89db-dfbca1e5ba79/system-drawer-no-subtab.png`
- Full comparison: `/Users/shien.liang/.codex/visualizations/2026/08/07/019fdbbe-d74c-7081-89db-dfbca1e5ba79/toolbar-bridge-comparison-final.png`
- Focused chrome comparison: `/Users/shien.liang/.codex/visualizations/2026/08/07/019fdbbe-d74c-7081-89db-dfbca1e5ba79/toolbar-bridge-comparison-focus-final.png`
- Viewport: 1528 × 1029 CSS px, deviceScaleFactor 1.
- State: macOS platform class, light theme, Home route, four recent-activity rows.

## Comparison evidence

The implementation now follows the second direction at the shell level:

- macOS navigation is a full-width horizontal toolbar below the native traffic-light area.
- Home is the active light-blue control, followed by the three section icons in one row.
- The old full-height vertical rail and its floating surface are removed from the macOS layout.
- The dashboard begins below the toolbar without a second blank gray band.
- The `应用列表 / 诊断 / 设置` shared horizontal subtab is removed from `VersionsLayout`.
- Those three pages are independently selected from the system navigation drawer instead.
- Existing dashboard content, recent activity, footer configuration action, and Windows vertical navigation remain intact.

The generated concept includes native macOS traffic lights. A static renderer capture does not paint those window-owned controls; production still uses Electron's native `hiddenInset` chrome. The current implementation keeps the existing settings control for access to the settings route, so it remains visible at the far end of the macOS toolbar as a functional control.

## Interaction and regression checks

- `tests/visual/dashboard-layout.spec.js`: passed.
- `tests/visual/window-chrome-layout.spec.js`: passed.
- macOS toolbar geometry at 1280 × 720: rail starts at y=0, height=102px, and dashboard content starts directly below it.
- Section hover opens NavDrawer below the toolbar at `top: 102px; left: 24px`.
- The system NavDrawer exposes exactly three independent routes: `library`, `diagnostics`, and `settings`.
- Browser console errors: none.
- Page errors: none.
- CSS lint: passed.
- TypeScript typecheck: passed (`preload`, `app`, `app.strict`, `renderer`, `tests`).
- `git diff --check`: passed.

## Comparison history

1. The floating command rail from option 3 made the shell feel detached from the native window chrome and was replaced with option 2 after review.
2. The macOS layout was changed from a vertical flex shell to a horizontal toolbar while keeping the Windows rail rules unchanged.
3. The Home control uses the project's linear SVG icon system instead of an emoji glyph.
4. The dashboard root remains independently scrollable so recent activity cannot be covered by the tile section.

## Findings

No actionable P0, P1, or P2 findings remain for the requested option-2 shell change.

## Follow-up polish

- P3: capture one native Electron screenshot for a chrome-only comparison with the traffic lights visible in the implementation evidence.
- P3: the generated concept uses a different dashboard density from the existing product; this iteration intentionally limits the change to the titlebar/navigation relationship and the recent-activity containment fix.

final result: passed

## Product Design QA — AI leaderboard Reading Rail implementation

Source visual:

- `/Users/shien.liang/.codex/generated_images/019fdccd-3752-7920-8c58-67bb72632686/exec-42b2fb3e-13e0-4c98-b253-da63253f2318.png`
- Selected direction: option 2, Reading Rail.

Implementation captures:

- `/Users/shien.liang/Desktop/AppUpdateChecker-Electron/test-results/ai-leaderboard-reading-rail-desktop-final.png`
- `/Users/shien.liang/Desktop/AppUpdateChecker-Electron/test-results/ai-leaderboard-reading-rail-final.png`

State coverage:

- Wide desktop `1920 × 1286`: fixed left source/dimension rail, central table-first work area, compact right detail hint, visible first 13 rows.
- Small desktop `960 × 643`: table viewport remains measurable at `126px`, with rendered rows present; no zero-height virtualized table.
- Interaction: selecting two rows enables the left-rail AI analysis action; opening and closing the analysis panel both pass.

Findings:

- No actionable P0/P1/P2 findings remain for the selected direction.
- The main table now owns the constrained viewport; supplementary charts remain progressive disclosure and are hidden only in very short windows so they cannot steal table height.
- Existing model/vendor icons and data semantics are retained from Pulse; no placeholder imagery was added.

Verification:

- `npm run build:renderer`: passed.
- `npm run typecheck`: passed across preload, app, strict app, renderer, and tests.
- Targeted Vitest: 6 files / 119 tests passed.
- `tests/visual/ai-leaderboard-virtualization.spec.js`: 2 tests passed (small viewport + wide desktop, including AI analysis open/close).
- `npm run lint:css`: passed for the repository's configured CSS scope.
- Direct linting of `ai-leaderboard.css` still reports legacy-file rules that predate this Reading Rail block; the new block itself uses the existing token/color conventions and `git diff --check` is clean.
- `git diff --check`: passed.

final result: passed

## Product Design QA — Settings controls, AI workspace, and theme transition

### Source and implementation evidence

- User-provided control reference: `/var/folders/3z/n7yg6g5d6wq0pf2y_zkzr1d40000gp/T/codex-clipboard-cca10bf1-617d-40d1-be61-ea49ae7b7334.png`
- User-provided dark-theme behavior evidence: `/var/folders/3z/n7yg6g5d6wq0pf2y_zkzr1d40000gp/T/codex-clipboard-cff6a458-8bb5-40ad-9a9c-2fdd3c1fd577.png`
- Browser-rendered AI workspace capture: `/Users/shien.liang/Desktop/AppUpdateChecker-Electron/test-results/visual-settings-page-—-P15-AI-配置-tab-baseline/settings-ai-light-actual.png`
- Viewport: `1280 × 800` CSS px, DPR 1; light theme, Settings → AI 配置 → 连接设置.

### Comparison history

1. The supplied automatic-check view exposed native select chrome and two detached blue state buttons. It was replaced with native-looking control rows: an accessible switch, a styled select affordance, and an explicit running/paused state.
2. The supplied dark-theme evidence showed stacked toasts while changing from dark to light. Code tracing found a renderer-to-main-to-renderer echo: the broadcast callback called the same synchronizing setter again. The broadcast path now applies the resolved theme with `syncMain: false`.
3. The AI settings view was restructured from a serial card stack into an AI workspace: health summary, three Provider choices, side-by-side connection/key configuration, and a dedicated verification action.

### Findings

- No actionable P0/P1/P2 findings remain in the captured AI state. Typography, spacing, token use, and content hierarchy are consistent with the selected settings direction.
- Provider/service icons remain text-led because Pulse does not currently ship provider brand artwork; this is an intentional P3 constraint, not a substituted graphic asset.
- The connection test and final save action remain below the first viewport by design: configuration must be filled before those actions become meaningful, so they do not compete with Provider, model, and key setup.

### Interaction and regression checks

- Theme echo regression: `tests/renderer/theme-manager.test.ts` verifies a main-process callback can apply a new theme without a second `theme:set` call.
- Settings render: `tests/renderer/SettingsPage.test.tsx` passed.
- Renderer typecheck and `git diff --check`: passed.
- Targeted AI visual screenshot generated successfully. It is reported as a missing pre-change baseline rather than a runtime failure.

final result: passed

## Product Design QA — Settings overview selected concept

### Source visual truth

- Source image: `/Users/shien.liang/.codex/generated_images/019ff50b-55d4-7081-88d9-bcad534d4847/exec-89accb12-9de4-4723-9906-0e3b3c128744.png`
- Implementation screenshot: `/Users/shien.liang/Desktop/AppUpdateChecker-Electron/test-results/visual-settings-page-—-P13-4-section-卡片化-baseline/settings-light-actual.png`
- State: Pulse macOS-style shell, light theme, Settings → 常规, empty activity and reminder data.
- Viewport: implementation `1280 × 800` CSS px, device scale factor `1`; source `1586 × 992` pixels. The full views were normalized side by side to equal `616px` content widths for comparison.

### Comparison history

1. Initial implementation matched the summary-card hierarchy, but retained the old gray segmented subtab container.
2. The Settings tabs were changed to the selected design’s blue active underline with a subtle shared divider. The rebuilt static renderer was recaptured at the same viewport.

### Findings

- No actionable P0, P1, or P2 findings remain. The implementation matches the selected direction’s light surface, three-item status overview, grouped common settings, and compact migration actions.
- The selected concept depicts check-frequency, notification, launch-at-login, auto-update, and language controls that are not present in Pulse’s current settings contract. They were intentionally not rendered as inactive or fake controls; the implemented page keeps the existing functional theme, activity, reminder, import, and export flows.

### Required fidelity surfaces

- Fonts and typography: the project’s existing system font, heading weights, small descriptive labels, and compact control sizing are retained; no wrapping or truncation is visible at the target viewport.
- Spacing and layout rhythm: the three equal overview cards, single grouped settings surface, row dividers, and migration strip reproduce the chosen composition without nested-card clutter.
- Colors and visual tokens: existing neutral surfaces, low-contrast dividers, blue accent, focus treatment, and dark-theme tokens remain in use.
- Image quality and asset fidelity: the selected visual has no raster imagery, logo artwork, or decorative illustration to reproduce. Existing project icon components are reused for functional UI affordances.
- Copy and content: all labels describe current, supported Pulse behavior; local-only data language reflects the existing configuration model.

### Interaction and verification

- Theme mode remains an accessible radiogroup and still calls the existing preference setter and success feedback.
- Existing reminder completion/removal and configuration import/export handlers are retained unchanged.
- `npx tsc -p tsconfig.renderer.json --noEmit`: passed.
- `vitest run tests/renderer/SettingsPage.test.tsx --pool=forks --maxWorkers=1`: passed.
- `git diff --check`: passed.
- Targeted visual regression capture completed. It reports a snapshot mismatch because the checked-in pre-change baseline represents the old layout; the received screenshot is the inspected final implementation.

### Follow-up polish

- P3: add visual baselines deliberately in a separate snapshot-update change once the broader working tree is ready to accept them.

final result: passed

## Product Design QA — AI leaderboard option 2

Source visual: `/Users/shien.liang/.codex/generated_images/019fdccd-3752-7920-8c58-67bb72632686/exec-c9d5c9a7-d942-4bf4-88d8-f4bb57c1f5ce.png`

Implementation screenshots:

- `/Users/shien.liang/.codex/visualizations/2026/08/11/ai-leaderboard-implementation/06-default-collapsed-final.png`
- `/Users/shien.liang/.codex/visualizations/2026/08/11/ai-leaderboard-implementation/05-analysis-open-top.png`

Viewport: implementation browser 1280 × 720 CSS px, DPR 1. The source visual is 1487 × 1058; the in-app browser has a fixed viewport, so the comparison uses the same available implementation viewport and checks layout/state parity rather than pixel dimensions.

State coverage:

- Default state: AI analysis panel is closed; the ranking table is primary and advanced filters are collapsed.
- Analysis state: three models selected; selected rows show an accent; the bottom compare tray exposes the AI CTA; the right analysis panel is open.
- Interaction state: closing AI analysis removes the dialog; `筛选` expands search/vendor/license controls and collapses them again.

Findings:

- No actionable P0, P1, or P2 findings remain.
- P3: the product's existing 102px native macOS toolbar is taller than the generated visual, so the AI panel is intentionally anchored below it.
- P3: model logos are not available in the current component system; existing vendor badges are retained.
- P3: no live leaderboard AI provider endpoint exists in the current contract, so the panel currently presents a deterministic current-data analysis preview while preserving the future connection point.

Comparison history:

1. The AI panel was initially positioned at the viewport top and covered native navigation; it was moved below the 102px toolbar.
2. The final open-state capture resets the leaderboard body scroll so the table, compare tray, and panel can be reviewed together.

final result: passed
