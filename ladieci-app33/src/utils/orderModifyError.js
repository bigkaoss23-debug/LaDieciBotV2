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

// N-5 — the SECOND reason an edit can be refused, and a different one from the state
// check above. The DB refuses any edit that MOVES an order's economic basis (total,
// delivery fee, discount) once payment evidence exists for it. This is not "the pedido is
// too far along" — a paid order sitting in EN_COCINA is still perfectly editable in every
// non-economic way — so it needs its own sentence, not the terminal-state one.
//
// Why a sibling parser and not a flag on the one above: they answer different questions
// and can be true independently, and `modificaOrden` renders whichever fired. Keeping the
// terminal-state parser byte-identical also keeps its existing test file honest.
const PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN = "PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN";
const PAID_ORDER_ECONOMIC_MESSAGE =
  "No se puede modificar el importe de un pedido que ya tiene pagos registrados.";

function parsePaidOrderEconomicRefusal(res) {
  if (res == null || typeof res !== "object" || Array.isArray(res)) {
    return { blocked: false, message: "" };
  }
  // The backend answers with BOTH `error` and `code` set to the contract string (the two
  // conventions live side by side in this codebase); accept either, and never treat a
  // success as a refusal just because the string appears somewhere.
  if (res.success === true) return { blocked: false, message: "" };
  const hit = res.error === PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN
    || res.code === PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN;
  if (!hit) return { blocked: false, message: "" };
  // Prefer the backend's own sentence when it sent one — it is already operator-facing
  // Spanish — and fall back to the local copy so the operator is never shown a raw code.
  const message = typeof res.message === "string" && res.message.trim()
    ? res.message.trim()
    : PAID_ORDER_ECONOMIC_MESSAGE;
  return { blocked: true, message };
}

// The one resolver the UI calls after an order write. There are now two independent
// reasons the backend can refuse, and every call site wants the same thing: "was it
// refused, and what do I tell the operator?". Terminal state is checked first only because
// it is the older, broader refusal; the two cannot both be true for a single response.
function parseOrderWriteRefusal(res) {
  const terminal = parseEstadoTerminalError(res);
  if (terminal.blocked) return { blocked: true, message: terminal.message, estado: terminal.estado };
  const economic = parsePaidOrderEconomicRefusal(res);
  if (economic.blocked) return { blocked: true, message: economic.message, estado: null };
  return { blocked: false, message: "", estado: null };
}

module.exports = {
  parseEstadoTerminalError,
  parsePaidOrderEconomicRefusal,
  parseOrderWriteRefusal,
  PAID_ORDER_ECONOMIC_MUTATION_FORBIDDEN,
  PAID_ORDER_ECONOMIC_MESSAGE,
};
