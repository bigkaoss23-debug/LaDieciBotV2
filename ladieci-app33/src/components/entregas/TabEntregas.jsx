import { useState, useEffect } from 'react';
import { calcTotale } from '../../constants';
import { api } from '../../api';
import { ZONE_DELIVERY, zonaBadgeStyle, tempoAndata } from '../../zones';
import { ORDER_STATES, buildEnEntregaTransition, isDriverOnTheWayState, isWaitingDriverState, logLegacyBypass, logRollback, logTransition } from '../../core/orders';
import { orderDeadlineMs, orderDeadlineHHMM, giroEarliestDeadlineMs, formatMadridHHMM } from '../cocina/manualGiroCocina';

// Helpers tempi: hora consegna ↔ horaForno (= partenza driver = uscita pizza forno)
const _tm = (t) => { if (!t) return null; const [h,m] = t.split(":").map(Number); return h*60+m; };
// [FDV1] Target di produzione DOMICILIO = (deadline più urgente del giro | propria deadline) + offset ± (di blocco).
// Niente rider, niente sottrazione di viaggio, niente hora_ref. giroMeta._earliestMs è calcolato dagli ordini realtime.
const targetHHMM = (o, giroMeta) => {
  const base = (giroMeta && Number.isFinite(giroMeta._earliestMs)) ? giroMeta._earliestMs : orderDeadlineMs(o);
  if (base == null) return o?.hora || null;
  return formatMadridHHMM(base + (Number(o?.ui_offset_min) || 0) * 60000);
};
// Orario operativo del blocco giro = target del giro (deadline più urgente + offset di blocco).
const giroOperationalHora = (giroMeta, ordini) => ((ordini && ordini[0]) ? targetHHMM(ordini[0], giroMeta) : null);

// [FDV1] warning fattuali dal backend (giroWarnings) → testo operatore. Mai bloccanti.
const fdv1WarningLabel = (w) => {
  const ids = (w.member_ids || []).join(", ");
  const d = w.data || {};
  switch (w.code) {
    case "deadline_much_closer": return `Límite mucho antes (−${d.delta_min} min): ${ids}`;
    case "spread_over_window":   return `Límites separados ${d.spread_min} min (> ${d.window_min}): ${ids}`;
    case "deadline_passed":      return `Límite ya pasado: ${ids}`;
    case "already_departed":     return `Ya en camino: ${ids}`;
    case "zones_differ":         return `Zonas diferentes: ${(d.zones || []).join(", ")}`;
    case "capacity_exceeded":    return `Capacidad superada: ${d.used}/${d.max}`;
    case "no_zone":              return `Sin zona: ${ids}`;
    default:                     return String(w.code || "aviso");
  }
};

const ORANGE = "#F97316";
// [FDV1] nessuna telemetria rider (DRIVER_STATO) nel percorso operativo.
const FDV1_NO_RIDER = true;

