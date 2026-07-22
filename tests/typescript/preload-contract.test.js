import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "../..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

describe("TypeScript foundation", () => {
  it("has separate app, renderer, and test projects", () => {
    const base = readJson("tsconfig.base.json");
    const app = readJson("tsconfig.app.json");
    const renderer = readJson("tsconfig.renderer.json");
    const tests = readJson("tsconfig.tests.json");

    expect(app.extends).toBe("./tsconfig.base.json");
    expect(renderer.extends).toBe("./tsconfig.base.json");
    expect(tests.extends).toBe("./tsconfig.base.json");
    expect(base.compilerOptions.strict).toBe(false);
    expect(base.compilerOptions.noEmit).toBe(true);
    expect(app.compilerOptions.allowJs).toBe(true);
    expect(renderer.compilerOptions.jsx).toBe("react-jsx");
    expect(renderer.compilerOptions.jsxImportSource).toBe("preact");
    expect(tests.compilerOptions.types).toContain("vitest/globals");
  });

  it("uses the TypeScript preload implementation as the bridge contract", () => {
    const preload = fs.readFileSync(path.join(root, "preload.ts"), "utf8");
    const types = fs.readFileSync(path.join(root, "src/shared/preload-types.ts"), "utf8");

    expect(types).toContain("export type Callback<T = unknown>");
    expect(types).toContain("export interface PlatformInfo");
    expect(preload).toContain("export const api =");
    expect(preload).toContain("export const pulse =");
    expect(preload).toContain("export const metalsApi =");
    expect(preload).toContain('exposeInMainWorld("api", api)');
    expect(preload).not.toContain(": any");
    expect(preload).not.toContain("@ts-ignore");
  });
});
