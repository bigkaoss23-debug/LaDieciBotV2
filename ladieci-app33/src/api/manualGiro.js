// ─── Manual multizone giro — preview (READ) + create/force (WRITE) ───────────
// Due azioni backend live, entrambe via il proxy Netlify esistente (api.post →
// proxyPost, stesso JWT; la X-Api-Key la aggiunge il proxy lato server, mai al
// client):
//
//   • previewManualGiroRoute  → READ-ONLY (safety {readOnly:true, writes:false}).
//       L'operatore compone una sequenza di tappe (es. Q1→Q5→Q3) e il backend
//       risponde routeTimeline + risk (recomendado/ajuste/no_recomendado/lleno)
//       + operatorMessage + blockers. NON scrive nulla.
//
//   • createManualGiro        → WRITE. Crea un giro manuale reale raggruppando
//       ordini ESISTENTI (order_ids). Il backend raggruppa A PRESCINDERE dal
//       risk: è il frontend a decidere se procedere quando il preview è
//       no_recomendado ("forzar" = l'operatore dice "ci può stare").
//
// NB sul "forzado" di audit: il backend createManualGiro non accetta (ancora) un
// flag `forzado` e non esiste una colonna per persisterlo. Quindi il fatto che un
// giro sia stato forzato resta, per ora, solo nel flusso UI — non sul DB.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "../api";

const PREVIEW_ACTION = "previewManualGiroRoute";
const CREATE_ACTION = "createManualGiro";

// Normalizza la risposta proxyPost in { ok, status, data }, come premiumProposals.js:
//  - ok:true  → HTTP 200 e (per le write) result.ok !== false;
//  - ok:false → errore HTTP/rete, sesión expirada, o result.ok === false.
function shape(res, { writeAction = false } = {}) {
  const status = res && typeof res._status === "number" ? res._status : 0;
  let ok = !!(res && res._ok && status === 200);
  // Le write backend ritornano { ok:false, error } anche con HTTP 200.
  if (ok && writeAction && res.ok === false) ok = false;
  return { ok, status, data: res || null };
}

// READ-ONLY. `input` = { currentOrderDraft:{zona,tipoConsegna,hora,pizzas},
//   startTime:"HH:MM", selectedZones:[...] | selectedStops:[...], capacity?,
//   includeCrossZone? }. Mai PII: solo zone/orari/pizzas sintetici.
export async function previewManualGiroRoute(input) {
  const body = { action: PREVIEW_ACTION, ...(input || {}) };
  try {
    return shape(await api.post(body));
  } catch (err) {
    return { ok: false, status: 0, data: { error: err && err.message ? err.message : "network_error" } };
  }
}

// WRITE. Crea/forza un giro manuale da order_ids reali (≥2).
//
// ⚠️ NOME ESPLICITO `...Unsafe`: questa funzione SCRIVE sul DB live. Non deve mai
// essere chiamata senza un guard a monte. Oggi l'UNICO chiamante è
// ManualGiroSection, e SOLO dietro il flag REACT_APP_MANUAL_GIRO_WRITE === "on"
// (default OFF) + conferma esplicita dell'operatore. Con flag OFF il bottone non
// esiste e questa funzione non è raggiungibile dal LAB.
//
//   order_ids:        array di id ordine esistenti da raggruppare.
//   hora_ref:         "HH:MM" orario operativo (uscita forno) del giro, opz.
//   anchor_order_id:  id dell'ordine "ancora" (provenienza scelta), opz, audit.
//   entrega_ref:      "HH:MM" target consegna/giro scelto dall'operatore, opz.
// Ritorna { ok, status, data } dove data.giro è il giro creato (se ok).
export async function createManualGiroUnsafe({ order_ids, hora_ref = null, anchor_order_id = null, entrega_ref = null }) {
  const body = { action: CREATE_ACTION, order_ids, hora_ref, anchor_order_id, entrega_ref };
  try {
    return shape(await api.post(body), { writeAction: true });
  } catch (err) {
    return { ok: false, status: 0, data: { error: err && err.message ? err.message : "network_error" } };
  }
}