// Per la navigazione usa solo "Via Numero" — l'interno/scala confonde Google Maps
const mapsAddr = (dir) => (dir || "").split(",")[0].trim();
const mapsUrl  = (dir) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddr(dir) + " Roquetas de Mar")}`;

const MANUAL_GIRO_STATES = new Set([
  ORDER_STATES.EN_COCINA,
  ORDER_STATES.LISTO,
  ORDER_STATES.EN_ENTREGA,
]);

const isManualGiroSelectableOrder = (o) =>
  o?.tipo_consegna === "DOMICILIO" && MANUAL_GIRO_STATES.has(o?.estado);

// Label visivo "G<seq>" coerente con P1A. seq arriva dal backend (per-day, reset
// giornaliero Madrid). Fallback parse dell'id `mg_<yymmdd>_<seq>` se metadata
// non ancora caricata (race fetch).
const formatGiroLabel = (giro) => {
  if (!giro) return "G?";
  if (typeof giro.seq === "number" && Number.isFinite(giro.seq)) return "G" + giro.seq;
  const m = String(giro.id || "").match(/_(\d+)$/);
  return m ? "G" + m[1] : "G?";
};

const warningStyle = (level = "soft") => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: level === "strong" ? "rgba(239,68,68,0.14)" : "rgba(251,191,36,0.11)",
  border: `1px solid ${level === "strong" ? "rgba(239,68,68,0.42)" : "rgba(251,191,36,0.36)"}`,
  borderRadius: 999,
  color: level === "strong" ? "#fca5a5" : "#fbbf24",
  fontSize: 10,
  fontWeight: 800,
  padding: "2px 7px",
  whiteSpace: "nowrap",
});

const buildManualGiroWarnings = (orders, manualGiroByOrderId = {}) => {
  const warnings = [];
  const add = (key, label, level = "soft") => {
    if (!warnings.some(w => w.key === key)) warnings.push({ key, label, level });
  };
  const list = (orders || []).filter(Boolean);
  if (list.length < 2) {
    if (list.some(o => manualGiroByOrderId[o.id])) add("already", "Ya en giro");
    if (list.some(o => !o.zona)) add("no-zona", "Sin zona");
    if (list.some(o => !o.direccion)) add("no-dir", "Sin direccion");
    return warnings;
  }

  const zones = new Set(list.map(o => o.zona).filter(Boolean));
  if (zones.size > 1) add("zones", "Zonas diferentes");
  if (list.some(o => !o.zona)) add("no-zona", "Sin zona");
  if (list.some(o => !o.direccion)) add("no-dir", "Sin direccion");
  if (list.some(o => manualGiroByOrderId[o.id])) add("already", "Ya en giro");

  const mins = list.map(o => _tm(o.hora)).filter(m => m != null);
  if (mins.length >= 2) {
    const diff = Math.max(...mins) - Math.min(...mins);
    if (diff > 25) add("hora-strong", "Horarios >25 min", "strong");
    else if (diff > 15) add("hora", "Horarios >15 min");
  }

  const states = new Set(list.map(o => o.estado));
  if (states.has(ORDER_STATES.EN_COCINA) && states.has(ORDER_STATES.EN_ENTREGA)) {
    add("state-gap", "Cocina + en camino", "strong");
  }

  return warnings;
};

// ─── Card ordine dentro un blocco zona ────────────────────────────────────
const ZonaOrderRow = ({
  o, zona, onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado,
  manualGiro, manualGiroWarnings = [], isManualGiroSelected = false,
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro,
  giroOptions = [], onMoveToGiro
}) => {
  const isLoading   = loadingId === o.id;
  const isListo     = o.estado === ORDER_STATES.LISTO;
  const isEnEntrega = o.estado === ORDER_STATES.EN_ENTREGA;
  const isCocina    = o.estado === ORDER_STATES.EN_COCINA;
  const selectableForManualGiro = isManualGiroSelectableOrder(o);

  // Override: salida no registrada (ordine EN_ENTREGA ma partito_alle nullo)
  // [FDV1] niente "salida no registrada": la partenza rider non è un dato del Planner.
  const salidaMancante = !FDV1_NO_RIDER && isEnEntrega && !driverStato?.partito_alle;

  const safeItems = (() => {
    if (!o.items) return [];
    const arr = Array.isArray(o.items) ? o.items : (() => { try { return JSON.parse(o.items); } catch(e) { return []; } })();
    return (Array.isArray(arr) ? arr : []).filter(i => i.n !== "Entrega a domicilio");
  })();
  const nPizze = safeItems.reduce((s, i) => s + (parseInt(i.q) || 1), 0);
  // Sorgente di verità: o.totale (include delivery_fee). Fallback per record legacy.
  const totaleNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(safeItems, o.tipo_consegna || "DOMICILIO");
  const total = totaleNum.toFixed(2);

  const estadoColor = isEnEntrega ? ORANGE : isListo ? "#22C55E" : isCocina ? "#3B82F6" : "#06B6D4";
  const estadoLabel = isEnEntrega ? "🛵" : isListo ? "✅" : isCocina ? "🔥" : "⏳";

  return (
    <div style={{
      background: manualGiro ? "rgba(251,191,36,0.055)" : "rgba(255,255,255,0.03)",
      border: manualGiro
        ? "1px solid rgba(251,191,36,0.42)"
        : `1px solid ${isEnEntrega ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: manualGiro ? "inset 3px 0 0 rgba(251,191,36,0.70)" : "none"
    }}>
      {selectableForManualGiro && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleManualGiro && onToggleManualGiro(o.id); }}
          aria-pressed={isManualGiroSelected}
          title={isManualGiroSelected ? "Quitar de seleccion manual" : "Añadir a giro manual"}
          style={{
            width: 24, height: 24, borderRadius: 7,
            border: `1.5px solid ${isManualGiroSelected ? "#fbbf24" : "rgba(251,191,36,0.55)"}`,
            background: isManualGiroSelected ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.08)",
            color: isManualGiroSelected ? "#fbbf24" : "#fde68a",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, lineHeight: 1, cursor: "pointer", flexShrink: 0
          }}
        >
          {isManualGiroSelected ? "✓" : "+"}
        </button>
      )}

      {/* Stato */}
      <span style={{ fontSize: 14, flexShrink: 0 }}>{estadoLabel}</span>

      {/* [FDV1] ADD / MOVE: standalone → giro, G1 → G2 (giro → suelto = × sul badge) */}
      {selectableForManualGiro && onMoveToGiro && giroOptions.some(g => g.id !== (manualGiro && manualGiro.id)) && (
        <select
          value=""
          aria-label={manualGiro ? "Mover a otro giro" : "Añadir a un giro"}
          title={manualGiro ? "Mover a otro giro" : "Añadir a un giro"}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const v = e.target.value; if (v) onMoveToGiro(o.id, v); }}
          style={{
            background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.45)", color: "#fde68a",
            borderRadius: 7, fontSize: 11, fontWeight: 800, padding: "2px 4px", flexShrink: 0, cursor: "pointer"
          }}
        >
          <option value="">{manualGiro ? "→ mover" : "→ giro"}</option>
          {giroOptions.filter(g => g.id !== (manualGiro && manualGiro.id)).map(g => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* Cliente + indirizzo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{o.nombre}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{o.id}</span>
          {manualGiro && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "rgba(251,191,36,0.14)",
              border: "1px solid rgba(251,191,36,0.42)",
              color: "#fbbf24", borderRadius: 999,
              padding: "2px 7px", fontSize: 10, fontWeight: 900,
              textTransform: "lowercase", whiteSpace: "nowrap"
            }} title="Giro manual persistente (backend)">
              giro manual · {formatGiroLabel(manualGiro)}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemoveFromManualGiro && onRemoveFromManualGiro(manualGiro.id, o.id); }}
                title="Quitar este pedido del giro"
                style={{
                  background: "transparent", border: "none", color: "#fde68a",
                  fontSize: 12, fontWeight: 900, padding: 0, cursor: "pointer", lineHeight: 1
                }}
              >×</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDissolveManualGiro && onDissolveManualGiro(manualGiro.id); }}
                title="Disolver giro manual"
                style={{
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.28)",
                  color: "#fde68a", borderRadius: 999, fontSize: 9, fontWeight: 900,
                  padding: "1px 5px", cursor: "pointer", lineHeight: 1.2
                }}
              >disolver</button>
            </span>
          )}
          {manualGiroWarnings.map(w => (
            <span key={`${manualGiro?.id || o.id}-${w.key}`} style={warningStyle(w.level)}>
              {w.label}
            </span>
          ))}
          {(() => {
            // [FDV1] ⏱ = target di produzione (deadline + offset ±); 🛵 = deadline cliente (singolo) o del giro
            // (la più urgente dei membri); "cliente" = deadline del singolo quando differisce da quella del giro.
            const isGiro = !!(manualGiro && manualGiro.id);
            const deadlineCliente = orderDeadlineHHMM(o);
            if (!isGiro) {
              const hF = targetHHMM(o, null);
              if (!deadlineCliente && !hF) return null;
              return (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  {hF && (
                    <span style={{ color: "#C2410C", fontWeight: 700 }} title="Objetivo producción">
                      ⏱ {hF}
                    </span>
                  )}
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }} title="Límite de entrega (creación + 55 min)">
                    🛵 {deadlineCliente}
                  </span>
                  {o.hora && o.hora !== deadlineCliente && (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }} title="Hora prometida al cliente">
                      cliente {o.hora}
                    </span>
                  )}
                </span>
              );
            }
            const hF = targetHHMM(o, manualGiro);
            const hEntrega = formatMadridHHMM(manualGiro._earliestMs) || deadlineCliente;
            const showClienteRef = deadlineCliente && deadlineCliente !== hEntrega;
            if (!hF && !hEntrega) return null;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                {hF && (
                  <span style={{ color: "#C2410C", fontWeight: 700 }} title="Objetivo producción (giro)">
                    ⏱ {hF}
                  </span>
                )}
                {hEntrega && (
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }} title="Límite más urgente del giro">
                    🛵 {hEntrega}
                  </span>
                )}
                {showClienteRef && (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }} title="Límite de entrega del pedido">
                    límite {deadlineCliente}
                  </span>
                )}
                {o.hora && o.hora !== deadlineCliente && (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }} title="Hora prometida al cliente">
                    cliente {o.hora}
                  </span>
                )}
              </span>
            );
          })()}
        </div>
        <div style={{ color: "rgba(253,186,116,0.8)", fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
          📍 {o.direccion || <span style={{ color: "rgba(255,100,50,0.5)" }}>Sin dirección</span>}
        </div>
        {/* Riesgo repartidor (DELIVERY-DRIVER-SCHEDULE-SEPARATION-01).
            Sorgente: campi driver backend separati da forno_out (cucina).
            forno_out NON è la salida driver: qui mostriamo la partenza/consegna
            stimata reale del rider e l'eventuale retraso. */}
        {o.conflicto_driver && o.salida_driver_estimada && (
          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.45)",
              color: "#fca5a5", borderRadius: 999, fontSize: 10, fontWeight: 800,
              padding: "2px 8px", whiteSpace: "nowrap"
            }} title="Schedule rider: salida estimada y retraso respecto a la hora cliente">
              ⚠ Repartidor tarde · salida {o.salida_driver_estimada}
              {Number(o.retraso_estimado_min) > 0 ? ` · +${o.retraso_estimado_min} min` : ""}
            </span>
            {o.entrega_estimada && (
              <span style={{
                color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700,
                fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap"
              }} title="Entrega estimada al cliente (schedule rider)">
                entrega est. {o.entrega_estimada}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pizze + totale */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ color: "#22C55E", fontWeight: 800, fontFamily: "'DM Mono',monospace", fontSize: 13 }}>{total}€</div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{nPizze} pz</div>
      </div>

      {/* Link Maps */}
      {o.direccion && (
        <a href={mapsUrl(o.direccion)} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 6, padding: "4px 8px",
            color: ORANGE, fontSize: 11, fontWeight: 700,
            textDecoration: "none", flexShrink: 0
          }}>
          🗺️
        </a>
      )}

      {/* EN_COCINA: nessuna azione driver disponibile, pill informativo per l'operatore.
          Le azioni (manda repartidor / registrar salida / entregado) renderizzano solo
          quando estado === LISTO o EN_ENTREGA — vedi sotto. Qui mostriamo perché. */}
      {isCocina && (
        <span style={{
          padding: "5px 10px",
          background: "rgba(59,130,246,0.10)",
          border: "1px solid rgba(59,130,246,0.35)",
          borderRadius: 8,
          color: "#60A5FA",
          fontWeight: 700,
          fontSize: 11,
          flexShrink: 0,
          whiteSpace: "nowrap"
        }} title="Acciones de repartidor disponibles cuando pase a LISTO">
          🔥 En cocina
        </span>
      )}

      {/* Bottone manda repartidor */}
      {isListo && (
        <button disabled={isLoading} onClick={() => onSendRepartidor(o.id)}
          style={{
            padding: "6px 12px",
            background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)",
            borderRadius: 8, color: ORANGE, fontWeight: 700, fontSize: 12,
            cursor: isLoading ? "not-allowed" : "pointer", flexShrink: 0
          }}>
          {isLoading ? "..." : "🛵"}
        </button>
      )}

      {/* Override: salida no registrada */}
      {salidaMancante && (
        <button disabled={isLoading} onClick={() => onForzaSalida && onForzaSalida(o)}
          style={{
            padding: "5px 10px",
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.5)",
            borderRadius: 8, color: "#fbbf24", fontWeight: 700, fontSize: 11,
            cursor: "pointer", flexShrink: 0
          }}
          title="Registrar manualmente la salida del repartidor">
          ⚠️ Registrar salida
        </button>
      )}

      {/* Override: marcar driver de vuelta manualmente.
          DOMICILIO: RETIRADO = driver rientrato in pizzeria (giro chiuso), NON consegna cliente. */}
      {isEnEntrega && (
        <button disabled={isLoading} onClick={() => {
          if (!window.confirm("¿Pedido entregado? Pasa a RETIRADO.")) return;
          onForzaEntregado && onForzaEntregado(o);
        }}
          style={{
            padding: "5px 10px",
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 8, color: "#22C55E", fontWeight: 700, fontSize: 11,
            cursor: "pointer", flexShrink: 0
          }}
          title="Marcar pedido entregado (RETIRADO) desde el panel del operador">
          ✓ Entregado
        </button>
      )}
    </div>
  );
};

