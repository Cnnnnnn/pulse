# macOS 钥匙串 (Keychain) 故障排查

> 适用: Pulse 在 macOS 上, 点击 AI 设置的「保存 key」后无反应, UI 提示 `safeStorage 不可用` 或
> `Electron wants to access key X` 弹窗反复出现.

## 现象

UI 状态栏显示 `⚠ safeStorage 不可用, 请在系统钥匙串 (Keychain Access.app) 手动允许 Electron 访问`,
「保存 key」按钮看似无反应, 也没有错误弹窗.

## 根因 (简版)

Electron 的 `safeStorage` 在 macOS 上是把密钥存在 **login keychain** 里, 走 `SecKeychainFindGenericPassword` /
`SecKeychainAddGenericPassword` API. 这套 API 的访问控制是 **ACL (Access Control List)**, ACL 按
**"designated requirement"** 匹配调用方 binary, 即 `bundle id + team id + 签名`.

- Dev 模式 (`npm start`): binary 是 npm 装在 `node_modules/electron/dist/Electron.app` 里的 Electron,
  **没有 Apple 签名**. macOS 给它创建的 ACL 是空集, 任何访问都被拒.
- 打包模式 (`electron-builder --mac`): binary 在 `dist/mac/Pulse.app/Contents/MacOS/Pulse`,
  ACL 跟着这个 binary 走. 如果 entitlements 缺失, library validation 会再卡一层.

所以**第一次**让 Electron 访问 keychain 时, macOS 会弹一个 `Electron wants to access key "Electron Safe Storage"`
(正式打包版会显示 `Pulse Safe Storage`) 的授权框, 点 **Always Allow** 后, ACL 会记录这个 binary
的 designated requirement, 之后不再弹.

但如果用户之前**点过 Deny** 或升级过 Electron 版本, ACL 会保留旧的 designated requirement, 新的 binary
不匹配 → `isEncryptionAvailable()` 返回 `false` → safeStorage 整个机制失效.

## 5 分钟修复 (推荐, 不重装系统)

```bash
# 1. 查 keychain 里有没有脏 item
security find-generic-password -s "Pulse Safe Storage" 2>&1
security find-generic-password -s "Electron Safe Storage" 2>&1
security find-generic-password -s "Chromium Safe Storage" 2>&1

# 2. 删脏 item (会要登录密码, 因为是 login keychain)
security delete-generic-password -s "Electron Safe Storage" 2>&1
security delete-generic-password -s "Chromium Safe Storage" 2>&1
security delete-generic-password -s "Pulse Safe Storage" 2>&1

# 3. (可选) 彻底清掉对应 app 的 ACL 缓存, 强制 macOS 重新评估
#    ⚠ 这会清掉这个 app 在 login keychain 里的所有授权记录, 谨慎执行
security delete-generic-password -s "Electron Safe Storage" -a "Electron" 2>&1
security delete-generic-password -s "Chromium Safe Storage" -a "Chromium" 2>&1

# 4. 启动 Pulse
npm start
```

第一次 `safeStorage` 调用时, 系统会弹授权框, **点 "Always Allow"**. 之后不再弹,
`isEncryptionAvailable()` 一直返回 `true`, 保存 key 按钮就生效了.

## UI 弹窗出现 / 不出现的判断

| 状态                                                       | 含义                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| 弹窗 **不** 出现, safeStorage 不可用                       | ACL 拒绝, 旧 keychain item 没清掉, 走 step 2 删除     |
| 弹窗出现一次, 点 Always Allow 后, safeStorage 可用         | 正常路径, 无需任何操作                                |
| 弹窗反复出现 (每次启动 Pulse 都要点)                       | dev 模式 + `npm i` 升级了 electron, binary 路径变了, 走 step 2 + step 4 |
| 点了 Deny, 之后再不弹                                      | ACL 记了 deny, 走 step 2 删 item + 系统设置里重置授权 |

## 系统设置里手动重置授权

1. 打开 `Keychain Access.app` (钥匙串访问).
2. 左侧选 `login` → 顶部搜索 `Electron Safe Storage` 或 `Chromium Safe Storage`.
3. 双击条目, 点右下角 `Get Info` → 勾上 `Allow all applications to access this item`
   或在 `Access Control` 里加 `Electron`.
4. 也可以直接右键 → `Delete "<service>"` 彻底删掉, 重启 Pulse 重建.

## 仍然不可用? 高级排查

```bash
# 看 Pulse (或 dev 用的 Electron) 的签名状态
codesign -dv --verbose=4 "$(which electron)" 2>&1 | head -30
codesign -dv --verbose=4 /Users/shien.liang/Desktop/AppUpdateChecker-Electron/node_modules/electron/dist/Electron.app 2>&1 | head -30

# 期望看到: Authority=Software Signing / Apple Development, 至少要有 adhoc 签名
# 看到 "code object is not signed at all" → 重新装 electron: rm -rf node_modules && npm i
```

```bash
# 看 entitlements 是否被打进 binary
codesign -d --entitlements - /Users/shien.liang/Desktop/AppUpdateChecker-Electron/node_modules/electron/dist/Electron.app 2>&1
# 期望看到 com.apple.security.cs.disable-library-validation = true
# 如果是 [] → electron 二进制在 dist 安装时被 strip 掉了, 见下文
```

## 项目里做了什么 (代码层)

- `build/entitlements.mac.plist`: 主 app 用的 entitlements (JIT / unsigned-exec-memory / disable-library-validation / network.client).
- `build/entitlements.mac.inherit.plist`: helper 子进程继承用 (`com.apple.security.inherit=true`).
- `package.json` 的 `build.mac` 段加了 `entitlements` + `entitlementsInherit` 引用, `hardenedRuntime: false` (因为没 Apple Dev ID 证书).
- `src/renderer/components/AISettingsModal.jsx`:
  - safeStorage 不可用时 UI 提示**不再骗用户**说"可改用环境变量" (代码没实现 env fallback, 旧文案是误报).
  - 「保存 key」失败时, 错误 reason (`safeStorage_unavailable` 等) 翻译成中文直接展示在状态栏, 不再静默吞掉.

**dev 模式 (`npm start`) 不吃 `build/entitlements.mac.plist`** — 这份配置只在
`electron-builder --mac` 打包时由 electron-osx-sign 注入到 .app 里. dev 模式要 work,
**必须**走上面 5 分钟修复里的 `security delete-generic-password` 步骤.

## 根除 (留作未来选项)

要彻底消掉弹窗 + 跨 dev / 打包 / 多机器分发都安全, 必须走 Apple Developer ID 签名 + notarization:

1. Apple Developer Program (¥688/年) → 拿 `Developer ID Application: <team> (<TEAM_ID>)` 证书.
2. 装到 mac 上, `electron-builder` 配 `CSC_LINK` + `CSC_KEY_PASSWORD` + `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`.
3. `hardenedRuntime: true` + notarize (`xcrun altool --notarize-app` 或 `notarytool`).
4. 之后 .app 在任何 mac 上启动都不会弹密码框, keychain ACL 由 Apple 团队 ID 锁定.

这条不阻塞本项目当前 dev 流程, 留作正式发布时再做.

## 引用

- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [electron-builder mac code signing](https://www.electron.build/docs/features/code-signing/code-signing-mac)
- [electron-osx-sign entitlements wiki](https://github.com/electron/osx-sign/wiki/3.-App-Sandbox-and-Entitlements)
- [electron/electron#43233 — ACL 机制详解](https://github.com/electron/electron/issues/43233)
- [Apple SecKeychain 官方文档](https://developer.apple.com/documentation/security/keychain_services)
