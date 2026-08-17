# GitHub Library Redesign Implementation Plan

> For agentic workers: use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

Goal: Rebuild the Pulse GitHub collection page as a curated project library with a sidebar, project grid, compact add dialog, and richer reading panel while preserving existing API, IPC, persistence, and update-tracking contracts.

Architecture: Keep GithubLayout and the existing store/service façade as the data boundary. Extract pure selectors from github-projects-store.ts, split the page into focused renderer components, and keep README/AI/Release views inside a compatibility-friendly project panel. Add only optional lastViewedAt state; old records remain valid without migration.

Tech stack: Preact, TypeScript, @preact/signals, existing Pulse design tokens/CSS, Vitest + happy-dom, Playwright visual checks, Electron dev smoke.

## Global constraints

- Preserve GitHub API, main-process IPC channels, Token handling, backup import/export, and release-checker service boundaries.
- Do not require localStorage migration; lastViewedAt is optional.
- Keep Cmd/Ctrl+F focused on the GitHub search input when GitHub is active.
- Preserve existing named exports used by tests: GithubProjectList, GithubProjectRow, and GithubProjectCard, until tests are migrated.
- Run non-watch Vitest only; before every Vitest run execute the repository test-process guard.
- Use Node 22 at /Users/shien.liang/.nvm/versions/node/v22.23.2/bin.
- Every production-code change follows red-green-refactor: failing test, expected failure, minimal implementation, focused pass.

---

## Task 1: Extract library selectors and recently-viewed state

Files:
- Create src/renderer/github/github-library-selectors.ts
- Modify src/renderer/store/github-projects-store.ts
- Create tests/renderer/github-library-selectors.test.ts
- Modify tests/renderer/github-projects-store.test.ts

Interfaces:
- GithubLibrarySort = added | stars | name | published | checked
- GithubLibraryStatus = all | unread | unparsed | unchecked
- GithubLibraryFilters = query, language, topic, status, sort
- filterGithubProjects(projects, filters): any[]
- getGithubLibraryStats(projects): total, unread, parsed, unchecked, languages, tags
- getGithubProjectStatus(project): update | latest | unparsed | unchecked
- markGithubProjectViewed(id): void

- [ ] Step 1: Write failing selector tests.
  Seed projects covering pinned, unread, parsed, unparsed, checked, unchecked, language, topics, AI tags, and timestamps. Assert combined search/language/topic/status filtering, pinned-first sorting, AI-tag matching, all derived counts, and status classification.
  Primary assertion:
  const result = filterGithubProjects(projects, { query: "react", language: "TypeScript", topic: "ui", status: "unread", sort: "stars" });
  expect(result.map((project) => project.id)).toEqual(["facebook/react"]);
  expect(projects[0].pinned).toBe(true);

- [ ] Step 2: Verify red.
  Run:
  /opt/homebrew/bin/rtk proxy bash /Users/shien.liang/.codex/skills/jest-process-guard/scripts/report-test-processes.sh --repo "$PWD"
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-library-selectors.test.ts
  Expected: fail because the selector module and exports do not exist.

- [ ] Step 3: Implement selectors and viewed timestamp.
  Implement pure selectors that treat missing arrays/timestamps as empty/zero, sort a copied array, always place pinned projects first, and search name, description, owner/repo, and AI summary. Topic matches GitHub topics or AI tags.
  Add markGithubProjectViewed(id) to update only the matching project with lastViewedAt: Date.now() and persist through the existing repository. Keep collectGithubTags as a compatibility export delegating to the selector implementation.

- [ ] Step 4: Verify green.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-library-selectors.test.ts tests/renderer/github-projects-store.test.ts
  Expected: focused selector and store tests pass.

- [ ] Step 5: Commit.
  git add src/renderer/github/github-library-selectors.ts src/renderer/store/github-projects-store.ts tests/renderer/github-library-selectors.test.ts tests/renderer/github-projects-store.test.ts
  git commit -m "refactor(github): extract library selectors"

