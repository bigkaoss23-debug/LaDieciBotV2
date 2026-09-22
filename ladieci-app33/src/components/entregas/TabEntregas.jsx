import { useState, useEffect, useRef } from 'react';
import { calcTotale } from '../../constants';
import { api } from '../../api';
import { ZONE_DELIVERY, zonaBadgeStyle, tempoAndata } from '../../zones';
import { ORDER_STATES, isDriverOnTheWayState, isWaitingDriverState, logRollback, logTransition } from '../../core/orders';
import { orderDeadlineMs, orderDeadlineHHMM, giroEarliestDeadlineMs, formatMadridHHMM } from '../cocina/manualGiroCocina';
import { filterFdv1Warnings } from './fdv1Warnings';
import { withTimeout, classifyGiroResult, giroErrorText, intentApplied } from './giroOutcome';

// Helpers tempi: hora consegna ↔ horaForno (= partenza driver = uscita pizza forno)
// [FDV1] A1: riferimento del blocco = límite (deadline) — giro: il più urgente dei membri; standalone: il suo.
const blockDeadlineHHMM = (giroMeta, ordini) => {
  if (giroMeta && Number.isFinite(giroMeta._earliestMs)) return formatMadridHHMM(giroMeta._earliestMs);
  const ms = (ordini || []).map(orderDeadlineMs).filter(Number.isFinite);
  return ms.length ? formatMadridHHMM(Math.min(...ms)) : ((ordini && ordini[0] && ordini[0].hora) || null);
};

// [FDV1] warning fattuali dal backend (giroWarnings) → testo operatore. Mai bloccanti.
const fdv1WarningLabel = (w) => {
  const ids = (w.member_ids || []).join(", ");
  const d = w.data || {};
  switch (w.code) {
    case "deadline_much_closer": return `En riesgo: ${ids} (vence ${d.delta_min} min antes que el resto)`;
    case "spread_over_window":   return `En riesgo: ${ids} (horas límite separadas ${d.spread_min} min)`;
    case "deadline_passed":      return `Ya tarde: ${ids}`;
    case "already_departed":     return `Ya en reparto: ${ids}`;
    case "zones_differ":         return `Zonas diferentes: ${(d.zones || []).join(", ")}`;
    case "capacity_exceeded":    return `Capacidad superada: ${d.used}/${d.max}`;
    case "no_zone":              return `Sin zona: ${ids}`;
    default:                     return String(w.code || "aviso");
  }
};

const ORANGE = "#F97316";
// [FDV1] nessuna telemetria rider (DRIVER_STATO) nel percorso operativo.

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

  // [FDV1] A2: nessun warning locale sulla distanza tra le `hora` cliente. Il warning canonico è quello del
  // backend (giroWarnings, sulle deadline), mostrato nella revisione con i soli ordini realmente a rischio.

  const states = new Set(list.map(o => o.estado));
  if (states.has(ORDER_STATES.EN_COCINA) && states.has(ORDER_STATES.EN_ENTREGA)) {
    add("state-gap", "Cocina + en camino", "strong");
  }

  return warnings;
};

