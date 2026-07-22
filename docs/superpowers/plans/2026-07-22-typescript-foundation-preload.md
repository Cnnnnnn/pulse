# TypeScript 基础设施与 preload API 契约实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立项目第一阶段 TypeScript 基础设施，并将 preload 暴露的 `window.api`、`window.pulse`、`window.metalsApi` 和 `window.platformInfo` 纳入可检查的共享类型契约，同时保持现有运行时行为和构建产物不变。

**Architecture:** 使用分层 `tsconfig` 覆盖 preload、app、renderer 和 tests，TypeScript 只负责 `noEmit` 类型检查，现有 esbuild 负责把 `.ts`/`.tsx` 打包成 Electron 和 renderer 当前使用的 JavaScript 产物。`preload.ts` 导出的桥对象同时作为运行时实现和类型单一真相，renderer 的全局 `Window` 声明通过 `typeof` 引用这些对象，避免维护重复接口清单。

**Tech Stack:** TypeScript 5.6、Electron 39、esbuild 0.28、Vitest 2、ESLint 9、Preact 10、CommonJS preload bundle

## Global Constraints

- 迁移期间允许 JS/TS 共存，当前阶段只迁移基础设施和 `preload.js`，不迁移业务 renderer 或主进程。
- 最终启用 TypeScript `strict`；本阶段的配置必须保留明确的收紧路径，不得把全项目永久设置为 `any` 或 `@ts-ignore`。
- 主进程、preload、workers 和 scripts 使用现有 `esbuild` 编译，不新增 `tsx` 或 `ts-node` 运行时依赖。
- 保持现有 Electron 启动、IPC channel、方法名、参数顺序、事件 unsubscribe 行为和发布目录结构不变。
- 保留现有 Preact compat、自动 JSX runtime、CSS/HTML 结构和 renderer-dist 文件名。
- 只允许为类型边界做小规模重构；不改变业务功能，不顺便清理大型文件。
- 不修改用户已有的未提交业务改动；提交时只包含本阶段文件。

---

## 文件结构

本阶段涉及以下文件：

- Create: `tsconfig.base.json` — 共享 TypeScript 编译选项和路径别名。
- Create: `tsconfig.app.json` — preload、app 运行时代码和共享 `src` 的类型检查范围。
- Create: `tsconfig.renderer.json` — renderer 的 JSX/Preact 类型检查范围。
- Create: `tsconfig.tests.json` — Vitest 测试和测试 JSX 的类型检查范围。
- Create: `src/shared/preload-types.ts` — `Callback`、`Unsubscribe` 和 `PlatformInfo` 等跨桥基础类型。
- Create: `src/shared/window.d.ts` — 使用 `typeof` 引用 preload 导出常量，扩展 renderer 的 `Window`。
- Rename: `preload.js` → `preload.ts` — 保持相同的 `contextBridge` 实现，增加显式 API 类型约束。
- Modify: `src/main/window.js` — 仅当构建产物路径需要兼容入口时更新 preload 路径引用；保持 JS，不在本阶段迁移主进程。
- Modify: `package.json` — 增加类型检查、TypeScript preload 构建和 renderer TS loader 配置所需脚本/文件列表调整。
- Modify: `eslint.config.mjs` — 让 ESLint 解析 `.ts`/`.tsx`，并保留现有 JS/JSX 规则。
- Modify: `vitest.config.js` — 将测试 include 扩展到 `.ts`/`.tsx`，保留现有 node/happy-dom 和 alias 行为。
- Create: `tests/typescript/preload-contract.test.js` — 不加载真实 Electron，静态检查共享声明和 preload 入口关键契约。

---

### Task 1: 建立分层 TypeScript 配置

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.renderer.json`
- Create: `tsconfig.tests.json`
- Modify: `package.json`
- Test: `tests/typescript/preload-contract.test.js`

**Interfaces:**
- Produces: `npm run typecheck`，依次检查 `tsconfig.app.json`、`tsconfig.renderer.json` 和 `tsconfig.tests.json`。
- Produces: 三个配置都继承 `tsconfig.base.json`，但 include 范围互不重复到无法解释的程度。

- [ ] **Step 1: 写入配置回归测试**

创建 `tests/typescript/preload-contract.test.js`，先只验证配置文件存在、继承关系和关键选项：

```js
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

