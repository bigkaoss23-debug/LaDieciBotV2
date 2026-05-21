// MOD-3 — logica del badge "MODIFICADO" per Cocina.
// L'ordine viene considerato modificato (dal punto di vista della cucina)
// SOLO se è stato toccato DOPO essere entrato in EN_COCINA. Modifiche
// pre-cucina (su POR_CONFIRMAR / NUEVO) sono normali e non vanno evidenziate.
//
// Campi DB richiesti (vedi migration 2026-05-21_add_mod_audit_fields.sql):
//   - mod_ts: TIMESTAMPTZ — ultima modifica applicata.
//   - cocina_started_at: TIMESTAMPTZ — prima entrata in EN_COCINA.
//
// CJS export per consentire test Node puro (no Jest, no transpiler).
// L'import frontend `import { isModifiedAfterCocina } from "./orderModBadge"`
// funziona via webpack (named import da CommonJS).

function toTimeMs(value) {
  if (value == null) return null;
  // Supabase ritorna timestamp come stringhe ISO. Number permesso (epoch ms).
  const d = new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function isModifiedAfterCocina(orden) {
  if (!orden || typeof orden !== "object") return false;
  const modTs = toTimeMs(orden.mod_ts);
  const startedAt = toTimeMs(orden.cocina_started_at);
  if (modTs == null || startedAt == null) return false;
  return modTs > startedAt;
}

module.exports = { isModifiedAfterCocina };
