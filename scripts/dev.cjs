#!/usr/bin/env node
"use strict";

/** Starts Electron plus the renderer rebuild watcher without an extra dependency. */
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const env = { ...process.env, NODE_ENV: "development" };
const watcher = spawn(process.execPath, ["scripts/watch-renderer.cjs"], { cwd: root, env, stdio: "inherit" });
const electron = spawn(require("electron"), ["."], { cwd: root, env, stdio: "inherit" });

function stop(code = 0) {
  watcher.kill();
  electron.kill();
  process.exit(code);
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
electron.on("exit", (code) => stop(code || 0));
