// src/components/ManualGiroSection.jsx
// ─────────────────────────────────────────────────────────────────────────────
// "Ruta manual multizona" — la centralina del Premium Planner LAB.
//
// Flusso operatore (tutto in questa pagina, dietro flag REACT_APP_PREMIUM_PROPOSALS):
//   1. carica gli ordini DOMICILIO attivi (api.getOrdenes, read-only);
//   2. l'operatore seleziona ≥2 ordini = le tappe del giro (es. Q1, Q5, Q3);
//   3. fija la salida del rider (startTime) y calcula → previewManualGiroRoute
//      (READ-ONLY): ruta + risk (recomendado/ajuste/no_recomendado/lleno) + msg;
//   4. si el sistema dice no (zonas opuestas → no_recomendado) el operador puede
//      FORZAR: createManualGiro real agrupa los pedidos igualmente.
//
// El backend createManualGiro escribe en el DB live (crea un manual_giro real).
// Por eso el botón distingue claramente "Aplicar" (riesgo ok) de "Forzar"
// (riesgo no_recomendado): el operador ve siempre QUÉ está forzando.
//
// PII: mostramos solo #id · zona · hora · nº pizzas. Nunca nombre/tel/dirección.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { previewManualGiroRoute, createManualGiroUnsafe } from "../api/manualGiro";

// Estados de pedido elegibles para entrar en un giro de reparto.
const ACTIVE_STATES = new Set(["NUEVO", "POR_CONFIRMAR", "EN_COCINA", "LISTO"]);

// ── Flag WRITE dedicato (separato da REACT_APP_PREMIUM_PROPOSALS). Default OFF. ──
// OFF  ⇒ "Consejero" puro read-only: nessun bottone Aplicar/Forzar, nessuna
//        chiamata a createManualGiroUnsafe possibile.
// ON   ⇒ il bottone di scrittura compare SOLO dopo una preview valida e richiede
//        conferma esplicita (digitare "FORZAR" + confirm dialog).
// CRA: env esposte al bundle con prefisso REACT_APP_, lette da process.env (build-time).
const WRITE_ENABLED = (() => {
  try { return process.env.REACT_APP_MANUAL_GIRO_WRITE === "on"; } catch (_) { return false; }
})();

function riskColor(s) {
  const k = String(s || "").toLowerCase();
  if (k === "recomendado" || k === "ok" || k === "compatible") return "#7cb342";
  if (k.includes("ajuste") || k.includes("tight")) return "#f59e0b";
  if (k.includes("no_recomendado") || k.includes("lleno") || k.includes("full") || k.includes("blocked")) return "#e8341c";
  return "#9a9aa2";
}

function nPizzas(items) {
  if (!Array.isArray(items)) return 1;
  const n = items.reduce((acc, it) => acc + (Number(it && it.qty) || 1), 0);
  return n > 0 ? n : items.length || 1;
}

const sstr = (v) => (v == null ? "" : String(v));

