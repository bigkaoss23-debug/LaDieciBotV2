// MOD-4 RR2 — Helper puro per interpretare l'errore backend
// `{ success:false, error:"estado_terminal", estado, message }`
// ritornato da `modificaOrdine` quando il pedido è in stato terminale
// (EN_ENTREGA / RETIRADO / COMPLETADO).
//
// Niente side effect, niente import React, nessuna dipendenza.
// CJS export per consentire test Node puro (l'import frontend
// `import { parseEstadoTerminalError } from "./orderModifyError"`
// funziona via webpack come named import da CommonJS).

function normalizeEstado(estado) {
  if (typeof estado !== "string") return null;
  const t = estado.trim();
  return t.length > 0 ? t : null;
}

function parseEstadoTerminalError(res) {
  if (res == null || typeof res !== "object" || Array.isArray(res)) {
    return { blocked: false, estado: null, message: "" };
  }
  if (res.success !== false || res.error !== "estado_terminal") {
    return { blocked: false, estado: null, message: "" };
  }
  const estado = normalizeEstado(res.estado);
  const message = estado
    ? `Pedido en ${estado} — no se puede modificar`
    : "Pedido ya entregado o cerrado — no se puede modificar";
  return { blocked: true, estado, message };
}

// Economic Writer Hardening V1 (E-1, migration 126) — UX-1 fix
// (ECONOMIC_WRITER_HARDENING_REVIEW_FAIL_FIX_REQUIRED, round 2). The backend can now also
// refuse an updateOrden/modificaOrdine write with
// `{success:false, error:"ORDER_ECONOMIC_BASIS_LOCKED", message}` when the order is
// Mesa-owned, already carries a commercial adjustment, or is cancelled/annulled
// (src/financial/paidOrderEconomicGuard.js on the backend, economicBasisLockRefusal).
// parseEstadoTerminalError only ever recognised "estado_terminal" — every other typed
// refusal, this one included, read as "not blocked", so every caller here that only
// checks `.blocked` showed the success toast ("✏️ Pedido actualizado") on a write the
// backend had just refused (independent review, §7.2, scenarios S1-S4).
//
// This is a SUPERSET, not a replacement: it recognises everything
// parseEstadoTerminalError already does, plus ORDER_ECONOMIC_BASIS_LOCKED, in the exact
// same {blocked, estado, message} shape — so every existing call site keeps working by
// only swapping which parser it calls, and parseEstadoTerminalError itself (and its own
// contract tests) are untouched.
//
// Deliberately NOT "any success:false is blocked": that would also catch write refusals
// unrelated to this contract (a future new code, a generic backend error) under a message
// that claims specifically "no se puede modificar el importe" — a wrong explanation is
// worse than a missed one. Named codes only, same policy parseEstadoTerminalError already
// follows.
const ORDER_ECONOMIC_BASIS_LOCKED = "ORDER_ECONOMIC_BASIS_LOCKED";

function parseOrderWriteRefusal(res) {
  const terminal = parseEstadoTerminalError(res);
  if (terminal.blocked) return terminal;
  if (res == null || typeof res !== "object" || Array.isArray(res)) {
    return { blocked: false, estado: null, message: "" };
  }
  if (res.success !== false || res.error !== ORDER_ECONOMIC_BASIS_LOCKED) {
    return { blocked: false, estado: null, message: "" };
  }
  const message = typeof res.message === "string" && res.message.trim()
    ? res.message
    : "No se puede modificar el importe de este pedido.";
  return { blocked: true, estado: null, message };
}

module.exports = { parseEstadoTerminalError, parseOrderWriteRefusal, ORDER_ECONOMIC_BASIS_LOCKED };
