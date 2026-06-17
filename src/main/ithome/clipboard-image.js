/**
 * src/main/ithome/clipboard-image.js
 *
 * 封装 Electron clipboard.writeImage,nativeImage.createFromBuffer 的薄层。
 */
const { clipboard, nativeImage } = require("electron");

function writePngToClipboard(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length === 0) {
    throw new Error("invalid_png_buffer");
  }
  const img = nativeImage.createFromBuffer(pngBuffer);
  if (img.isEmpty()) throw new Error("native_image_empty");
  clipboard.writeImage(img);
}

module.exports = { writePngToClipboard };