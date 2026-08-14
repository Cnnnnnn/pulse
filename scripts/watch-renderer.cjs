#!/usr/bin/env node
"use strict";

/** Rebuilds the static renderer bundle and emits one final reload signal per change burst. */
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const rendererDir = path.join(root, "src", "renderer");
const sharedDir = path.join(root, "src", "shared");
const reloadMarker = path.join(root, "renderer-dist", ".pulse-reload");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const watchTargets = [rendererDir, sharedDir, path.join(root, "index.html"), path.join(root, "styles.css")];

let rebuilding = false;
let pending = false;
let timer = null;

function emitReload() {
  fs.writeFileSync(reloadMarker, String(Date.now()));
}

function rebuild() {
  if (rebuilding) {
    pending = true;
    return;
  }
  rebuilding = true;
  execFile(npm, ["run", "build:renderer"], { cwd: root }, (error, stdout, stderr) => {
    rebuilding = false;
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if (error) {
      console.error("[watch-renderer] build failed; keeping the current renderer", error.message);
    } else {
      emitReload();
      console.log("[watch-renderer] renderer rebuilt");
    }
    if (pending) {
      pending = false;
      rebuild();
    }
  });
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    rebuild();
  }, 80);
}

for (const target of watchTargets) {
  const options = fs.statSync(target).isDirectory() ? { recursive: true } : undefined;
  fs.watch(target, options, schedule);
}

console.log("[watch-renderer] watching renderer sources");
