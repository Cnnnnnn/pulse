# Funds · 每日/月度盈亏记录 (2026-06-12)

## Goal

从功能启用日起，自动记录组合每日盈亏，并在 UI 展示每日列表与月度汇总。

## Data

`state.json.funds.dailySnapshots[]`:

```ts
{
  date: string;           // YYYY-MM-DD (Asia/Shanghai)
  todayProfit: number;
  totalMarketValue: number;
  totalCost: number;
  totalProfit: number;
  recordedAt: number;
}
```

- 每个自然日最多一条，同日多次拉净值会覆盖更新
- 保留约 400 天，超出自动清理

## Recording

净值 scheduler 拉取成功后，用 `fundCalc` 汇总 `todayProfit` 并 upsert 当天快照。

## UI

- Header 增加「本月累计」卡片（含上月对比）
- Header 下方「盈亏记录」：月份切换、月度卡片、每日表格

## Out of scope (v1)

历史补录、导入、单基金分拆、图表
