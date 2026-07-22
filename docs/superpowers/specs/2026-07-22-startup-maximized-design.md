# 应用冷启动最大化设计

## 目标

主窗口在应用冷启动并首次显示时以操作系统原生“最大化”状态打开，而不是使用默认的 `1080x780` 小窗口。

## 行为范围

- 仅影响应用冷启动时主窗口的首次显示。
- 从托盘或 Dock 再次唤醒窗口时，不强制改变用户当前的窗口状态。
- 不影响离屏分享卡等其他 `BrowserWindow`。
- 保留现有 `minWidth`、`minHeight` 和默认尺寸，作为取消最大化后的窗口尺寸。

## 实现

在 `src/main/window.js` 的 `ready-to-show` 回调中，当 `config.check_on_launch` 为真时，按以下顺序执行：

1. `mainWindow.maximize()`
2. `mainWindow.show()`
3. `mainWindow.focus()`

继续保持 `show: false`，避免启动时先显示小窗口再放大。不要修改 `showWindow()`，以确保后续唤醒不会再次强制最大化。

## 错误与兼容性

使用 Electron `BrowserWindow.maximize()`，由操作系统处理可用工作区、多显示器、Dock 和任务栏边界，无需手动计算窗口尺寸。

## 验证

补充或复用最小窗口管理器测试，验证：

- 首次 `ready-to-show` 时先最大化再显示和聚焦。
- 普通 `showWindow()` 唤醒路径不会调用 `maximize()`。
