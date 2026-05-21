// DS-4-B parity check: direccionToCacheKey frontend vs backend.
// Estrae il source della funzione dai due file reali (no bundler, no jest, no deps).
// Exit code != 0 se almeno un input produce key diverse FE vs BE.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const BE_PATH = path.join(ROOT, "ladieci-bot", "src", "utils", "helpers.js");
const FE_PATH = path.join(ROOT, "ladieci-app33", "src", "api.js");

function extractFn(filePath, fnName) {
  const src = fs.readFileSync(filePath, "utf8");
  const re = new RegExp("function\\s+" + fnName + "\\s*\\([\\s\\S]*?\\n\\}\\n");
  const m = src.match(re);
  if (!m) throw new Error("Cannot locate " + fnName + " in " + filePath);
  // Wrappa in IIFE che restituisce la funzione.
  return new Function(m[0] + "\nreturn " + fnName + ";")();
}

const beFn = extractFn(BE_PATH, "direccionToCacheKey");
const feFn = extractFn(FE_PATH, "direccionToCacheKey");

const inputs = [
  "Calle Mayor 1",
  "calle mayor, 1",
  "C/ Mayor 1",
  "Avenida Reino de España 200",
  "Av. Reino de España, 200",
  "Las Marinas 14",
  "Calle Cervantes 12",
  "C. Cervantes, 12",
  "Calle   Cuba   5",
  "Calle Cuba nº5",
  "Calle Cuba numero 5",
  "Plaza de Toros 3",
  "Urb. Roquetas 10",
  "Roquetas centro 22",
  "Calle José Ojeda 8",
  "Calle Jose Ojeda 8",
  "Calle Andalucía 7",
  "Calle Andalucia 7",
  "Calle Inventada Codex 999",
  "Calle Mayor 200",
];

let mismatches = 0;
const rows = [];
for (const inp of inputs) {
  const be = beFn(inp);
  const fe = feFn(inp);
  const ok = be === fe;
  if (!ok) mismatches++;
  rows.push({ ok, inp, be, fe });
}

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log(pad("status", 8) + pad("input", 34) + pad("BE", 28) + "FE");
console.log("-".repeat(100));
for (const r of rows) {
  console.log(
    pad(r.ok ? "PASS" : "FAIL", 8) +
    pad(r.inp, 34) +
    pad(r.be, 28) +
    (r.ok ? "(equal)" : r.fe)
  );
}
console.log("-".repeat(100));
console.log("Total: " + rows.length + " | PASS: " + (rows.length - mismatches) + " | FAIL: " + mismatches);

if (mismatches > 0) process.exit(1);
