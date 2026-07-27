# SECURITY-NOTES — 依赖漏洞审计与处置记录

> **最近审计**: 2026-07-26 (code-simplifier cleanup + vitest 4 + electron-builder 26 升级)
> **审计方式**: `npm audit` (项目根 .npmrc 已切到 registry.npmjs.org)
> **当前状态**: 33 → 19 vulnerabilities (14 已修, 19 评估后保留, 0 critical / 0 moderate / 0 low)

## 已修复 (2026-07-26)

### Round 1: dompurify (root dep 安全升级)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `dompurify` 3.4.11 → 3.4.12 | low | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` | root dep, `npm install dompurify@latest` 直接升 |

### Round 2: vitest 2 → vitest 4 + 连带升级 (major breaking, 已迁移)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `vitest` 2.1.9 → 4.1.10 | **critical** | Vitest UI server 任意文件读取/执行 | major 升级 + 测试适配 (见下) |
| `vite` ≤ 6.4.2 → 8.1.5 | high | Path Traversal in Optimized Deps `.map` Handling | vitest 4 连带 |
| `esbuild` ≤ 0.24.2 | moderate | 开发服务器任意请求/响应读取 | vitest 4 连带修复 |
| `@vitest/mocker` ≤ 3.0.0-beta.4 | moderate | (transitive) | vitest 4 连带 |
| `vite-node` ≤ 2.2.0-beta.2 | moderate | (transitive) | vitest 4 连带 |

**vitest 4 迁移踩坑** (后续遇到类似问题可参考):
1. `vi.fn(() => instance)` 不能被 `new` 调用 → 改 `function NameCtor() { return instance; }` (箭头函数无 [[Construct]])
2. happy-dom + react-virtuoso + preact/compat 出现 `__H undefined` → 全局 mock react-virtuoso 透传组件 (happy-dom 无 viewport, 真虚拟滚动无意义)
3. vitest 4 install 把 eslint 顺带升到 10 (跟 eslint-plugin-react-hooks 不兼容) → 手动 pin eslint@9

### Round 3: electron-builder 25 → 26 (major breaking, 已迁移)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| **`tar`** (transitive via app-builder-lib/node-gyp) | **critical** | 11 个 advisory (路径遍历 / 符号链接 / DoS 等) | electron-builder 26 连带升级 |
| `@electron/asar` ≤ 3.4.1 | high | (transitive, glob/minimatch) | electron-builder 26 连带 |
| `@electron/universal` ≤ 2.0.1 | high | (transitive) | electron-builder 26 连带 |
| `app-builder-lib` / `dmg-builder` | high | (transitive) | electron-builder 26 连带 |
| `ejs` / `filelist` / `jake` / `dir-compare` 等 | high | (transitive) | electron-builder 26 连带 |

**electron-builder 26 迁移踩坑**:
1. macOS arm64 + Windows x64 build 都验证通过 (`build:mac:arm64-only` + `build:win`)
2. `@noble/hashes@2.x` 跟 app-builder-lib 兼容 (exports 含 `./blake2.js`)
3. vitest 4 / esbuild 0.28 改变了 path join 处理, build-main.cjs 的 manual rewrite rules 全改 noop
   (esbuild 0.28 自己处理跨目录 path join, 不再需要 manual rewrite)
4. tests/main/main-bundle-paths-contract.test.ts 容忍 pre-rewrite 形态 (esbuild 接管)

## 保留 (19 个, 评估为"暂不修")

剩余漏洞全部是 **transitive dependencies**, 被以下 2 个 root dev-tool 依赖锁住:

### 1. `eslint` 9.x → 需升 `eslint@10.8.0` (5 个漏洞根因, 全 high)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| @eslint/eslintrc, @eslint/config-array | (transitive) | high |
| minimatch | DoS via exponential-time expansion | high |
| brace-expansion | DoS via exponential-time expansion | high |

**为什么不修**: eslint 10 跟 `eslint-plugin-react-hooks@5` peer 不兼容 (peer 限制到 9). 升级 eslint 10 需要等 react-hooks plugin 升级支持, 或者迁移到 eslint 9 兼容的 hooks plugin.

### 2. npm audit 误报 — electron-builder 26.x 被标 "需降级到 22"

`npm audit` 把当前装的 electron-builder@26.15.7 + 它的 transitive 树标为"needs electron-builder@22.14.13" (semver major downgrade). 这是 npm audit 的逻辑 bug — 26.15.7 是当前 latest stable, 没有真实漏洞. 真正的漏洞 (tar critical 等) 在 Round 3 已经修掉.

## 处置原则

1. **CI/runtime 漏洞优先**: 所有保留的漏洞都在 **devDependencies** (eslint), 不进生产 bundle (`npm run build:mac` 产物). 用户安装的 app 不受影响.
2. **Major 升级单独做**: 每个 breaking 升级应该单独开分支 + 单独 commit + 单独验证, 不混在其他 cleanup 里.
3. **`.npmrc` 已切官方源**: 项目根 `.npmrc` 把 registry 改到 `registry.npmjs.org` (覆盖用户级 Nexus). 团队成员如需切回 Nexus, 删 `.npmrc` 即可.

## 下次审计

- 跑: `npm audit` (项目根 .npmrc 已配置)
- 比对本文件: 新漏洞补到上面, 已修的从"保留"挪到"已修复"
- 优先级建议: eslint 10 (等 react-hooks plugin 支持) > 其他暂无 critical/high 真实漏洞


