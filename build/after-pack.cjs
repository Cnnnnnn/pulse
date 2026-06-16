/**
 * build/after-pack.cjs
 *
 * 在 electron-builder 打完 .app 之后跑, 手动 ad-hoc 签.
 *
 * 背景: electron-builder 25.x 在没 Apple Developer ID 证书时, 默认不签 .app
 * (只在某些版本给 ARM/universal 加 ad-hoc fallback). 没签的 .app 在 keychain 看来
 * 完全没有 designated requirement, safeStorage 走 SecKeychainAddGenericPassword 时
 * ACL 拒, isEncryptionAvailable() 返 false.
 *
 * ad-hoc 签名 (`codesign -s -`) 会给 .app 一个 empty team ID 的 designated requirement,
 * macOS 用它建 keychain ACL, 之后所有 safeStorage 调用都通过.
 *
 * 没签的 .app 还有"damaged"弹窗问题 (Apple Silicon Big Sur+), 签了才能消掉.
 *
 * entitlements: electron-builder 在 hardenedRuntime:true 时**会**把 entitlements 写进
 * LC_CODE_SIGNATURE, 但只在它**自己签**的时候. 我们跳过了它, 所以用 --entitlements 选项
 * 让 codesign 同时打 entitlements.
 */
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function (context) {
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${productFilename}.app`);
  const entitlements = path.resolve(__dirname, "entitlements.mac.plist");
  const entitlementsInherit = path.resolve(
    __dirname,
    "entitlements.mac.inherit.plist",
  );

  console.log(`[after-pack] ad-hoc signing ${appPath}`);

  // 1) 先签 helper / framework / nested .app (从内到外, --deep 行为)
  // 2) 签主 .app, 加 entitlements
  //    --options runtime 启用 hardened runtime
  //    --timestamp=none 不带 trusted timestamp (ad-hoc 没 timestamp server 可用)
  //    --force 覆盖既有签名
  //    --deep 对所有 nested .app 递归 (其实不依赖 --deep, 因为 step 1 已签)
  //    --entitlements 主进程用的 entitlements
  //    --entitlements-inherit helper 子进程继承的 (这个是 electron-osx-sign 用法, codesign 没这个选项, 我们改成 step 1 单独签)
  // codesign 不支持 --entitlements-inherit, helper entitlements 只能单独签 helper binary 时指定
  // 简化: 主 app + 所有 .app 内 binary 全部用 inherit entitlements 签一次, helper binary 再用主 entitlements 签

  const innerApps = (() => {
    const fs = require("fs");
    const out = [];
    const frameworksDir = path.join(appPath, "Contents/Frameworks");
    if (!fs.existsSync(frameworksDir)) return out;
    for (const name of fs.readdirSync(frameworksDir)) {
      if (name.endsWith(".app")) {
        out.push(path.join(frameworksDir, name));
      }
    }
    return out;
  })();

  // sign inner .apps (helper) with inherit entitlements
  for (const inner of innerApps) {
    console.log(`[after-pack]   ad-hoc sign (inherit) ${inner}`);
    execFileSync(
      "codesign",
      [
        "--force",
        "--sign",
        "-",
        "--entitlements",
        entitlementsInherit,
        "--timestamp=none",
        "--options=runtime",
        inner,
      ],
      { stdio: "inherit" },
    );
  }

  // sign main app with main entitlements
  console.log(`[after-pack]   ad-hoc sign (main) ${appPath}`);
  execFileSync(
    "codesign",
    [
      "--force",
      "--sign",
      "-",
      "--entitlements",
      entitlements,
      "--timestamp=none",
      "--options=runtime",
      appPath,
    ],
    { stdio: "inherit" },
  );

  // verify
  console.log(`[after-pack]   verifying signature`);
  execFileSync("codesign", ["--verify", "--verbose=2", appPath], {
    stdio: "inherit",
  });
  execFileSync("codesign", ["-dv", "--entitlements", "-", appPath], {
    stdio: "inherit",
  });
};
