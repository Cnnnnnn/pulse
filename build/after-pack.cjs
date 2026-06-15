/**
 * build/after-pack.cjs
 *
 * 在 electron-builder 打完 .app 之后跑, 手动 ad-hoc 签.
 *
 * 背景: electron-builder 25.x 在没 Apple Developer ID 证书时, 默认不签 .app.
 * 没签的 .app 在 keychain 看来完全没有 designated requirement, safeStorage 走
 * SecKeychainAddGenericPassword 时 ACL 拒, isEncryptionAvailable() 返 false.
 *
 * ad-hoc 签名 (`codesign -s -`) 会给 .app 一个 empty team ID 的 designated
 * requirement, macOS 用它建 keychain ACL, 之后所有 safeStorage 调用都通过.
 *
 * 没签的 .app 还有 "damaged" 弹窗问题 (Apple Silicon Big Sur+), 签了才能消掉.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  const appOutDir = context.appOutDir;
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${productFilename}.app`);
  const entitlements = path.resolve(__dirname, "entitlements.mac.plist");
  const entitlementsInherit = path.resolve(__dirname, "entitlements.mac.inherit.plist");

  console.log(`[after-pack] ad-hoc signing ${appPath}`);

  const innerApps = (() => {
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

  for (const inner of innerApps) {
    console.log(`[after-pack]   ad-hoc sign (inherit) ${inner}`);
    execFileSync("codesign", [
      "--force",
      "--sign", "-",
      "--entitlements", entitlementsInherit,
      "--timestamp=none",
      "--options=runtime",
      inner,
    ], { stdio: "inherit" });
  }

  console.log(`[after-pack]   ad-hoc sign (main) ${appPath}`);
  execFileSync("codesign", [
    "--force",
    "--sign", "-",
    "--entitlements", entitlements,
    "--timestamp=none",
    "--options=runtime",
    appPath,
  ], { stdio: "inherit" });

  console.log(`[after-pack]   verifying signature`);
  execFileSync("codesign", ["--verify", "--verbose=2", appPath], { stdio: "inherit" });
  execFileSync("codesign", ["-dv", "--entitlements", "-", appPath], { stdio: "inherit" });
};
