/**
 * src/main/log.ts
 *
 * 诊断日志 — spec §6 埋点 + 错误日志
 *
 * 路径: ~/Library/Logs/AppUpdateChecker/{startup,detect}.log
 *      (macOS 系统标准；找不到时回退到 os.tmpdir() / 项目根)
 *
 * 环境:
 *   APP_UPDATE_CHECKER_DEBUG=1  → DEBUG 级别也写
 *   默认:  INFO / WARN / ERROR 三级
 *
 * 使用:
 *   const log = createLogger('startup');
 *   log.info('tray=45ms window=180ms total=520ms');
 *   log.error('something failed', { code: 'ENOENT' });
 *
 * 设计原则:
 *   - 不抛任何错（写日志失败只 console.error，绝不 crash 主进程）
 *   - 行格式:  [tag] ISO-timestamp text [{ ...meta }]
 *   - 单条写完即 flush（appendFileSync 简单稳）
 *   - 文件轮转按需：每文件上限 5 MB，超了改名 .1
 */

// ponytail: 只用 `import type` (TS 编译期剥除), 运行时全走 CommonJS `require()` +
//          `module.exports = ...`. 见 pool-size.ts 顶部注释原因 (post-build path
//          rewrite 依赖 path 保留裸名).
import type * as fsType from "node:fs";
import type * as osType from "node:os";
import type * as pathType from "node:path";

const fs: typeof fsType = require("node:fs");
const os: typeof osType = require("node:os");
const path: typeof pathType = require("node:path");

type LogLevel = import("../shared/electron/log-adapter").LogLevel;
type Logger = import("../shared/electron/log-adapter").Logger;

const MAX_BYTES = 5 * 1024 * 1024;   // 5 MB
const DEBUG_ENV = "APP_UPDATE_CHECKER_DEBUG";

let _logDir: string | null = null;

/**
 * 解析日志目录（macOS 标准位置；其他平台回退到 tmp）。
 * 失败也不抛，回退到 tmp。
 */
function resolveLogDir(): string {
  if (_logDir) return _logDir;
  const home = os.homedir();
  const candidates = [
    path.join(home, "Library", "Logs", "AppUpdateChecker"),
    // Linux/Windows 测试环境兜底
    path.join(home, ".app_update_checker", "logs"),
    path.join(os.tmpdir(), "app-update-checker-logs"),
  ];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      // 写权限验证
      fs.accessSync(dir, fs.constants.W_OK);
      _logDir = dir;
      return dir;
    } catch { /* try next */ }
  }
  // 都不行：把目录设到 tmp 但不验证；后续 writeLine 会兜底
  _logDir = path.join(os.tmpdir(), "app-update-checker-logs");
  try { fs.mkdirSync(_logDir, { recursive: true }); } catch { /* noop */ }
  return _logDir;
}

function isDebug(): boolean {
  return process.env[DEBUG_ENV] === "1" || process.env[DEBUG_ENV] === "true";
}

/**
 * ISO 时间戳 + 时区前加空格 — 跟 spec §6 示例一致:
 *   "2026-06-05T10:23:45 +0800"  （注意 + 前有空格）
 * 这样 grep 起来不粘。
 */
function nowIsoSpaced(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const tzOff = -d.getTimezoneOffset();
  const tzSign = tzOff >= 0 ? "+" : "-";
  const tzH = pad(Math.floor(Math.abs(tzOff) / 60));
  const tzM = pad(Math.abs(tzOff) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + ` ${tzSign}${tzH}${tzM}`;
}

/**
 * 拍平 meta 为 "k=v k2=v2 ..." 形式:
 *   - 数字 / boolean: 不加引号
 *   - 简单字符串 (字母/数字/_/./-): 不加引号 (符合 spec §6 app=Cursor 这种)
 *   - 含空格/特殊字符的字符串: 加双引号 + 转义 (\n, \r, ", \)
 *   - 嵌套对象: JSON.stringify
 *   - null/undefined → 跳过
 */
function flattenMeta(meta: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "boolean") {
      out.push(`${k}=${v}`);
    } else if (typeof v === "string") {
      if (/^[A-Za-z0-9_.-]+$/.test(v)) {
        // 简单 token: 直接拼
        out.push(`${k}=${v}`);
      } else {
        // 含特殊字符: 加双引号 + 转义
        const safe = v.replace(
          /[\\\n\r"]/g,
          (c) =>
            ({ "\\": "\\\\", "\n": "\\n", "\r": "\\r", '"': '\\"' } as Record<
              string,
              string
            >)[c],
        );
        out.push(`${k}="${safe}"`);
      }
    } else {
      try { out.push(`${k}=${JSON.stringify(v)}`); } catch { /* skip */ }
    }
  }
  return out.join(" ");
}

