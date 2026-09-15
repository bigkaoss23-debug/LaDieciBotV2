// src/api/giroFactsSignal.js — W5 Packet 01.
//
// Tiny, isolated reader for the cross-tablet invalidation signal
// (public.config, chiave='GIRO_FACTS_SIGNAL'). Mirrors the exact same
// direct-Supabase polling pattern already used for DRIVER_STATO
// (TabEntregas.jsx) — no new transport, no new backend route.
//
// Contract: the signal holds ONLY { version, updated_at } — never a Giro
// fact (membership/state/salida/order ids). Callers use it exclusively to
// decide "did something change -> should I ask the canonical endpoint
// again", never as a source of Giro truth themselves.
//
// Returns the numeric version, or null on any failure (row missing, network
// error, malformed JSON) — callers must treat null as "unknown", never as
// "nothing changed" and never as "something changed".
export async function readGiroFactsSignalVersion(sb) {
  try {
    const rows = await sb.select("config", "chiave=eq.GIRO_FACTS_SIGNAL");
    if (!rows || rows.length === 0) return null;
    const raw = rows[0].valore;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const version = parsed && parsed.version;
    return typeof version === "number" && Number.isFinite(version) ? version : null;
  } catch (_) {
    return null;
  }
}
