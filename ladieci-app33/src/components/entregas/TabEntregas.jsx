import { useState, useEffect } from 'react';
import { calcTotale } from '../../constants';
import { api } from '../../api';
import { sb } from '../../api';
import { ZONE_DELIVERY, zonaBadgeStyle, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import { ORDER_STATES, buildEnEntregaTransition, isDriverOnTheWayState, isWaitingDriverState, logLegacyBypass, logRollback, logTransition } from '../../core/orders';

// Helpers tempi: hora consegna ↔ horaForno (= partenza driver = uscita pizza forno)
const _tm = (t) => { if (!t) return null; const [h,m] = t.split(":").map(Number); return h*60+m; };
const _th = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
// Sorgente unica: o.forno_out (backend cascade-aware). Fallback legacy per ordini pre-migration.
// Applica ui_offset_min (snooze visivo per-card DOMICILIO).
const calcHoraForno = (o, zona) => {
  const base = o.forno_out
    || (() => {
        const m = _tm(o.hora);
        if (m == null || !zona) return null;
        return _th(Math.max(0, m - tempoAndata(o, zona)));
      })();
  // TabEntregas è solo delivery → applichiamo sempre l'offset
  return applyUiOffset(base, o.ui_offset_min);
};

// Orario di salida (forno_out) di un singolo ordine come stringa HH:MM.
// Sorgente: o.forno_out (backend cascade-aware) con fallback legacy; include ui_offset.
const ordSalida = (o) => calcHoraForno(o, ZONE_DELIVERY.find(z => z.id === o?.zona));

// Orario operativo unico del giro manuale (guida cucina/driver).
// Priorità: hora_ref scelto dall'operatore → altrimenti la prima salida
// (min forno_out) tra i membri → altrimenti la prima hora cliente.
const giroOperationalHora = (giroMeta, ordini) => {
  if (giroMeta?.hora_ref) return giroMeta.hora_ref;
  const sal = (ordini || []).map(ordSalida).filter(Boolean).map(_tm).filter(m => m != null);
  if (sal.length) return _th(Math.min(...sal));
  const hs = (ordini || []).map(o => _tm(o.hora)).filter(m => m != null);
  return hs.length ? _th(Math.min(...hs)) : null;
};

const ORANGE = "#F97316";

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
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro
}) => {
  const isLoading   = loadingId === o.id;
  const isListo     = o.estado === ORDER_STATES.LISTO;
  const isEnEntrega = o.estado === ORDER_STATES.EN_ENTREGA;
  const isCocina    = o.estado === ORDER_STATES.EN_COCINA;
  const selectableForManualGiro = isManualGiroSelectableOrder(o);

  // Override: salida no registrada (ordine EN_ENTREGA ma partito_alle nullo)
  const salidaMancante = isEnEntrega && !driverStato?.partito_alle;

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
            // Allineamento orari con Cocina.
            // Membro di giro manuale: orario operativo unico = hora_ref (come header
            // giro e Cocina), consegna comune = entrega_ref; l'ora cliente del singolo
            // resta come riferimento secondario piccolo.
            // Ordine singolo (no giro): comportamento invariato (forno_out + ora cliente).
            const isGiro = !!(manualGiro && manualGiro.id);
            if (!isGiro) {
              if (!(o.hora && zona)) return null;
              const hF = calcHoraForno(o, zona);
              return (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  {hF && (
                    <span style={{ color: "#C2410C", fontWeight: 700 }} title="Pizza fuera del horno">
                      ⏱ {hF}
                    </span>
                  )}
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }} title="Entrega al cliente">
                    🛵 {o.hora}
                  </span>
                </span>
              );
            }
            const hF = manualGiro.hora_ref || (zona ? calcHoraForno(o, zona) : null);
            const hEntrega = manualGiro.entrega_ref || o.hora;
            const showClienteRef = o.hora && o.hora !== hEntrega;
            if (!hF && !hEntrega) return null;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                {hF && (
                  <span style={{ color: "#C2410C", fontWeight: 700 }} title="Salida horno (giro)">
                    ⏱ {hF}
                  </span>
                )}
                {hEntrega && (
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }} title="Entrega del giro">
                    🛵 {hEntrega}
                  </span>
                )}
                {showClienteRef && (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }} title="Hora cliente (referencia)">
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

      {/* Override: marcar entregado manualmente */}
      {isEnEntrega && (
        <button disabled={isLoading} onClick={() => {
          if (!window.confirm("¿Confirmar entrega? Esta acción cerrará el pedido como entregado.")) return;
          onForzaEntregado && onForzaEntregado(o);
        }}
          style={{
            padding: "5px 10px",
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 8, color: "#22C55E", fontWeight: 700, fontSize: 11,
            cursor: "pointer", flexShrink: 0
          }}
          title="Marcar como entregado desde el panel del operador">
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
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro
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
            onDissolveManualGiro={onDissolveManualGiro} />
        ))}
      </div>
    </div>
  );
};

