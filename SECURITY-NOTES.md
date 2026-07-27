# SECURITY-NOTES — 依赖漏洞审计与处置记录

> **最近审计**: 2026-07-26 (code-simplifier cleanup + vitest 4 升级)
> **审计方式**: `npm audit` (项目根 .npmrc 已切到 registry.npmjs.org)
> **当前状态**: 33 → 26 vulnerabilities (7 已修, 26 评估后保留, 0 moderate / 0 low)

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

## 保留 (26 个, 评估为"暂不修")

剩余漏洞全部是 **transitive dependencies**, 被以下 3 个 root dev-tool 依赖锁住:

### 1. `eslint` 9.x → 需升 `eslint@10.8.0` (4-5 个漏洞根因)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| @eslint/eslintrc, @eslint/config-array | (transitive) | high |
| minimatch | DoS via exponential-time expansion | high |
| brace-expansion | DoS via exponential-time expansion | high |

**为什么不修**: eslint 10 跟 `eslint-plugin-react-hooks@5` peer 不兼容 (peer 限制到 9). 升级 eslint 10 需要等 react-hooks plugin 升级支持, 或者迁移到 eslint 9 兼容的 hooks plugin.

### 2. `electron-builder` ≤ 24 → 需升 `electron-builder@26.15.3` (15+ 个漏洞根因, 含 critical)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| **tar** (transitive via node-gyp / app-builder-lib) | 11 个 advisory (路径遍历 / 符号链接 / DoS 等) | **critical** |
| @electron/asar, @electron/universal, app-builder-lib, dmg-builder, dir-compare, ejs, filelist, jake 等 | (transitive) | high |

**为什么不修**: electron-builder 25/26 改了 macOS notarization API + windows signing 流程, 现有 `build/after-pack.cjs` + entitlements 配置可能要改. tar 的 critical 只影响 build 时解压第三方包 (electron-builder 下载依赖时用), 不影响运行时 app 用户.

### 3. `stylelint` ≤ 16 → 需升 `stylelint@17.14.1` (5 个漏洞根因)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| stylelint + file-entry-cache/flat-cache/glob/rimraf | (transitive) | high |

**为什么不修**: stylelint 17 改了 rule API, 现有 `.stylelintrc.json` 配置可能失效.

## 处置原则

1. **CI/runtime 漏洞优先**: 所有保留的漏洞都在 **devDependencies** (eslint/electron-builder/stylelint), 不进生产 bundle (`npm run build:mac` 产物). 用户安装的 app 不受影响.
2. **Major 升级单独做**: 每个 breaking 升级应该单独开分支 + 单独 commit + 单独验证, 不混在其他 cleanup 里.
3. **`.npmrc` 已切官方源**: 项目根 `.npmrc` 把 registry 改到 `registry.npmjs.org` (覆盖用户级 Nexus). 团队成员如需切回 Nexus, 删 `.npmrc` 即可.

## 下次审计

- 跑: `npm audit` (项目根 .npmrc 已配置)
- 比对本文件: 新漏洞补到上面, 已修的从"保留"挪到"已修复"
- 优先级建议: electron-builder 26 (含 critical, 但只影响 build) > eslint 10 (等 plugin 支持) > stylelint 17

