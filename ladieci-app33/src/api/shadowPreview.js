// ─── Delivery Planner — Shadow Preview client (READ-ONLY) ───────────────────
// Consuma l'endpoint backend live:
//   GET /api/delivery/shadow-preview?date=YYYY-MM-DD   (contract shadow-preview-contract-v1)
//
// Passa SEMPRE dal proxy Netlify esistente (/api/proxy) con lo stesso JWT del resto
// dell'app (header Authorization: Bearer <token>). Il proxy aggiunge la X-Api-Key
// lato server: la chiave NON è mai esposta al frontend.
//
// STRETTAMENTE READ-ONLY: solo GET. Nessun POST/PUT/PATCH/DELETE, nessuna azione
// operativa, nessun CommitWriter. Questa è una vista di sola lettura.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from "../api";

const PROXY_URL = "/api/proxy";

// Ritorna { ok, status, data } così il chiamante può distinguere:
//  - 200 → contract ok (anche con summary 0 ordini)
//  - 400 → { error: "missing_date" | "invalid_date" }
//  - 401 → sesión expirada / token mancante
//  - altro / errore di rete → ok:false con status best-effort
export async function fetchShadowPreview({ date } = {}) {
  const qs = "action=shadowPreview" + (date ? "&date=" + encodeURIComponent(date) : "");
  try {
    const res = await fetch(PROXY_URL + "?" + qs, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: "Bearer " + auth.getToken() },
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err && err.message ? err.message : "network_error" } };
  }
}
