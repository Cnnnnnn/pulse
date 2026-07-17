# State Store Simplification Plan

**Goal:** 删除状态存储和核心 IPC 中的重复校验、重复异常捕获与重复模块加载，同时保持容错行为。

**Scope:**

- `src/main/state-store.js`
- `src/main/ipc/register-core.js`
- `tests/main/state-store.test.js`

**Constraints:**

- 不改变公开 API、默认值或错误结构。
- 不改变损坏 JSON 的容错行为。
- 不改变 watchlist 校验或持久化逻辑。
- 不新增依赖或共享抽象。

## Tasks

- [ ] 为五个状态加载器增加损坏 JSON 默认值回归断言。
- [ ] 在 `_loadOrThrow` 中只调用一次 `validateState`。
- [ ] 删除五个状态加载器对不抛异常 `load()` 的重复 try/catch。
- [ ] 让三个 watchlist IPC handler 复用文件顶部的 `stateStore`。
- [ ] 运行聚焦测试、完整功能测试、性能基准和 renderer 构建。
- [ ] 检查 lint、diff 边界与净代码变化。
