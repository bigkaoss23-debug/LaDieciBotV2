// Test puro di deleteReconcile (riconciliazione delete ordini, root cause #001).
// Node puro, no Jest, no rete, no DB.
// Esecuzione: node ladieci-app33/src/utils/deleteReconcile.test.js

const { DELETE_PATCH_TTL_MS, isDeleteConfirmed, shouldHideDeleted } = require("./deleteReconcile");

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("PASS  " + name); }
  else    { fail++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

// ── 1. delete success → confermato (il chiamante NON lancia, l'ordine resta rimosso)
check("success _ok:true (body vuoto)", isDeleteConfirmed({ _ok: true, _status: 200 }) === true);
check("success _ok:true ok:true", isDeleteConfirmed({ _ok: true, _status: 200, ok: true }) === true);
check("success _ok:true success:true", isDeleteConfirmed({ _ok: true, _status: 200, success: true }) === true);

// ── 2. delete failure HTTP → NON confermato (il chiamante lancia → rollback)
check("fail HTTP 500", isDeleteConfirmed({ _ok: false, _status: 500 }) === false);
check("fail network (_status 0)", isDeleteConfirmed({ _ok: false, _status: 0, error: "TypeError" }) === false);
check("fail 401 sesión expirada", isDeleteConfirmed({ _status: 401, error: "sesión expirada" }) === false);
check("fail res null", isDeleteConfirmed(null) === false);

// ── 3. delete failure payload { error:"delete failed" } con HTTP 200 → NON confermato
check("fail body error con HTTP 200", isDeleteConfirmed({ _ok: true, _status: 200, error: "delete failed" }) === false);

// ── 4. delete failure { ok:false } con HTTP 200 → NON confermato
check("fail body ok:false con HTTP 200", isDeleteConfirmed({ _ok: true, _status: 200, ok: false }) === false);

// ── 5. polling reconciliation (shouldHideDeleted)
const NOW = 1_000_000;
check("nasconde se _deleted entro TTL",
  shouldHideDeleted({ patch: { _deleted: true }, ts: NOW - 1000 }, NOW, DELETE_PATCH_TTL_MS) === true);
check("NON nasconde se _deleted scaduto (TTL) → riappare",
  shouldHideDeleted({ patch: { _deleted: true }, ts: NOW - DELETE_PATCH_TTL_MS - 1 }, NOW, DELETE_PATCH_TTL_MS) === false);
check("NON nasconde patch non-_deleted (es. estado)",
  shouldHideDeleted({ patch: { estado: "EN_COCINA" }, ts: NOW }, NOW, DELETE_PATCH_TTL_MS) === false);
check("NON nasconde entry assente (delete confermato → patch rimosso)",
  shouldHideDeleted(undefined, NOW, DELETE_PATCH_TTL_MS) === false);
check("NON nasconde entry null", shouldHideDeleted(null, NOW, DELETE_PATCH_TTL_MS) === false);
check("ts mancante → trattato come 0 → scaduto",
  shouldHideDeleted({ patch: { _deleted: true } }, NOW, DELETE_PATCH_TTL_MS) === false);

// ── 6. costante TTL ragionevole (finestra ottimistica breve)
check("DELETE_PATCH_TTL_MS è positivo e <= 60s", DELETE_PATCH_TTL_MS > 0 && DELETE_PATCH_TTL_MS <= 60000, String(DELETE_PATCH_TTL_MS));

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail > 0 ? 1 : 0);
