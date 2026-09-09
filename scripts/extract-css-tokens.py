#!/usr/bin/env python3
"""从 styles.css 抽出 :root 令牌块 → tokens.css，并从 styles.css 删除。

同时清理 worldcup/match-card 死选择器。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STYLES = ROOT / "styles.css"
TOKENS = ROOT / "tokens.css"


def extract_root_block(lines: list[str], start_idx: int) -> tuple[str, int]:
    """从 start_idx 的 :root 行起，返回 (block_text, end_line_exclusive)。"""
    depth = 0
    buf = []
    i = start_idx
    while i < len(lines):
        line = lines[i]
        buf.append(line)
        depth += line.count("{") - line.count("}")
        i += 1
        if depth <= 0 and buf:
            break
    return "\n".join(buf) + "\n", i


def main() -> None:
    src = STYLES.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=False)

    # 找两个顶级 :root 块（不带 [data-theme] 选择器的 light + dark）
    light_start = None
    dark_start = None
    for i, line in enumerate(lines):
        if re.match(r"^:root\s*\{", line) and light_start is None:
            light_start = i
        elif re.match(r'^:root\[data-theme="dark"\]\s*\{', line) and dark_start is None:
            dark_start = i

    if light_start is None or dark_start is None:
        raise SystemExit(f"root blocks not found: light={light_start} dark={dark_start}")

    light_block, light_end = extract_root_block(lines, light_start)
    dark_block, dark_end = extract_root_block(lines, dark_start)

    tokens = (
        "/* tokens.css — design tokens (light + dark). "
        "Load BEFORE styles.css. Extracted 2026-09-09 Phase CSS layering. */\n"
        + light_block
        + "\n"
        + dark_block
    )
    TOKENS.write_text(tokens, encoding="utf-8")

    # 从 styles.css 删除这两块（从后往前删，避免下标漂移）
    new_lines = lines[:dark_start] + lines[dark_end:]
    # light 在 dark 之前，下标仍有效
    new_lines = new_lines[:light_start] + new_lines[light_end:]

    out = "\n".join(new_lines)
    if not out.endswith("\n"):
        out += "\n"

    # 清理 match-card 死选择器
    out = out.replace(".match-card,\n", "")
    out = out.replace(".match-card-main:focus-visible,\n", "")
    out = re.sub(
        r"\n\.match-card--live\s*\{[^}]*\}\n",
        "\n",
        out,
    )
    out = re.sub(
        r"\n\.match-card--final\s*\{[^}]*\}\n",
        "\n",
        out,
    )

    STYLES.write_text(out, encoding="utf-8")
    print(f"wrote {TOKENS} ({len(tokens.splitlines())} lines)")
    print(f"styles.css: {len(lines)} → {len(out.splitlines())} lines")
    print("match-card leftovers:", out.count("match-card"))


if __name__ == "__main__":
    main()