describe("TypeScript foundation", () => {
  it("has separate app, renderer, and test projects", () => {
    const base = readJson("tsconfig.base.json");
    const app = readJson("tsconfig.app.json");
    const renderer = readJson("tsconfig.renderer.json");
    const tests = readJson("tsconfig.tests.json");

    expect(app.extends).toBe("./tsconfig.base.json");
    expect(renderer.extends).toBe("./tsconfig.base.json");
    expect(tests.extends).toBe("./tsconfig.base.json");
    expect(base.compilerOptions.strict).toBe(false);
    expect(base.compilerOptions.noEmit).toBe(true);
    expect(app.compilerOptions.allowJs).toBe(true);
    expect(renderer.compilerOptions.jsx).toBe("react-jsx");
    expect(renderer.compilerOptions.jsxImportSource).toBe("preact");
    expect(tests.compilerOptions.types).toContain("vitest/globals");
  });
});
```

测试应先失败，因为四个配置文件尚不存在。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: FAIL，错误指向缺少 `tsconfig.base.json` 或对应配置文件。

- [ ] **Step 3: 写入最小配置**

创建 `tsconfig.base.json`，使用以下共享选项：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": {
      "react": ["./node_modules/preact/compat/"],
      "react-dom": ["./node_modules/preact/compat/"],
      "@main/*": ["./src/main/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

创建 `tsconfig.app.json`：

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node", "electron"],
    "strict": false
  },
  "include": ["preload.ts", "src/shared/**/*.d.ts", "src/main/**/*.js", "src/workers/**/*.js", "src/**/*.js"],
  "exclude": ["node_modules", "renderer-dist", "tests"]
}
```

创建 `tsconfig.renderer.json`：

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": false
  },
  "include": ["src/shared/**/*.d.ts", "src/renderer/**/*.jsx", "src/renderer/**/*.js", "src/renderer/**/*.tsx", "src/renderer/**/*.ts"],
  "exclude": ["node_modules", "renderer-dist"]
}
```

创建 `tsconfig.tests.json`：

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node", "vitest/globals"],
    "strict": false
  },
  "include": ["src/shared/**/*.d.ts", "tests/**/*.js", "tests/**/*.jsx", "tests/**/*.ts", "tests/**/*.tsx"],
  "exclude": ["node_modules", "renderer-dist"]
}
```

在 `package.json` 增加：

```json
"typecheck": "tsc -p tsconfig.app.json && tsc -p tsconfig.renderer.json && tsc -p tsconfig.tests.json"
```

- [ ] **Step 4: 运行配置测试和类型检查**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: PASS。

Run: `npm run typecheck`

Expected: 三个项目均以 exit code 0 完成；`allowJs: true` 与 `checkJs: false` 保证本阶段不检查尚未迁移的 JavaScript 业务类型。

- [ ] **Step 5: 提交配置批次**

```bash
git add package.json tsconfig.base.json tsconfig.app.json tsconfig.renderer.json tsconfig.tests.json tests/typescript/preload-contract.test.js
git commit -m "build: add TypeScript project configurations"
```

---

### Task 2: 将 preload 迁移为 TypeScript，并导出桥对象类型

**Files:**
- Rename: `preload.js` → `preload.ts`
- Create: `src/shared/preload-types.ts`
- Modify: `tests/typescript/preload-contract.test.js`

**Interfaces:**
- Produces: `Callback<T>`、`Unsubscribe`、`PlatformInfo` 三个共享基础类型。
- Produces: `api`、`pulse`、`metalsApi`、`platformInfo` 四个导出常量；它们既是 `contextBridge` 的运行时对象，也是后续 `Window` 声明的类型单一真相。
- 保持: 四个 `contextBridge.exposeInMainWorld` 名称、全部 IPC channel、参数顺序和 listener 清理行为不变。

