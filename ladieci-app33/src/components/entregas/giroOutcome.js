// [FDV1] Esito di una mutazione giro (create / add / remove / dissolve) visto dall'operatore:
//   "ok"        → salvato;
//   "failed"    → errore certo (4xx con codice): nulla è cambiato;
//   "uncertain" → rete / 5xx / timeout: il server può aver già applicato → verificare rileggendo i dati.
// Tutte le mutazioni giro sono idempotenti lato DB: dopo un esito incerto un nuovo tentativo è sicuro.
export const GIRO_TIMEOUT_MS = 15000;

export const withTimeout = (promise, ms = GIRO_TIMEOUT_MS) => new Promise((resolve) => {
  let done = false;
  const t = setTimeout(() => { if (!done) { done = true; resolve({ _timeout: true, _status: 0, _ok: false }); } }, ms);
  Promise.resolve(promise).then(
    (res) => { if (!done) { done = true; clearTimeout(t); resolve(res); } },
    (err) => { if (!done) { done = true; clearTimeout(t); resolve({ _thrown: true, _status: 0, _ok: false, error: String(err && err.message || err) }); } },
  );
});

export const classifyGiroResult = (res) => {
  if (res && res.ok) return "ok";
  const st = res && Number(res._status);
  if (res && res.error === "giro_rpc_outcome_unknown") return "uncertain";
  if (Number.isFinite(st) && st >= 400 && st < 500) return "failed";
  return "uncertain";
};

// Messaggio operativo per un errore certo (codici del backend FDV1).
export const giroErrorText = (code) => (
  code === "invalid_orders" || code === "order_not_eligible" ? "Pedidos no elegibles"
    : code === "some_orders_not_found" || code === "order_not_found" ? "Pedido no encontrado"
    : code === "giro_not_found" || code === "giro_not_found_or_dissolved" ? "Ese giro ya no existe"
    : code === "giro_full" ? "Giro completo"
    : code === "giro_departed" || code === "members_departed" ? "Giro ya en reparto"
    : code === "members_already_in_giro" || code === "giro_changed_during_add" ? "El giro cambió — revisa y reintenta"
    : code === "giro_atomic_unavailable" ? "Giros no disponibles ahora"
    : (code === "need_at_least_2_orders" || code === "need_at_least_2_distinct_orders") ? "Elige al menos 2 pedidos"
    : "No se pudo guardar"
);

// Verifica dell'intento dopo un esito incerto, sugli ordini riletti (manual_giro_id autoritativo).
//   create: tutti gli ordini nello stesso giro · add: ordine nel giro · remove: ordine senza giro · dissolve: nessun ordine nel giro.
export const intentApplied = (intent, ordenes = []) => {
  const byId = new Map((ordenes || []).map((o) => [o.id, o]));
  const gid = (id) => (byId.get(id) || {}).manual_giro_id || null;
  if (intent.kind === "create") {
    const g = intent.orderIds.map(gid);
    return g.length >= 2 && !!g[0] && g.every((x) => x === g[0]) ? g[0] : false;
  }
  if (intent.kind === "add") return gid(intent.orderId) === intent.giroId;
  if (intent.kind === "remove") return gid(intent.orderId) == null;
  if (intent.kind === "dissolve") return !(ordenes || []).some((o) => o.manual_giro_id === intent.giroId);
  return false;
};
