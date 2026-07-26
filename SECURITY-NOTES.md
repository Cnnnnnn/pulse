# SECURITY-NOTES — 依赖漏洞审计与处置记录

> **最近审计**: 2026-07-26 (code-simplifier cleanup 收尾)
> **审计方式**: `npm audit --registry=https://registry.npmjs.org` (默认 Nexus registry 不支持 audit 接口)
> **当前状态**: 33 → 32 vulnerabilities (1 已修, 32 评估后保留)

## 已修复 (2026-07-26)

| Package | 严重度 | 漏洞 | 处置 |
|---|---|---|---|
| `dompurify` 3.4.11 → 3.4.12 | low | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) `CUSTOM_ELEMENT_HANDLING` bypasses `afterSanitizeElements` | root dep, `npm install dompurify@latest` 直接升 |

## 保留 (32 个, 评估为"暂不修")

剩余漏洞全部是 **transitive dependencies**, 被以下 4 个 root dev-tool 依赖锁住, 升级需要 **major breaking change**:

### 1. `vitest` ≤ 3.2.5 → 需升 `vitest@4.1.10` (25 个漏洞的根因之一)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| vitest 自身 | [GHSA-...](https://github.com/advisories/) Vitest UI server 任意文件读取/执行 | **critical** |
| vite ≤ 6.4.2 | Path Traversal in Optimized Deps `.map` Handling | high |
| esbuild ≤ 0.24.2 | 开发服务器任意请求/响应读取 | moderate |
| @vitest/mocker ≤ 3.0.0-beta.4 | (transitive) | moderate |
| vite-node ≤ 2.2.0-beta.2 | (transitive) | moderate |

**为什么不修**: vitest 4 是 major breaking, 配置/API 变化未知, 现有 474 个 test files / 4901 tests 全部依赖 vitest 3 行为. 升级需要单独的迁移工作 (跑全量 vitest 4 兼容性测试).

### 2. `eslint` ≤ 9.x → 需升 `eslint@10.8.0` (5 个漏洞根因)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| eslint 自身 | (multiple) | high |
| @eslint/config-array, @eslint/eslintrc | (transitive) | high |
| minimatch | DoS via exponential-time expansion | high |
| brace-expansion | DoS via exponential-time expansion | high |

**为什么不修**: eslint 10 是 major breaking, `eslint.config.mjs` flat config 兼容性未知. 升级需要单独迁移工作.

### 3. `electron-builder` ≤ 24 → 需升 `electron-builder@25.1.8` (12 个漏洞根因)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| electron-builder 自身 + transitive (@electron/asar, @electron/universal, app-builder-lib, dmg-builder, dir-compare, ejs, filelist, jake, electron-winstaller, electron-builder-squirrel-windows) | (multiple, mostly transitive vulns) | high |

**为什么不修**: electron-builder 25 改了 macOS notarization API + windows signing 流程, 现有 `build/after-pack.cjs` + entitlements 配置可能要改. 升级需要 build 验证 (跑 `npm run build:mac` + `build:win` 实测).

### 4. `stylelint` ≤ 16 → 需升 `stylelint@17.14.1` (5 个漏洞根因)

| 影响 | 漏洞 | 严重度 |
|---|---|---|
| stylelint 自身 | (transitive via file-entry-cache/flat-cache/glob/rimraf) | high |
| stylelint-config-standard → needs `stylelint-config-standard@40.0.0` | (transitive) | high |

**为什么不修**: stylelint 17 改了 rule API, 现有 `.stylelintrc.json` 配置可能失效. 升级需要 lint:css 验证.

## 处置原则

1. **CI/runtime 漏洞优先**: 所有保留的漏洞都在 **devDependencies** (vitest/eslint/electron-builder/stylelint), 不进生产 bundle (`npm run build:mac` 产物). 用户安装的 app 不受影响.
2. **Major 升级单独做**: 每个 breaking 升级 (vitest 4 / eslint 10 / electron-builder 25 / stylelint 17) 应该单独开分支 + 单独 commit + 单独验证, 不混在其他 cleanup 里.
3. **审计 Nexus URL 完整性**: 用 `--registry=https://registry.npmjs.org` 跑 audit fix 会把 `package-lock.json` 里所有 `resolved` URL 从 `nexus.npt.seabank.io` 改成 `registry.npmjs.org`, 破坏团队镜像依赖. **永远只用它做 audit (只读), 不要用它做 fix**. fix 走默认 Nexus registry + 手动 `npm install <pkg>@latest`.

## 下次审计

- 跑: `npm audit --registry=https://registry.npmjs.org`
- 比对本文件: 新漏洞补到上面, 已修的从"保留"挪到"已修复"
- 评估 breaking 升级是否到时机 (例: vitest 4 / eslint 10 是否已有 stable + 社区迁移指南)
