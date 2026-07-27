#!/usr/bin/env node
// S2-7D6E3 — runs the hand-rolled standalone test scripts under src/ with plain `node`,
// one child process per file, and reports a single pass/fail summary with a correct exit
// code. These files are NOT Jest suites (no describe/it, no expect from a test
// framework) — each ends with its own assert-and-count loop and a bare `process.exit`.
// That `process.exit` is exactly why they must NEVER run inside the Jest process: Jest
// runs test files in-process (or in-band under CI=true), and a process.exit() call at
// module scope there can silently kill the whole Jest run before every suite completes.
// Running them here, one `node <file>` child process at a time, makes that impossible —
// a child calling process.exit only ends the child, and this script reads its exit code.
//
// Usage:
//   node scripts/run-standalone-tests.js standalone   # src/**/*.standalone.js
//   node scripts/run-standalone-tests.js mjs          # src/**/*.test.mjs
//   node scripts/run-standalone-tests.js all          # both

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SRC = path.join(__dirname, "..", "src");

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function collect(suffixes) {
  const all = [];
  walk(SRC, all);
  return all.filter((f) => suffixes.some((s) => f.endsWith(s))).sort();
}

const mode = process.argv[2] || "all";
const suffixMap = {
  standalone: [".standalone.js"],
  mjs: [".test.mjs"],
  all: [".standalone.js", ".test.mjs"],
};
if (!suffixMap[mode]) {
  console.error(`Unknown mode "${mode}". Use: standalone | mjs | all`);
  process.exit(2);
}

const files = collect(suffixMap[mode]);
if (files.length === 0) {
  console.log(`No files matched for mode "${mode}".`);
  process.exit(0);
}

let passed = 0;
let failed = 0;
const failedFiles = [];

for (const file of files) {
  const rel = path.relative(path.join(__dirname, ".."), file);
  const res = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (res.status === 0) {
    passed++;
  } else {
    failed++;
    failedFiles.push(rel);
  }
}

console.log("");
console.log(`=== standalone runner (${mode}): ${passed}/${files.length} files passed ===`);
if (failedFiles.length) {
  console.log("FAILED:");
  failedFiles.forEach((f) => console.log("  - " + f));
}
process.exit(failed === 0 ? 0 : 1);
