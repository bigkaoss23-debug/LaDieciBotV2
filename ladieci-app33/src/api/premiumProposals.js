// ─── Premium Planner — Proposals preview client (READ-ONLY) ──────────────────
// Consuma l'azione backend live POST `previewStrategicOpportunities`
//   (contract `premium-planner-strategic-preview-v1`,
//    campo additivo proposals[] + proposalContract `premium-planner-proposal-selection-v1`).
//
// Passa SEMPRE dal proxy Netlify esistente (`/api/proxy`, via api.post → proxyPost)
// con lo stesso JWT del resto dell'app. Il proxy aggiunge la X-Api-Key lato server:
// la chiave NON è mai esposta al frontend.
//
// STRETTAMENTE READ-ONLY: l'azione è una preview backend (safety {readOnly:true,
// writes:false, pii:"redacted"}). Nessun apply, nessun manual_giro, nessun
// CommitWriter, nessuna mutazione. Usato SOLO dal pannello nascosto
// PremiumProposalsLabPanel, mai dal flusso operatore.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "../api";

const ACTION = "previewStrategicOpportunities";

// Payload minimo SINTETICO e senza PII: zona/pizzas/promised + startTime/now
// espliciti (nessun Date.now lato client, nessun tel/nombre/direccion). Gli
// anchor reali li deriva il backend in sola lettura dal DB.
const SAFE_FIXTURE = {
  currentOrderDraft: { zona: "Q2", pizzas: 1, promised: "21:00", serviceMin: 2 },
  startTime: "20:35",
  now: "20:30",
};

// Ritorna { ok, status, data } così il chiamante distingue:
//  - ok:true  (HTTP 200) → contract presente (proposals[] può essere [])
//  - ok:false           → errore HTTP/rete o sesión expirada
// `data` è il body così com'è: il chiamante ne legge SOLO i campi whitelist
// (proposalContract, proposals[].rank/kind/status/timeLabel/zoneLabel, safety,
//  warnings/blockers) — mai il body grezzo, mai PII.
export async function fetchPremiumProposals(overrides) {
  const body = { action: ACTION, ...SAFE_FIXTURE, ...(overrides || {}) };
  try {
    const res = await api.post(body);
    const status = res && typeof res._status === "number" ? res._status : 0;
    const ok = !!(res && res._ok && status === 200);
    return { ok, status, data: res || null };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err && err.message ? err.message : "network_error" } };
  }
}
