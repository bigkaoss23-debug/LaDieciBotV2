import { useState, useEffect } from 'react';
import { calcTotale } from '../../constants';
import { api } from '../../api';
import { sb } from '../../api';
import { ZONE_DELIVERY, zonaBadgeStyle, tempoAndata } from '../../zones';
import { applyUiOffset } from '../../utils/uiOffset';
import { ORDER_STATES, buildEnEntregaTransition, isCompletedState, logLegacyBypass, logRollback, logTransition } from '../../core/orders';

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

// ─── Card ordine dentro un blocco zona ────────────────────────────────────
const ZonaOrderRow = ({ o, zona, onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado }) => {
  const isLoading   = loadingId === o.id;
  const isListo     = o.estado === ORDER_STATES.LISTO;
  const isEnEntrega = o.estado === ORDER_STATES.EN_ENTREGA;
  const isCocina    = o.estado === ORDER_STATES.EN_COCINA;

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
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${isEnEntrega ? "rgba(249,115,22,0.3)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", alignItems: "center", gap: 10
    }}>
      {/* Stato */}
      <span style={{ fontSize: 14, flexShrink: 0 }}>{estadoLabel}</span>

      {/* Cliente + indirizzo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{o.nombre}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{o.id}</span>
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
          title="El driver salió sin registrar la salida">
          ⚠️ Salgo
        </button>
      )}

      {/* Override: marcar entregado manualmente */}
      {isEnEntrega && (
        <button disabled={isLoading} onClick={() => onForzaEntregado && onForzaEntregado(o)}
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
const ZonaBlock = ({ zona, ordini, giroHora, onSendRepartidor, loadingId, driverStato, onForzaSalida, onForzaEntregado }) => {
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
        {/* Tempo giro — snapshot durata_andata reale (Google), worst-case del giro */}
        {(() => {
          const tg = Math.max(...ordini.map(o => tempoAndata(o, zona)));
          return (
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "'DM Mono',monospace", fontWeight: 600 }}
              title="Tempo andata one-way (peggior caso del giro)">
              ~{tg}min
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
            driverStato={driverStato} onForzaSalida={onForzaSalida} onForzaEntregado={onForzaEntregado} />
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

  // Filtra solo delivery attivi (escludi POR_CONFIRMAR: l'operatore deve prima confermare in Pedidos)
  const entregas = ordenes.filter(o =>
    o.tipo_consegna === "DOMICILIO" &&
    !isCompletedState(o.estado) &&
    o.estado !== ORDER_STATES.POR_CONFIRMAR
  );

  const consegnati = ordenes.filter(o =>
    o.tipo_consegna === "DOMICILIO" && o.estado === ORDER_STATES.RETIRADO
  );

  const toMin = (t) => { if (!t) return 9999; const [h,m] = t.split(":").map(Number); return h*60+m; };
  const toHora = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

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
    setDriverLoading(true);
    const enEntrega = entregas.filter(o => o.estado === ORDER_STATES.EN_ENTREGA);
    const nOrdini = enEntrega.length || 1;
    try {
      await api.registrarSalidaDriver(ordine?.zona || null, nOrdini);
      const nuovoStato = { stato: "IN_GIRO", zona: ordine?.zona || null, partito_alle: new Date().toISOString(), n_ordini: nOrdini, rientro_stimato: null };
      setDriverStato(nuovoStato);
      if (notify) notify("⚠️ Salida registrada manualmente", "#fbbf24");
    } catch(e) { if (notify) notify("❌ Error al registrar salida", "#E8341C"); }
    setDriverLoading(false);
  };

  // Override operatore: marca entregado manualmente (driver dimenticò Entregado)
  const handleForzaEntregado = async (ordine) => {
    logLegacyBypass({
      component: "TabEntregas",
      action: "handleForzaEntregado",
      orderId: ordine.id,
      from: ordine?.estado,
      to: ORDER_STATES.RETIRADO,
      metadata: { reason: "operatore marca consegna manualmente" },
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
                driverStato={driverStato} onForzaSalida={handleForzaSalida} onForzaEntregado={handleForzaEntregado} />
            ))}
          </div>
        </div>
      )}

      {ResumenEntregados}
    </div>
  );
};

export default TabEntregas;
