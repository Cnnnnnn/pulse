/**
 * src/detectors/base.ts
 *
 * Detector 抽象基类。Phase 1 规定:
 *   - 静态属性 name（子类覆盖）
 *   - 实例属性 timeout（per-detector，可被 detector 配置覆盖）
 *   - 抽象方法 detect(ctx) → DetectorResult
 *
 * DetectContext 携带一次检测所需的全部依赖（http / logger / arch / appCfg）。
 * 这样 detector 本体保持纯逻辑、易测、不直接 require fs/https。
 */

export class DetectorResult {
  version: any;
  raw: any;
  source: any;
  confidence: any;
  note: any;
  changelog: any;
  changelog_url: any;
  changelog_format: any;
  track_id: any;
  release_url: any;

  /**
   * @param {object} opt
   * @param {string|null} opt.version    解析出的版本号；失败为 null
   * @param {*}           opt.raw        原始响应/数据，诊断用
   * @param {string}      opt.source     detector 名（自动 = this.constructor.name）
   * @param {'high'|'medium'|'low'} [opt.confidence='high']
   * @param {string}      [opt.note='']  解释（低置信度 / 部分匹配 / 解析路径）
   * @param {string}      [opt.changelog='']      候选 3 (Phase 14): markdown / 纯文本 release notes
   *                                            UI 端会用 marked + DOMPurify 渲染
   * @param {string}      [opt.changelog_url='']  完整 release notes 链接, 旁路 fallback
   *                                            (changelog 字段为空时也带, 让用户点过去看)
   * @param {'md'|'html'} [opt.changelog_format='md']  changelog 的格式
   *                                            md = 简单 markdown 渲染
   *                                            html = 来自 sparkle appcast, 需 sanitize
   * @param {number}      [opt.track_id=0]        Phase 22: App Store trackId, 给 Bulk Upgrade 拼
   *                                              macappstore://apps.apple.com/app/id<trackId> 用.
   *                                              0 = 不可用.
   * @param {string}      [opt.release_url='']    Phase 22: sparkle 的 <enclosure url="...">, 指向
   *                                              该版本的 .zip 下载. 给 Bulk Upgrade 用 openExternal
   *                                              打开下载页. '' = 不可用, fallback 到 openPath.
   */
  constructor({
    version,
    raw = null,
    source,
    confidence = "high",
    note = "",
    changelog = "",
    changelog_url = "",
    changelog_format = "md",
    track_id = 0,
    release_url = "",
  }: any) {
    this.version = version;
    this.raw = raw;
    this.source = source;
    this.confidence = confidence;
    this.note = note;
    this.changelog = changelog || "";
    this.changelog_url = changelog_url || "";
    this.changelog_format = changelog_format || "md";
    this.track_id =
      typeof track_id === "number" && Number.isFinite(track_id) && track_id > 0
        ? track_id
        : 0;
    this.release_url = typeof release_url === "string" ? release_url : "";
  }
}

export class DetectContext {
  appCfg: any;
  arch: any;
  http: any;
  logger: any;
  detCfg: any;
  platform: any;

  /**
   * @param {object} opt
   * @param {object} opt.appCfg   新 schema: { name, bundle, detectors:[...] }
   * @param {string} opt.arch     'arm64' | 'x64'
   * @param {object} opt.http     统一 HTTP client: { get, head, post, request }
   * @param {object} opt.logger   结构化 logger: { debug, info, warn, error }
   * @param {object} [opt.detCfg] 当前 detector 在 detectors[] 里的具体配置（含 url/timeout/...）
   */
  constructor({
    appCfg,
    arch,
    http,
    logger,
    detCfg = {},
    platform,
  }: any = {}) {
    this.appCfg = appCfg;
    this.arch = arch;
    this.http = http;
    this.logger = logger;
    this.detCfg = detCfg;
    this.platform = platform || process.platform;
  }

  /** 取 per-detector 配置的 url（带空值兜底） */
  get url() {
    return this.detCfg.url || "";
  }

  /** 取 per-detector 配置的 timeout（默认走 this.timeout） */
  get timeout() {
    return this.detCfg.timeout || null;
  }
}

export class Detector {
  timeout: any;
  // 子类会用 this.url / this.field / this.id 等构造选项, 没在 class body
  // 显式声明. Phase 5 之前 CJS require("./base") 拿到的 Detector 是 any,
  // 字段随便写. Phase 7 ESM-ify 后严格 import — TS strict mode 抓出. 加索引
  // ponytail: 字段类型实际是 unknown; 如果子类要严格类型, 应改在 class body 声明.
  [key: string]: any;
  /** 子类覆盖 Function.name（见各子类 Object.defineProperty） */

  /**
   * @param {object} [opts]
   * @param {number} [opts.timeout=8000]  per-detector 硬上限（ms）
   */
  constructor(opts: any = {}) {
    this.timeout = opts.timeout ?? 8000;
  }

  /**
   * 子类实现：返回 DetectorResult；抛 DetectorError 表示这一步失败。
   * @param {DetectContext} ctx
   * @returns {Promise<DetectorResult>}
   */
  async detect(_ctx: any): Promise<DetectorResult> {
    throw new Error(
      `Detector.detect not implemented (${this.constructor.name})`,
    );
  }
}

Object.defineProperty(Detector, "name", { value: "base", configurable: true });

