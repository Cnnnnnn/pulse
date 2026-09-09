#!/usr/bin/env python3
"""把 register-*.ts 里裸的 ipcMain.handle( 换成 safeHandle(。

不碰:
- context.ts (safeHandle 实现本身)
- ipcMain.on (事件订阅，不是 request/response)
- 已是 safeHandle 的调用
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IPC_DIR = ROOT / "src" / "main" / "ipc"


def convert(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    if path.name == "context.ts":
        return 0
    # 确保函数里解构了 safeHandle
    if "safeHandle" not in src:
        print(f"SKIP no safeHandle in scope: {path.name}")
        return 0
    new, n = re.subn(r"\bipcMain\.handle\(", "safeHandle(", src)
    if n == 0:
        return 0
    path.write_text(new, encoding="utf-8")
    print(f"{path.name}: {n} handles → safeHandle")
    return n


def main() -> int:
    total = 0
    for path in sorted(IPC_DIR.glob("register-*.ts")):
        total += convert(path)
    print(f"total converted: {total}")
    # 剩余裸 handle
    left = []
    for path in sorted(IPC_DIR.glob("*.ts")):
        for i, line in enumerate(path.read_text().splitlines(), 1):
            if re.search(r"\bipcMain\.handle\(", line):
                left.append(f"{path.name}:{i}")
    print("remaining ipcMain.handle:")
    for x in left:
        print(" ", x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
