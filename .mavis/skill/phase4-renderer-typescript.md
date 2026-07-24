---
name: phase4-renderer-typescript
description: Phase 4 renderer JSX→TSX 迁移 — Pulse
---

# Phase 4 Renderer TypeScript — Pulse

> **目标**：`src/renderer/**` 的 `.js`/`.jsx` 一并改成 `.ts`/`.tsx`；**不保留 `.jsx`**。
> tsconfig.renderer 已含 `.tsx`；esbuild `build:renderer` 已有 `.ts`/`.tsx` loader。
>
> **Batch A 已完成**：`hooks/` + `utils/`。

## 单文件迁移步骤（忠实迁移）

1. `git mv foo.js foo.ts` 或 `foo.jsx` → `foo.tsx`
2. 给导出函数补最小参数/返回类型；JSDoc `@typedef` 可改成 `interface`
3. `catch (err)` 里用 `err instanceof Error ? err.message : …`（若触及）
4. **同步改所有 import 扩展名**（本仓库显式写 `.js`/`.jsx`，改完必须更新；含 `tests/` 与 `vi.mock` 路径）
5. 未迁的依赖继续 `import … from "../api.js"`（保留 `.js` 直到对方也迁）
6. `npm run typecheck` + 相关 vitest + 必要时 `npm run build:renderer`

## 分批约定

- 按目录一批一 commit（与 Phase 3.5 同构）
- 优先叶子目录：hooks/utils → digest/recent/wechat-hot/metals/… → store → components → 大业务域 → 入口 `index.jsx`
- `any` 用 `ponytail:` 标 ceiling；禁 `@ts-ignore`

## 踩坑

- **解构里不要写 `{ x: any }`** — 那是 rename，应写成 `{ x }: any`
- vitest 已 `include: **/*.{js,jsx,ts,tsx}`；happy-dom 测试头注释不变
- CSS/`*.module` 不动；只迁脚本
