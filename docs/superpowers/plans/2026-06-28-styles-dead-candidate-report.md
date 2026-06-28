# styles.css 死代码候选清单 (报告, 不删)

> 生成时间: 2026-06-28
> 静态扫描方法: ripgrep 在 `src/`, `index.html`, `share-card.html` 里匹配 `class=...` / `class={...}` / `className=...` / `className={...}` 提取 token, 与 `styles.css` 中以 `.` 开头的 class 选择器对比.

> **重要警告**: 本报告**只列'无静态使用证据'的候选**,**不代表真的死代码**. 任何模板字符串拼接 / 子组件内部传 class / webview 内页 (`share-card.html` 已被扫但场景有限) / data-* 属性触发的选择器, 静态扫描都会漏掉.

> **建议**: 候选清单**只供人工事后复核**, 不要直接脚本批量删.

## 数字

| 指标 | 数量 |
|---|---|
| styles.css 中唯一 `.class` 选择器 | 1275 |
| 静态扫描到的使用中 class token | 1086 |
| **候选 (无静态证据)** | **390** |

## 候选按主题分组

### `ai-*` (24 条)

- `ai-config-inline-status`
- `ai-config-provider-pill`
- `ai-config-tab`
- `ai-config-tabs`
- `ai-digest-drawer`
- `ai-digest-overlay`
- `ai-settings-modal`
- `ai-settings-save-status`
- `ai-settings-test-result`
- `ai-settings-toggle`
- `ai-task-card`
- `ai-task-status-badge`
- `ai-tasks-date-chip`
- `ai-tasks-date-row`
- `ai-usage-sparkline--empty`
- `ai-usage-sparkline-bar`
- `ai-usage-sparkline-bar--anomaly`
- `ai-usage-sparkline-bar--filled`
- `ai-usage-sparkline-bar--hover`
- `ai-usage-sparkline-bar--today`
- `ai-usage-status`
- `ai-usage-status--ok`
- `ai-usage-status--throttled`
- `ai-usage-tab`

### `app-*` (5 条)

- `app-action-group`
- `app-content-row`
- `app-info-btn`
- `app-shell`
- `app-subtitle`

### `backfill-*` (1 条)

- `backfill-progress`

### `bracket-*` (19 条)

- `bracket-card`
- `bracket-card--final`
- `bracket-card--final-prominent`
- `bracket-card--live`
- `bracket-card--projected`
- `bracket-card--third-prominent`
- `bracket-grid`
- `bracket-grid--1`
- `bracket-grid--16`
- `bracket-grid--2`
- `bracket-grid--4`
- `bracket-grid--8`
- `bracket-stage-tab`
- `bracket-tree-column`
- `bracket-tree-column--final`
- `bracket-tree-column-section`
- `bracket-tree-column-section--final`
- `bracket-tree-column-section--third`
- `bracket-tree-columns`

### `bulk-*` (1 条)

- `bulk-row`

### `category-*` (5 条)

- `category-tab`
- `category-tab-count`
- `category-tab-icon`
- `category-tab-name`
- `category-tabs`

### `changelog-*` (4 条)

- `changelog-empty`
- `changelog-history-tab`
- `changelog-summary-feedback`
- `changelog-summary-feedback-btn`

### `command-*` (2 条)

- `command-palette-item`
- `command-palette-kind`

### `config-*` (4 条)

- `config-import-modal`
- `config-import-modal-content`
- `config-import-row`
- `config-import-status`

### `confirm-*` (2 条)

- `confirm-dialog`
- `confirm-dialog-backdrop`

### `day-*` (2 条)

- `day-bet-flash`
- `day-bet-pnl`

### `diag-*` (13 条)

- `diag-config-portability-actions`
- `diag-export__err`
- `diag-export__ok`
- `diag-row`
- `diag-row--sub`
- `diag-row__label`
- `diag-row__value`
- `diag-section`
- `diag-section--export`
- `diag-section__loading`
- `diag-section__title`
- `diag-self-update`
- `diag-self-update-info`