/**
 * spec §6 格式: [tag] ISO [+tz] <k=v> 文本 / 或带 level (DEBUG 才有)
 *   例:  [startup] 2026-06-05T10:23:45 +0800 tray=45ms window=180ms total=520ms
 *        [detect] 2026-06-05T10:23:46 +0800 app=Cursor det=cursor_redirect ms=234 version=3.6 confidence=high
 *        [detect] ... error="HTTP 400"
 * meta 优先 — 把它拍平成 k=v 序列, 更接近 spec 风格
 */
function formatLine(
  tag: string,
  level: string | null,
  text: string,
  meta: Record<string, unknown> | null,
): string {
  const ts = nowIsoSpaced();
  const head: string[] = [`[${tag}]`, ts];
  if (level && level !== "INFO") head.push(level);
  if (meta && typeof meta === "object" && Object.keys(meta).length) {
    const flat = flattenMeta(meta);
    if (flat) head.push(flat);
  }
  if (text) head.push(text);
  return head.join(" ") + "\n";
}

function writeLine(file: string, line: string): void {
  try {
    const dir = resolveLogDir();
    const full = path.join(dir, file);
    // 简单轮转
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_BYTES) {
        try { fs.renameSync(full, full + ".1"); } catch { /* noop */ }
      }
    } catch { /* file not exist yet, noop */ }
    fs.appendFileSync(full, line);
  } catch (err) {
    // 写失败就退到 console；绝不让 logger 自己 crash 主进程
    try {
      const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
      process.stderr.write(`[log-fail] ${msg}\n`);
    } catch { /* noop */ }
  }
}

/**
 * 构造一个带 tag 的 logger.
 * @param tag  startup | detect
 */
function createLogger(tag: string): Logger {
  const file = `${tag}.log`;
  const logger: Logger = {
    tag,
    file,
    dir: resolveLogDir(),
    debug(text: string, meta?: Record<string, unknown>) {
      if (!isDebug()) return;
      writeLine(file, formatLine(tag, "DEBUG", text, meta ?? null));
    },
    info(text: string, meta?: Record<string, unknown>) {
      writeLine(file, formatLine(tag, "INFO", text, meta ?? null));
    },
    warn(text: string, meta?: Record<string, unknown>) {
      writeLine(file, formatLine(tag, "WARN", text, meta ?? null));
    },
    error(text: string, meta?: Record<string, unknown>) {
      writeLine(file, formatLine(tag, "ERROR", text, meta ?? null));
    },
    // 暴露给 worker 用（通过 postMessage 把 'log' 消息送回主进程更稳；
    // 但 worker 端要直接写文件也可以用这个 raw writer）
    _write(level: LogLevel | string, text: string, meta?: Record<string, unknown>) {
      writeLine(file, formatLine(tag, level, text, meta ?? null));
    },
    // 写一行结构化 (k=v) 记录 — spec §6 风格, 不带 level
    event(meta: Record<string, unknown>) {
      writeLine(file, formatLine(tag, "INFO", "", meta));
    },
  };
  return logger;
}

// 默认导出 main + detect 两个 logger（spec §6 提到这两个文件）
const mainLog: Logger = createLogger("startup");
const detectLog: Logger = createLogger("detect");

module.exports = {
  createLogger,
  resolveLogDir,
  isDebug,
  mainLog,
  detectLog,
};