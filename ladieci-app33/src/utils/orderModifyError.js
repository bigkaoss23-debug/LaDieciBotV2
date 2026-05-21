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

module.exports = { parseEstadoTerminalError };
