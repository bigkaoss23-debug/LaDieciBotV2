// ─── ShadowPreviewPanel — Vista interna/admin READ-ONLY del Delivery Planner ──
// Consuma il contract `shadow-preview-contract-v1` dall'endpoint backend live
// (GET /api/delivery/shadow-preview?date=YYYY-MM-DD) via il client read-only
// src/api/shadowPreview.js → proxy Netlify → Railway.
//
// È una VISTA DI SOLA LETTURA per operatore/admin: NON esegue azioni, NON ha
// bottoni live ("aplicar plan", "forzar", "modificar orden"), NON tocca ordini,
// NON collega CommitWriter. Le `actions` sono mostrate come suggerimenti testuali
// NON cliccabili. Non mostra raw diagnostics né PII (telefono/dirección/nombre/notas).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import { C } from "../constants";
import { fetchShadowPreview } from "../api/shadowPreview";

// Data odierna in formato YYYY-MM-DD (orario locale, non UTC).
function todayLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const STATUS_META = {
  ok:       { label: "OK",       color: C.verde,  bg: "rgba(34,197,94,0.12)",  bd: "rgba(34,197,94,0.35)" },
  warning:  { label: "WARNING",  color: C.orange, bg: "rgba(249,115,22,0.12)", bd: "rgba(249,115,22,0.4)" },
  critical: { label: "CRITICAL", color: C.rosso,  bg: "rgba(232,52,28,0.14)",  bd: "rgba(232,52,28,0.45)" },
};

const LEVEL_META = {
  info:     { color: C.blu,    bd: "rgba(59,130,246,0.35)" },
  warning:  { color: C.orange, bd: "rgba(249,115,22,0.4)" },
  critical: { color: C.rosso,  bd: "rgba(232,52,28,0.45)" },
};

function metaFor(map, key, fallback) {
  return map[String(key || "").toLowerCase()] || fallback;
}

function errorMessage(status, data) {
  const code = data && data.error ? String(data.error) : "";
  if (status === 401) return "Sesión expirada o no autorizada. Vuelve a entrar con el PIN.";
  if (code === "missing_date") return "Falta la fecha. Selecciona un día (YYYY-MM-DD).";
  if (code === "invalid_date") return "Fecha no válida. Usa el formato YYYY-MM-DD.";
  if (status === 403) return "Acceso no permitido para este rol.";
  if (status === 0) return "Error de red. Comprueba la conexión.";
  return "No se pudo cargar la vista previa" + (code ? ` (${code})` : "") + ".";
}

