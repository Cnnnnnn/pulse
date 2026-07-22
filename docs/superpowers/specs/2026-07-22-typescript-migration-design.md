# 全项目 TypeScript 迁移设计

## 目标

将 Pulse 项目的生产代码、renderer、preload、workers、测试和 scripts 分阶段迁移为 TypeScript，最终启用全项目 `strict` 类型检查，同时保持现有 Electron 启动、构建、发布和业务行为不变。

## 已确认约束

- 采用分阶段迁移，而不是一次性重命名全部文件。
- 迁移范围包含生产代码、renderer、preload、workers、测试和 scripts。
- 最终启用 TypeScript `strict`；迁移期间允许按目录逐步收紧。
- 迁移期间允许 JS/TS 共存，每批逐步重命名并保持可运行。
- 只允许为类型边界进行小规模重构，不改变业务功能，不进行无关架构清理。
- 主进程、preload、workers 和 scripts 使用现有 `esbuild` 编译，不新增 `tsx` 或 `ts-node` 运行时依赖。
- 保留现有 Preact compat、自动 JSX runtime、CSS/HTML 结构和发布目录结构。

## 当前规模与风险

当前项目约有：

- `src/main`：144 个代码文件，主要是 CommonJS。
- `src/renderer`：306 个代码文件，使用 ESM/Preact/JSX。
- `tests`：473 个代码文件。
- 全部 `src`、测试及脚本合计约 1,000 个 JS/JSX 代码文件。
- 已安装 TypeScript 和 `@typescript-eslint/parser`，已有 `jsconfig.json`，但没有 `tsconfig.json`。

主要风险是模块格式混用、Electron 主进程入口和 preload 的运行时边界、IPC payload 缺乏统一类型、worker 消息协议，以及 renderer 与主进程共享数据结构可能在迁移中漂移。

## 架构与配置

新增分层 TypeScript 配置：

- `tsconfig.base.json`：共享 `target`、模块解析、路径、类型环境和迁移期间的基础选项。
- `tsconfig.app.json`：主进程、preload、workers 和共享业务模块。
- `tsconfig.renderer.json`：Preact/JSX renderer。
- `tsconfig.tests.json`：Vitest 测试及测试专用类型。

最终使用 `tsc --noEmit` 执行类型检查，TypeScript 不直接向源码目录输出编译文件。现有 `esbuild` 继续负责编译和打包，扩展 `.ts`/`.tsx` loader 与对应入口配置。全部迁移完成后删除 `jsconfig.json`，避免配置重复和 include/path 漂移。

迁移期间通过分层配置和目录范围控制逐步提高严格度；已完成目录不得依赖永久性的 `any` 或 `@ts-ignore`。对于第三方库或历史动态数据，优先在边界处定义 `unknown`、类型守卫或显式适配类型。

## 分批迁移顺序

### 第一阶段：基础设施与 preload API 契约

- 建立 TypeScript 分层配置和类型检查命令。
- 配置 ESLint 对 `.ts`/`.tsx` 的解析和规则。
- 配置 esbuild 处理 `.ts`/`.tsx`。
- 为 preload 暴露的 API 建立类型定义。
- 为 renderer 的 `window.api` 和 `platformInfo` 建立全局类型声明。
- 迁移少量最简单的共享类型文件，验证构建、测试和类型检查链路。

验收重点：现有应用构建和测试保持通过，renderer 能获得类型化 IPC API，且不改变运行时行为。

### 第二阶段：Electron 运行边界

迁移主入口、窗口、托盘、IPC 注册、preload、workers 和 Electron 启动相关脚本。保持 CommonJS/ESM 边界和现有发布产物不变，明确 Electron API、IPC request/response、worker 消息和生命周期类型。

验收重点：应用可以启动，主窗口、托盘、IPC 和 worker 生命周期行为与迁移前一致。

### 第三阶段：共享业务模块和后端业务域

按依赖关系分批迁移 `src/utils`、`src/config`、`src/detectors`、`src/stocks`、`src/funds`、`src/metals`、`src/ai`、`src/ai-sessions`、`src/ai-usage` 等目录。每批完成后清理该域的隐式 `any`，必要时只做服务于类型边界的小规模重构。

验收重点：每个域的单元测试通过，完成域不再保留同名 JS 实现。

### 第四阶段：renderer

先迁移共享类型、store、hooks 和公共组件，再按 games、worldcup、stocks、funds、AI 等功能域把 `.jsx` 转为 `.tsx`。保留 Preact compat、自动 JSX runtime、现有路由和 CSS/HTML 结构。

验收重点：renderer 构建、组件测试和视觉测试保持通过，公共 `window.api` 类型不出现重复定义。

### 第五阶段：测试与 scripts

迁移 `tests`、`scripts`、build 辅助代码和配置脚本。最后开启全项目 `strict`，移除迁移期临时放宽配置，完成 JS/JSX 残留扫描和发布构建验证。

验收重点：全项目类型检查、lint、完整测试和生产构建通过；目标代码范围不再残留待迁移的 `.js`/`.jsx`。

## 构建与运行兼容性

- Electron 的实际入口仍由发布配置指向可执行的 JavaScript 产物；构建流程负责把 TypeScript 入口编译到现有预期位置。
- renderer 继续由现有 esbuild bundle 流程生成 `renderer-dist`，不改变 HTML 引用路径。
- preload、worker 和主进程 bundle 的输出路径和加载方式保持不变。
- 不引入运行时 TypeScript loader。
- 每批迁移都必须验证对应的开发启动、测试和构建命令，不能只依赖 `tsc` 通过。

## 类型边界

- preload API 是 renderer 与主进程之间的单一类型契约来源。
- IPC channel、参数、返回值和事件 payload 使用显式类型；多状态数据使用可判别联合。
- worker 消息使用显式 request/result/error 消息类型。
- 外部 HTTP、配置文件、持久化 JSON 和第三方返回值在信任边界先视为 `unknown`，再通过解析器或类型守卫进入业务层。
- 不使用全局 `any` 作为迁移捷径；确需临时放宽时必须限定目录和阶段，并在后续批次消除。

## 验证与回滚

每个批次独立提交，遵循“迁移少量文件 → 定向测试 → 类型检查 → lint → 构建 → 完整测试”的循环。批次之间保持可回滚，避免把多个独立迁移域混在同一个提交中。

最终验收包括：

- `tsc --noEmit` 覆盖全部目标代码并启用 `strict`。
- ESLint 覆盖 `.ts`/`.tsx` 和残留 `.js`/`.jsx`。
- Vitest 完整测试通过。
- renderer 构建和 Electron 发布构建通过。
- 启动、窗口、托盘、IPC、worker、renderer 关键路径行为无回归。
- JS/JSX 残留扫描结果符合迁移范围；配置和文档中不再引用已删除入口。

与本次迁移无关的既有 lint 问题单独记录，不扩大迁移范围；若某个批次引入新失败，优先回滚该批次而不是在后续批次掩盖问题。

## 第一阶段交付边界

第一阶段只实现基础设施和 preload API 类型契约，不迁移整个项目。其交付物应包括分层 TypeScript 配置、esbuild/ESLint/Vitest 支持、共享 API 类型和 `window` 类型声明，以及一个可运行的最小 TypeScript 示例或最小迁移文件，用于证明整条构建链路可用。