## Task 2: Build the curated-library shell and add dialog

Files:
- Create src/renderer/github/GithubLibraryHeader.tsx
- Create src/renderer/github/GithubLibrarySidebar.tsx
- Create src/renderer/github/GithubAddDialog.tsx
- Modify src/renderer/github/GithubPage.tsx
- Modify src/renderer/github/GithubAddForm.tsx
- Modify src/renderer/github/github.css
- Create tests/renderer/github-library-shell.test.tsx

Interfaces:
- GithubLibraryHeader({ stats, checking, progress, onAdd, onCheckUpdates, onMarkAllSeen, onRetryFailed })
- GithubLibrarySidebar({ stats, filters, onFiltersChange })
- GithubAddDialog({ open, onClose })
- GithubAddForm({ onComplete? }) keeps the existing single/batch behavior.

- [ ] Step 1: Write failing shell tests.
  Render the page with seeded projects and assert the 我的开源库 heading, 添加项目 button, status sidebar, empty-state add action, conditional 全部已读 action, and filter changes. Assert that clicking 添加项目 opens a labelled dialog containing the existing GitHub input.
  Core assertions:
  expect(getByText("我的开源库")).toBeTruthy();
  expect(getByRole("button", { name: "添加项目" })).toBeTruthy();
  fireEvent.click(getByRole("button", { name: "添加项目" }));
  expect(getByLabelText("GitHub 项目地址")).toBeTruthy();

- [ ] Step 2: Verify red.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-library-shell.test.tsx
  Expected: fail because the new shell components and labels do not exist.

- [ ] Step 3: Implement header, sidebar, and dialog.
  Move current toolbar actions into GithubLibraryHeader, preserving update progress, retry-failed, mark-all-seen, and Toast semantics. Derive sidebar languages/tags/status counts from Task 1 selectors. Keep filters controlled by GithubPage and reset pagination when filters change.
  Change GithubAddForm to be dialog content without changing parseBatchInputs, validation, batch ordering, duplicate handling, or failure copy. GithubAddDialog must close via close button, Escape, or backdrop; expose role dialog and aria-modal; keep loading state mounted; and return focus to the add button.

- [ ] Step 4: Add shell CSS.
  Add github-library, header, sidebar, content, dialog, focus, and responsive rules using existing tokens. At max-width 820px, collapse the sidebar into a filter button and use a single-column content layout.

- [ ] Step 5: Verify focused behavior.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-library-shell.test.tsx tests/renderer/github-project-list.test.tsx tests/renderer/github-check-toast.test.tsx
  Expected: new shell tests and existing list/update-toast tests pass.

- [ ] Step 6: Commit.
  git add src/renderer/github/GithubLibraryHeader.tsx src/renderer/github/GithubLibrarySidebar.tsx src/renderer/github/GithubAddDialog.tsx src/renderer/github/GithubPage.tsx src/renderer/github/GithubAddForm.tsx src/renderer/github/github.css tests/renderer/github-library-shell.test.tsx
  git commit -m "refactor(github): add curated library shell"

## Task 3: Extract project grid and cards

Files:
- Create src/renderer/github/GithubProjectGrid.tsx
- Create src/renderer/github/GithubProjectCard.tsx
- Modify src/renderer/github/GithubProjectList.tsx
- Modify src/renderer/github/github.css
- Create tests/renderer/github-project-card.test.tsx
- Modify tests/renderer/github-project-list.test.tsx

Interfaces:
- GithubProjectGrid({ projects, onView, onParse, onRemove, onTogglePin })
- GithubProjectCard({ project, onView, onParse, onRemove, onTogglePin })
- GithubProjectList remains a compatibility façade for existing callers and tests.

