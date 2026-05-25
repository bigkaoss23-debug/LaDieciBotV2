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
            }} title="Grupo local, no guardado">
              giro manual · {manualGiro.id}
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
          {o.hora && zona && (() => {
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

// ─── Tab principale Entregas ───────────────────────────────────────────────
const TabEntregas = ({ ordenes = [], notify, setOrdenes }) => {
  const [loadingId,    setLoadingId]    = useState(null);
  const [driverStato,  setDriverStato]  = useState(null);
  const [apertoConsegnati, setApertoConsegnati] = useState(false);
  const [manualGiros, setManualGiros] = useState([]);
  const [selectedManualGiroOrderIds, setSelectedManualGiroOrderIds] = useState([]);
  const [manualGiroSeq, setManualGiroSeq] = useState(1);

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

  useEffect(() => {
    const activeIds = new Set(
      ordenes.filter(isManualGiroSelectableOrder).map(o => o.id)
    );
    setManualGiros(prev => prev
      .map(g => ({ ...g, orderIds: g.orderIds.filter(id => activeIds.has(id)) }))
      .filter(g => g.orderIds.length >= 2)
    );
    setSelectedManualGiroOrderIds(prev => prev.filter(id => activeIds.has(id)));
  }, [ordenes]);

  const ordersById = {};
  for (const o of entregas) ordersById[o.id] = o;

  const manualGiroByOrderId = {};
  for (const giro of manualGiros) {
    for (const id of giro.orderIds) {
      if (activeManualGiroIds.has(id)) manualGiroByOrderId[id] = giro;
    }
  }

  const manualGiroWarningsById = {};
  for (const giro of manualGiros) {
    const giroOrders = giro.orderIds.map(id => ordersById[id]).filter(Boolean);
    const warnings = buildManualGiroWarnings(giroOrders);
    for (const id of giro.orderIds) manualGiroWarningsById[id] = warnings;
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

  const createManualGiro = () => {
    const orderIds = selectedManualGiroOrderIds.filter(id => activeManualGiroIds.has(id));
    if (orderIds.length < 2) return;
    const giroId = `G${manualGiroSeq}`;
    const selectedSet = new Set(orderIds);
    setManualGiroSeq(n => n + 1);
    setManualGiros(prev => [
      ...prev
        .map(g => ({ ...g, orderIds: g.orderIds.filter(id => !selectedSet.has(id)) }))
        .filter(g => g.orderIds.length >= 2),
      { id: giroId, orderIds, createdAt: Date.now(), volatile: true }
    ]);
    setSelectedManualGiroOrderIds([]);
  };

  const removeFromManualGiro = (giroId, orderId) => {
    setManualGiros(prev => prev
      .map(g => g.id === giroId ? { ...g, orderIds: g.orderIds.filter(id => id !== orderId) } : g)
      .filter(g => g.orderIds.length >= 2)
    );
  };

  const dissolveManualGiro = (giroId) => {
    setManualGiros(prev => prev.filter(g => g.id !== giroId));
  };

  // Raggruppamento cluster-based per giro: stessa zona + delta ≤ GIRO_WINDOW_MIN dal primo dell'ordine.
  // Esempio: Q1 17:10 + Q1 17:15 → stesso giro (delta 5). Q1 17:10 + Q1 17:22 → due giri (delta 12).
  // Risolve il problema dello slot10-ceiling che spaccava ordini vicini ai bordi (17:10 vs 17:15 → slot 17:10 vs 17:20).
  const GIRO_WINDOW_MIN = 10;
  const senzaZona = [];
  const perZonaSorted = {};
  for (const o of entregas) {
    if (!o.zona) { senzaZona.push(o); continue; }
    (perZonaSorted[o.zona] = perZonaSorted[o.zona] || []).push(o);
  }
  const giriList = [];
  for (const zonaId of Object.keys(perZonaSorted)) {
    const list = perZonaSorted[zonaId].sort((a, b) => toMin(a.hora) - toMin(b.hora));
    let current = null;
    let clusterStartMin = null;
    for (const o of list) {
      const m = toMin(o.hora);
      if (!current || m - clusterStartMin > GIRO_WINDOW_MIN) {
        current = { zonaId, hora: o.hora, ordini: [o] };
        clusterStartMin = m;
        giriList.push(current);
      } else {
        current.ordini.push(o);
        // hora del giro = ultima consegna (massimo nel cluster)
        if (m > toMin(current.hora)) current.hora = o.hora;
      }
    }
  }
  giriList.sort((a, b) => toMin(a.hora) - toMin(b.hora));

  // Conteggio per zona (per riepilogo rapido)
  const perZonaCount = {};
  for (const g of giriList) perZonaCount[g.zonaId] = (perZonaCount[g.zonaId] || 0) + g.ordini.length;

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

      {/* Giro manual UI-only: stato locale volatile, nessuna API e nessuna persistenza. */}
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
          <button
            type="button"
            disabled={selectedManualGiroOrderIds.length < 2}
            onClick={createManualGiro}
            style={{
              background: selectedManualGiroOrderIds.length >= 2 ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${selectedManualGiroOrderIds.length >= 2 ? "rgba(251,191,36,0.60)" : "rgba(255,255,255,0.10)"}`,
              color: selectedManualGiroOrderIds.length >= 2 ? "#fde68a" : "rgba(255,255,255,0.30)",
              borderRadius: 9, padding: "7px 12px",
              fontSize: 12, fontWeight: 900,
              cursor: selectedManualGiroOrderIds.length >= 2 ? "pointer" : "not-allowed"
            }}
          >
            Crear giro manual
          </button>
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

      {/* Blocchi per giro (zona + ora) — ordinati cronologicamente */}
      {giriList.map(({ zonaId, hora, ordini }) => {
        const zona = ZONE_DELIVERY.find(z => z.id === zonaId);
        if (!zona) return null;
        return (
          <ZonaBlock
            key={`${zonaId}|${hora}`}
            zona={zona}
            ordini={ordini}
            giroHora={hora}
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
    </div>
  );
};

export default TabEntregas;