// ─── Blocco giro (zona + ora consegna) ───────────────────────────────────
const ZonaBlock = ({
  zona, ordini, giroHora, onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado,
  manualGiroByOrderId, manualGiroWarningsById, selectedManualGiroOrderIds,
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro,
  giroOptions = [], onMoveToGiro
}) => {
  const isFull  = ordini.length >= zona.maxOrdiniPerGiro;
  const isOver  = ordini.length > zona.maxOrdiniPerGiro;

  return (
    <div style={{
      border: `2px solid ${isFull ? "rgba(251,191,36,0.6)" : zona.colore + "CC"}`,
      borderRadius: 14, overflow: "hidden", marginBottom: 16,
      boxShadow: isFull
        ? `0 0 0 1px rgba(251,191,36,0.15), 0 0 18px rgba(251,191,36,0.25)`
        : `0 0 0 1px ${zona.colore}22, 0 0 18px ${zona.colore}55, 0 4px 16px rgba(0,0,0,0.35)`,
    }}>
      {/* Header zona */}
      <div style={{
        background: `linear-gradient(135deg, ${zona.colore}44 0%, ${zona.colore}18 60%, rgba(0,0,0,0) 100%)`,
        borderBottom: `1px solid ${zona.colore}55`,
        padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 10
      }}>
        {/* Pallino colorato con glow */}
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: zona.colore, flexShrink: 0,
          boxShadow: `0 0 8px ${zona.colore}, 0 0 16px ${zona.colore}88`
        }} />
        <span style={{
          color: "#fff", fontWeight: 900, fontSize: 14, flex: 1,
          textShadow: `0 0 12px ${zona.colore}99`,
          display: "flex", alignItems: "center", gap: 8
        }}>
          <span style={{ color: zona.colore }}>{zona.id}</span>
          {giroHora && (
            <span style={{
              background: zona.colore, color: "#fff",
              borderRadius: 8, padding: "2px 10px",
              fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900
            }} title="Última entrega del giro">⏱ {giroHora}</span>
          )}
          <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600, fontSize: 12 }}>
            {zona.nome}
          </span>
        </span>
        {/* Contatore ordini / max */}
        <span style={{
          background: isFull ? "rgba(251,191,36,0.20)" : `${zona.colore}33`,
          border: `1.5px solid ${isFull ? "rgba(251,191,36,0.6)" : zona.colore + "99"}`,
          color: isFull ? "#fbbf24" : "#fff",
          borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 800,
          boxShadow: isFull ? "none" : `0 0 8px ${zona.colore}55`
        }}>
          {ordini.length}/{zona.maxOrdiniPerGiro}
        </span>
        {/* Tempo giro — snapshot durata_andata reale (Google), worst-case del giro.
            Se almeno un ordine non ha né durata_andata_min né zona_lat/lon, il valore
            cade sul fallback zona.tempoGiro (worst-case zona): marca con * + giallo +
            tooltip per evitare che l'operatore lo legga come ETA reale. */}
        {(() => {
          const tg = Math.max(...ordini.map(o => tempoAndata(o, zona)));
          const isFallback = ordini.some(o =>
            (o.durata_andata_min == null) &&
            (o.zona_lat == null || o.zona_lon == null)
          );
          return (
            <span style={{
                color: isFallback ? "#fbbf24" : "rgba(255,255,255,0.45)",
                fontSize: 11, fontFamily: "'DM Mono',monospace", fontWeight: 600
              }}
              title={isFallback
                ? "Estimación de zona (sin GPS del cliente) — verificar en Maps"
                : "Tempo andata one-way (peggior caso del giro)"}>
              ~{tg}min{isFallback ? "*" : ""}
            </span>
          );
        })()}
      </div>

      {/* Alert slot pieno */}
      {isOver && (
        <div style={{
          background: "rgba(251,191,36,0.08)",
          borderBottom: "1px solid rgba(251,191,36,0.2)",
          padding: "6px 14px",
          fontSize: 11, color: "#fbbf24", fontWeight: 600
        }}>
          ⚠️ Slot lleno — más de {zona.maxOrdiniPerGiro} pedidos, la pizza puede enfriarse
        </div>
      )}

      {/* Ordini */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {ordini.map(o => (
          <ZonaOrderRow key={o.id} o={o} zona={zona}
            onSendRepartidor={onSendRepartidor} loadingId={loadingId}
            driverStato={driverStato} onForzaSalida={onForzaSalida} onForzaEntregado={onForzaEntregado}
            manualGiro={manualGiroByOrderId[o.id] || null}
            manualGiroWarnings={manualGiroWarningsById[o.id] || []}
            isManualGiroSelected={selectedManualGiroOrderIds.includes(o.id)}
            onToggleManualGiro={onToggleManualGiro}
            onRemoveFromManualGiro={onRemoveFromManualGiro}
            onDissolveManualGiro={onDissolveManualGiro}
            giroOptions={giroOptions} onMoveToGiro={onMoveToGiro} />
        ))}
      </div>
    </div>
  );
};