- [ ] **Step 1: 增加失败断言**

在 `tests/typescript/preload-contract.test.js` 增加：

```js
it("uses the TypeScript preload implementation as the bridge contract", () => {
  const preload = fs.readFileSync(path.join(root, "preload.ts"), "utf8");
  const types = fs.readFileSync(path.join(root, "src/shared/preload-types.ts"), "utf8");

  expect(types).toContain("export type Callback<T = unknown>");
  expect(types).toContain("export interface PlatformInfo");
  expect(preload).toContain("export const api =");
  expect(preload).toContain("export const pulse =");
  expect(preload).toContain("export const metalsApi =");
  expect(preload).toContain('exposeInMainWorld("api", api)');
  expect(preload).not.toContain(": any");
  expect(preload).not.toContain("@ts-ignore");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: FAIL，错误指向缺少 `preload.ts` 或 `src/shared/preload-types.ts`。

- [ ] **Step 3: 创建共享基础类型**

创建 `src/shared/preload-types.ts`：

```ts
export type Callback<T = unknown> = (data: T) => void;
export type Unsubscribe = () => void;

export interface PlatformInfo {
  platform: NodeJS.Platform;
}
```

本阶段只共享跨桥通用原语，不手写一份与 300 多个方法重复的镜像接口。

- [ ] **Step 4: 重命名 preload 并建立单一类型真相**

将 `preload.js` 重命名为 `preload.ts`。把四个内联对象提取为导出常量，再传给 `contextBridge`：

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { Callback, PlatformInfo } from "./src/shared/preload-types";

export const platformInfo: PlatformInfo = {
  platform: process.platform,
};

export const api = {
  // 此处原样保留 preload.js 的 api 对象全部成员和 IPC channel。
};

export const pulse = {
  // 此处原样保留 preload.js 的 pulse 对象。
};

export const metalsApi = {
  // 此处原样保留 preload.js 的 metalsApi 对象。
};

contextBridge.exposeInMainWorld("platformInfo", platformInfo);
contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("pulse", pulse);
contextBridge.exposeInMainWorld("metalsApi", metalsApi);
```

对原文件每个未标注参数执行以下规则，不改变函数体：

- URL、ID、名称、日期键、代码和查询字符串标为 `string`。
- 数字时长标为 `number`。
- callback 标为 `Callback<unknown>`；无 payload callback 标为 `() => void`。
- 当前没有稳定模型的对象输入标为 `unknown`，并保留原有运行时判断。
- 需要读取属性的对象先定义只包含当前读取字段的局部 interface，不使用类型断言绕过检查。
- 不添加 `any`、`@ts-ignore` 或索引签名兜底。

