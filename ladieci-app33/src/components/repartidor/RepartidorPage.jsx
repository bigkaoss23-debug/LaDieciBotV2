import { useState, useEffect, useRef } from 'react';
import { api, auth } from '../../api';
import { ZONE_DELIVERY, tempoAndata } from '../../zones';
import { calcTotale } from '../../constants';
import { applyUiOffset } from '../../utils/uiOffset';
import Suoni from '../../sounds';
import { ORDER_STATES, isCompletedState, logLegacyBypass, logRollback, logTransition } from '../../core/orders';

const mapsUrl = (dir) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((dir || "") + " Roquetas de Mar")}`;

const oraToMin = (h) => {
  if (!h) return 9999;
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
};

const addMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm + min;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
};

// hora = orario consegna cliente → horaForno = hora − tempoGiro
const subtractMinutes = (hora, min) => {
  if (!hora || !min) return null;
  const [hh, mm] = hora.split(":").map(Number);
  const tot = hh * 60 + mm - min;
  if (tot < 0) return null;
  return `${String(Math.floor(tot/60)%24).padStart(2,"0")}:${String(tot % 60).padStart(2,"0")}`;
};

// ─── Card singola ─────────────────────────────────────────────────────────
const EntregaCard = ({ orden, onSalgo, onEntregado, loading }) => {
  const [pendingPago, setPendingPago] = useState(null); // null | orden.id
  const isListo   = orden.estado === ORDER_STATES.LISTO;
  const isEnRoute = orden.estado === ORDER_STATES.EN_ENTREGA;
  const isCocina  = orden.estado === ORDER_STATES.EN_COCINA;
  const zonaObj   = ZONE_DELIVERY.find(z => z.id === orden.zona) || null;

  const items = (Array.isArray(orden.items) ? orden.items : [])
    .filter(it => it.n !== "Entrega a domicilio" && it.cat !== "Bebidas");

  const extras = (Array.isArray(orden.items) ? orden.items : [])
    .filter(it => it.n !== "Entrega a domicilio" && it.cat === "Bebidas");

  // Sorgente di verità: orden.totale (include delivery_fee). Fallback per record legacy.
  const allItems = (Array.isArray(orden.items) ? orden.items : []).filter(i => i.n !== "Entrega a domicilio");
  const totalNum = (Number(orden.totale) > 0) ? Number(orden.totale) : calcTotale(allItems, orden.tipo_consegna || "DOMICILIO");
  const total = totalNum.toFixed(2);

  const statusBg    = isEnRoute ? "#F97316" : isListo ? "#16A34A" : "#374151";
  const statusLabel = isEnRoute ? "EN CAMINO" : isListo ? "LISTO" : "EN COCINA";

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      marginBottom: 10,
      overflow: "hidden",
      boxShadow: isListo
        ? "0 0 0 3px #16A34A, 0 4px 16px rgba(0,0,0,0.15)"
        : isEnRoute
        ? "0 0 0 3px #F97316, 0 4px 16px rgba(0,0,0,0.15)"
        : "0 2px 8px rgba(0,0,0,0.10)",
    }}>
      {/* Header: ID + stato + ora */}
      <div style={{
        background: zonaObj ? zonaObj.colore : "#374151",
        padding: "10px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontWeight: 900, fontSize: 22, color: "#fff", letterSpacing: -1
        }}>{orden.id}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {orden.hora && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <span style={{
                background: "rgba(0,0,0,0.25)", color: "#fff",
                fontWeight: 800, fontSize: 15,
                fontFamily: "'DM Mono', monospace",
                borderRadius: 7, padding: "2px 9px"
              }}>Lista {applyUiOffset(orden.forno_out || subtractMinutes(orden.hora, tempoAndata(orden, zonaObj)) || orden.hora, orden.ui_offset_min)}</span>
              {orden.hora && (
                <span style={{
                  background: "rgba(0,0,0,0.40)", color: "#FCD34D",
                  fontWeight: 800, fontSize: 13,
                  fontFamily: "'DM Mono', monospace",
                  borderRadius: 7, padding: "2px 9px"
                }}>Entrega ~{orden.hora}</span>
              )}
            </div>
          )}
          <span style={{
            background: statusBg, color: "#fff",
            fontWeight: 800, fontSize: 11, letterSpacing: 1,
            borderRadius: 8, padding: "3px 10px"
          }}>{statusLabel}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 16px" }}>
        {/* Nome cliente */}
        <div style={{ fontSize: 17, fontWeight: 800, color: "#111", marginBottom: 2 }}>
          {orden.nombre}
        </div>

        {/* Telefono */}
        {orden.tel && (
          <a href={`tel:+${(orden.tel).replace(/\D/g,"")}`}
            style={{ color: "#2563EB", fontSize: 14, fontWeight: 600,
              textDecoration: "none", display: "block", marginBottom: 8 }}>
            {orden.tel}
          </a>
        )}

        {/* Indirizzo */}
        <div style={{
          background: "#F3F4F6", borderRadius: 10,
          padding: "10px 14px", marginBottom: 10,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#111", lineHeight: 1.3 }}>
            {orden.direccion || <span style={{ color: "#EF4444" }}>Sin dirección</span>}
          </div>
          {orden.direccion_note && (
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{orden.direccion_note}</div>
          )}
          {orden.direccion && (
            <a href={mapsUrl(orden.direccion)} target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-block", marginTop: 8,
                background: "#1D4ED8", color: "#fff",
                borderRadius: 8, padding: "6px 14px",
                fontSize: 13, fontWeight: 700, textDecoration: "none"
              }}>
              Abrir en Maps
            </a>
          )}
        </div>

        {/* Items — solo pizze, senza emoji ingredienti */}
        <div style={{ marginBottom: 10 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between",
              padding: "5px 0",
              borderBottom: i < items.length - 1 ? "1px solid #E5E7EB" : "none",
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
                {it.q}× {it.n}
              </span>
              {it.sub && (
                <span style={{
                  fontSize: 13, fontWeight: 700, color: "#fff",
                  background: "#EF4444", borderRadius: 6, padding: "2px 8px",
                  alignSelf: "center"
                }}>{it.sub}</span>
              )}
            </div>
          ))}
          {extras.length > 0 && (
            <div style={{
              marginTop: 6, padding: "6px 10px",
              background: "#FEF9C3", borderRadius: 8,
              fontSize: 14, fontWeight: 600, color: "#713F12"
            }}>
              + {extras.map(it => `${it.q}× ${it.n}`).join(", ")}
            </div>
          )}
          {(orden.nota || orden.nota_cucina) && (
            <div style={{
              marginTop: 6, padding: "6px 10px",
              background: "#FEF2F2", border: "1px solid #FECACA",
              borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#991B1B"
            }}>
              {orden.nota_cucina || orden.nota}
            </div>
          )}
        </div>

        {/* Totale */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderTop: "2px solid #E5E7EB", paddingTop: 10
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6B7280" }}>
            Total a cobrar
          </span>
          <span style={{
            fontSize: 26, fontWeight: 900, color: "#16A34A",
            fontFamily: "'DM Mono', monospace"
          }}>
            {total}€
          </span>
        </div>

        {/* Azione */}
        {isListo && (
          <button onClick={() => onSalgo(orden.id)} disabled={loading === orden.id}
            style={{
              width: "100%", marginTop: 12, padding: "16px 0",
              background: loading === orden.id ? "#9CA3AF" : "#F97316",
              border: "none", borderRadius: 12,
              color: "#fff", fontWeight: 900, fontSize: 18,
              cursor: loading === orden.id ? "not-allowed" : "pointer",
            }}>
            {loading === orden.id ? "..." : "Salgo"}
          </button>
        )}
        {isEnRoute && (
          pendingPago === orden.id ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6B7280",
                textAlign: "center", marginBottom: 8 }}>¿Cómo paga?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => { setPendingPago(null); onEntregado(orden.id, "efectivo"); }}
                  disabled={loading === orden.id}
                  style={{ padding: "14px 0", background: "#16A34A",
                    border: "none", borderRadius: 12, color: "#fff",
                    fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                  💵 Efectivo
                </button>
                <button
                  onClick={() => { setPendingPago(null); onEntregado(orden.id, "tarjeta"); }}
                  disabled={loading === orden.id}
                  style={{ padding: "14px 0", background: "#2563EB",
                    border: "none", borderRadius: 12, color: "#fff",
                    fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                  💳 Tarjeta
                </button>
                <button
                  onClick={() => { setPendingPago(null); onEntregado(orden.id, "bizum"); }}
                  disabled={loading === orden.id}
                  style={{ padding: "14px 0", background: "#0EA5E9",
                    border: "none", borderRadius: 12, color: "#fff",
                    fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                  📱 Bizum
                </button>
              </div>
              <button onClick={() => setPendingPago(null)}
                style={{ width: "100%", marginTop: 6, background: "transparent",
                  border: "none", color: "#9CA3AF", fontSize: 12, cursor: "pointer" }}>
                cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => setPendingPago(orden.id)} disabled={loading === orden.id}
              style={{
                width: "100%", marginTop: 12, padding: "16px 0",
                background: loading === orden.id ? "#9CA3AF" : "#16A34A",
                border: "none", borderRadius: 12,
                color: "#fff", fontWeight: 900, fontSize: 18,
                cursor: loading === orden.id ? "not-allowed" : "pointer",
              }}>
              {loading === orden.id ? "..." : "Entregado"}
            </button>
          )
        )}
      </div>
    </div>
  );
};

// ─── Pagina principale ────────────────────────────────────────────────────
const RepartidorPage = ({ ordenes = [], onBack, notify }) => {
  const [loading,      setLoading]      = useState(null);
  const [ordLocal,     setOrdLocal]     = useState([]);
  const [audioAttivato, setAudioAttivato] = useState(false);
  const [apertoConsegnati, setApertoConsegnati] = useState(false);
  const prevIdsRef = useRef(null);

  // ─── PIN gate per Repartidor ───────────────────────────────────────────
  const [repUnlocked, setRepUnlocked] = useState(() => {
    try {
      const role = sessionStorage.getItem("ld_role");
      return role === "repartidor" && auth.isAuthenticated();
    } catch(e) { return false; }
  });
  const [repPin, setRepPin] = useState("");
  const [repPinError, setRepPinError] = useState(false);
  const [repPinLoading, setRepPinLoading] = useState(false);

  const handleRepPinKey = (k) => {
    if (repPinLoading) return;
    if (k === "DEL") { setRepPin(p => p.slice(0,-1)); return; }
    if (repPin.length < 6) {
      const next = repPin + k;
      setRepPin(next);
      if (next.length === 6) checkRepPin(next);
    }
  };

  const checkRepPin = async (pin) => {
    if (repPinLoading) return;
    const value = pin !== undefined ? pin : repPin;
    if (value.length < 6) return;
    setRepPinLoading(true);
    const result = await auth.login(value, "repartidor");
    setRepPinLoading(false);
    if (result.success) {
      setRepUnlocked(true);
    } else {
      setRepPinError(true); setRepPin("");
      setTimeout(() => setRepPinError(false), 1200);
    }
  };

  useEffect(() => { setOrdLocal(ordenes); }, [ordenes]);

  // Rileva nuovi ordini e suona
  useEffect(() => {
    const currentIds = new Set(
      ordenes
        .filter(o =>
          o.tipo_consegna === "DOMICILIO" &&
          !isCompletedState(o.estado) &&
          o.estado !== ORDER_STATES.POR_CONFIRMAR
        )
        .map(o => o.id)
    );
    if (prevIdsRef.current !== null && audioAttivato) {
      for (const id of currentIds) {
        if (!prevIdsRef.current.has(id)) {
          Suoni.nuovoOrdineDelivery();
          break;
        }
      }
    }
    prevIdsRef.current = currentIds;
  }, [ordenes, audioAttivato]);

  if (!repUnlocked) {
    return (
      <div style={{minHeight:"100dvh",background:"#1F2937",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{fontSize:48,marginBottom:8}}>🛵</div>
        <div style={{color:"#fff",fontSize:20,fontWeight:700,marginBottom:6}}>PIN Repartidor</div>
        <div style={{color:"rgba(255,255,255,0.4)",fontSize:13,marginBottom:24}}>6 dígitos</div>

        {/* 6 puntos */}
        <div style={{display:"flex",gap:12,marginBottom:16}}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              width:14,height:14,borderRadius:"50%",
              background: i < repPin.length ? (repPinError ? "#E8341C" : "#F59E0B") : "transparent",
              border: `2px solid ${repPinError ? "#E8341C" : i < repPin.length ? "#F59E0B" : "rgba(255,255,255,0.25)"}`,
              transition:"all .15s"
            }}/>
          ))}
        </div>

        {repPinLoading && <div style={{color:"rgba(255,255,255,0.5)",fontSize:13,marginBottom:12}}>Verificando…</div>}
        {repPinError && !repPinLoading && <div style={{color:"#E8341C",fontSize:13,marginBottom:12}}>PIN incorrecto</div>}

        {/* Tastierino */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:240}}>
          {["1","2","3","4","5","6","7","8","9","DEL","0",""].map((k,idx) => (
            k === "" ? <div key={idx}/> :
            <button key={k} onClick={()=>handleRepPinKey(k)} disabled={repPinLoading} style={{
              width:70,height:56,borderRadius:14,border:"1px solid rgba(255,255,255,0.1)",
              fontSize:k==="DEL"?18:22, fontWeight:700, cursor:repPinLoading?"default":"pointer",
              background:k==="DEL"?"#374151":"#111827",
              color:"#fff", opacity:repPinLoading?0.4:1
            }}>{k==="DEL"?"⌫":k}</button>
          ))}
        </div>
      </div>
    );
  }
  // ─── Fine PIN gate ─────────────────────────────────────────────────────

  const handleAttivaAudio = () => {
    Suoni.preload();
    Suoni.confermaSoft();  // sblocca notifica_wa.mp3
    Suoni.consegnaSoft();  // sblocca consegna.mp3 sottovoce — necessario su iOS/Safari
    setAudioAttivato(true);
  };

  const entregas = ordLocal.filter(o =>
    o.tipo_consegna === "DOMICILIO" &&
    !isCompletedState(o.estado) &&
    o.estado !== ORDER_STATES.POR_CONFIRMAR
  );

  const consegnati = ordLocal.filter(o =>
    o.tipo_consegna === "DOMICILIO" && o.estado === ORDER_STATES.RETIRADO
  );

  // Raggruppa per zona, ogni gruppo ordinato per hora
  const perZona = {};
  const senzaZona = [];
  for (const o of entregas) {
    if (o.zona) {
      if (!perZona[o.zona]) perZona[o.zona] = [];
      perZona[o.zona].push(o);
    } else {
      senzaZona.push(o);
    }
  }
  // Ordina per hora dentro ogni zona; LISTO/EN_ENTREGA prima
  const priori = (o) => {
    if (o.estado === ORDER_STATES.EN_ENTREGA) return 0;
    if (o.estado === ORDER_STATES.LISTO)      return 1;
    return 2;
  };
  for (const z of Object.keys(perZona)) {
    perZona[z].sort((a, b) => priori(a) - priori(b) || oraToMin(a.hora) - oraToMin(b.hora));
  }
  senzaZona.sort((a, b) => oraToMin(a.hora) - oraToMin(b.hora));

  // Zone ordinate per urgenza: hora minima degli ordini dentro la zona (più urgente prima)
  const zoneCoinvolte = ZONE_DELIVERY
    .filter(z => perZona[z.id]?.length > 0)
    .sort((za, zb) => {
      const minA = Math.min(...perZona[za.id].map(o => oraToMin(o.hora)));
      const minB = Math.min(...perZona[zb.id].map(o => oraToMin(o.hora)));
      return minA - minB;
    });
  const nAttivi = entregas.filter(o => [ORDER_STATES.LISTO, ORDER_STATES.EN_ENTREGA].includes(o.estado)).length;

  const handleSalgo = async (id) => {
    const current = ordLocal.find(o => o.id === id);
    logTransition({
      component: "RepartidorPage",
      action: "handleSalgo",
      orderId: id,
      from: current?.estado,
      to: ORDER_STATES.EN_ENTREGA,
    });
    setLoading(id);
    setOrdLocal(prev => prev.map(o => o.id === id ? { ...o, estado: ORDER_STATES.EN_ENTREGA, hora_salida: Date.now() } : o));
    try {
      await api.marcarEnEntrega(id);

      // Primo Salgo del giro → registra partenza in DRIVER_STATO
      const giaInViaggio = ordLocal.some(o => o.estado === ORDER_STATES.EN_ENTREGA && o.id !== id);
      if (!giaInViaggio) {
        const orden = ordLocal.find(o => o.id === id);
        const ordiniGiro = ordLocal.filter(o => [ORDER_STATES.EN_ENTREGA, ORDER_STATES.LISTO].includes(o.estado));
        logLegacyBypass({
          component: "RepartidorPage",
          action: "registrarSalidaDriver",
          orderId: id,
          from: current?.estado,
          to: ORDER_STATES.EN_ENTREGA,
          metadata: { reason: "side effect driver accoppiato al primo Salgo", n_ordini: ordiniGiro.length },
        });
        await api.registrarSalidaDriver(orden?.zona || null, ordiniGiro.length);
      }

      if (notify) notify("🛵 Entrega iniciada", "#F97316");
    } catch(e) {
      logRollback({
        component: "RepartidorPage",
        action: "handleSalgo.rollback",
        orderId: id,
        from: ORDER_STATES.EN_ENTREGA,
        to: current?.estado,
        metadata: { reason: "api.marcarEnEntrega failed; restore props snapshot" },
      });
      setOrdLocal(ordenes);
      if (notify) notify("Error al actualizar", "#EF4444");
    }
    setLoading(null);
  };

  const handleEntregado = async (id, metodo_pago) => {
    const orden = ordLocal.find(o => o.id === id);
    logTransition({
      component: "RepartidorPage",
      action: "handleEntregado",
      orderId: id,
      from: orden?.estado,
      to: ORDER_STATES.RETIRADO,
      metadata: { metodo_pago: metodo_pago || "" },
    });
    setLoading(id);
    setOrdLocal(prev => prev.map(o => o.id === id ? { ...o, estado: ORDER_STATES.RETIRADO, hora_entrega: Date.now() } : o));
    try {
      await api.marcarEntregado(id, true, orden, metodo_pago || "");

      // Ultimo Entregado del giro → calcola rientro e salva log
      const rimanenti = ordLocal.filter(o => [ORDER_STATES.LISTO, ORDER_STATES.EN_ENTREGA].includes(o.estado) && o.id !== id);
      if (rimanenti.length === 0) {
        logLegacyBypass({
          component: "RepartidorPage",
          action: "chiudiGiro",
          orderId: id,
          from: orden?.estado,
          to: ORDER_STATES.RETIRADO,
          metadata: { reason: "side effect giro legato all'ultima consegna" },
        });
        await api.chiudiGiro();
      }

      if (notify) notify(
        metodo_pago === "tarjeta" ? "💳 Entregado — Tarjeta" : "💵 Entregado — Efectivo",
        "#16A34A"
      );
    } catch(e) {
      logRollback({
        component: "RepartidorPage",
        action: "handleEntregado.rollback",
        orderId: id,
        from: ORDER_STATES.RETIRADO,
        to: orden?.estado,
        metadata: { reason: "api.marcarEntregado failed; restore props snapshot" },
      });
      setOrdLocal(ordenes);
      if (notify) notify("Error al actualizar", "#EF4444");
    }
    setLoading(null);
  };

  if (!audioAttivato) return (
    <div style={{
      minHeight: "100vh", background: "#111827",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32, textAlign: "center",
    }}>
      <div style={{ fontSize: 72, marginBottom: 24 }}>🔔</div>
      <div style={{
        color: "#fff", fontWeight: 900, fontSize: 26, marginBottom: 12
      }}>Activa las notificaciones</div>
      <div style={{
        color: "#9CA3AF", fontSize: 16, marginBottom: 40, maxWidth: 280
      }}>
        Recibirás un sonido cada vez que llegue un nuevo pedido a domicilio.
      </div>
      <button onClick={handleAttivaAudio} style={{
        background: "#F97316", border: "none", borderRadius: 16,
        color: "#fff", fontWeight: 900, fontSize: 20,
        padding: "20px 48px", cursor: "pointer",
        boxShadow: "0 8px 32px rgba(249,115,22,0.4)",
      }}>
        Activar y continuar
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        background: "#111827", padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: "rgba(255,255,255,0.1)", border: "none",
            borderRadius: 10, width: 40, height: 40,
            color: "#fff", fontSize: 20, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}>←</button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>Mis Entregas</div>
          <div style={{ color: "#9CA3AF", fontSize: 13, marginTop: 1 }}>
            {nAttivi > 0
              ? `${nAttivi} listo${nAttivi !== 1 ? "s" : ""} para salir`
              : entregas.length > 0
              ? `${entregas.length} en preparación`
              : "Sin entregas pendientes"}
          </div>
        </div>
        {/* Pillole zone */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {zoneCoinvolte.map(z => (
            <span key={z.id} style={{
              background: z.colore, color: "#fff",
              borderRadius: 20, padding: "3px 10px",
              fontSize: 12, fontWeight: 800
            }}>{z.id}</span>
          ))}
        </div>
      </div>

      {/* Corpo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 40px" }}>
        {entregas.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 24px", color: "#9CA3AF"
          }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#374151" }}>Sin entregas a domicilio</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Los pedidos aparecerán aquí cuando estén listos</div>
          </div>
        ) : (
          <>
            {/* Blocchi per zona */}
            {zoneCoinvolte.map(zona => (
              <div key={zona.id} style={{ marginBottom: 20 }}>
                {/* Header zona */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  marginBottom: 8, padding: "0 4px"
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    background: zona.colore, flexShrink: 0
                  }} />
                  <span style={{
                    fontSize: 15, fontWeight: 900, color: "#111827",
                    letterSpacing: 1, textTransform: "uppercase"
                  }}>
                    {zona.id} · {zona.nome}
                  </span>
                  <span style={{
                    marginLeft: "auto",
                    fontSize: 12, fontWeight: 700, color: zona.colore
                  }}>
                    {perZona[zona.id].length} pedido{perZona[zona.id].length !== 1 ? "s" : ""}
                    {" · "}~{zona.tempoGiro} min
                  </span>
                </div>
                {perZona[zona.id].map(o => (
                  <EntregaCard key={o.id} orden={o}
                    onSalgo={handleSalgo} onEntregado={handleEntregado} loading={loading} />
                ))}
              </div>
            ))}

            {/* Ordini senza zona */}
            {senzaZona.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: "#EF4444",
                  letterSpacing: 1, textTransform: "uppercase",
                  marginBottom: 8, padding: "0 4px"
                }}>
                  Sin zona asignada
                </div>
                {senzaZona.map(o => (
                  <EntregaCard key={o.id} orden={o}
                    onSalgo={handleSalgo} onEntregado={handleEntregado} loading={loading} />
                ))}
              </div>
            )}

            {/* Entregados esta noche — collapsible */}
            {consegnati.length > 0 && (() => {
              const totalNoche = consegnati.reduce((sum, o) => {
                const its = Array.isArray(o.items) ? o.items : [];
                if (Number(o.totale) > 0) return sum + Number(o.totale);
                const clean = its.filter(i => i.n !== "Entrega a domicilio");
                return sum + calcTotale(clean, o.tipo_consegna || "DOMICILIO");
              }, 0);
              return (
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => setApertoConsegnati(v => !v)} style={{
                    width: "100%", background: "#16A34A", border: "none",
                    borderRadius: apertoConsegnati ? "12px 12px 0 0" : 12,
                    padding: "14px 16px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>
                      ✓ Entregados esta noche · {consegnati.length}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 900, fontSize: 15, fontFamily: "'DM Mono',monospace" }}>
                      {totalNoche.toFixed(2)}€ {apertoConsegnati ? "▲" : "▼"}
                    </span>
                  </button>
                  {apertoConsegnati && (
                    <div style={{ background: "#fff", borderRadius: "0 0 12px 12px", padding: "8px 14px" }}>
                      {consegnati.map((o, i) => {
                        const its = Array.isArray(o.items) ? o.items : [];
                        const clean = its.filter(it => it.n !== "Entrega a domicilio");
                        const totNum = (Number(o.totale) > 0) ? Number(o.totale) : calcTotale(clean, o.tipo_consegna || "DOMICILIO");
                        const tot = totNum.toFixed(2);
                        return (
                          <div key={o.id} style={{
                            display: "flex", justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: i < consegnati.length - 1 ? "1px solid #F3F4F6" : "none",
                            fontSize: 15, color: "#374151"
                          }}>
                            <span style={{ fontWeight: 700 }}>{o.id} · {o.nombre}</span>
                            <span style={{ color: "#16A34A", fontWeight: 800, fontFamily: "'DM Mono',monospace" }}>{tot}€</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default RepartidorPage;