// ─── Card ordine dentro un blocco zona ────────────────────────────────────
const ZonaOrderRow = ({
  o, zona, loadingId, onEntregado,
  manualGiro, manualGiroWarnings = [], isManualGiroSelected = false,
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro,
  giroOptions = [], onMoveToGiro, inGiroBlock = false
}) => {
  // [DELIVERY-REFACTOR 2026-09-22] picker pagamento inline, stesso pattern di
  // TabListos: niente modal nuovo. Aperto solo per gli ordini non ancora pagati.
  const [pendingPago, setPendingPago] = useState(false);
  const isLoading   = loadingId === o.id;
  const isListo     = o.estado === ORDER_STATES.LISTO;
  // Legacy in-flight: ordini già in EN_ENTREGA creati prima di questa release.
  // Restano finalizzabili, ma la UI non ne produce di nuovi.
  const isEnEntrega = o.estado === ORDER_STATES.EN_ENTREGA;
  const isCocina    = o.estado === ORDER_STATES.EN_COCINA;
  const finalizable = isListo || isEnEntrega;
  const yaPagado    = o.ya_pagado === true;
  const selectableForManualGiro = isManualGiroSelectableOrder(o);

  const safeItems = (() => {
    if (!o.items) return [];
    const arr = Array.isArray(o.items) ? o.items : (() => { try { return JSON.parse(o.items); } catch(e) { return []; } })();
    return (Array.isArray(arr) ? arr : []).filter(i => i.n !== "Entrega a domicilio");
  })();
  const nPizze = safeItems.reduce((s, i) => s + (parseInt(i.q) || 1), 0);
  // Sorgente di verità: o.totale (include delivery_fee). Fallback per record legacy.
  const totaleNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(safeItems, o.tipo_consegna || "DOMICILIO");
  const total = totaleNum.toFixed(2);


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
      {selectableForManualGiro && !manualGiro && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleManualGiro && onToggleManualGiro(o.id); }}
          aria-pressed={isManualGiroSelected}
          title={isManualGiroSelected ? "Quitar de la selección" : "Elegir para un giro nuevo"}
          style={{
            minWidth: 64, height: 30, padding: "0 8px", borderRadius: 7,
            border: `1.5px solid ${isManualGiroSelected ? "#fbbf24" : "rgba(251,191,36,0.55)"}`,
            background: isManualGiroSelected ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.08)",
            color: isManualGiroSelected ? "#fbbf24" : "#fde68a",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 900, lineHeight: 1, cursor: "pointer", flexShrink: 0
          }}
        >
          {isManualGiroSelected ? "✓ Elegido" : "Elegir"}
        </button>
      )}

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
            borderRadius: 7, fontSize: 12, fontWeight: 800, padding: "0 6px", height: 30, flexShrink: 0, cursor: "pointer"
          }}
        >
          <option value="">{manualGiro ? "Mover a…" : "Añadir a…"}</option>
          {giroOptions.filter(g => g.id !== (manualGiro && manualGiro.id)).map(g => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* Cliente + indirizzo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {inGiroBlock && (
            <span data-testid="entregas-zone" style={{ background: (zona && zona.colore) || "#6B7280", color: "#fff", borderRadius: 6,
              padding: "1px 7px", fontSize: 11, fontWeight: 900, border: zona ? "none" : "1.5px dashed #fff" }}>{(zona && zona.id) || "SIN ZONA"}</span>
          )}
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{o.nombre}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{o.id}</span>
          {manualGiroWarnings.map(w => (
            <span key={`${manualGiro?.id || o.id}-${w.key}`} style={warningStyle(w.level)}>
              {w.label}
            </span>
          ))}
          {(() => {
            // [FDV1] UN solo riferimento temporale: Límite (delivery_deadline_at) del pedido; "cliente" = hora
            // prometida solo se diversa. Nessun orario derivato dal ± (priorità) né dal rider.
            const deadlineCliente = orderDeadlineHHMM(o);
            if (!deadlineCliente) return null;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                <span style={{ color: "#FDBA74", fontWeight: 800 }} title="Hora límite de entrega: la más tardía entre creación + 55 min y la hora prometida al cliente">
                  Hora límite {deadlineCliente}
                </span>
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
        }} title="Se podrá entregar cuando esté listo">
          En cocina
        </span>
      )}

      {/* [FDV1] giro: separar este pedido (el resto del giro sigue). Botón de texto, lejos de las acciones de estado. */}
      {inGiroBlock && manualGiro && selectableForManualGiro && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onRemoveFromManualGiro && onRemoveFromManualGiro(manualGiro.id, o.id); }}
          title="Quitar este pedido del giro"
          style={{
            height: 30, padding: "0 10px", borderRadius: 8, flexShrink: 0, cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.25)",
            color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 800
          }}
        >Separar</button>
      )}

      {/* [DELIVERY-REFACTOR 2026-09-22] Fallback operatore: il driver segna la consegna
          dalla sua app, ma l'operatore deve poter chiudere l'ordine se non l'ha fatto.
          Stessa azione business del driver (LISTO → RETIRADO), actor diverso.
          Il pulsante "Enviar" (ex 🛵 → EN_ENTREGA) non esiste più: durante il viaggio
          l'ordine resta LISTO. */}
      {isEnEntrega && (
        <span style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.20)", color: "rgba(255,255,255,0.65)" }}
          title="Estado heredado de una versión anterior — se puede finalizar igualmente">Legacy</span>
      )}

      {finalizable && (
        pendingPago ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>¿Cómo paga?</span>
            {[
              { m: "efectivo", label: "💵", bg: "#16A34A" },
              { m: "tarjeta",  label: "💳", bg: "#2563EB" },
              { m: "bizum",    label: "📱", bg: "#0EA5E9" },
            ].map(({ m, label, bg }) => (
              <button key={m} type="button" disabled={isLoading}
                onClick={() => { setPendingPago(false); onEntregado && onEntregado(o, m); }}
                title={m}
                style={{
                  padding: "6px 9px", background: isLoading ? `${bg}55` : bg, border: "none",
                  borderRadius: 8, color: "#fff", fontWeight: 800, fontSize: 12,
                  cursor: isLoading ? "wait" : "pointer", flexShrink: 0
                }}>{label}</button>
            ))}
            <button type="button" onClick={() => setPendingPago(false)}
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
              cancelar
            </button>
          </div>
        ) : (
          <button disabled={isLoading}
            onClick={() => {
              // Già pagato → nessun secondo pagamento, solo conferma.
              if (yaPagado) {
                if (!window.confirm("¿Pedido entregado? Ya está pagado — pasa a RETIRADO.")) return;
                onEntregado && onEntregado(o, null);
                return;
              }
              setPendingPago(true);
            }}
            style={{
              padding: "6px 12px",
              background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: 8, color: "#22C55E", fontWeight: 700, fontSize: 12,
              cursor: isLoading ? "not-allowed" : "pointer", flexShrink: 0, whiteSpace: "nowrap"
            }}
            title="Marcar pedido entregado al cliente (RETIRADO) desde el panel del operador">
            {isLoading ? "..." : (yaPagado ? "✓ Entregado · pagado" : "✓ Entregado")}
          </button>
        )
      )}
    </div>
  );
};

