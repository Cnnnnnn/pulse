# Core Utility Simplification Plan

**Goal:** 删除 timer、批量升级 action 和诊断打包中的重复控制逻辑，保持清理、错误文案和文件计数语义。

**Scope:**

- `src/main/timer-registry.js`
- `src/main/bulk-upgrade-actions.js`
- `src/main/diagnostics-aggregator.js`
- 对应聚焦测试

**Constraints:**

- Timer 清理返回目标数量，前缀筛选行为不变。
- Sparkle `releaseUrl` 继续优先于打开应用。
- Manifest 内计数不包含 manifest 自身；返回的 `fileCount` 包含。
- 不新增依赖或共享抽象。

## Tasks

- [ ] 增强 timer 实际取消回调、批量升级分支和诊断计数行为锁。
- [ ] 让 `clearAllManaged` 和测试重置复用 `clearManaged`。
- [ ] 合并五种打开应用 source 的公共分支。
- [ ] 让诊断收集器直接返回 parts，并用 `parts.length` 计数。
- [ ] 运行聚焦测试、完整功能测试、性能基准和 renderer 构建。
- [ ] 检查 lint、diff 边界与净源码变化。