### `diagnostics-*` (10 条)

- `diagnostics-drawer`
- `diagnostics-drawer__body`
- `diagnostics-drawer__close`
- `diagnostics-drawer__empty`
- `diagnostics-drawer__footer`
- `diagnostics-drawer__header`
- `diagnostics-drawer__loading`
- `diagnostics-drawer__stats`
- `diagnostics-drawer__title`
- `diagnostics-overlay`

### `digest-*` (22 条)

- `digest-drawer`
- `digest-drawer__body`
- `digest-drawer__close`
- `digest-drawer__header`
- `digest-drawer__title`
- `digest-scope-actions`
- `digest-scope-badge`
- `digest-scope-btn`
- `digest-scope-desc`
- `digest-scope-head`
- `digest-scope-title`
- `digest-section`
- `digest-setup-intro`
- `digest-stat-pill`
- `digest-workbench-desc`
- `digest-workbench-hero`
- `digest-workbench-kicker`
- `digest-workbench-list`
- `digest-workbench-section`
- `digest-workbench-source-line`
- `digest-workbench-stats`
- `digest-workbench-title`

### `drawer-*` (4 条)

- `drawer-body`
- `drawer-empty`
- `drawer-legacy-summary`
- `drawer-needs-setup`

### `error-*` (4 条)

- `error-detail`
- `error-entry`
- `error-entry--unhandled`
- `error-entry--warn`

### `evidence-*` (2 条)

- `evidence-session-project`
- `evidence-session-row`

### `filter-*` (6 条)

- `filter-bar`
- `filter-search`
- `filter-search-clear`
- `filter-search-input`
- `filter-tab`
- `filter-tabs`

### `fund-*` (14 条)

- `fund-btn-active`
- `fund-btn-danger`
- `fund-modal`
- `fund-modal-overlay`
- `fund-pnl-history`
- `fund-pnl-history--page`
- `fund-pnl-summary`
- `fund-pnl-summary--page`
- `fund-row`
- `fund-row-action-btn--active`
- `fund-row-error`
- `fund-row-pending`
- `fund-source-btn`
- `fund-view-tab`

### `header-*` (4 条)

- `header-export-err`
- `header-export-ok`
- `header-left`
- `header-right`

### `ithome-*` (7 条)

- `ithome-refresh-btn`
- `ithome-row`
- `ithome-row-btn`
- `ithome-row-btn--ai`
- `ithome-row-star`
- `ithome-sidebar-item`
- `ithome-subtab`

### `kpi-*` (6 条)

- `kpi-card`
- `kpi-card--danger`
- `kpi-card--default`
- `kpi-card--success`
- `kpi-card--warning`
- `kpi-grid`

### `match-*` (8 条)

- `match-card`
- `match-card--final`
- `match-card--live`
- `match-center-score`
- `match-row-highlight`
- `match-score`
- `match-score--final`
- `match-score--live`

### `merged-*` (1 条)

- `merged-filter-chip`

### `metal-*` (2 条)

- `metal-modal`
- `metal-modal-overlay`

### `metals-*` (2 条)

- `metals-cell-change-pct`
- `metals-cell-holding-pnl`

### `modal-*` (6 条)

- `modal-backdrop`
- `modal-backdrop-top`
- `modal-body`
- `modal-card`
- `modal-squad`
- `modal-squad-team`

### `mute-*` (1 条)

- `mute-menu-item--recommended`

### `negative-*` (1 条)

- `negative`

### `news-*` (3 条)

- `news-share-toast`
- `news-share-toast--error`
- `news-share-toast--success`

### `overview-*` (4 条)

- `overview-grid`
- `overview-page`
- `overview-section`
- `overview-section-title`

### `positive-*` (1 条)

- `positive`

### `provider-*` (1 条)

- `provider-card`