// ─── Blocco giro MANUALE (cross-zona / cross-orario) ──────────────────────
// Il manual_giro_id comanda sul clustering automatico: tutti i membri stanno
// in UN blocco anche se zone/orari diversi. Mostra orario operativo unico
// (deadline più urgente + offset di blocco) + zone incluse + deadline individuali per card.
const ManualGiroBlock = ({
  giro, ordini, zones, hora, warnings = [],
  onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado,
  manualGiroByOrderId, manualGiroWarningsById, selectedManualGiroOrderIds,
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro,
  giroOptions = [], onMoveToGiro
}) => {
  const giroLabel = formatGiroLabel(giro);
  const AMBER = "#fbbf24";
  return (
    <div style={{
      border: `2px solid rgba(251,191,36,0.55)`,
      borderRadius: 14, overflow: "hidden", marginBottom: 16,
      boxShadow: `0 0 0 1px rgba(251,191,36,0.15), 0 0 18px rgba(251,191,36,0.22), 0 4px 16px rgba(0,0,0,0.35)`,
    }}>
      {/* Header giro manuale */}
      <div style={{
        background: `linear-gradient(135deg, rgba(251,191,36,0.30) 0%, rgba(251,191,36,0.10) 60%, rgba(0,0,0,0) 100%)`,
        borderBottom: `1px solid rgba(251,191,36,0.45)`,
        padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
      }}>
        <span style={{
          background: AMBER, color: "#1c1300", borderRadius: 8,
          padding: "3px 10px", fontSize: 13, fontWeight: 900, flexShrink: 0
        }}>
          🔗 Giro manual {giroLabel}
        </span>
        {hora && (
          <span style={{
            background: AMBER, color: "#1c1300",
            borderRadius: 8, padding: "2px 10px",
            fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900
          }} title="Orario operativo del giro (salida driver)">🕐 {hora}</span>
        )}
        {/* Zone incluse */}
        <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
          {zones.map(zid => {
            const z = ZONE_DELIVERY.find(zz => zz.id === zid);
            const col = z?.colore || "#888";
            return (
              <span key={zid} style={{
                background: `${col}33`, border: `1.5px solid ${col}99`, color: "#fff",
                borderRadius: 7, padding: "2px 8px", fontSize: 11, fontWeight: 800
              }}>{zid}</span>
            );
          })}
          {ordini.some(o => !o.zona) && (
            <span style={{
              background: "rgba(251,191,36,0.18)", border: "1.5px solid rgba(251,191,36,0.6)",
              color: AMBER, borderRadius: 7, padding: "2px 8px", fontSize: 11, fontWeight: 800
            }}>sin zona</span>
          )}
        </span>
        <span style={{ flex: 1 }} />
        {warnings.map(w => (
          <span key={w.key} style={warningStyle(w.level)}>{w.label}</span>
        ))}
        <span style={{
          background: "rgba(251,191,36,0.18)", border: `1.5px solid rgba(251,191,36,0.55)`,
          color: AMBER, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 800
        }}>{ordini.length} pedidos</span>
        <button
          type="button"
          onClick={() => onDissolveManualGiro && onDissolveManualGiro(giro.id)}
          title="Disolver giro manual"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "4px 10px",
            fontSize: 11, fontWeight: 800, cursor: "pointer"
          }}
        >Disolver</button>
      </div>

      {/* Ordini del giro — ognuno con la propria zona + orario cliente */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {ordini.map(o => (
          <ZonaOrderRow key={o.id} o={o} zona={ZONE_DELIVERY.find(z => z.id === o.zona)}
            onSendRepartidor={onSendRepartidor} loadingId={loadingId}
            driverStato={driverStato} onForzaSalida={onForzaSalida} onForzaEntregado={onForzaEntregado}
            manualGiro={manualGiroByOrderId[o.id] || null}
            manualGiroWarnings={manualGiroWarningsById[o.id] || []}
            isManualGiroSelected={selectedManualGiroOrderIds.includes(o.id)}
            onToggleManualGiro={onToggleManualGiro}
            onRemoveFromManualGiro={onRemoveFromManualGiro}
            onDissolveManualGiro={onDissolveManualGiro}
            giroOptions={giroOptions} onMoveToGiro={onMoveToGiro} />
        ))}
      </div>
    </div>
  );
};

// ─── [FDV1] Modal di revisione: create / add / move. Warning fattuali dal backend; l'operatore decide ─────
// (conferma = override). Nessuna scelta di orario: le deadline dei clienti non cambiano mai.
const GiroReviewModal = ({ review, orders = [], pending, onConfirm, onCancel }) => {
  const warnings = review.warnings || [];
  const isCreate = review.kind === "create";
  const title = isCreate ? `Crear giro manual · ${orders.length} pedidos` : `${review.moving ? "Mover" : "Añadir"} ${review.orderIds.join(", ")} → ${review.giroLabel || "giro"}`;
  const cta = pending ? "..." : warnings.length ? "Confirmar igualmente" : (isCreate ? "Crear giro" : review.moving ? "Mover" : "Añadir al giro");
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(480px, 100%)", maxHeight: "90vh", overflowY: "auto",
        background: "#16181d", border: "1.5px solid rgba(251,191,36,0.4)",
        borderRadius: 14, padding: 18, boxShadow: "0 12px 48px rgba(0,0,0,0.6)"
      }}>
        <div style={{ color: "#fde68a", fontWeight: 900, fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginBottom: 12 }}>
          El giro toma el <strong style={{ color: "#fde68a" }}>límite más urgente</strong> de sus pedidos. Los límites de cada cliente no cambian.
        </div>
        {orders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {orders.map(o => (
              <div key={o.id} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#fff" }}>
                <span style={{ fontWeight: 800, minWidth: 44 }}>{o.id}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.7)" }}>{o.nombre}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.6)" }}>{o.zona || "—"} · límite {orderDeadlineHHMM(o) || "—"}</span>
              </div>
            ))}
          </div>
        )}
        {warnings.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={warningStyle("strong")}>REVISAR</span>
            {warnings.map((w, i) => <span key={`${w.code}-${i}`} style={warningStyle("strong")}>{fdv1WarningLabel(w)}</span>)}
          </div>
        )}
        {review.warningsUnavailable && (
          <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>Avisos no disponibles — revisa a mano antes de confirmar.</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.6)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer"
          }}>Cancelar</button>
          <button type="button" disabled={pending} onClick={onConfirm} style={{
            background: pending ? "rgba(255,255,255,0.05)" : "rgba(251,191,36,0.22)",
            border: `1px solid ${pending ? "rgba(255,255,255,0.1)" : "rgba(251,191,36,0.6)"}`,
            color: pending ? "rgba(255,255,255,0.3)" : "#fde68a",
            borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 900,
            cursor: pending ? "not-allowed" : "pointer"
          }}>{cta}</button>
        </div>
      </div>
    </div>
  );
};