// ─── Blocco giro MANUALE (cross-zona / cross-orario) ──────────────────────
// Il manual_giro_id comanda sul clustering automatico: tutti i membri stanno
// in UN blocco anche se zone/orari diversi. Mostra orario operativo unico
// (hora_ref) + zone incluse + orari cliente individuali per card.
const ManualGiroBlock = ({
  giro, ordini, zones, hora, warnings = [],
  onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado,
  manualGiroByOrderId, manualGiroWarningsById, selectedManualGiroOrderIds,
  onToggleManualGiro, onRemoveFromManualGiro, onDissolveManualGiro
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
            onDissolveManualGiro={onDissolveManualGiro} />
        ))}
      </div>
    </div>
  );
};

// ─── Mini-modal: scelta orario operativo alla creazione del giro ──────────
const GiroTimeModal = ({ orders, warnings = [], pending, onConfirm, onCancel }) => {
  const salidas = orders.map(o => ({ o, salida: ordSalida(o) }));
  const validSal = salidas.filter(s => s.salida).map(s => ({ ...s, min: _tm(s.salida) }));
  const earliest = validSal.length
    ? validSal.reduce((a, b) => (a.min <= b.min ? a : b))
    : null;

  // entrega_ref = orario consegna/giro comune. Derivato per-modalità (vedi resolve()):
  // non c'è ancora un input dedicato — l'UX definitiva potrà separare due input
  // ("salida horno" operativo vs "entrega giro" consegna). Default sicuro: l'ora
  // cliente più tarda tra i membri (tutti consegnati entro quel limite).
  const maxMemberHora = () => {
    const latest = orders
      .map(o => o.hora).filter(Boolean)
      .map(h => ({ h, min: _tm(h) }))
      .filter(x => x.min != null)
      .reduce((a, b) => (a == null || b.min > a.min ? b : a), null);
    return latest ? latest.h : null;
  };

  // Opzioni: "lo antes posible" (default) + una per ordine + personalizzato.
  const [mode, setMode] = useState("earliest"); // earliest | order | custom
  const [orderId, setOrderId] = useState(earliest ? earliest.o.id : (orders[0] && orders[0].id));
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");

  const HHMM = /^(\d{1,2}):(\d{2})$/;
  const parseHHMM = (s) => {
    const m = String(s || "").trim().match(HHMM);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  };
  // Ritorna { hora_ref, anchor_order_id, entrega_ref } o { error }.
  const resolve = () => {
    if (mode === "custom") {
      // Il custom oggi è SOLO l'orario operativo (uscita forno). entrega_ref
      // cade sul default sicuro = max ora cliente dei membri. L'UX definitiva
      // potrà aggiungere un secondo input per separare salida horno / entrega giro.
      const v = parseHHMM(custom);
      if (!v) return { error: "Formato HH:MM no válido" };
      return { hora_ref: v, anchor_order_id: null, entrega_ref: maxMemberHora() };
    }
    if (mode === "order") {
      // "Salida pedido X": operativo = salida di X, entrega = ora cliente di X.
      const sel = salidas.find(s => s.o.id === orderId);
      if (!sel || !sel.salida) return { error: "Pedido sin hora de salida" };
      return { hora_ref: sel.salida, anchor_order_id: sel.o.id, entrega_ref: sel.o.hora || maxMemberHora() };
    }
    // earliest: operativo = prima salida; entrega = max ora cliente dei membri.
    if (!earliest) return { error: "Ningún pedido tiene hora de salida — usa personalizado" };
    return { hora_ref: earliest.salida, anchor_order_id: earliest.o.id, entrega_ref: maxMemberHora() };
  };

  const confirm = () => {
    const r = resolve();
    if (r.error) { setErr(r.error); return; }
    onConfirm(r.hora_ref, r.anchor_order_id, r.entrega_ref ?? null);
  };

  const radio = (val, checked, label, hint) => (
    <label style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
      borderRadius: 9, cursor: "pointer",
      background: checked ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${checked ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.08)"}`
    }}>
      <input type="radio" name="giro-hora" checked={checked} onChange={() => { setMode(val); setErr(""); }} />
      <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13, flex: 1 }}>{label}</span>
      {hint && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{hint}</span>}
    </label>
  );

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
        <div style={{ color: "#fde68a", fontWeight: 900, fontSize: 15, marginBottom: 4 }}>
          Crear giro manual · {orders.length} pedidos
        </div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginBottom: 12 }}>
          Elige el <strong style={{ color: "#fde68a" }}>orario operativo</strong> del giro (guía cocina/driver). Las horas de cada cliente se conservan.
        </div>

        {warnings.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {warnings.map(w => <span key={w.key} style={warningStyle(w.level)}>{w.label}</span>)}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {radio("earliest", mode === "earliest", "Lo antes posible (primera salida)", earliest ? earliest.salida : "—")}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }} />
          {salidas.map(s => (
            <label key={s.o.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
              borderRadius: 9, cursor: "pointer",
              background: (mode === "order" && orderId === s.o.id) ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${(mode === "order" && orderId === s.o.id) ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.08)"}`
            }}>
              <input type="radio" name="giro-hora" checked={mode === "order" && orderId === s.o.id}
                onChange={() => { setMode("order"); setOrderId(s.o.id); setErr(""); }} />
              <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13, flex: 1 }}>
                Salida pedido {s.o.id || s.o.nombre || "?"}
                <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 500 }}> · cliente {s.o.hora || "—"}</span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{s.salida || "sin hora"}</span>
            </label>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }} />
          <label style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
            borderRadius: 9, cursor: "pointer",
            background: mode === "custom" ? "rgba(251,191,36,0.14)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${mode === "custom" ? "rgba(251,191,36,0.55)" : "rgba(255,255,255,0.08)"}`
          }}>
            <input type="radio" name="giro-hora" checked={mode === "custom"} onChange={() => { setMode("custom"); setErr(""); }} />
            <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13, flex: 1 }}>Personalizado</span>
            <input
              type="text" inputMode="numeric" placeholder="HH:MM" value={custom}
              onChange={e => { setCustom(e.target.value); setMode("custom"); setErr(""); }}
              style={{
                width: 70, textAlign: "center", background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7,
                color: "#fff", padding: "5px 6px", fontFamily: "'DM Mono',monospace", fontSize: 13
              }} />
          </label>
        </div>

        {err && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.6)", borderRadius: 9, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer"
          }}>Cancelar</button>
          <button type="button" disabled={pending} onClick={confirm} style={{
            background: pending ? "rgba(255,255,255,0.05)" : "rgba(251,191,36,0.22)",
            border: `1px solid ${pending ? "rgba(255,255,255,0.1)" : "rgba(251,191,36,0.6)"}`,
            color: pending ? "rgba(255,255,255,0.3)" : "#fde68a",
            borderRadius: 9, padding: "8px 16px", fontSize: 12.5, fontWeight: 900,
            cursor: pending ? "not-allowed" : "pointer"
          }}>{pending ? "..." : "Crear giro"}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab principale Entregas ───────────────────────────────────────────────
