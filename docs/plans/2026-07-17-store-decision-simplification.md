# Store and Decision Simplification Plan

**Goal:** 删除检测会话初始化、搜索分词和自更新决策中的重复分支，同时保持 signal 写入、token 顺序和决策优先级。

**Scope:**

- `src/renderer/store/check-store.js`
- `src/main/search/tokenizer.js`
- `src/main/self-update-idle.js`
- 对应聚焦测试

**Constraints:**

- `appOrder` 保留输入顺序与重复项。
- 已存在的 phase signal 每轮只写一次，新 signal 只创建一次。
- Token 顺序、去重和 UTF-16 bigram 行为不变。
- Boot gate 继续优先于系统活动 gate。
- 不新增依赖或共享抽象。

## Tasks

- [ ] 增强重复 app 名、停用词和非法时间参数行为锁。
- [ ] 用 app 名 Map 直接初始化 session phases。
- [ ] 删除 tokenizer 末尾重复停用词过滤。
- [ ] 合并 self-update 的 `too_soon` 条件与最终分支。
- [ ] 运行聚焦测试、完整功能测试、性能基准和 renderer 构建。
- [ ] 检查 lint、diff 边界与净源码变化。