// ─── Blocco giro (zona + ora consegna) ───────────────────────────────────
const ZonaBlock = ({
  zona, ordini, giroHora, loadingId, onEntregado,
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
            }} title="Hora límite de entrega">Hora límite {giroHora}</span>
          )}
          <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600, fontSize: 12 }}>
            {zona.nome}
          </span>
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
                : "Tiempo de ida en coche (zona)"}>
              ida ~{tg} min{isFallback ? "*" : ""}
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
            loadingId={loadingId} onEntregado={onEntregado}
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
  loadingId, onEntregado,
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
          Giro {giroLabel}
        </span>
        {hora && (
          <span style={{
            background: AMBER, color: "#1c1300",
            borderRadius: 8, padding: "2px 10px",
            fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 900
          }} title="Hora límite más urgente del giro">Hora límite {hora}</span>
        )}
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
          onClick={() => {
            if (!window.confirm(`¿Deshacer el giro ${giroLabel}? Los ${ordini.length} pedidos quedan separados.`)) return;
            onDissolveManualGiro && onDissolveManualGiro(giro.id);
          }}
          title="Deshacer giro"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "4px 10px",
            fontSize: 12, fontWeight: 800, cursor: "pointer", height: 30, marginLeft: 12
          }}
        >Deshacer giro</button>
      </div>

      {/* Ordini del giro — ognuno con la propria zona + orario cliente */}
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {ordini.map(o => (
          <ZonaOrderRow key={o.id} o={o} zona={ZONE_DELIVERY.find(z => z.id === o.zona)}
            loadingId={loadingId} onEntregado={onEntregado}
            manualGiro={manualGiroByOrderId[o.id] || null}
            manualGiroWarnings={manualGiroWarningsById[o.id] || []}
            isManualGiroSelected={selectedManualGiroOrderIds.includes(o.id)}
            onToggleManualGiro={onToggleManualGiro}
            onRemoveFromManualGiro={onRemoveFromManualGiro}
            onDissolveManualGiro={onDissolveManualGiro}
            giroOptions={giroOptions} onMoveToGiro={onMoveToGiro} inGiroBlock />
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
  const title = isCreate ? `Crear giro · ${orders.length} pedidos` : `${review.moving ? "Mover" : "Añadir"} ${review.orderIds.join(", ")} → ${review.giroLabel || "giro"}`;
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
          El giro usa la <strong style={{ color: "#fde68a" }}>hora límite más urgente</strong>. La hora límite de cada cliente no cambia.
        </div>
        {orders.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {orders.map(o => (
              <div key={o.id} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "#fff" }}>
                <span style={{ fontWeight: 800, minWidth: 44 }}>{o.id}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.7)" }}>{o.nombre}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", color: "rgba(255,255,255,0.6)" }}>{o.zona || "—"} · Hora límite {orderDeadlineHHMM(o) || "—"}</span>
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

const TabEntregas = ({ ordenes = [], notify, setOrdenes, suspended = false }) => {
  const [loadingId,    setLoadingId]    = useState(null);
  const [apertoConsegnati, setApertoConsegnati] = useState(false);
  // DELIVERY-MANUAL-GIRO-01 P1C.1: manualGiros è backend-derived (api.getManualGiros).
  // selectedManualGiroOrderIds resta locale (selezione UI, mai persistita).
  // pendingManualGiroAction disabilita i bottoni durante una mutation in volo.
  const [manualGiros, setManualGiros] = useState([]);
  // [FDV1] ultima lettura riuscita dei giri + ultimo tentativo: se le letture falliscono da >30 s lo si dice.
  const [girosReadState, setGirosReadState] = useState({ okAt: Date.now(), failing: false });
  const [selectedManualGiroOrderIds, setSelectedManualGiroOrderIds] = useState([]);
  const [pendingManualGiroAction, setPendingManualGiroAction] = useState(false);
  // [FDV1] revisione in corso: { kind: 'create'|'add', orderIds, giroId?, giroLabel?, moving?, warnings, warningsUnavailable? }
  const [giroReview, setGiroReview] = useState(null);
  // [FDV1] Rider return: nessuna telemetria rider (nessun banner, nessuna ETA).
  // [FDV1] il rider non è una variabile del Planner: nessuna lettura di DRIVER_STATO →
  // nessun banner di rientro, nessuna registrazione della partenza. Il flusso di stato EN_ENTREGA → RETIRADO resta invariato.

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

  // [FDV1] nessuna telemetria rider: nessun banner di rientro, nessuna ETA.
  const consegnatiCollapsed = consegnati;

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
        if (Array.isArray(res)) { setManualGiros(res); setGirosReadState({ okAt: Date.now(), failing: false }); }
        else { setGirosReadState(prev => ({ ...prev, failing: true })); if (res && res.error) console.warn("[manualGiros] fetch error:", res.error); }
      } catch (e) {
        if (mounted) setGirosReadState(prev => ({ ...prev, failing: true }));
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

  // [FDV1] La revisione esiste solo in Entregas: se la Pizzeria (overlay) si apre, si chiude e le risposte tardive
  // (giroWarnings) vengono scartate (token). Nessuna mutazione parte mentre Entregas è coperta.
  const reviewToken = useRef(0);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  useEffect(() => { if (suspended) { reviewToken.current += 1; setGiroReview(null); } }, [suspended]);

  const giroName = (giroId) => formatGiroLabel(giroMetaById[giroId] || { id: giroId });
  const toastOk = (msg) => notify && notify(msg, "#22C55E");
  const toastErr = (msg) => notify && notify(msg, "#E8341C");
  const toastWait = (msg) => notify && notify(msg, "#fbbf24");

  // Esecuzione unica di una mutazione giro: ok / errore certo / esito incerto (verifica rileggendo gli ordini).
  const runGiroMutation = async (intent, call, okText) => {
    const res = await withTimeout(call());
    const kind = classifyGiroResult(res);
    if (kind === "ok") { toastOk(okText(res)); return true; }
    if (kind === "failed") { toastErr(giroErrorText(res && res.error)); console.warn("[giro] failed:", res); return false; }
    toastWait("Sin confirmar — comprobando…");
    console.warn("[giro] outcome uncertain:", res);
    let fresh = null;
    try { const r = await api.getOrdenes(); fresh = r && Array.isArray(r.ordenes) ? r.ordenes : null; } catch (_) { fresh = null; }
    if (!fresh) { toastErr("Sin confirmar — recarga la página"); return false; }
    const applied = intentApplied(intent, fresh);
    if (setOrdenes) {
      const g = new Map(fresh.map(o => [o.id, o]));
      setOrdenes(prev => prev.map(o => (g.has(o.id) ? { ...o, manual_giro_id: g.get(o.id).manual_giro_id, ui_offset_min: g.get(o.id).ui_offset_min } : o)));
    }
    if (applied) { toastOk(okText({ giro: typeof applied === "string" ? { id: applied } : null })); return true; }
    toastErr("No se guardó — reintenta");
    return false;
  };

  // [FDV1] Apre la revisione (warning fattuali dal backend) prima di creare il giro. Nessun orario da scegliere.
  const openGiroModal = async () => {
    if (pendingManualGiroAction || suspendedRef.current) return;
    const orderIds = selectedManualGiroOrderIds.filter(id => activeManualGiroIds.has(id));
    if (orderIds.length < 2) return;
    const token = ++reviewToken.current;
    setPendingManualGiroAction(true);
    let res = null;
    try { res = await withTimeout(api.giroWarnings({ order_ids: orderIds }), 8000); } catch (_) { res = null; }
    setPendingManualGiroAction(false);
    if (token !== reviewToken.current || suspendedRef.current) return;
    const members = ordenes.filter(o => orderIds.includes(o.id));
    setGiroReview({ kind: "create", orderIds, warnings: filterFdv1Warnings((res && res.ok && res.warnings) || [], members), warningsUnavailable: !(res && res.ok) });
  };

  // [FDV1] ADD / MOVE: standalone → giro, oppure G1 → G2 ("move silent" atomico lato DB).
  const moveToGiro = async (orderId, giroId) => {
    if (pendingManualGiroAction || suspendedRef.current) return;
    const token = ++reviewToken.current;
    setPendingManualGiroAction(true);
    let res = null;
    try { res = await withTimeout(api.giroWarnings({ giro_id: giroId, order_ids: [orderId] }), 8000); } catch (_) { res = null; }
    setPendingManualGiroAction(false);
    if (token !== reviewToken.current || suspendedRef.current) return;
    const cur = ordenes.find(o => o.id === orderId);
    setGiroReview({
      kind: "add", orderIds: [orderId], giroId,
      giroLabel: giroName(giroId),
      moving: !!(cur && cur.manual_giro_id),
      warnings: filterFdv1Warnings((res && res.ok && res.warnings) || [],
        ordenes.filter(o => o.id === orderId || (o.manual_giro_id === giroId && o.id !== orderId))),
      warningsUnavailable: !(res && res.ok),
    });
  };

  // Conferma dalla revisione (= override se ci sono warning).
  const confirmGiroReview = async () => {
    if (pendingManualGiroAction || !giroReview || suspendedRef.current) return;
    const rv = giroReview;
    setPendingManualGiroAction(true);
    try {
      let ok;
      if (rv.kind === "create") {
        const ids = rv.orderIds.filter(id => activeManualGiroIds.has(id));
        ok = await runGiroMutation({ kind: "create", orderIds: ids }, () => api.createManualGiro(ids),
          (res) => `Giro ${res && res.giro ? formatGiroLabel(res.giro) : ""} creado`.replace("  ", " "));
        if (ok) setSelectedManualGiroOrderIds([]);
      } else {
        ok = await runGiroMutation({ kind: "add", orderId: rv.orderIds[0], giroId: rv.giroId },
          () => api.addOrderToManualGiro(rv.giroId, rv.orderIds[0]),
          () => (rv.moving ? `${rv.orderIds[0]} movido a ${rv.giroLabel}` : `${rv.orderIds[0]} añadido a ${rv.giroLabel}`));
      }
      if (ok) setGiroReview(null);
    } finally {
      await refetchManualGiros();
      setPendingManualGiroAction(false);
    }
  };

  // giroId ricevuto per compatibilità chiamante; backend usa solo orderId.
  const removeFromManualGiro = async (_giroId, orderId) => {
    if (pendingManualGiroAction || suspendedRef.current) return;
    setPendingManualGiroAction(true);
    try {
      await runGiroMutation({ kind: "remove", orderId }, () => api.removeOrderFromManualGiro(orderId),
        (res) => (res && res.auto_dissolved ? `${orderId} separado · giro deshecho (quedaba 1 pedido)` : `${orderId} separado`));
    } finally {
      await refetchManualGiros();
      setPendingManualGiroAction(false);
    }
  };

  const dissolveManualGiro = async (giroId) => {
    if (pendingManualGiroAction || suspendedRef.current) return;
    const label = giroName(giroId);
    setPendingManualGiroAction(true);
    try {
      await runGiroMutation({ kind: "dissolve", giroId }, () => api.dissolveManualGiro(giroId), () => `Giro ${label} deshecho`);
    } finally {
      await refetchManualGiros();
      setPendingManualGiroAction(false);
    }
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
    const ordini = manualMembersByGiro[gid].slice().sort((a, b) => (orderDeadlineMs(a) ?? 0) - (orderDeadlineMs(b) ?? 0));
    const giroMeta = giroMetaById[gid] || manualGiroByOrderId[ordini[0].id] || { id: gid, seq: null };
    const zones = Array.from(new Set(ordini.map(o => o.zona).filter(Boolean)));
    const hora = blockDeadlineHHMM(giroMeta, ordini);
    const warnings = manualGiroWarningsById[ordini[0].id] || buildManualGiroWarnings(ordini);
    const dlMs = Math.min(...ordini.map(orderDeadlineMs).filter(Number.isFinite));
    return { type: "manual", id: gid, giro: giroMeta, ordini, zones, hora, dlMs: Number.isFinite(dlMs) ? dlMs : null, warnings };
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
    for (const o of perZonaSorted[zonaId].sort((a, b) => (orderDeadlineMs(a) ?? 0) - (orderDeadlineMs(b) ?? 0))) {
      autoGiri.push({ type: "auto", zonaId, hora: orderDeadlineHHMM(o) || o.hora, dlMs: orderDeadlineMs(o), ordini: [o] });
    }
  }

  // ── Step 3: merge blocchi (manuali + automatici) ordinati per orario ────
  // [FDV1] A1: ordine per límite (ms esatto; a parità di minuto nessun salto), poi id stabile.
  const blockDlMs = (b) => (Number.isFinite(b.dlMs) ? b.dlMs : toMin(b.hora) * 60000);
  const allBlocks = [...manualGiroBlocks, ...autoGiri]
    .sort((a, b) => (toMin(a.hora) - toMin(b.hora)) || (blockDlMs(a) - blockDlMs(b)) || String(a.id || a.ordini[0].id).localeCompare(String(b.id || b.ordini[0].id)));

  // Conteggio per zona (per riepilogo rapido) — include membri dei giri manuali.
  const perZonaCount = {};
  for (const o of entregas) {
    if (o.zona) perZonaCount[o.zona] = (perZonaCount[o.zona] || 0) + 1;
  }

  // [DELIVERY-REFACTOR 2026-09-22] handleSendRepartidor RIMOSSO col bottone "Enviar".
  // Era l'ultimo writer di EN_ENTREGA della dashboard. Durante il viaggio l'ordine
  // resta LISTO: il rider non è una variabile dell'ordine.

  // Fallback operatore: il driver segna la consegna dalla sua app; se non l'ha fatto,
  // la chiude l'operatore. STESSA azione business (→ RETIRADO), actor diverso — non è
  // più un "legacy bypass". Il metodo di pagamento lo sceglie l'operatore nel picker
  // inline; per un ordine già pagato `metodo` arriva null e il backend preserva il
  // metodo canonico. Se il pagamento manca o non è valido il backend RIFIUTA: qui
  // rimettiamo lo stato com'era e lo diciamo all'operatore.
  const handleEntregado = async (ordine, metodo) => {
    const estadoOriginale = ordine?.estado;
    logTransition({
      component: "TabEntregas",
      action: "handleEntregado",
      orderId: ordine.id,
      from: estadoOriginale,
      to: ORDER_STATES.RETIRADO,
      metadata: { actor: "operator", metodo_pago: metodo || "(ya_pagado)" },
    });
    setLoadingId(ordine.id);
    setOrdenes(prev => prev.map(o => o.id === ordine.id ? { ...o, estado: ORDER_STATES.RETIRADO, hora_entrega: Date.now() } : o));
    const rollback = (reason, msg) => {
      logRollback({
        component: "TabEntregas",
        action: "handleEntregado.rollback",
        orderId: ordine.id,
        from: ORDER_STATES.RETIRADO,
        to: estadoOriginale,
        metadata: { reason },
      });
      setOrdenes(prev => prev.map(o => o.id === ordine.id ? { ...o, estado: estadoOriginale } : o));
      if (notify) notify(msg, "#E8341C");
    };
    try {
      const res = await api.marcarEntregado(ordine.id, {
        metodo_pago: metodo || undefined,
        actor: "operator",
        origin: "entregas",
      });
      if (res && res.success === false) {
        rollback(
          res.error || "backend_refused",
          res.error === "payment_method_required"
            ? "❌ Falta el método de pago"
            : "❌ No se pudo marcar entregado"
        );
        return;
      }
      if (notify) notify(metodo ? "✓ Entregado (operador)" : "✓ Entregado — ya pagado", "#22C55E");
    } catch(e) {
      rollback("api.marcarEntregado failed", "❌ Error al marcar entregado");
    } finally {
      setLoadingId(null);
    }
  };

  // Riepilogo "esta noche" dei pedidos entregados.
  const totalNoche = consegnatiCollapsed.reduce((sum, o) => {
    if (Number(o.totale) > 0) return sum + Number(o.totale);
    const its = (Array.isArray(o.items) ? o.items : []).filter(i => i.n !== "Entrega a domicilio");
    return sum + calcTotale(its, o.tipo_consegna || "DOMICILIO");
  }, 0);

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


      {girosReadState.failing && Date.now() - girosReadState.okAt > 30000 && (
        <div role="status" style={{ marginBottom: 10, padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.45)", color: "#fbbf24" }}>
          Giros sin actualizar — comprobando conexión…
        </div>
      )}

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
                {pendingManualGiroAction ? "..." : `Crear giro con ${selectedManualGiroOrderIds.length}`}
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
            Para un giro nuevo: pulsa <strong style={{ color: "#fde68a" }}>Elegir</strong> en 2 o más pedidos
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
              loadingId={loadingId}
              onEntregado={handleEntregado}
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
            key={`${block.zonaId}|${block.ordini[0].id}`}
            zona={zona}
            ordini={block.ordini}
            giroHora={block.hora}
            loadingId={loadingId}
            onEntregado={handleEntregado}
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
                loadingId={loadingId} onEntregado={handleEntregado}
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