- [ ] Step 1: Write failing card tests.
  Assert project identity, description, language, stars, tags, AI summary, update state, pin state, external-link action, and accessible 更多操作 menu. Cover 查看介绍, AI parse, remove confirmation, and missing README/AI states.
  Core assertions:
  expect(getByText("facebook/react")).toBeTruthy();
  expect(getByText(/新版本/)).toBeTruthy();
  expect(getByRole("button", { name: "更多操作" })).toBeTruthy();

- [ ] Step 2: Verify red.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-project-card.test.tsx
  Expected: fail because the extracted card/grid modules do not exist.

- [ ] Step 3: Extract card and grid.
  Move current card markup and shared actions into GithubProjectCard.tsx. Keep GitHub external-link behavior, pin, AI parse, remove, update badge, loading, and confirmation semantics. Show a bounded number of tags plus a +N overflow label. Expose menu actions with role menu and keyboard focus.
  GithubProjectGrid owns empty/no-match state, card collection, and pagination. Keep GithubProjectRow exported for compatibility, but make the default page render the curated card grid.

- [ ] Step 4: Verify focused behavior.
  Run:
  /opt/homebrew/bin/rtk proxy bash /Users/shien.liang/.codex/skills/jest-process-guard/scripts/report-test-processes.sh --repo "$PWD"
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-project-card.test.tsx tests/renderer/github-project-list.test.tsx tests/renderer/github-projects-store.pin.test.ts
  Expected: card, list compatibility, and pin tests pass.

- [ ] Step 5: Commit.
  git add src/renderer/github/GithubProjectGrid.tsx src/renderer/github/GithubProjectCard.tsx src/renderer/github/GithubProjectList.tsx src/renderer/github/github.css tests/renderer/github-project-card.test.tsx tests/renderer/github-project-list.test.tsx
  git commit -m "refactor(github): extract curated project cards"

## Task 4: Rebuild the project reading panel

Files:
- Create src/renderer/github/GithubProjectPanel.tsx
- Modify src/renderer/github/GithubProjectDrawer.tsx
- Modify src/renderer/github/GithubReadmeView.tsx
- Modify src/renderer/github/GithubAiParseView.tsx
- Modify src/renderer/github/GithubReleasesView.tsx
- Modify src/renderer/github/github.css
- Create tests/renderer/github-project-panel.test.tsx

Interfaces:
- GithubProjectPanel({ projectId, initialTab, onClose })
- GithubProjectDrawer becomes a compatibility wrapper around DrawerShell.

- [ ] Step 1: Write failing panel tests.
  Assert metadata, overview, four tabs, initial ai/update routing, README refresh, external link, mark-seen, and close.
  Core assertions:
  expect(getByText("facebook/react")).toBeTruthy();
  expect(getByRole("tab", { name: "概览" })).toBeTruthy();
  expect(getByRole("tab", { name: "README" })).toBeTruthy();
  expect(getByRole("tab", { name: "AI 解析" })).toBeTruthy();
  expect(getByRole("tab", { name: /更新/ })).toBeTruthy();

- [ ] Step 2: Verify red.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-project-panel.test.tsx
  Expected: fail because the panel and overview tab do not exist.

- [ ] Step 3: Implement panel and wrapper.
  Move current drawer header/tab/content logic into GithubProjectPanel. Add an overview that only reads existing fields plus optional AI result. Keep lazy AI parsing, release fetching, README refresh, loading skeletons, error copy, DrawerShell, Escape, and external-link behavior. Call markGithubProjectViewed(projectId) when the panel opens.
  Use role tablist, role tab, aria-selected, and a labelled content region for the four tabs.

- [ ] Step 4: Verify content-view compatibility.
  Run:
  /opt/homebrew/bin/rtk proxy bash /Users/shien.liang/.codex/skills/jest-process-guard/scripts/report-test-processes.sh --repo "$PWD"
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run tests/renderer/github-project-panel.test.tsx tests/renderer/github-readme-view.test.tsx tests/renderer/github-ai-parse-view.test.tsx tests/renderer/github-releases-view.test.tsx tests/renderer/github-check-toast.test.tsx
  Expected: panel behavior and all existing content-view contracts pass.