const TabEntregas = ({ ordenes = [], notify, setOrdenes }) => {
  const [loadingId,    setLoadingId]    = useState(null);
  const [driverStato] = useState(null);   // [FDV1] sempre null: nessuna telemetria rider
  const [apertoConsegnati, setApertoConsegnati] = useState(false);
  // DELIVERY-MANUAL-GIRO-01 P1C.1: manualGiros è backend-derived (api.getManualGiros).
  // selectedManualGiroOrderIds resta locale (selezione UI, mai persistita).
  // pendingManualGiroAction disabilita i bottoni durante una mutation in volo.
  const [manualGiros, setManualGiros] = useState([]);
  const [selectedManualGiroOrderIds, setSelectedManualGiroOrderIds] = useState([]);
  const [pendingManualGiroAction, setPendingManualGiroAction] = useState(false);
  // [FDV1] revisione in corso: { kind: 'create'|'add', orderIds, giroId?, giroLabel?, moving?, warnings, warningsUnavailable? }
  const [giroReview, setGiroReview] = useState(null);
  // Ticker UI-only (no network): fa avanzare il countdown del rientro rider
  // mentre l'operatore resta sulla pagina. 15s basta (display in minuti).
  const [riderNowMs, setRiderNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setRiderNowMs(Date.now()), 15000);
    return () => clearInterval(tick);
  }, []);

  // [FDV1] Rider return: nessuna telemetria (driverStato sempre null → nessun banner).
  // [FDV1] il rider non è una variabile del Planner: nessuna lettura di DRIVER_STATO (driverStato resta null →
  // nessun banner di rientro, nessun "Registrar salida"). Il flusso di stato EN_ENTREGA → RETIRADO resta invariato.

  // Reparto operativo: include EN_COCINA per pianificazione operatore di sala
  // (badge "🔥" + nessun bottone d'azione finché non passa a LISTO).
  // POR_CONFIRMAR e NUEVO restano in Pedidos: l'operatore deve prima confermare.
  const entregas = ordenes.filter(o =>
    isWaitingDriverState(o) ||
    isDriverOnTheWayState(o) ||
    (o.tipo_consegna === "DOMICILIO" && o.estado === ORDER_STATES.EN_COCINA)
  );

  const consegnati = ordenes.filter(o =>
    o.tipo_consegna === "DOMICILIO" && o.estado === ORDER_STATES.RETIRADO
  );

  // ── Rider return: TELEMETRIA VISIVA dal backend ───────────────────────────
  // [FDV1] driverStato è sempre null (nessuna lettura di DRIVER_STATO) → sezione mai visibile.
  // NIENTE fallback hora_entrega+durata: eviterebbe il "returning" prematuro in
  // un giro multi-ordine (no banner > banner sbagliato). Il "returning" diventa
  // vero solo quando il backend chiude il giro (ultima consegna). Nessuna
  // scrittura DRIVER_STATO lato frontend.
  const RIDER_RETURN_GRACE_MIN = 5;
  // nowMs deriva dal ticker UI (riderNowMs): il countdown avanza senza refresh.
  const nowMs = riderNowMs;
  const driverOut = !!(driverStato && driverStato.out === true);
  const driverReturning = !!(driverStato && driverStato.returning === true && driverStato.rientro_stimato);
  const driverPartitoMs = driverStato?.partito_alle ? Date.parse(driverStato.partito_alle) : NaN;
  const riderBannerEtaMs = driverReturning ? Date.parse(driverStato.rientro_stimato) : NaN;
  // Card del giro in ritorno: ordini consegnati DOPO la partenza corrente,
  // mostrati SOLO quando il backend dichiara returning=true (giro chiuso).
  const returningOrders = (driverReturning && Number.isFinite(riderBannerEtaMs))
    ? consegnati.filter(o => {
        const he = Number(o?.hora_entrega);
        if (!Number.isFinite(he)) return false;
        return !Number.isFinite(driverPartitoMs) || he >= driverPartitoMs;
      })
    : [];
  const returningIds = new Set(returningOrders.map(o => o.id));
  // Esclude i returning dal riepilogo collassato per evitare duplicati.
  const consegnatiCollapsed = consegnati.filter(o => !returningIds.has(o.id));
  // Banner attivo finché non superata ETA + grace (5 min); poi si nasconde.
  const riderReturnActive = Number.isFinite(riderBannerEtaMs) && nowMs <= riderBannerEtaMs + RIDER_RETURN_GRACE_MIN * 60000;
  const riderReturnBeforeEta = Number.isFinite(riderBannerEtaMs) && nowMs <= riderBannerEtaMs;
  const riderReturnQuedanMin = Number.isFinite(riderBannerEtaMs)
    ? Math.max(0, Math.ceil((riderBannerEtaMs - nowMs) / 60000)) : 0;
  // Dopo l'ETA (dentro la grace di 5 min): minuti trascorsi dalla stima. <1 min → "~1 min".
  const riderReturnElapsedMin = Number.isFinite(riderBannerEtaMs)
    ? Math.max(1, Math.ceil((nowMs - riderBannerEtaMs) / 60000)) : 0;
  const riderReturnEtaHHMM = Number.isFinite(riderBannerEtaMs)
    ? new Date(riderBannerEtaMs).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
    : "";
  // Mostra la sezione anche per "driver fuori senza ETA" (out && !returning).
  const riderSectionVisible = riderReturnActive || (driverOut && !driverReturning);

  const toMin = (t) => { if (!t) return 9999; const [h,m] = t.split(":").map(Number); return h*60+m; };
  const toHora = (m) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const activeManualGiroIds = new Set(entregas.filter(isManualGiroSelectableOrder).map(o => o.id));

  // DELIVERY-MANUAL-GIRO-01 P1C.1: prune solo della selezione locale quando un
  // ordine esce dagli stati selezionabili. I manual_giros restano backend-driven:
  // l'hook cambiaStato lato Railway stacca + auto-dissolve, e il polling 10s
  // sotto riallinea la metadata.
  useEffect(() => {
    const activeIds = new Set(
      ordenes.filter(isManualGiroSelectableOrder).map(o => o.id)
    );
    setSelectedManualGiroOrderIds(prev => prev.filter(id => activeIds.has(id)));
  }, [ordenes]);

  // Fetch manual giros metadata da backend + poll 10s.
  // L'appartenenza orderId → giroId arriva da ordenes.manual_giro_id (popolato
  // da api.getOrdenes/Realtime in App.jsx). Questo fetch serve per `seq`
  // (label "G<n>") e per filtrare i dissolti durante una finestra di race.
  useEffect(() => {
    let mounted = true;
    const safeLoad = async () => {
      try {
        const res = await api.getManualGiros();
        if (!mounted) return;
        if (Array.isArray(res)) setManualGiros(res);
        else if (res && res.error) console.warn("[manualGiros] fetch error:", res.error);
      } catch (e) {
        console.warn("[manualGiros] fetch threw:", (e && e.message) || e);
      }
    };
    safeLoad();
    const poll = setInterval(safeLoad, 10000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

  const ordersById = {};
  for (const o of entregas) ordersById[o.id] = o;

  // Mappa orderId → giro metadata.
  // Sorgente primaria: ordenes.manual_giro_id (membership autoritativa).
  // Sorgente secondaria: manualGiros (metadata: seq, ecc.). Se la metadata non
  // è ancora arrivata, fallback minimo {id, seq:null} per non perdere il chip.
  // Filtra giri dissolved per evitare di mostrare chip su ordini il cui FK
  // non è ancora stato pulito da un tick di realtime.
  const giroMetaById = {};
  // [FDV1] _earliestMs = deadline più urgente dei membri, dagli ordini realtime (non dalla metadata pollata).
  for (const giro of manualGiros) {
    if (!giro.dissolved_at) giroMetaById[giro.id] = { ...giro, _earliestMs: giroEarliestDeadlineMs(giro.id, ordenes) };
  }
  const manualGiroByOrderId = {};
  for (const o of entregas) {
    const gid = o.manual_giro_id;
    if (!gid) continue;
    manualGiroByOrderId[o.id] = giroMetaById[gid] || { id: gid, seq: null, order_ids: [], _earliestMs: giroEarliestDeadlineMs(gid, ordenes) };
  }

  const manualGiroWarningsById = {};
  for (const giro of manualGiros) {
    if (giro.dissolved_at) continue;
    const ids = Array.isArray(giro.order_ids) ? giro.order_ids : [];
    const giroOrders = ids.map(id => ordersById[id]).filter(Boolean);
    const warnings = buildManualGiroWarnings(giroOrders);
    for (const id of ids) manualGiroWarningsById[id] = warnings;
  }

  const selectedManualGiroOrders = selectedManualGiroOrderIds
    .map(id => ordersById[id])
    .filter(Boolean);
  const selectedManualGiroWarnings = buildManualGiroWarnings(selectedManualGiroOrders, manualGiroByOrderId);

  const toggleManualGiroSelection = (id) => {
    if (!activeManualGiroIds.has(id)) return;
    setSelectedManualGiroOrderIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // DELIVERY-MANUAL-GIRO-01 P1C.1: refetch helper riusato dopo ogni mutation
  // per riallineare metadata. Senza optimistic, ci affidiamo al backend + a
  // questo refetch + a Supabase Realtime per ordenes.manual_giro_id.
  const refetchManualGiros = async () => {
    try {
      const res = await api.getManualGiros();
      if (Array.isArray(res)) setManualGiros(res);
      else if (res && res.error) console.warn("[manualGiros] refetch error:", res.error);
    } catch (e) {
      console.warn("[manualGiros] refetch threw:", (e && e.message) || e);
    }
  };

  // [FDV1] Apre la revisione (warning fattuali dal backend) prima di creare il giro. Nessun orario da scegliere.
  const openGiroModal = async () => {
    if (pendingManualGiroAction) return;
    const orderIds = selectedManualGiroOrderIds.filter(id => activeManualGiroIds.has(id));
    if (orderIds.length < 2) return;
    setPendingManualGiroAction(true);
    let res = null;
    try { res = await api.giroWarnings({ order_ids: orderIds }); } catch (_) { res = null; }
    setPendingManualGiroAction(false);
    setGiroReview({ kind: "create", orderIds, warnings: (res && res.ok && res.warnings) || [], warningsUnavailable: !(res && res.ok) });
  };

  // [FDV1] ADD / MOVE: standalone → giro, oppure G1 → G2 ("move silent" atomico lato DB).
  const moveToGiro = async (orderId, giroId) => {
    if (pendingManualGiroAction) return;
    setPendingManualGiroAction(true);
    let res = null;
    try { res = await api.giroWarnings({ giro_id: giroId, order_ids: [orderId] }); } catch (_) { res = null; }
    setPendingManualGiroAction(false);
    const cur = ordenes.find(o => o.id === orderId);
    setGiroReview({
      kind: "add", orderIds: [orderId], giroId,
      giroLabel: formatGiroLabel(giroMetaById[giroId] || { id: giroId }),
      moving: !!(cur && cur.manual_giro_id),
      warnings: (res && res.ok && res.warnings) || [], warningsUnavailable: !(res && res.ok),
    });
  };

  // Conferma dalla revisione (= override se ci sono warning).
  const confirmGiroReview = async () => {
    if (pendingManualGiroAction || !giroReview) return;
    const rv = giroReview;
    setPendingManualGiroAction(true);
    try {
      const res = rv.kind === "create"
        ? await api.createManualGiro(rv.orderIds.filter(id => activeManualGiroIds.has(id)))
        : await api.addOrderToManualGiro(rv.giroId, rv.orderIds[0]);
      if (res && res.ok) {
        if (notify) notify(rv.kind === "create" ? `✓ Giro manual creado · ${formatGiroLabel(res.giro)}` : `✓ ${rv.orderIds[0]} → ${rv.giroLabel}`, "#22C55E");
        if (rv.kind === "create") setSelectedManualGiroOrderIds([]);
        setGiroReview(null);
      } else {
        const code = res && res.error;
        const msg = code === "invalid_orders" || code === "invalid_order" ? "Pedidos no elegibles"
          : code === "some_orders_not_found" || code === "order_not_found" ? "Pedidos no encontrados"
          : code === "giro_not_found" || code === "giro_dissolved" ? "Giro ya no existe"
          : (code === "need_at_least_2_orders" || code === "need_at_least_2_distinct_orders") ? "Selecciona 2 pedidos"
          : code === "giro_rpc_outcome_unknown" ? "Resultado incierto — reintenta"
          : "Error en el giro";
        if (notify) notify("❌ " + msg, "#E8341C");
        console.warn("[manualGiros] giro action failed:", res);
      }
    } catch (e) {
      console.warn("[manualGiros] giro action threw:", e);
      if (notify) notify("❌ Error de red", "#E8341C");
    }
    await refetchManualGiros();
    setPendingManualGiroAction(false);
  };

  // giroId ricevuto per compatibilità chiamante; backend usa solo orderId.
  const removeFromManualGiro = async (_giroId, orderId) => {
    if (pendingManualGiroAction) return;
    setPendingManualGiroAction(true);
    try {
      const res = await api.removeOrderFromManualGiro(orderId);
      if (res && res.ok) {
        if (res.auto_dissolved && notify) {
          notify("⚠️ Giro disuelto: quedan menos de 2 pedidos", "#fbbf24");
        }
      } else {
        if (notify) notify("❌ Error al quitar pedido", "#E8341C");
        console.warn("[manualGiros] removeOrderFromManualGiro failed:", res);
      }
    } catch (e) {
      console.warn("[manualGiros] removeOrderFromManualGiro threw:", e);
      if (notify) notify("❌ Error de red", "#E8341C");
    }
    await refetchManualGiros();
    setPendingManualGiroAction(false);
  };

  const dissolveManualGiro = async (giroId) => {
    if (pendingManualGiroAction) return;
    setPendingManualGiroAction(true);
    try {
      const res = await api.dissolveManualGiro(giroId);
      if (res && res.ok) {
        if (notify) notify("✓ Giro disuelto", "#22C55E");
      } else {
        if (notify) notify("❌ Error al disolver", "#E8341C");
        console.warn("[manualGiros] dissolveManualGiro failed:", res);
      }
    } catch (e) {
      console.warn("[manualGiros] dissolveManualGiro threw:", e);
      if (notify) notify("❌ Error de red", "#E8341C");
    }
    await refetchManualGiros();
    setPendingManualGiroAction(false);
  };

  // ── Step 1: i giri MANUALI comandano sul clustering automatico ──────────
  // Ogni ordine con manual_giro_id attivo va nel blocco del suo giro, anche
  // se zona/orario diversi. Solo i restanti passano al clustering automatico.
  const manualMembersByGiro = {};
  const nonManual = [];
  for (const o of entregas) {
    const gid = o.manual_giro_id;
    if (gid && manualGiroByOrderId[o.id]) {
      (manualMembersByGiro[gid] = manualMembersByGiro[gid] || []).push(o);
    } else {
      nonManual.push(o);
    }
  }
  const manualGiroBlocks = Object.keys(manualMembersByGiro).map(gid => {
    const ordini = manualMembersByGiro[gid].slice().sort((a, b) => toMin(a.hora) - toMin(b.hora));
    const giroMeta = giroMetaById[gid] || manualGiroByOrderId[ordini[0].id] || { id: gid, seq: null };
    const zones = Array.from(new Set(ordini.map(o => o.zona).filter(Boolean)));
    const hora = giroOperationalHora(giroMeta, ordini);
    const warnings = manualGiroWarningsById[ordini[0].id] || buildManualGiroWarnings(ordini);
    return { type: "manual", id: gid, giro: giroMeta, ordini, zones, hora, warnings };
  });

  // [FDV1] destinazioni per ADD / MOVE: i giri attivi visibili.
  const giroOptions = manualGiroBlocks.map(b => ({ id: b.id, label: formatGiroLabel(b.giro) }));

  // ── Step 2: clustering automatico solo per i NON-manuali ────────────────
  // [FDV1] Nessun cluster: ogni standalone resta un blocco singolo.
  const senzaZona = [];
  const perZonaSorted = {};
  for (const o of nonManual) {
    if (!o.zona) { senzaZona.push(o); continue; }
    (perZonaSorted[o.zona] = perZonaSorted[o.zona] || []).push(o);
  }
  // [FDV1] nessun raggruppamento automatico silenzioso: ogni ordine standalone è un blocco a sé.
  // Solo l'operatore crea giri (Crear giro manual / → giro).
  const autoGiri = [];
  for (const zonaId of Object.keys(perZonaSorted)) {
    for (const o of perZonaSorted[zonaId].sort((a, b) => toMin(a.hora) - toMin(b.hora))) {
      autoGiri.push({ type: "auto", zonaId, hora: o.hora, ordini: [o] });
    }
  }

  // ── Step 3: merge blocchi (manuali + automatici) ordinati per orario ────
  const allBlocks = [...manualGiroBlocks, ...autoGiri]
    .sort((a, b) => toMin(a.hora) - toMin(b.hora));

  // Conteggio per zona (per riepilogo rapido) — include membri dei giri manuali.
  const perZonaCount = {};
  for (const o of entregas) {
    if (o.zona) perZonaCount[o.zona] = (perZonaCount[o.zona] || 0) + 1;
  }

  // LISTO → EN_ENTREGA
  const handleSendRepartidor = async (id) => {
    const current = ordenes.find(o => o.id === id);
    const intent = buildEnEntregaTransition(current, {
      component: "TabEntregas",
      action: "handleSendRepartidor",
    });
    logTransition(intent);
    setLoadingId(id);
    setOrdenes(prev => prev.map(o =>
      o.id === id ? { ...o, estado: ORDER_STATES.EN_ENTREGA, hora_salida: Date.now() } : o
    ));
    try {
      await api.marcarEnEntrega(id);
      if (notify) notify("🛵 Repartidor en camino", ORANGE);
      // [FDV1] nessuna telemetria rider: EN_ENTREGA è solo un cambio di stato dell'ordine.
    } catch(e) {
      logRollback({
        component: "TabEntregas",
        action: "handleSendRepartidor.rollback",
        orderId: id,
        from: ORDER_STATES.EN_ENTREGA,
        to: ORDER_STATES.LISTO,
        metadata: { reason: "api.marcarEnEntrega failed" },
      });
      setOrdenes(prev => prev.map(o =>
        o.id === id ? { ...o, estado: ORDER_STATES.LISTO } : o
      ));
      if (notify) notify("❌ Error al enviar", "#E8341C");
    }
    setLoadingId(null);
  };

  // Override operatore: la telemetria "driver fuori" è ora BACKEND-owned (side-effect
  // di EN_ENTREGA, d569163). Il frontend non scrive più DRIVER_STATO — questo handler
  // si limita a ri-leggere lo status backend (read-only) e riallineare il banner.
  // [FDV1] nessuna registrazione / rilettura della partenza rider (niente getDriverStatus).
  const handleForzaSalida = () => {};

  // Override operatore: marca entregado manualmente (driver dimenticò Entregado)
  const handleForzaEntregado = async (ordine) => {
    logLegacyBypass({
      component: "TabEntregas",
      action: "handleForzaEntregado",
      orderId: ordine.id,
      metadata: {
        reason: "delivery_force_entregado_legacy_bypass",
        estadoOriginale: ordine?.estado,
        targetEstado: ORDER_STATES.RETIRADO,
      },
    });
    logTransition({
      component: "TabEntregas",
      action: "handleForzaEntregado",
      orderId: ordine.id,
      from: ordine?.estado,
      to: ORDER_STATES.RETIRADO,
    });
    setLoadingId(ordine.id);
    setOrdenes(prev => prev.map(o => o.id === ordine.id ? { ...o, estado: ORDER_STATES.RETIRADO, hora_entrega: Date.now() } : o));
    try {
      await api.marcarEntregado(ordine.id, true, ordine, "manual");
      // La chiusura del giro + ETA rientro sono ora un side-effect BACKEND del
      // RETIRADO (d569163): il backend rileva l'ultima consegna del giro
      // server-side. Niente decisione last-of-giro né chiudiGiro lato frontend.
      if (notify) notify("✓ Entregado (operador)", "#22C55E");
    } catch(e) {
      logRollback({
        component: "TabEntregas",
        action: "handleForzaEntregado.rollback",
        orderId: ordine.id,
        from: ORDER_STATES.RETIRADO,
        to: ORDER_STATES.EN_ENTREGA,
        metadata: { reason: "api.marcarEntregado failed" },
      });
      setOrdenes(prev => prev.map(o => o.id === ordine.id ? { ...o, estado: ORDER_STATES.EN_ENTREGA } : o));
      if (notify) notify("❌ Error al marcar entregado", "#E8341C");
    }
    setLoadingId(null);
  };

  // Riepilogo "esta noche": esclude gli ordini attualmente nella sezione "Rider volviendo".
  const totalNoche = consegnatiCollapsed.reduce((sum, o) => {
    if (Number(o.totale) > 0) return sum + Number(o.totale);
    const its = (Array.isArray(o.items) ? o.items : []).filter(i => i.n !== "Entrega a domicilio");
    return sum + calcTotale(its, o.tipo_consegna || "DOMICILIO");
  }, 0);

  // ── Sezione "Rider volviendo": banner globale + card del giro in ritorno ──
  // Renderizzata sia nel ramo vuoto (giro chiuso → nessuna entrega attiva) sia
  // in quello principale, così l'operatore la vede sempre durante il ritorno.
  const RiderReturnSection = riderSectionVisible ? (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        background: "rgba(249,115,22,0.10)",
        border: "1.5px solid rgba(249,115,22,0.45)",
        borderRadius: 12, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>🛵</span>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 170 }}>
          <span style={{ color: "#fdba74", fontWeight: 900, fontSize: 13.5 }}>
            {!driverReturning
              ? "Rider en reparto"
              : (riderReturnBeforeEta ? "Rider volviendo a pizzería" : "Rider debería estar llegando a pizzería")}
          </span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11.5, fontWeight: 600 }}>
            {!driverReturning
              ? "En reparto · sin hora estimada todavía"
              : (riderReturnBeforeEta
                  ? `Regreso estimado en ~${riderReturnQuedanMin} min${riderReturnEtaHHMM ? ` · Hora estimada ${riderReturnEtaHHMM}` : ""}`
                  : `Estimado cumplido hace ~${riderReturnElapsedMin} min${riderReturnEtaHHMM ? ` · Hora estimada ${riderReturnEtaHHMM}` : ""}`)}
          </span>
        </div>
      </div>
      {returningOrders.length > 0 && (
        <div style={{
          marginTop: 8,
          border: "1px solid rgba(249,115,22,0.28)",
          borderRadius: 10, overflow: "hidden"
        }}>
          <div style={{
            background: "rgba(249,115,22,0.08)",
            padding: "6px 12px", fontSize: 11.5, fontWeight: 800, color: "#fdba74"
          }}>
            🛵 Rider volviendo a pizzería · {returningOrders.length} {returningOrders.length === 1 ? "pedido" : "pedidos"}
          </div>
          <div style={{ padding: "4px 12px" }}>
            {returningOrders.map((o, i) => {
              const its = (Array.isArray(o.items) ? o.items : []).filter(it => it.n !== "Entrega a domicilio");
              const totNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(its, o.tipo_consegna || "DOMICILIO");
              return (
                <div key={o.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", gap: 8,
                  borderBottom: i < returningOrders.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                  fontSize: 13, color: "rgba(255,255,255,0.82)"
                }}>
                  <span style={{ fontWeight: 700 }}>
                    {o.id} · {o.nombre}{o.zona ? ` · ${o.zona}` : ""}
                  </span>
                  <span style={{ color: "#4ade80", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>
                    {totNum.toFixed(2)}€
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ) : null;

  const ResumenEntregados = consegnatiCollapsed.length > 0 ? (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => setApertoConsegnati(v => !v)} style={{
        width: "100%", background: "#16A34A", border: "none",
        borderRadius: apertoConsegnati ? "12px 12px 0 0" : 12,
        padding: "14px 16px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>
          ✓ Entregados esta noche · {consegnatiCollapsed.length}
        </span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 900, fontSize: 14, fontFamily: "'DM Mono',monospace" }}>
          {totalNoche.toFixed(2)}€ {apertoConsegnati ? "▲" : "▼"}
        </span>
      </button>
      {apertoConsegnati && (
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0 0 12px 12px", padding: "8px 14px" }}>
          {consegnatiCollapsed.map((o, i) => {
            const its = (Array.isArray(o.items) ? o.items : []).filter(it => it.n !== "Entrega a domicilio");
            const totNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(its, o.tipo_consegna || "DOMICILIO");
            const tot = totNum.toFixed(2);
            return (
              <div key={o.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < consegnatiCollapsed.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                fontSize: 14, color: "rgba(255,255,255,0.8)"
              }}>
                <span style={{ fontWeight: 700 }}>{o.id} · {o.nombre}</span>
                <span style={{ color: "#4ade80", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{tot}€</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  if (entregas.length === 0) return (
    <div>
      {RiderReturnSection}
      <div style={{ textAlign: "center", padding: "60px 24px", color: "rgba(255,255,255,0.2)" }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: .35 }}>🛵</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Sin entregas a domicilio</div>
        <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
          Los pedidos con entrega aparecerán aquí.<br />
          Crea un pedido → elige <strong style={{ color: ORANGE }}>🛵 Entrega</strong>
        </div>
      </div>
      {ResumenEntregados}
    </div>
  );

  return (
    <div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}`}</style>

      {RiderReturnSection}

      {/* Giro manual persistente (P1C.1): selezione locale, mutazioni via api.createManualGiro. */}
      {selectedManualGiroOrderIds.length > 0 && (
        <div style={{
          marginBottom: 12,
          background: "rgba(251,191,36,0.08)",
          border: "1.5px solid rgba(251,191,36,0.34)",
          borderRadius: 12,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap"
        }}>
          <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: 13 }}>
            Giro manual · {selectedManualGiroOrderIds.length} seleccionados
          </span>
          {selectedManualGiroWarnings.map(w => (
            <span key={w.key} style={warningStyle(w.level)}>{w.label}</span>
          ))}
          <span style={{ flex: 1 }} />
          {(() => {
            const enabled = selectedManualGiroOrderIds.length >= 2 && !pendingManualGiroAction;
            return (
              <button
                type="button"
                disabled={!enabled}
                onClick={openGiroModal}
                style={{
                  background: enabled ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${enabled ? "rgba(251,191,36,0.60)" : "rgba(255,255,255,0.10)"}`,
                  color: enabled ? "#fde68a" : "rgba(255,255,255,0.30)",
                  borderRadius: 9, padding: "7px 12px",
                  fontSize: 12, fontWeight: 900,
                  cursor: enabled ? "pointer" : "not-allowed"
                }}
              >
                {pendingManualGiroAction ? "..." : "Crear giro manual"}
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => setSelectedManualGiroOrderIds([])}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.55)",
              borderRadius: 9, padding: "7px 10px",
              fontSize: 12, fontWeight: 800, cursor: "pointer"
            }}
          >
            Cancelar selección
          </button>
        </div>
      )}

      {/* Hint scopribilità giro manuale: visibile solo quando esistono ordini selezionabili
          e nessuna selezione è ancora attiva. Quando l'operatore inizia a selezionare,
          la action bar in alto sostituisce questo hint. */}
      {selectedManualGiroOrderIds.length === 0 && entregas.some(isManualGiroSelectableOrder) && (
        <div style={{
          marginBottom: 12,
          padding: "8px 12px",
          background: "rgba(251,191,36,0.05)",
          border: "1px dashed rgba(251,191,36,0.28)",
          borderRadius: 10,
          fontSize: 11.5,
          color: "rgba(253,230,138,0.78)",
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap"
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 6,
            border: "1.5px solid rgba(251,191,36,0.55)",
            background: "rgba(251,191,36,0.08)",
            color: "#fde68a", fontSize: 11, fontWeight: 900, lineHeight: 1, flexShrink: 0
          }}>+</span>
          <span>
            Giro manual: pulsa el <strong style={{ color: "#fde68a" }}>+</strong> en 2+ pedidos para agruparlos
          </span>
        </div>
      )}

      {/* Riepilogo rapido */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total", n: entregas.length, color: "rgba(255,255,255,0.4)" },
          ...ZONE_DELIVERY.filter(z => perZonaCount[z.id] > 0).map(z => ({
            label: `${z.id} ${z.nomeBreve || z.nome}`, n: perZonaCount[z.id], color: z.colore
          })),
          ...(senzaZona.length > 0 ? [{ label: "Sin zona", n: senzaZona.length, color: "#fbbf24" }] : [])
        ].map(({ label, n, color }) => (
          <div key={label} style={{
            background: `${color}15`, border: `1px solid ${color}40`,
            borderRadius: 10, padding: "5px 12px",
            fontSize: 12, color, fontWeight: 700
          }}>
            <span style={{ fontSize: 15, fontWeight: 900 }}>{n}</span>
            <span style={{ opacity: .8, marginLeft: 5 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Blocchi per giro — manuali (cross-zona/orario) + automatici, ordinati cronologicamente */}
      {allBlocks.map((block) => {
        if (block.type === "manual") {
          return (
            <ManualGiroBlock
              key={`mg|${block.id}`}
              giro={block.giro}
              ordini={block.ordini}
              zones={block.zones}
              hora={block.hora}
              warnings={block.warnings}
              onSendRepartidor={handleSendRepartidor}
              loadingId={loadingId}
              driverStato={driverStato}
              onForzaSalida={handleForzaSalida}
              onForzaEntregado={handleForzaEntregado}
              manualGiroByOrderId={manualGiroByOrderId}
              manualGiroWarningsById={manualGiroWarningsById}
              selectedManualGiroOrderIds={selectedManualGiroOrderIds}
              onToggleManualGiro={toggleManualGiroSelection}
              onRemoveFromManualGiro={removeFromManualGiro}
              onDissolveManualGiro={dissolveManualGiro}
              giroOptions={giroOptions} onMoveToGiro={moveToGiro}
            />
          );
        }
        const zona = ZONE_DELIVERY.find(z => z.id === block.zonaId);
        if (!zona) return null;
        return (
          <ZonaBlock
            key={`${block.zonaId}|${block.hora}`}
            zona={zona}
            ordini={block.ordini}
            giroHora={block.hora}
            onSendRepartidor={handleSendRepartidor}
            loadingId={loadingId}
            driverStato={driverStato}
            onForzaSalida={handleForzaSalida}
            onForzaEntregado={handleForzaEntregado}
            manualGiroByOrderId={manualGiroByOrderId}
            manualGiroWarningsById={manualGiroWarningsById}
            selectedManualGiroOrderIds={selectedManualGiroOrderIds}
            onToggleManualGiro={toggleManualGiroSelection}
            onRemoveFromManualGiro={removeFromManualGiro}
            onDissolveManualGiro={dissolveManualGiro}
              giroOptions={giroOptions} onMoveToGiro={moveToGiro}
          />
        );
      })}

      {/* Ordini senza zona assegnata */}
      {senzaZona.length > 0 && (
        <div style={{
          border: "1.5px solid rgba(251,191,36,0.3)",
          borderRadius: 12, overflow: "hidden", marginBottom: 14
        }}>
          <div style={{
            background: "rgba(251,191,36,0.08)",
            borderBottom: "1px solid rgba(251,191,36,0.2)",
            padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{ color: "#fbbf24", fontWeight: 800, fontSize: 13, flex: 1 }}>
              ⚠️ Sin zona asignada · {senzaZona.length}
            </span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
              Asigna zona en el pedido
            </span>
          </div>
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {senzaZona.map(o => (
              <ZonaOrderRow key={o.id} o={o}
                onSendRepartidor={handleSendRepartidor} loadingId={loadingId}
                driverStato={driverStato} onForzaSalida={handleForzaSalida} onForzaEntregado={handleForzaEntregado}
                manualGiro={manualGiroByOrderId[o.id] || null}
                manualGiroWarnings={manualGiroWarningsById[o.id] || []}
                isManualGiroSelected={selectedManualGiroOrderIds.includes(o.id)}
                onToggleManualGiro={toggleManualGiroSelection}
                onRemoveFromManualGiro={removeFromManualGiro}
                onDissolveManualGiro={dissolveManualGiro}
              giroOptions={giroOptions} onMoveToGiro={moveToGiro} />
            ))}
          </div>
        </div>
      )}

      {ResumenEntregados}

      {giroReview && (
        <GiroReviewModal
          review={giroReview}
          orders={giroReview.orderIds.map(id => ordersById[id]).filter(Boolean)}
          pending={pendingManualGiroAction}
          onConfirm={confirmGiroReview}
          onCancel={() => setGiroReview(null)}
        />
      )}
    </div>
  );
};

export default TabEntregas;