export default function ShadowPreviewPanel({ onBack }) {
  const [date, setDate] = useState(todayLocalISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError("");
    const res = await fetchShadowPreview({ date: d });
    if (res.ok && res.data && res.data.version) {
      setPreview(res.data);
    } else {
      setPreview(null);
      setError(errorMessage(res.status, res.data));
    }
    setLoading(false);
  }, []);

  // Carico al mount per la data odierna.
  useEffect(() => { load(date); /* eslint-disable-next-line */ }, []);

  const status = preview ? metaFor(STATUS_META, preview.status, STATUS_META.ok) : null;
  const summary = preview && preview.summary ? preview.summary : null;
  const groups = preview && Array.isArray(preview.groups) ? preview.groups : [];
  const actions = preview && Array.isArray(preview.actions) ? preview.actions : [];
  const safety = preview && preview.safety ? preview.safety : null;
  const src = preview && preview.source ? preview.source : null;
  const srcDate = src ? (src.date || (Array.isArray(src.dates) ? src.dates.join(", ") : "")) : "";

  const wrap = { minHeight: "100vh", background: C.nero, color: C.bianco, fontFamily: "'DM Sans',sans-serif", padding: "20px 18px 60px" };
  const card = { background: C.carbone, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 18px", marginBottom: 16 };
  const sectionTitle = { fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 12 };

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {onBack && (
              <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "rgba(255,255,255,0.5)", padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>← Volver</button>
            )}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>
                {(preview && preview.title) || "Vista previa planner"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                Delivery Planner · interno · solo lectura
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {status && (
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: status.color, background: status.bg, border: `1px solid ${status.bd}`, borderRadius: 8, padding: "5px 10px" }}>
                {status.label}
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: C.verde, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "5px 10px" }}>
              🔒 Solo lectura
            </span>
          </div>
        </div>

        {/* ── Controlli data ── */}
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ background: C.fumo, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: C.bianco, padding: "8px 10px", fontSize: 14 }}
          />
          <button
            onClick={() => load(date)}
            disabled={loading}
            style={{ background: loading ? "rgba(255,255,255,0.05)" : "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)", borderRadius: 8, color: loading ? "rgba(255,255,255,0.3)" : C.blu, padding: "8px 16px", cursor: loading ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}
          >
            {loading ? "Cargando…" : "↻ Cargar"}
          </button>
          {src && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>
              Origen: <b style={{ color: "rgba(255,255,255,0.55)" }}>{src.type}</b>{srcDate ? ` · ${srcDate}` : ""}
            </span>
          )}
        </div>

        {/* ── Errore ── */}
        {error && (
          <div style={{ ...card, border: "1px solid rgba(232,52,28,0.35)", background: "rgba(232,52,28,0.08)", color: "#ffb4a8" }}>
            {error}
          </div>
        )}

        {/* ── Contenuto ── */}
        {preview && !error && (
          <>
            {/* Summary */}
            <div style={card}>
              <div style={sectionTitle}>Resumen</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                {[
                  ["Pedidos totales", summary.totalOrders],
                  ["Domicilio", summary.deliveryOrders],
                  ["Recogida", summary.pickupOrders],
                  ["Zonas", Array.isArray(summary.zones) ? summary.zones.length : 0],
                  ["Avisos", summary.warningsCount],
                  ["Diferencias", summary.differencesCount],
                  ["Mensajes agrupados", summary.groupedMessagesCount],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: C.fumo, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.bianco }}>{value}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              {Array.isArray(summary.zones) && summary.zones.length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {summary.zones.map((z) => (
                    <span key={z} style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "3px 8px" }}>{z}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Groups */}
            <div style={card}>
              <div style={sectionTitle}>Avisos del planner</div>
              {groups.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "8px 0" }}>
                  Sin avisos para esta fecha.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groups.map((g, i) => {
                    const lvl = metaFor(LEVEL_META, g.level, LEVEL_META.info);
                    return (
                      <div key={g.id || i} style={{ background: C.fumo, border: `1px solid ${lvl.bd}`, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${lvl.color}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.bianco }}>{g.title}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: lvl.color }}>{g.level}</span>
                            {Number(g.count) > 0 && (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 8px" }}>×{g.count}</span>
                            )}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{g.message}</div>
                        {g.operatorHint && (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8, fontStyle: "italic" }}>💡 {g.operatorHint}</div>
                        )}
                        {(Array.isArray(g.zones) && g.zones.length > 0) || (Array.isArray(g.tags) && g.tags.length > 0) ? (
                          <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(g.zones || []).map((z) => (
                              <span key={"z" + z} style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "2px 7px" }}>{z}</span>
                            ))}
                            {(g.tags || []).map((t) => (
                              <span key={"t" + t} style={{ fontSize: 10, color: lvl.color, background: "rgba(255,255,255,0.04)", border: `1px solid ${lvl.bd}`, borderRadius: 6, padding: "2px 7px" }}>#{t}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions — suggerimenti NON cliccabili */}
            <div style={card}>
              <div style={sectionTitle}>Sugerencias (no ejecutan acciones)</div>
              {actions.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, padding: "8px 0" }}>
                  Sin sugerencias.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {actions.map((a, i) => {
                    const high = String(a.priority || "").toLowerCase() === "high";
                    const col = high ? C.rosso : C.orange;
                    return (
                      // role="note" + cursor:default: chip puramente informativo, non interattivo.
                      <span key={a.id || i} role="note" aria-disabled="true" style={{ cursor: "default", userSelect: "none", fontSize: 12, fontWeight: 600, color: col, background: "rgba(255,255,255,0.04)", border: `1px solid ${col}55`, borderRadius: 20, padding: "6px 14px" }}>
                        {a.label}
                      </span>
                    );
                  })}
                </div>
              )}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
                Estas sugerencias son informativas: la app no aplica ningún cambio.
              </div>
            </div>

            {/* Safety — box tecnico admin */}
            {safety && (
              <div style={{ ...card, marginBottom: 0 }}>
                <div style={sectionTitle}>Safety (técnico)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["readOnly", safety.readOnly, true],
                    ["writesEnabled", safety.writesEnabled, false],
                    ["piiIncluded", safety.piiIncluded, false],
                    ["rawDiagnosticsHidden", safety.rawDiagnosticsHidden, true],
                  ].map(([k, v, want]) => {
                    const good = v === want;
                    const col = good ? C.verde : C.rosso;
                    return (
                      <span key={k} style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: col, background: "rgba(255,255,255,0.04)", border: `1px solid ${col}44`, borderRadius: 6, padding: "4px 9px" }}>
                        {k}: {String(v)}
                      </span>
                    );
                  })}
                </div>
                {preview.generatedAt && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
                    {preview.version} · generado {preview.generatedAt}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!preview && !error && loading && (
          <div style={{ ...card, color: "rgba(255,255,255,0.4)" }}>Cargando vista previa…</div>
        )}
      </div>
    </div>
  );
}
