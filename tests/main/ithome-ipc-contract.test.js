import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const handlerSource = readFileSync(
  "src/main/ipc/register-ithome.js",
  "utf8",
);
const preloadSource = readFileSync("preload.js", "utf8");

describe("ithome comments IPC contract", () => {
  it("registers a comments handler and preload bridge", () => {
    expect(handlerSource).toContain('safeHandle("ithome:fetch-comments"');
    expect(preloadSource).toContain("ithomeFetchComments:");
    expect(preloadSource).toContain(
      'ipcRenderer.invoke("ithome:fetch-comments"',
    );
  });
});