- [ ] Step 5: Commit.
  git add src/renderer/github/GithubProjectPanel.tsx src/renderer/github/GithubProjectDrawer.tsx src/renderer/github/GithubReadmeView.tsx src/renderer/github/GithubAiParseView.tsx src/renderer/github/GithubReleasesView.tsx src/renderer/github/github.css tests/renderer/github-project-panel.test.tsx
  git commit -m "refactor(github): rebuild project reading panel"

## Task 5: Wire the full page and visual/accessibility contract

Files:
- Modify src/renderer/github/GithubPage.tsx
- Modify src/renderer/github/github.css
- Create tests/renderer/github-page-a11y.test.tsx
- Modify tests/visual/visual.spec.ts

- [ ] Step 1: Write failing integration contract.
  Mount GithubPage with seeded projects and assert the complete path: header, add button, card, card click, overview tab, search/sidebar filters, and no horizontal overflow at the narrow viewport. Use deterministic API stubs in the Playwright test.
  Core assertions:
  expect(getByText("我的开源库")).toBeTruthy();
  expect(getByRole("button", { name: "添加项目" })).toBeTruthy();
  fireEvent.click(getByText("facebook/react"));
  expect(getByRole("tab", { name: "概览" })).toBeTruthy();

- [ ] Step 2: Verify red.
  Run the process guard and the focused renderer test. Expected: fail on the new page labels/selectors before final wiring is complete.

- [ ] Step 3: Wire page state.
  Remove the always-visible GithubAddForm path. Keep _reportCheckResult, update-check callbacks, retry-failed, mark-all-seen, and existing update-badge tab routing. Pass controlled filters to the selector/grid and reset paging whenever a filter changes.

- [ ] Step 4: Finish CSS and accessibility.
  Verify keyboard-reachable sidebar filters, one clear card heading, accessible menu labels, dialog focus return, selected tab state, live progress/error regions, and no horizontal overflow below 820px. Keep light/dark tokens and existing density settings.

- [ ] Step 5: Run focused renderer and build checks.
  Run the process guard, the focused Github page/card/panel tests, and npm run build:renderer. Run the documented Playwright command from package.json filtering to the GitHub test; do not invent a script alias. Expected: focused tests and renderer build exit 0.

- [ ] Step 6: Commit.
  git add src/renderer/github/GithubPage.tsx src/renderer/github/github.css tests/renderer/github-page-a11y.test.tsx tests/visual/visual.spec.ts
  git commit -m "feat(github): ship curated library page"

## Task 6: Full verification and Electron smoke

Files:
- No planned source changes unless verification finds a concrete regression.
- Inspect Git diff, Git status, and generated artifacts only for evidence.

- [ ] Step 1: Run typecheck and lint.
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm run typecheck
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm run lint
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm run lint:css
  Expected: all commands exit 0; report warning-only output separately.

- [ ] Step 2: Run the full test suite.
  Run the process guard, then:
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm test -- --run
  Expected: no new failures; compare counts with the pre-change baseline and report existing skips/flaky cases separately.

- [ ] Step 3: Run renderer build.
  /Users/shien.liang/.nvm/versions/node/v22.23.2/bin/npm run build:renderer
  Expected: exit 0 and renderer-dist/index.js plus CSS output exist.

- [ ] Step 4: Run Electron smoke.
  Start npm run dev, open the Pulse GitHub section, and verify curated header, seeded cards, search/sidebar filters, add-dialog open/close, overview/README/AI/Update tabs, update badge to Update tab, mark-seen clearing, and narrow-window one-column layout. Capture light and dark screenshots for review.

- [ ] Step 5: Final evidence check.
  Run git diff --check, git status --short, and git log --oneline -10. Only GitHub redesign source/tests and approved design/plan docs may be tracked. Keep .serena/, .token-savior-cache.json, and .superpowers/ uncommitted.