创建 `tsconfig.preload.json`，让 preload 从第一阶段开始单独启用隐式 `any` 检查：

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node", "electron"],
    "noImplicitAny": true
  },
  "include": ["preload.ts", "src/shared/**/*.ts", "src/shared/**/*.d.ts"],
  "exclude": ["node_modules", "dist", "renderer-dist"]
}
```

将 `package.json` 的 `typecheck` 命令调整为先检查 preload，再检查其余三个项目。

- [ ] **Step 5: 运行契约测试和 preload 类型检查**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: PASS。

Run: `npx tsc -p tsconfig.preload.json --noEmit`

Expected: PASS，且没有隐式 `any`。

- [ ] **Step 6: 提交 preload 源码迁移**

```bash
git add -A preload.js preload.ts src/shared/preload-types.ts tsconfig.preload.json tests/typescript/preload-contract.test.js package.json
git commit -m "refactor: migrate preload bridge to TypeScript"
```

---

### Task 3: 声明 renderer Window 桥类型并构建 preload

**Files:**
- Create: `src/shared/window.d.ts`
- Modify: `src/main/window.js`
- Modify: `package.json`
- Modify: `tests/typescript/preload-contract.test.js`

**Interfaces:**
- Consumes: `typeof api`、`typeof pulse`、`typeof metalsApi`、`typeof platformInfo`。
- Produces: renderer 全局 `Window.api`、`Window.pulse`、`Window.metalsApi`、`Window.platformInfo`。
- Produces: `dist/preload.js` CommonJS bundle，作为 Electron 实际加载的 preload。

- [ ] **Step 1: 增加 Window 和构建路径失败断言**

在契约测试增加：

```js
it("declares Window from the preload implementation and builds a JS preload", () => {
  const windowTypes = fs.readFileSync(path.join(root, "src/shared/window.d.ts"), "utf8");
  const packageJson = readJson("package.json");
  const windowManager = fs.readFileSync(path.join(root, "src/main/window.js"), "utf8");

  expect(windowTypes).toContain('import type { api, metalsApi, platformInfo, pulse } from "../../preload"');
  expect(windowTypes).toContain("api: typeof api");
  expect(windowTypes).toContain("pulse: typeof pulse");
  expect(windowTypes).toContain("metalsApi: typeof metalsApi");
  expect(packageJson.scripts["build:preload"]).toContain("--outfile=dist/preload.js");
  expect(windowManager).toContain('"dist", "preload.js"');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: FAIL，缺少 `window.d.ts`、构建脚本或新 preload 路径。

- [ ] **Step 3: 创建 Window 全局声明**

创建 `src/shared/window.d.ts`：

```ts
import type { api, metalsApi, platformInfo, pulse } from "../../preload";

declare global {
  interface Window {
    api: typeof api;
    pulse: typeof pulse;
    metalsApi: typeof metalsApi;
    platformInfo: typeof platformInfo;
  }
}

export {};
```

这样新增或删除桥方法时，renderer 类型自动跟随 preload 实现，不维护第二份接口清单。

- [ ] **Step 4: 增加 preload 构建并更新加载路径**

在 `package.json` 增加：

```json
"build:preload": "esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js --target=es2020"
```

将 `prestart`、`build`、`dev` 调整为启动 Electron 或 electron-builder 前执行 `build:preload`；避免 `build` 通过 `prestart` 间接重复构建。将 electron-builder `files` 中的 `preload.js` 替换为 `dist/preload.js`。

将 `src/main/window.js` 默认 preload 路径改为：

```js
const preloadPath = opts.preloadPath || path.join(__dirname, "..", "..", "dist", "preload.js");
```

测试显式传入的 `opts.preloadPath` 仍优先。

- [ ] **Step 5: 构建并静态验证产物**

Run: `npm run build:preload`

Expected: 生成 `dist/preload.js`，esbuild exit code 0。

Run: `node --check dist/preload.js`

Expected: exit code 0。不要用裸 Node `require()` 执行 preload，因为 `contextBridge` 只能在 Electron preload 环境工作。

Run: `npx vitest run tests/typescript/preload-contract.test.js tests/main/window.test.js`

Expected: PASS。

- [ ] **Step 6: 提交 Window 契约和构建接入**

```bash
git add src/shared/window.d.ts src/main/window.js package.json tests/typescript/preload-contract.test.js
git commit -m "build: compile TypeScript preload for Electron"
```

---

### Task 4: 接入 renderer、ESLint、Vitest 并验证构建链

**Files:**
- Modify: `scripts/clean-renderer-css-chunks.cjs` — 仅在构建脚本需要同步入口时修改，不改 CSS 行为。
- Modify: `package.json`
- Modify: `eslint.config.mjs`
- Modify: `vitest.config.js`
- Modify: `tsconfig.renderer.json`
- Modify: `tsconfig.tests.json`
- Modify: `tests/typescript/preload-contract.test.js`

**Interfaces:**
- Produces: ESLint 能解析 `.ts`、`.tsx`、`.js`、`.jsx`，且 renderer 使用 JSX parser。
- Produces: Vitest include 覆盖 `tests/**/*.test.{js,jsx,ts,tsx}` 和 bench 的四种扩展名。
- Produces: `npm run build:renderer` 能继续生成现有 `renderer-dist/index.js`、`index.css` 和 share-card bundle。

- [ ] **Step 1: 扩展配置回归测试**

在测试中加入对三个配置文件的静态断言：

```js
it("keeps TypeScript in lint, test, and renderer build paths", () => {
  const eslint = fs.readFileSync(path.join(root, "eslint.config.mjs"), "utf8");
  const vitest = fs.readFileSync(path.join(root, "vitest.config.js"), "utf8");
  const packageJson = readJson("package.json");

  expect(eslint).toContain('"**/*.ts"');
  expect(eslint).toContain('"**/*.tsx"');
  expect(vitest).toContain("test.{js,jsx,ts,tsx}");
  expect(packageJson.scripts["build:renderer"]).toContain("--loader:.tsx=tsx");
});
```

测试应先失败，直到配置接入完成。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/typescript/preload-contract.test.js`

Expected: FAIL，缺少 `.ts/.tsx` lint 或 build loader 配置断言。

- [ ] **Step 3: 接入 ESLint 和 Vitest 扩展名**

在 `eslint.config.mjs` 增加 TypeScript 文件匹配：

```js
files: ["src/renderer/**/*.js", "src/renderer/**/*.jsx", "src/renderer/**/*.ts", "src/renderer/**/*.tsx"]
```

并为主进程/共享 TypeScript 增加与现有 CommonJS 规则等价的 scope；使用已有 `tseslintParser`，不新增 parser 依赖。tests scope 扩展到 `.ts/.tsx`。

在 `vitest.config.js` 将 include 改为：

```js
include: [
  "tests/**/*.test.{js,jsx,ts,tsx}",
  "tests/**/*.bench.{js,jsx,ts,tsx}",
],
```

- [ ] **Step 4: 接入 renderer esbuild loader**

在现有 `build:renderer` 的两个 esbuild 命令增加：

```text
--loader:.ts=ts --loader:.tsx=tsx
```

保留原 `.jsx=jsx`、Preact alias、splitting、target、outfile 和 CSS merge 顺序。不要将 `tsc` 输出目录接到 renderer HTML；renderer 仍使用 `renderer-dist`。

- [ ] **Step 5: 运行第一阶段全链路验证**

按顺序运行：

```bash
npx vitest run tests/typescript/preload-contract.test.js
npm run typecheck
npm run lint -- --quiet
npm run build:renderer
npm run build:preload
npm test -- --run
```

Expected:

- 契约测试 PASS。
- TypeScript 的 preload、app、renderer 和 tests 四个 project check 均完成；本阶段新增配置和声明不产生错误。
- 本阶段修改的配置、声明和 preload 文件无 ESLint 错误；仓库既有错误单独记录。
- renderer 产物名称和 CSS merge 结果与迁移前一致。
- 完整 Vitest 通过。

- [ ] **Step 6: 提交第一阶段配置接入**

```bash
git add package.json eslint.config.mjs vitest.config.js tsconfig*.json tests/typescript/preload-contract.test.js
 git commit -m "build: enable TypeScript checks and tooling"
```

---

## 计划自检

- 设计覆盖：分层配置、esbuild 构建、preload 导出类型、Window 全局声明、ESLint/Vitest 扩展、最小 TypeScript 入口和全链路验证均有对应任务。
- 范围控制：本阶段不迁移主进程、renderer 业务、workers、tests 实现或 scripts 实现；只修改构建配置、共享声明和 preload 入口。
- 类型一致性：`api`、`pulse`、`metalsApi`、`platformInfo` 在 preload 运行时对象和 `Window` 全局声明中使用同一组导出常量；`Callback` 与 `PlatformInfo` 只在 `preload-types.ts` 定义一次。
- 运行时兼容：Electron 只加载 esbuild 输出的 JavaScript；IPC channel 和暴露对象名保持不变。
- 无永久放宽：基础配置暂时 `strict: false` 是迁移期明确策略；后续阶段必须按目录收紧，最终由全项目 strict 验收。
- 不提交生成物：`dist` 和 `renderer-dist` 仅用于验证，不加入源码提交。