// ── Strip lineal de la ruta devuelta por el backend (solo render) ────────────
function RouteStrip({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6, overflowX: "auto", padding: "4px 0 8px" }}>
      {steps.map((st, i) => {
        const col = riskColor(st.status);
        const ring = st.isNewOrder ? "#f59e0b" : st.isAnchor ? "#56c5d0" : "#2a2a2e";
        return (
          <React.Fragment key={st.seq != null ? st.seq : i}>
            {i > 0 && <div style={{ alignSelf: "center", color: "#3a3a40", fontSize: 14 }}>→</div>}
            <div style={{ minWidth: 64, textAlign: "center", border: `1px solid ${ring}`, borderRadius: 10, padding: "8px 6px", background: "#1a1a1c" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e8e8ea", whiteSpace: "nowrap" }}>{st.zone || st.label || "·"}</div>
              {st.eta && <div style={{ fontSize: 11, fontWeight: 800, color: col, marginTop: 3 }}>{st.eta}</div>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Sanitiza routeTimeline a los campos whitelist (no PII, no body crudo).
function safeTimeline(rt) {
  if (!rt || typeof rt !== "object") return null;
  const sum = rt.summary && typeof rt.summary === "object" ? rt.summary : {};
  const steps = Array.isArray(rt.timeline)
    ? rt.timeline.map((t) => ({
        seq: Number.isFinite(t.seq) ? t.seq : null,
        zone: sstr(t.zone),
        label: sstr(t.label),
        eta: sstr(t.eta),
        status: sstr(t.status),
        isNewOrder: !!t.isNewOrder,
        isAnchor: !!t.isAnchor,
      }))
    : [];
  return {
    summary: { directEta: sstr(sum.directEta), giroEta: sstr(sum.giroEta), returnEta: sstr(sum.returnEta) },
    steps,
  };
}

const card = { border: "1px solid #2a2a2e", borderRadius: 12, padding: "14px 14px", background: "#141416", marginTop: 12 };
const label = { fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: "10px 0 6px" };

export default function ManualGiroSection() {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [selected, setSelected] = useState([]); // array de id
  const [startTime, setStartTime] = useState("");

  const [preview, setPreview] = useState(null); // { risk, operatorMessage, timeline, blockers }
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null); // { ok, giroId } | { ok:false, msg }
  const [confirmText, setConfirmText] = useState(""); // gate write: debe ser "FORZAR"

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrdersError("");
    try {
      const res = await api.getOrdenes();
      const list = (res && Array.isArray(res.ordenes) ? res.ordenes : [])
        .filter((o) => String(o.tipo_consegna || "").toUpperCase() === "DOMICILIO")
        .filter((o) => ACTIVE_STATES.has(String(o.estado || "").toUpperCase()))
        .filter((o) => o.zona)
        // Whitelist anti-PII: en el estado del componente guardamos SOLO campos
        // no-PII. Nunca nombre/tel/dirección, ni siquiera en memoria.
        .map((o) => ({ id: o.id, zona: o.zona, hora: o.hora || "", estado: o.estado || "", pizzas: nPizzas(o.items) }));
      setOrders(list);
    } catch (e) {
      setOrdersError(e && e.message ? e.message : "No se pudieron cargar los pedidos");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const selectedOrders = useMemo(
    () => selected.map((id) => orders.find((o) => o.id === id)).filter(Boolean),
    [selected, orders]
  );

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPreview(null);
    setApplyResult(null);
  };

  const canPreview = selectedOrders.length >= 2 && /^\d{1,2}:\d{2}$/.test(startTime);

  const runPreview = useCallback(async () => {
    if (!canPreview) return;
    setPreviewing(true);
    setPreviewError("");
    setPreview(null);
    setApplyResult(null);
    // El primer pedido seleccionado hace de "pedido actual"; el resto + él mismo
    // son las zonas de la ruta. El backend calcula risk/ruta sobre las zonas.
    const first = selectedOrders[0];
    const input = {
      currentOrderDraft: {
        zona: first.zona,
        tipoConsegna: "DOMICILIO",
        hora: first.hora || startTime,
        pizzas: first.pizzas,
      },
      startTime,
      selectedZones: selectedOrders.map((o) => o.zona),
    };
    const res = await previewManualGiroRoute(input);
    if (!res.ok) {
      const d = res.data || {};
      const code = d.error || (Array.isArray(d.blockers) && d.blockers[0] && d.blockers[0].code);
      setPreviewError("No se pudo calcular la ruta" + (res.status ? ` (HTTP ${res.status})` : "") + (code ? ` · ${code}` : "") + ".");
      setPreviewing(false);
      return;
    }
    const d = res.data || {};
    setPreview({
      risk: sstr(d.risk),
      operatorMessage: sstr(d.operatorMessage),
      timeline: safeTimeline(d.routeTimeline),
      blockers: Array.isArray(d.blockers) ? d.blockers.map((b) => sstr(b && b.message)) : [],
    });
    setPreviewing(false);
  }, [canPreview, selectedOrders, startTime]);

  const isNoRec = preview && String(preview.risk).toLowerCase().includes("no_recomendado");
  const isLleno = preview && String(preview.risk).toLowerCase().includes("lleno");

  const apply = useCallback(async () => {
    // ── Guardie multiple: senza TUTTE queste condizioni NON si scrive. ──
    if (!WRITE_ENABLED) return;                                   // 1) flag dedicato OFF ⇒ stop
    if (selectedOrders.length < 2) return;                        // 2) servono ≥2 tappe
    if (confirmText.trim().toUpperCase() !== "FORZAR") return;    // 3) conferma digitata
    if (typeof window !== "undefined" && typeof window.confirm === "function" &&
        !window.confirm("¿Crear el giro REAL con estos pedidos? Esto ESCRIBE en la base de datos en vivo.")) return; // 4) confirm dialog
    setApplying(true);
    setApplyResult(null);
    const res = await createManualGiroUnsafe({
      order_ids: selectedOrders.map((o) => o.id),
      hora_ref: startTime || null,
      anchor_order_id: selectedOrders[0].id,
      entrega_ref: startTime || null,
    });
    if (!res.ok) {
      const d = res.data || {};
      setApplyResult({ ok: false, msg: d.error || `Error al crear el giro (HTTP ${res.status})` });
      setApplying(false);
      return;
    }
    const giro = res.data && res.data.giro;
    setApplyResult({ ok: true, giroId: giro && giro.id ? giro.id : "?" });
    setApplying(false);
    // Recarga: los pedidos quedan agrupados; refrescamos la lista.
    loadOrders();
    setSelected([]);
    setPreview(null);
    setConfirmText("");
  }, [selectedOrders, startTime, loadOrders, confirmText]);

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Ruta manual multizona · solo lectura</div>
        <button type="button" onClick={loadOrders} disabled={loadingOrders}
          style={{ background: "transparent", border: "1px solid #3a3a40", borderRadius: 8, color: "#cfcfd4", fontSize: 12, padding: "4px 10px", cursor: loadingOrders ? "default" : "pointer" }}>
          {loadingOrders ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#7a7a82", marginTop: 2 }}>
        Agrupa 2+ pedidos y calcula la ruta.{" "}
        {WRITE_ENABLED ? "Escritura armada (flag ON): requiere confirmación." : "Consejero: solo lectura, no crea giros."}
      </div>

      {ordersError && <div style={{ color: "#ffb4a8", fontSize: 12, marginTop: 8 }}>{ordersError}</div>}

      {/* Lista de pedidos seleccionables */}
      <div style={label}>Pedidos a domicilio activos</div>
      {orders.length === 0 && !loadingOrders ? (
        <div style={{ fontSize: 12, color: "#6a6a72" }}>No hay pedidos a domicilio activos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {orders.map((o) => {
            const on = selected.includes(o.id);
            return (
              <button type="button" key={o.id} onClick={() => toggle(o.id)} aria-pressed={on}
                style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, background: on ? "#202227" : "#1a1a1c",
                  border: `1px solid ${on ? "#7cb342" : "#2a2a2e"}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "inherit" }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1px solid ${on ? "#7cb342" : "#4a4a50"}`, background: on ? "#7cb342" : "transparent", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e8e8ea" }}>#{sstr(o.id)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#9ccc65" }}>{sstr(o.zona)}</span>
                {o.hora && <span style={{ fontSize: 12, color: "#cfcfd4" }}>⏱ {sstr(o.hora)}</span>}
                <span style={{ fontSize: 11, color: "#9a9aa2" }}>{o.pizzas} pz</span>
                <span style={{ fontSize: 10, color: "#6a6a72", marginLeft: "auto" }}>{sstr(o.estado)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Salida del rider + calcular */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <div>
          <div style={label}>Salida rider (HH:MM)</div>
          <input value={startTime} onChange={(e) => { setStartTime(e.target.value); setPreview(null); setApplyResult(null); }}
            placeholder="20:35" inputMode="numeric"
            style={{ width: 90, background: "#1a1a1c", border: "1px solid #2a2a2e", borderRadius: 8, color: "#e8e8ea", padding: "8px 10px", fontSize: 14 }} />
        </div>
        <button type="button" onClick={runPreview} disabled={!canPreview || previewing}
          style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #3a5a3a", background: !canPreview || previewing ? "#1a1a1c" : "rgba(124,179,66,0.14)",
            color: !canPreview || previewing ? "#6a6a72" : "#9ccc65", cursor: !canPreview || previewing ? "default" : "pointer", fontWeight: 800, fontSize: 14 }}>
          {previewing ? "Calculando…" : "Calcular ruta"}
        </button>
        <span style={{ fontSize: 11, color: "#6a6a72" }}>{selectedOrders.length} seleccionados (mín. 2)</span>
      </div>

      {previewError && <div style={{ color: "#ffb4a8", fontSize: 12, marginTop: 10 }}>{previewError}</div>}

      {/* Resultado del planner */}
      {preview && !previewError && (
        <div style={{ marginTop: 12, borderTop: "1px solid #1f1f23", paddingTop: 10 }}>
          <div style={label}>Resultado del planner</div>
          {preview.risk && (
            <div style={{ display: "inline-block", fontSize: 12, fontWeight: 800, color: riskColor(preview.risk),
              background: `${riskColor(preview.risk)}1f`, border: `1px solid ${riskColor(preview.risk)}55`, borderRadius: 20, padding: "3px 12px", marginBottom: 8 }}>
              Riesgo: {preview.risk}
            </div>
          )}
          {preview.timeline && <RouteStrip steps={preview.timeline.steps} />}
          {preview.timeline && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "2px 0 8px" }}>
              {preview.timeline.summary.giroEta && <span style={{ fontSize: 11, color: "#9a9aa2" }}>En giro <b style={{ color: "#cfcfd4" }}>{preview.timeline.summary.giroEta}</b></span>}
              {preview.timeline.summary.returnEta && <span style={{ fontSize: 11, color: "#9a9aa2" }}>Regreso <b style={{ color: "#cfcfd4" }}>{preview.timeline.summary.returnEta}</b></span>}
            </div>
          )}
          {preview.operatorMessage && <div style={{ fontSize: 12, color: "#7a7a82", fontStyle: "italic", marginBottom: 8 }}>{preview.operatorMessage}</div>}
          {preview.blockers.length > 0 && (
            <div style={{ fontSize: 12, color: "#ffb4a8", marginBottom: 8 }}>{preview.blockers.join(" · ")}</div>
          )}

          {/* ── Zona de escritura ───────────────────────────────────────────
              SOLO si REACT_APP_MANUAL_GIRO_WRITE === "on". Con flag OFF: badge
              read-only, ningún botón, createManualGiroUnsafe inalcanzable. */}
          {!WRITE_ENABLED ? (
            <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "#9ccc65",
              background: "rgba(124,179,66,0.1)", border: "1px solid rgba(124,179,66,0.35)", borderRadius: 20, padding: "5px 12px", marginTop: 4 }}>
              🔒 Solo lectura · no crea giros
            </div>
          ) : isLleno ? (
            <div style={{ fontSize: 12, color: "#e8341c", fontWeight: 700 }}>Giro lleno: no se puede aplicar.</div>
          ) : (
            <div style={{ marginTop: 4 }}>
              {isNoRec && (
                <div style={{ fontSize: 11, color: "#9a9aa2", marginBottom: 8 }}>
                  El sistema lo desaconseja (zonas opuestas). Forzar crea el giro REAL de todas formas.
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Escribe FORZAR"
                  style={{ width: 130, background: "#1a1a1c", border: "1px solid #2a2a2e", borderRadius: 8, color: "#e8e8ea", padding: "8px 10px", fontSize: 13 }} />
                <button type="button" onClick={apply}
                  disabled={applying || confirmText.trim().toUpperCase() !== "FORZAR"}
                  style={{ padding: "11px 18px", borderRadius: 10, border: `1px solid ${isNoRec ? "#e8341c" : "#3a5a3a"}`,
                    background: (applying || confirmText.trim().toUpperCase() !== "FORZAR") ? "#1a1a1c" : isNoRec ? "rgba(232,52,28,0.14)" : "rgba(124,179,66,0.16)",
                    color: (applying || confirmText.trim().toUpperCase() !== "FORZAR") ? "#6a6a72" : isNoRec ? "#ff7a68" : "#9ccc65",
                    cursor: (applying || confirmText.trim().toUpperCase() !== "FORZAR") ? "default" : "pointer", fontWeight: 800, fontSize: 14 }}>
                  {applying ? "Creando giro…" : isNoRec ? "⚠ Forzar giro" : "✓ Aplicar ruta"}
                </button>
              </div>
              <div style={{ fontSize: 10, color: "#6a6a72", marginTop: 6 }}>
                Escritura armada (flag ON). Escribe FORZAR para habilitar; createManualGiro escribe en el DB en vivo.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resultado del apply */}
      {applyResult && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8,
          border: `1px solid ${applyResult.ok ? "#3a5a3a" : "rgba(232,52,28,0.4)"}`,
          background: applyResult.ok ? "rgba(124,179,66,0.08)" : "rgba(232,52,28,0.08)",
          color: applyResult.ok ? "#9ccc65" : "#ffb4a8", fontSize: 13, fontWeight: 700 }}>
          {applyResult.ok ? `✓ Giro creado: ${applyResult.giroId}` : applyResult.msg}
        </div>
      )}
    </div>
  );
}