const TabEntregas = ({ ordenes = [], notify, setOrdenes }) => {
  const [loadingId,    setLoadingId]    = useState(null);
  const [driverStato,  setDriverStato]  = useState(null);
  const [apertoConsegnati, setApertoConsegnati] = useState(false);
  // DELIVERY-MANUAL-GIRO-01 P1C.1: manualGiros è backend-derived (api.getManualGiros).
  // selectedManualGiroOrderIds resta locale (selezione UI, mai persistita).
  // pendingManualGiroAction disabilita i bottoni durante una mutation in volo.
  const [manualGiros, setManualGiros] = useState([]);
  const [selectedManualGiroOrderIds, setSelectedManualGiroOrderIds] = useState([]);
  const [pendingManualGiroAction, setPendingManualGiroAction] = useState(false);
  const [giroModalOpen, setGiroModalOpen] = useState(false);

  // Legge DRIVER_STATO da Supabase ogni 15s
  useEffect(() => {
    let mounted = true;
    const loadDriver = async () => {
      try {
        const rows = await sb.select("config", "chiave=eq.DRIVER_STATO");
        if (!mounted) return;
        if (rows && rows.length > 0) {
          const val = typeof rows[0].valore === "string"
            ? JSON.parse(rows[0].valore)
            : rows[0].valore;
          setDriverStato(val);
        }
      } catch(e) {}
    };
    loadDriver();
    const poll = setInterval(loadDriver, 15000);
    return () => { mounted = false; clearInterval(poll); };
  }, []);

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

  const toMin = (t) => { if (!t) return 9999; const [h,m] = t.split(":").map(Number); return h*60+m; };
  const toHora = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
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
  for (const giro of manualGiros) {
    if (!giro.dissolved_at) giroMetaById[giro.id] = giro;
  }
  const manualGiroByOrderId = {};
  for (const o of entregas) {
    const gid = o.manual_giro_id;
    if (!gid) continue;
    manualGiroByOrderId[o.id] = giroMetaById[gid] || { id: gid, seq: null, order_ids: [] };
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

  // Apre il mini-modal di scelta orario (non crea subito il giro).
  const openGiroModal = () => {
    if (pendingManualGiroAction) return;
    const orderIds = selectedManualGiroOrderIds.filter(id => activeManualGiroIds.has(id));
    if (orderIds.length < 2) return;
    setGiroModalOpen(true);
  };

  // Conferma dal modal: crea il giro con l'orario operativo scelto.
  const confirmManualGiro = async (horaRef, anchorOrderId, entregaRef) => {
    if (pendingManualGiroAction) return;
    const orderIds = selectedManualGiroOrderIds.filter(id => activeManualGiroIds.has(id));
    if (orderIds.length < 2) return;
    setPendingManualGiroAction(true);
    try {
      const res = await api.createManualGiro(orderIds, horaRef, anchorOrderId, entregaRef ?? null);
      if (res && res.ok) {
        if (notify) notify(`✓ Giro manual creado · ${formatGiroLabel(res.giro)}`, "#22C55E");
        setSelectedManualGiroOrderIds([]);
        setGiroModalOpen(false);
      } else {
        const code = res && res.error;
        const msg = code === "invalid_orders" ? "Pedidos no elegibles"
          : code === "some_orders_not_found" ? "Pedidos no encontrados"
          : code === "invalid_hora_ref" ? "Hora no válida"
          : code === "invalid_entrega_ref" ? "Hora de entrega no válida"
          : (code === "need_at_least_2_orders" || code === "need_at_least_2_distinct_orders") ? "Selecciona 2 pedidos"
          : "Error al crear giro";
        if (notify) notify("❌ " + msg, "#E8341C");
        console.warn("[manualGiros] createManualGiro failed:", res);
      }
    } catch (e) {
      console.warn("[manualGiros] createManualGiro threw:", e);
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

  // ── Step 2: clustering automatico solo per i NON-manuali ────────────────
  // Stessa zona + delta ≤ GIRO_WINDOW_MIN dal primo dell'ordine.
  // Esempio: Q1 17:10 + Q1 17:15 → stesso giro (delta 5). Q1 17:10 + Q1 17:22 → due giri (delta 12).
  const GIRO_WINDOW_MIN = 10;
  const senzaZona = [];
  const perZonaSorted = {};
  for (const o of nonManual) {
    if (!o.zona) { senzaZona.push(o); continue; }
    (perZonaSorted[o.zona] = perZonaSorted[o.zona] || []).push(o);
  }
  const autoGiri = [];
  for (const zonaId of Object.keys(perZonaSorted)) {
    const list = perZonaSorted[zonaId].sort((a, b) => toMin(a.hora) - toMin(b.hora));
    let current = null;
    let clusterStartMin = null;
    for (const o of list) {
      const m = toMin(o.hora);
      if (!current || m - clusterStartMin > GIRO_WINDOW_MIN) {
        current = { type: "auto", zonaId, hora: o.hora, ordini: [o] };
        clusterStartMin = m;
        autoGiri.push(current);
      } else {
        current.ordini.push(o);
        // hora del giro = ultima consegna (massimo nel cluster)
        if (m > toMin(current.hora)) current.hora = o.hora;
      }
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

  // Override operatore: registra salida manualmente (driver dimenticò Salgo)
  const handleForzaSalida = async (ordine) => {
    logLegacyBypass({
      component: "TabEntregas",
      action: "handleForzaSalida",
      orderId: ordine?.id,
      from: ordine?.estado,
      to: ordine?.estado,
      metadata: { reason: "registra uscita driver senza cambio stato ordine" },
    });
    setLoadingId(ordine?.id || null);
    const enEntrega = entregas.filter(o => o.estado === ORDER_STATES.EN_ENTREGA);
    const nOrdini = enEntrega.length || 1;
    try {
      await api.registrarSalidaDriver(ordine?.zona || null, nOrdini);
      const nuovoStato = { stato: "IN_GIRO", zona: ordine?.zona || null, partito_alle: new Date().toISOString(), n_ordini: nOrdini, rientro_stimato: null };
      setDriverStato(nuovoStato);
      if (notify) notify("⚠️ Salida registrada manualmente", "#fbbf24");
    } catch(e) { if (notify) notify("❌ Error al registrar salida", "#E8341C"); }
    setLoadingId(null);
  };

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
      // Controlla se era l'ultimo
      const rimanenti = entregas.filter(o => [ORDER_STATES.LISTO, ORDER_STATES.EN_ENTREGA].includes(o.estado) && o.id !== ordine.id);
      if (rimanenti.length === 0) await api.chiudiGiro();
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

  const totalNoche = consegnati.reduce((sum, o) => {
    if (Number(o.totale) > 0) return sum + Number(o.totale);
    const its = (Array.isArray(o.items) ? o.items : []).filter(i => i.n !== "Entrega a domicilio");
    return sum + calcTotale(its, o.tipo_consegna || "DOMICILIO");
  }, 0);

  const ResumenEntregados = consegnati.length > 0 ? (
    <div style={{ marginTop: 16 }}>
      <button onClick={() => setApertoConsegnati(v => !v)} style={{
        width: "100%", background: "#16A34A", border: "none",
        borderRadius: apertoConsegnati ? "12px 12px 0 0" : 12,
        padding: "14px 16px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>
          ✓ Entregados esta noche · {consegnati.length}
        </span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 900, fontSize: 14, fontFamily: "'DM Mono',monospace" }}>
          {totalNoche.toFixed(2)}€ {apertoConsegnati ? "▲" : "▼"}
        </span>
      </button>
      {apertoConsegnati && (
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "0 0 12px 12px", padding: "8px 14px" }}>
          {consegnati.map((o, i) => {
            const its = (Array.isArray(o.items) ? o.items : []).filter(it => it.n !== "Entrega a domicilio");
            const totNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(its, o.tipo_consegna || "DOMICILIO");
            const tot = totNum.toFixed(2);
            return (
              <div key={o.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < consegnati.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
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
                onDissolveManualGiro={dissolveManualGiro} />
            ))}
          </div>
        </div>
      )}

      {ResumenEntregados}

      {giroModalOpen && (
        <GiroTimeModal
          orders={selectedManualGiroOrders}
          warnings={selectedManualGiroWarnings}
          pending={pendingManualGiroAction}
          onConfirm={confirmManualGiro}
          onCancel={() => setGiroModalOpen(false)}
        />
      )}
    </div>
  );
};

export default TabEntregas;
