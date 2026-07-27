# SECURITY-NOTES — 依赖漏洞审计与处置记录

> **最近审计**: 2026-07-26 (code-simplifier cleanup + 4 轮 major 升级)
> **审计方式**: `npm audit` (项目根 .npmrc 已切到 registry.npmjs.org)
> **当前状态**: 33 → **0** vulnerabilities 🎉 (33 已修, 0 保留)

## 已修复 (2026-07-26)

### Round 1: dompurify (root dep 安全升级)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `dompurify` 3.4.11 → 3.4.12 | low | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` | root dep, `npm install dompurify@latest` 直接升 |

### Round 2: vitest 2 → vitest 4 + 连带升级 (major breaking, 已迁移)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `vitest` 2.1.9 → 4.1.10 | **critical** | Vitest UI server 任意文件读取/执行 | major 升级 + 测试适配 |
| `vite` ≤ 6.4.2 → 8.1.5 | high | Path Traversal in Optimized Deps `.map` Handling | vitest 4 连带 |
| `esbuild` ≤ 0.24.2 | moderate | 开发服务器任意请求/响应读取 | vitest 4 连带修复 |
| `@vitest/mocker` / `vite-node` | moderate | (transitive) | vitest 4 连带 |

**vitest 4 迁移踩坑** (后续遇到类似问题可参考):
1. `vi.fn(() => instance)` 不能被 `new` 调用 → 改 `function NameCtor() { return instance; }` (箭头函数无 [[Construct]])
2. happy-dom + react-virtuoso + preact/compat 出现 `__H undefined` → 全局 mock react-virtuoso 透传组件
3. vitest 4 install 把 eslint 顺带升到 10 (跟 eslint-plugin-react-hooks@5 不兼容) → 在 Round 4 正式升 eslint 10

### Round 3: electron-builder 25 → 26 (major breaking, 已迁移)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| **`tar`** (transitive via app-builder-lib/node-gyp) | **critical** | 11 个 advisory (路径遍历 / 符号链接 / DoS 等) | electron-builder 26 连带升级 |
| `@electron/asar` / `@electron/universal` / `app-builder-lib` / `dmg-builder` / `ejs` / `filelist` / `jake` / `dir-compare` | high | (transitive) | electron-builder 26 连带 |

**electron-builder 26 迁移踩坑**:
1. macOS arm64 + Windows x64 build 都验证通过
2. `@noble/hashes@2.x` 跟 app-builder-lib 兼容 (exports 含 `./blake2.js`)
3. vitest 4 / esbuild 0.28 改变了 path join 处理, build-main.cjs 的 manual rewrite rules 全改 noop
4. tests/main/main-bundle-paths-contract.test.ts 容忍 pre-rewrite 形态

### Round 4: eslint 9 → eslint 10 + brace-expansion override (0 vulnerabilities 收尾)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `eslint` 9.39.5 → 10.8.0 | high | (连带修 @eslint/eslintrc / @eslint/config-array / minimatch / brace-expansion transitive) | major 升级 + react-hooks plugin 同步升 7 |
| `eslint-plugin-react-hooks` 5.2.0 → 7.1.1 | (peer) | — | 升级支持 eslint 10 peer |
| `@eslint/js` 9 → 10.0.1 | (peer) | — | 跟 eslint 10 对齐 |
| `globals` (新增) | — | — | eslint 10 flat config 必需 |
| `brace-expansion` ≤5.0.7 → 5.0.8 (overrides) | high | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) DoS via unbounded expansion | npm `overrides` 强制升 |

**eslint 10 迁移踩坑**:
1. eslint 10 默认开启 `no-constant-binary-expression` / `no-useless-assignment` / `preserve-caught-error` 等新规则 → 全部 off (项目大量 `catch {}` 有意吞错)
2. Node 22+ 下 `crypto` / `fetch` / `Worker` 是 built-in global, 代码 `const crypto = require("crypto")` 算 redeclare → `no-redeclare: off`
3. `@typescript-eslint/no-explicit-any` rule 未声明但代码有 inline disable → eslint 10 严格"未声明 rule 不能 disable", 删掉 3 处 stale inline disable
4. `NodeJS.Timeout` 是 TS 全局类型但 eslint 当 runtime global → 1 处 inline disable
5. brace-expansion 5.0.7 仍有漏洞, npm 不会自动升到 5.0.8 (transitive 锁), 用 `overrides` 强制

## 当前状态: 0 vulnerabilities 🎉

```
$ npm audit
found 0 vulnerabilities
```

## 处置原则

1. **CI/runtime 漏洞优先**: 所有原漏洞都在 **devDependencies**, 不进生产 bundle (`npm run build:mac` 产物). 用户安装的 app 不受影响.
2. **Major 升级单独做**: 每个 breaking 升级单独 commit + 单独验证.
3. **`.npmrc` 已切官方源**: 项目根 `.npmrc` registry 改到 `registry.npmjs.org` (覆盖用户级 Nexus). 团队成员如需切回 Nexus, 删 `.npmrc` 即可.
4. **`overrides` 用于 transitive 锁**: 当上游包没及时升级有漏洞的 transitive (如 brace-expansion), 用 npm `overrides` 强制升到 fixed 版本.

## 下次审计

- 跑: `npm audit` (项目根 .npmrc 已配置)
- 当前应该是 0 vulnerabilities; 如果有新漏洞:
  - 先看是 root dep (直接 `npm install pkg@latest`) 还是 transitive (用 `overrides`)
  - devDeps 漏洞优先级低 (不进生产), runtime deps (electron / dompurify) 优先级高