### `recent-*` (9 条)

- `recent-filter-pill`
- `recent-modal`
- `recent-modal-backdrop`
- `recent-modal-body`
- `recent-modal-filters`
- `recent-row`
- `recent-timeline-empty`
- `recent-timeline-text`
- `recent-timeline-ts`

### `release-*` (4 条)

- `release-notes-trigger-badge`
- `release-notes-wizard`
- `release-notes-wizard-dot`
- `release-notes-wizard-overlay`

### `reminder-*` (6 条)

- `reminder-fired-pill`
- `reminder-modal`
- `reminder-modal-backdrop`
- `reminder-modal-body`
- `reminder-pending-pill`
- `reminder-row`

### `row-*` (6 条)

- `row-action-pin`
- `row-action-rollback`
- `row-action-snooze`
- `row-overflow-dropdown`
- `row-overflow-menu`
- `row-overflow-trigger`

### `search-*` (5 条)

- `search-highlight`
- `search-modal`
- `search-modal-overlay`
- `search-result-row`
- `search-source-item`

### `session-*` (5 条)

- `session-card-app`
- `session-meta`
- `session-selection-hint`
- `session-selection-title`
- `session-selection-topline`

### `side-*` (9 条)

- `side-nav`
- `side-nav-ai-btn`
- `side-nav-ai-btn-needs-setup`
- `side-nav-badge`
- `side-nav-collapsed`
- `side-nav-item`
- `side-nav-item-dragging`
- `side-nav-item-drop-after`
- `side-nav-item-drop-before`

### `sidenav-*` (6 条)

- `sidenav-hidden-drawer`
- `sidenav-hidden-drawer-overlay`
- `sidenav-hidden-drawer__body`
- `sidenav-hidden-drawer__close`
- `sidenav-hidden-drawer__header`
- `sidenav-hidden-drawer__title`

### `signal-*` (3 条)

- `signal-cautious`
- `signal-neutral`
- `signal-positive`

### `snooze-*` (6 条)

- `snooze-menu`
- `snooze-menu__cancel`
- `snooze-menu__divider`
- `snooze-menu__item`
- `snooze-menu__status`
- `snooze-menu__title`

### `source-*` (1 条)

- `source-tag`

### `squad-*` (6 条)

- `squad-row`
- `squad-row-tbd`
- `squad-score-banner`
- `squad-score-banner--final`
- `squad-score-banner--live`
- `squad-vs-score`

### `status-*` (1 条)

- `status-badge`

### `stock-*` (41 条)

- `stock-advise-chip`
- `stock-advise-drawer`
- `stock-advise-header`
- `stock-advise-overlay`
- `stock-advise-title`
- `stock-detail-chip`
- `stock-detail-drawer`
- `stock-detail-header`
- `stock-detail-overlay`
- `stock-detail-pad-drawer`
- `stock-detail-preview-row`
- `stock-detail-preview-title`
- `stock-detail-selected`
- `stock-detail-subtitle`
- `stock-detail-subtitle-inline`
- `stock-detail-title`
- `stock-detail-title-block`
- `stock-modal`
- `stock-modal-body`
- `stock-modal-close`
- `stock-modal-error`
- `stock-modal-header`
- `stock-modal-hint`
- `stock-modal-input`
- `stock-modal-title`
- `stock-search-code`
- `stock-search-industry`
- `stock-search-item`
- `stock-search-list`
- `stock-star`
- `stock-strategy-chip`
- `stock-strategy-custom`
- `stock-table`
- `stock-table-error`
- `stock-th`
- `stock-th-right`
- `stock-watchlist`
- `stock-wl-info`
- `stock-wl-quote`
- `stock-wl-remove`
- `stock-wl-row`

### `toast-*` (5 条)

- `toast`
- `toast-error`
- `toast-info`
- `toast-success`
- `toast-warn`

### `topbar-*` (12 条)

- `topbar`
- `topbar-ai`
- `topbar-badge`
- `topbar-center`
- `topbar-icon-btn`
- `topbar-left`
- `topbar-logo`
- `topbar-menu`
- `topbar-menu-divider`
- `topbar-overflow`
- `topbar-right`
- `topbar-search`

### `tray-*` (1 条)

- `tray-config-modal`

### `trend-*` (1 条)

- `trend-sparkline`

### `upgrade-*` (8 条)

- `upgrade-advice--skip`
- `upgrade-advice--upgrade`
- `upgrade-advice--wait`
- `upgrade-advice-confidence`
- `upgrade-advice-confidence--high`
- `upgrade-advice-confidence--low`
- `upgrade-advice-confidence--medium`
- `upgrade-advice-feedback-btn`

### `version-*` (10 条)

- `version-history-drawer`
- `version-history-drawer__body`
- `version-history-drawer__close`
- `version-history-drawer__empty`
- `version-history-drawer__footer`
- `version-history-drawer__header`
- `version-history-drawer__loading`
- `version-history-drawer__stats`
- `version-history-drawer__title`
- `version-history-overlay`

### `versions-*` (1 条)

- `versions-layout-body`

### `view-*` (1 条)

- `view-switcher-btn`

### `watchlist-*` (21 条)

- `watchlist-drawer`
- `watchlist-drawer__body`
- `watchlist-drawer__close`
- `watchlist-drawer__empty`
- `watchlist-drawer__header`
- `watchlist-drawer__stats`
- `watchlist-drawer__title`
- `watchlist-drawer__title-row`
- `watchlist-entry`
- `watchlist-entry__main`
- `watchlist-entry__meta`
- `watchlist-entry__name`
- `watchlist-keyword-form`
- `watchlist-keyword-input`
- `watchlist-overlay`
- `watchlist-quick`
- `watchlist-quick-badge`
- `watchlist-quick-item`
- `watchlist-quick-list`
- `watchlist-quick-title`
- `watchlist-quick-view-all`

### `wechat-*` (2 条)

- `wechat-hot-list-rank`
- `wechat-hot-list-row`

### `work-*` (11 条)

- `work-item-actions`
- `work-item-card`
- `work-item-content`
- `work-item-draft-hint`
- `work-item-evidence-list`
- `work-item-main`
- `work-item-pills`
- `work-item-projects`
- `work-item-status-badge`
- `work-item-title`
- `work-item-topline`

### `worldcup-*` (18 条)

- `worldcup-bets-stat-pnl`
- `worldcup-refresh-btn`
- `worldcup-refresh-btn-loading`
- `worldcup-scorers-rank`
- `worldcup-scorers-rank-top1`
- `worldcup-scorers-rank-top2`
- `worldcup-scorers-rank-top3`
- `worldcup-subtab`
- `worldcup-subtab-active`
- `worldcup-team-en`
- `worldcup-team-fam`
- `worldcup-team-fam-name`
- `worldcup-team-fam-pos`
- `worldcup-team-gd`
- `worldcup-team-gd--neg`
- `worldcup-team-gd--pos`
- `worldcup-team-info`
- `worldcup-title`

## 复核建议

1. 优先看是否在 JSX 里通过模板字符串拼接 (e.g. `` `bracket-card--${variant}` ``).
2. 看是否子组件内部 `<div class={...passedClass}>` 传入.
3. 看是否 webview / iframe 内页引用.
4. 看 `[data-foo]` / `[aria-*]` 属性选择器 (本报告只比较 `.class` 选择器, 不含 `[attr]`, 所以 `data-*` 触发的样式**误判为死**的风险存在).

## 不在本次清理范围

- `preload.js` (已有未提交修改, 不动)
- `index.js` (主进程入口, 跨 IPC 影响面)
- `styles.css` 内的 `@keyframes` / `@media` / `@container` / `[lang=zh]` 等非 class 规则 (绝不能按 class 扫描判定死).
