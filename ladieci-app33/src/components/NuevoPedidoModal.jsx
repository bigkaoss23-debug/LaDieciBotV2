import { useState, useEffect, useRef, useMemo } from 'react';
import { C, genId, INGREDIENTI, calcTotale, DELIVERY_FEE, aplicarDescuento } from '../constants';
import { api, sb } from '../api';
import { assegnaZonaDaKeyword, suggerisciOrario, zonaBadgeStyle, ZonaBadge, ZONE_DELIVERY, risolviTempoAndata, tempoAndata, proposeForNewOrder, BUFFER_OPS_DRIVER_MIN } from '../zones';
import ItemPickerModal from './ItemPickerModal';
import { applyUiOffset } from '../utils/uiOffset';
import DescuentoInput from './ui/DescuentoInput';
import { getKitchenCapacityStatus } from '../core/kitchen/capacity';

const CLOSING_TIME_MIN = 23 * 60;
const CLOSING_TIME_ERROR = "Hora inválida.";
const CLOSING_TIME_OVERRIDE_MARKER = "FUERA_HORARIO_FORZADO";

function horaToMinStrict(hora) {
  const m = String(hora || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23) return null;
  return h * 60 + min;
}

function buildClosingOverrideNota(nota, hora) {
  const base = String(nota || "").trim();
  if (base.includes(CLOSING_TIME_OVERRIDE_MARKER)) return base;
  const marker = `[${CLOSING_TIME_OVERRIDE_MARKER} ${hora}]`;
  return base ? `${base}\n${marker}` : marker;
}

// Helper di PURA PRESENTAZIONE per la mini-tabella "Disponibilidad" del modal
// delivery. NESSUN dato sensibile (niente nombre / #id / ticket): solo finestra
// oraria, zona e stato operativo. Sorgente: ordenes delivery attivi + campi
// driver separati (salida_driver_estimada / entrega_estimada) con fallback
// legacy forno_out / hora. Nessun calcolo di scheduling: solo lettura.
const DISPONIBILIDAD_STATES = ["EN_COCINA", "POR_CONFIRMAR", "LISTO", "EN_ENTREGA"];
const GIRO_COMPATIBLE_RECOMMENDATION_WINDOW_MIN = 20;
// Margine (min): la pizza nuova può uscire dal forno fino a N minuti DOPO la
// partenza del giro esistente ed essere ancora agganciabile (il driver può
// attendere un paio di minuti). Oltre questo, il giro NON è aggregabile.
const GIRO_AGGREGATION_MARGIN_MIN = 2;

function timeDiffMin(a, b) {
  const toM = (t) => {
    if (!t) return null;
    const m = String(t).trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || h < 0 || h > 23) return null;
    return h * 60 + min;
  };
  const ma = toM(a);
  const mb = toM(b);
  if (ma == null || mb == null) return null;
  return Math.abs(ma - mb);
}

function buildDisponibilidad(ordenes, currentZonaId, newOrderFornoOut = null, marginMin = GIRO_AGGREGATION_MARGIN_MIN) {
  const toM = (t) => { if (!t) return null; const [h, m] = String(t).split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  // forno_out del NUOVO ordine: minuto in cui la sua pizza esce dal forno.
  // Serve a decidere se è ancora in tempo per agganciarsi a un giro esistente.
  const newFornoMin = toM(newOrderFornoOut);
  const rows = [];
  const byKey = new Map();
  for (const o of (ordenes || [])) {
    if (!o || o.tipo_consegna !== "DOMICILIO") continue;
    if (!DISPONIBILIDAD_STATES.includes(o.estado)) continue;
    if (!o.zona || !o.hora) continue;
    const start = o.salida_driver_estimada || o.forno_out || null;
    const end = o.entrega_estimada || o.hora || null;
    if (!start && !end) continue;
    const key = `${o.zona}|${start || end}`;
    if (byKey.has(key)) { byKey.get(key).count += 1; continue; }
    const startMin = toM(start) ?? toM(end);
    const sameZone = !!currentZonaId && o.zona === currentZonaId;
    // Agganciabile SOLO se la pizza nuova esce dal forno entro la partenza del
    // giro (+margine): il driver parte a `startMin`, la pizza deve essere pronta.
    // Se non conosciamo il forno_out nuovo restiamo ottimisti (compatibile) per
    // non regredire rispetto al solo match di zona.
    const aggregable = sameZone && (
      newFornoMin == null || (startMin != null && newFornoMin <= startMin + marginMin)
    );
    const row = {
      key,
      zona: o.zona,
      startMin,
      range: (start && end && start !== end) ? `${start}–${end}` : (start || end),
      slotHora: end || start, // hora da applicare cliccando un giro compatibile
      kind: sameZone ? (aggregable ? "compatible" : "no_agregable") : "ocupado",
      conflicto: o.conflicto_driver === true,
      count: 1,
    };
    byKey.set(key, row);
    rows.push(row);
  }
  rows.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
  return rows;
}

function findRecommendedCompatibleGiro(disponibilidad, currentZonaId, referenceHora) {
  if (!currentZonaId || !referenceHora) return null;
  return (disponibilidad || [])
    .filter(r => r.kind === "compatible" && r.zona === currentZonaId && r.slotHora)
    .map(r => ({ ...r, diffMin: timeDiffMin(referenceHora, r.slotHora) }))
    .filter(r => r.diffMin != null && r.diffMin <= GIRO_COMPATIBLE_RECOMMENDATION_WINDOW_MIN)
    .sort((a, b) => (a.diffMin - b.diffMin) || ((a.startMin ?? 0) - (b.startMin ?? 0)))[0] || null;
}

const NuevoPedidoModal = ({ onClose, onConfirm, visible, prefill, ordenes = [] }) => {
  const [items,           setItems]           = useState([]);
  const [tel,             setTel]             = useState("");
  const [nombre,          setNombre]          = useState("");
  const [hora,            setHora]            = useState("");
  const [nota,            setNota]            = useState("");
  const [canal,           setCanal]           = useState("TEL");
  const [direccion,       setDireccion]       = useState("");
  const [direccionNote,   setDireccionNote]   = useState("");
  const [clienteAbitual,  setClienteAbitual]  = useState(null);
  const [showNotaGen,     setShowNotaGen]     = useState(false);
  const [showDeliveryPopup, setShowDeliveryPopup] = useState(false);
  // Override esplicito: l'operatore ha cliccato "Forzar HORA" ignorando la proposta
  const [forzaHora, setForzaHora] = useState(false);
  const [yaPagedo,        setYaPagedo]        = useState(false);
  const [metodoPago,      setMetodoPago]      = useState("");
  const [descuentoTipo,   setDescuentoTipo]   = useState(null);
  const [descuentoValor,  setDescuentoValor]  = useState(0);

  // ── VIP / Preferiti ──────────────────────────────────────────────────────
  const [clienteId,       setClienteId]       = useState(null);   // id riga in `clientes`, valorizzato solo se cliente preesistente o appena creato
  const [preferito,       setPreferito]       = useState(false);  // toggle stellina (grigio→giallo)
  const [clientesList,    setClientesList]    = useState([]);     // tutti i preferiti caricati una volta
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [nombreFocus,     setNombreFocus]     = useState(false);

  // ── Zona delivery ────────────────────────────────────────────────────────
  const [zonaInfo,       setZonaInfo]       = useState(null);  // { zona, lat, lon, metodo }
  const [zonaLoading,    setZonaLoading]    = useState(false);
  const [zonaManuale,    setZonaManuale]    = useState(false); // true se l'operatore ha scelto a mano
  const geocodeTimer = useRef(null);

  // ── Feedback slot forno (solo delivery) ──────────────────────────────────
  const [slotFeedback,   setSlotFeedback]   = useState(null);
  // Step 2 anti-cerotto: timing delivery AUTORITATIVO dal backend (fonte unica).
  // Popolato da api.previewOrderTiming. Il frontend MOSTRA questi valori (zona,
  // durata, source, forno_out, warnings, driver conflict, suggested_hora);
  // slotFeedback/proposeForNewOrder locali restano solo come hint UI live mentre
  // si digita, NON come decisione né come dato salvato.
  const [backendTiming,    setBackendTiming]    = useState(null);
  const [backendTimingLoading, setBackendTimingLoading] = useState(false);
  const [horaTouchedByOperator, setHoraTouchedByOperator] = useState(false);
  // { horaForno, slotOk, load, slotSuggerito, consegnaSuggerita,
  //   scenario: "A"|"B"|"C"|"D"|"E"|"F", driverRientro, stessaZona }

  // ── Stato driver (fetch quando il modal si apre) ──────────────────────────
  const [driverStato,    setDriverStato]    = useState(null);

  // ItemPickerModal state
  const [pickerVisible,   setPickerVisible]   = useState(false);
  const [editingItem,     setEditingItem]     = useState(null); // null = nuovo, item = modifica

  // ── Tipo consegna: si determina automaticamente dall'indirizzo ─────────
  // Se l'indirizzo è compilato → DOMICILIO, altrimenti → RITIRO
  const tipoConsegna = direccion.trim().length > 0 ? "DOMICILIO" : "RITIRO";

  // ── Totale ──────────────────────────────────────────────────────────────
  // Sorgente unica: calcTotale (sum items + delivery_fee). Niente più magic numbers.
  // Sconto applicato sul totale finale — il backend è autoritativo, qui solo preview.
  const totaleBase = calcTotale(items, tipoConsegna);
  const descPreview = aplicarDescuento(totaleBase, descuentoTipo, descuentoValor);
  const total = descPreview.totale.toFixed(2);
  const descuentoImporte = descPreview.importe;
  const zonaAssegnata = tipoConsegna !== "DOMICILIO" || (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
  const ok = items.length > 0 && nombre.trim().length > 0 && zonaAssegnata && (!yaPagedo || metodoPago !== "");

  // ── Anti double-submit ───────────────────────────────────────────────────
  // submittingRef: guardia immediata (sync) contro rapid click prima del
  // re-render. Confronta meglio della sola useState che è async.
  // submitting (state): trigger re-render del bottone (disabled + label).
  // reqIdRef: client_req_id stabile per una singola apertura del modal —
  // riusato a ogni click finché il modal non si chiude/riapre. Così rapid
  // click producono lo stesso reqId e l'idempotency backend (creaOrdine)
  // riconosce il duplicato anche se la guardia frontend dovesse fallire.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const reqIdRef = useRef(null);

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = () => {
    setItems([]); setTel(""); setNombre(""); setHora(""); setNota("");
    setCanal("TEL"); setDireccion(""); setDireccionNote("");
    setClienteAbitual(null); setShowNotaGen(false);
    setYaPagedo(false); setMetodoPago("");
    setDescuentoTipo(null); setDescuentoValor(0);
    setClienteId(null); setPreferito(false); setShowSugerencias(false);
    setPickerVisible(false); setEditingItem(null);
    setZonaInfo(null); setZonaLoading(false); setZonaManuale(false);
    setBackendTiming(null); setBackendTimingLoading(false);
    horaCustom.current = false;
    setHoraTouchedByOperator(false);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    submittingRef.current = false;
    setSubmitting(false);
    reqIdRef.current = null;
  };

  // ── Confirm ──────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (submittingRef.current || !ok) return;
    const horaMin = horaToMinStrict(hora);
    if (horaMin == null) {
      window.alert(CLOSING_TIME_ERROR);
      return;
    }
    const cierreOverride = horaMin > CLOSING_TIME_MIN;
    if (cierreOverride) {
      const okFueraHorario = window.confirm(
        `Pedido fuera de horario (${hora}). ¿Forzar igualmente?\n\n` +
        `Se guardará marcado como ${CLOSING_TIME_OVERRIDE_MARKER}.`
      );
      if (!okFueraHorario) return;
    }
    // Freno a mano UX (Bug Z3, 17/05/2026): se hora è > 90 min nel futuro,
    // chiedi conferma esplicita. Cattura digitazioni accidentali (es. 23:43
    // invece di 21:30) o button click sbagliati prima che inquinino la coda.
    if (hora && /^\d{1,2}:\d{2}$/.test(hora)) {
      const [hh, mm] = hora.split(":").map(Number);
      const horaMinFuture = hh * 60 + mm;
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const deltaMin = horaMinFuture - nowMin;
      // Solo se nel futuro lontano nello stesso "giorno logico" (non gestiamo
      // wrap a giorno dopo — orari tipo 24:02 hanno deltaMin negativo o assurdo
      // e cadono fuori da questo controllo che è OK: sono casi rari da non bloccare qui).
      if (deltaMin > 90 && deltaMin < 12 * 60) {
        const h = Math.floor(deltaMin / 60);
        const m = deltaMin % 60;
        const dStr = h > 0 ? `${h}h${String(m).padStart(2,"0")}` : `${m} min`;
        const intensity = deltaMin > 120 ? "⚠️⚠️ HORA MUY LEJANA" : "⚠️ ATENCIÓN";
        const ok2 = window.confirm(
          `${intensity} — Hora pedido: ${hora}\n` +
          `Está ${dStr} en el futuro.\n\n` +
          `Confirma SOLO si el cliente la pidió EXPLÍCITAMENTE.\n` +
          `En caso de duda → CANCELA y verifica con el cliente.`
        );
        if (!ok2) return;
      }
    }
    // Attiva il guard SOLO dopo l'eventuale confirm dialog: se l'operatore
    // ha annullato la future-hora, NON bloccare il modal.
    submittingRef.current = true;
    setSubmitting(true);
    const telFinal = tel.trim() || (canal === "BANCO" ? "BARRA-" + Date.now().toString(36).toUpperCase().slice(-4) : "");

    // Se l'operatore ha attivato la stellina e non c'è già un clienteId,
    // creiamo/aggiorniamo il record in `clientes` PRIMA di mandare l'ordine.
    // L'ordine viene poi legato a quel cliente_id, così lo storico aggrega
    // anche i clienti senza tel (banco abituali).
    let cidFinale = clienteId;
    if (preferito && !cidFinale) {
      try {
        const r = await api.upsertCliente({
          alias: nombre.trim(),
          nombre: nombre.trim(),
          tel: tel.trim() || null,
          direccion: tipoConsegna === "DOMICILIO" ? direccion.trim() : null,
          direccion_note: tipoConsegna === "DOMICILIO" ? (direccionNote.trim() || null) : null,
          zona: tipoConsegna === "DOMICILIO" ? (zonaInfo?.zona?.id || null) : null,
          zona_lat: tipoConsegna === "DOMICILIO" ? (zonaInfo?.lat || null) : null,
          zona_lon: tipoConsegna === "DOMICILIO" ? (zonaInfo?.lon || null) : null,
          preferito: true
        });
        if (r?.id) cidFinale = r.id;
      } catch (e) {
        console.warn("[upsertCliente] failed, l'ordine procede senza cliente_id:", e?.message || e);
      }
    }
    // Step 2 anti-cerotto: usato SOLO per l'override zona manuale (input operatore).
    // Zona/durata definitive le decide il backend in createOrden (resolveDeliveryFields).
    const zonaFinaleId = tipoConsegna === "DOMICILIO"
      ? (zonaInfo?.zona?.id || assegnaZonaDaKeyword(direccion)?.id || null)
      : null;
    const notaFinale = cierreOverride ? buildClosingOverrideNota(nota, hora) : nota;
    // client_req_id: idempotency key. Stabile per la sessione modal corrente
    // (generato all'apertura via useEffect su `visible`). Anche se la guardia
    // frontend `submittingRef` dovesse fallire per qualche edge case React,
    // rapid click producono lo stesso reqId → backend `creaOrdine` riconosce
    // il duplicato (idempotent: true) invece di creare ordini multipli.
    // Fallback difensivo: se per qualche motivo non è stato popolato, lo
    // generiamo qui.
    if (!reqIdRef.current) {
      reqIdRef.current = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
    }
    onConfirm({
      id: genId(), client_req_id: reqIdRef.current, nombre: nombre.trim(), tel: telFinal,
      cliente_id: cidFinale || null,
      canal: canal === "WA" ? "WA" : canal === "BANCO" ? "BANCO" : "MANUAL",
      items: items.map(i => ({ ...i })),
      nota: notaFinale, hora, ts: Date.now(), estado: "POR_CONFIRMAR",
      tipo_consegna: tipoConsegna,
      direccion: tipoConsegna === "DOMICILIO" ? direccion.trim() : null,
      direccion_note: tipoConsegna === "DOMICILIO" ? (direccionNote.trim() || null) : null,
      // ── Step 2 anti-cerotto: geo/durata NON sono più fonte di verità del
      // frontend. Il backend (createOrden → resolveDeliveryFields) ri-risolve
      // server-side e IGNORA questi campi. Inviamo solo gli input operatore:
      // `direccion` + flag `zona_manuale` (+ `zona` solo se override esplicito).
      // I campi derivati restano null: il backend li popola autoritativamente.
      zona: (tipoConsegna === "DOMICILIO" && zonaManuale) ? zonaFinaleId : null,
      zona_lat: null,
      zona_lon: null,
      zona_manuale: tipoConsegna === "DOMICILIO" ? zonaManuale : false,
      durata_andata_min:    null,
      durata_google_min:    null,
      durata_haversine_min: null,
      geo_source:           null,
      // Flag operatore: ha forzato un'hora che il sistema considerava in conflitto
      // (driver impegnato o slot pieno). Tracciato per analytics + audit qualità.
      forzado: cierreOverride || (tipoConsegna === "DOMICILIO" ? forzaHora : false),
      ya_pagado: yaPagedo,
      metodo_pago: yaPagedo ? metodoPago : "",
      descuento_tipo:  descuentoImporte > 0 ? descuentoTipo  : null,
      descuento_valor: descuentoImporte > 0 ? descuentoValor : null,
    });
    // saveGeoCache rimosso — il backend resolver salva automaticamente in cache
    // quando geocoda con successo (Google/Nominatim/Photon). Una sola fonte di scrittura.
    reset();
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Picker: aggiungi item ────────────────────────────────────────────────
  const handleAdd = (item) => {
    setItems(prev => {
      // Se stesso prodotto predefinito (non custom, non con extras), incrementa quantità
      const canMerge = !item.id?.toString().startsWith("custom_") && !item.sub;
      if (canMerge) {
        const ex = prev.find(i => String(i.id) === String(item.id) && !i.sub);
        if (ex) return prev.map(i => String(i.id) === String(item.id) && !i.sub ? { ...i, q: i.q + 1 } : i);
      }
      return [...prev, { ...item, q: item.q || 1, _uid: genId() }];
    });
  };

  // ── Picker: aggiorna item esistente ─────────────────────────────────────
  const handleUpdate = (updated) => {
    setItems(prev => prev.map(i => i._uid === updated._uid ? { ...updated } : i));
  };

  // ── Apri picker per modifica ─────────────────────────────────────────────
  const handleEditItem = (item) => {
    setEditingItem(item);
    setPickerVisible(true);
  };

  // ── Rimuovi item ─────────────────────────────────────────────────────────
  const handleRemoveItem = (uid) => {
    setItems(prev => prev.filter(i => i._uid !== uid));
  };

  // ── Qty diretta ──────────────────────────────────────────────────────────
  const adj = (uid, d) => setItems(prev =>
    prev.map(i => i._uid === uid ? { ...i, q: Math.max(0, i.q + d) } : i).filter(i => i.q > 0)
  );

  // ── Autocomplete cliente per telefono (legacy WhatsApp) ──────────────────
  useEffect(() => {
    if (!visible) return;
    const telClean = tel.replace(/\D/, "");
    if (telClean.length < 6) { setClienteAbitual(null); return; }
    const t = setTimeout(async () => {
      try {
        const c = await api.getClientePorTel(tel);
        if (!c) { setClienteAbitual(null); return; }
        setClienteAbitual(c);
        if (c.id) { setClienteId(c.id); if (c.preferito) setPreferito(true); }
        if (!nombre.trim() && c.nombre) setNombre(c.nombre);
        if (!direccion.trim() && c.direccion) setDireccion(c.direccion);
        if (!direccionNote.trim() && c.direccion_note) setDireccionNote(c.direccion_note);
      } catch (e) { /* silenzioso */ }
    }, 400);
    return () => clearTimeout(t);
  }, [tel, visible]); // eslint-disable-line

  // ── Carica preferiti una volta all'apertura del modal ────────────────────
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    (async () => {
      try {
        const res = await api.getClientes();
        if (mounted) setClientesList(res?.clientes || []);
      } catch (e) { /* silenzioso */ }
    })();
    return () => { mounted = false; };
  }, [visible]);

  // ── Suggerimenti autocomplete su nombre ──────────────────────────────────
  // Match per prefisso (case-insensitive) su alias e nombre. VIP prima, poi gli altri.
  const sugerencias = useMemo(() => {
    const q = nombre.trim().toUpperCase();
    if (q.length < 1) return [];
    const matches = (clientesList || []).filter(c => {
      const a = (c.alias || "").toUpperCase();
      const n = (c.nombre || "").toUpperCase();
      return a.startsWith(q) || n.startsWith(q) || a.includes(q) || n.includes(q);
    });
    matches.sort((a, b) => {
      // VIP prima
      if (!!b.vip - !!a.vip) return (b.vip ? 1 : 0) - (a.vip ? 1 : 0);
      // poi per ordini_30gg desc
      return (b.ordini_30gg || 0) - (a.ordini_30gg || 0);
    });
    return matches.slice(0, 6);
  }, [nombre, clientesList]);

  // Quando l'operatore seleziona un suggerimento → riempie tutto.
  const pickCliente = (c) => {
    setClienteId(c.id);
    setNombre(c.alias || c.nombre || "");
    if (c.tel) setTel(c.tel);
    if (c.direccion) setDireccion(c.direccion);
    if (c.direccion_note) setDireccionNote(c.direccion_note);
    setPreferito(true);
    setShowSugerencias(false);
  };

  // ── Fetch driver state quando il modal è visibile ────────────────────────
  useEffect(() => {
    if (!visible) { setDriverStato(null); return; }
    let mounted = true;
    (async () => {
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
    })();
    return () => { mounted = false; };
  }, [visible]);

  // Traccia se l'operatore ha toccato manualmente l'orario
  const horaCustom = useRef(false);
  const setHoraFromOperator = (nextHora) => {
    horaCustom.current = true;
    setHoraTouchedByOperator(true);
    setHora(nextHora);
  };

  // ── Geocoding zona — debounce 800ms sull'indirizzo ─────────────────────
  // ENGINE UNICO: chiama api.resolveAddress sul backend (stessa cascata del bot WhatsApp).
  // Server-side: cache → cliente → Google → Nominatim → Photon → keyword.
  // Backend cacha automaticamente, qui niente saveGeoCache da gestire.
  useEffect(() => {
    if (tipoConsegna !== "DOMICILIO" || zonaManuale) return;
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    if (direccion.trim().length < 5) { setZonaInfo(null); setZonaLoading(false); return; }
    setZonaLoading(true);
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await api.resolveAddress(direccion, { tel: tel || null });
        if (res && res.zona) {
          const zonaObj = ZONE_DELIVERY.find(z => z.id === res.zona);
          // Mappatura source → metodo per coerenza con UI esistente
          // (badge "zona affidabile" vs "keyword guess" vs "fuori zona")
          const metodo = res.source === "keyword" ? "keyword"
                       : res.cached ? "cache"
                       : "polygon";
          setZonaInfo({
            zona: zonaObj || null,
            lat: res.lat, lon: res.lon,
            metodo,
            // Campi A/B + scelta server-side (non mostrati operatore — interni per analytics)
            durataAndataMin: res.durataAndataMin ?? null,
            googleMin: res.googleMin ?? null,
            haversineMin: res.haversineMin ?? null,
            source: res.source || null
          });
        } else {
          setZonaInfo({
            zona: null,
            lat: null,
            lon: null,
            metodo: "manual_required",
            source: res?.source || null,
            error: res?.error || "not_detected"
          });
        }
      } catch (e) {
        console.warn("[resolveAddress] failed:", e?.message || e);
        setZonaInfo({
          zona: null,
          lat: null,
          lon: null,
          metodo: "manual_required",
          source: null,
          error: "resolve_failed"
        });
      } finally {
        setZonaLoading(false);
      }
    }, 800);
    return () => clearTimeout(geocodeTimer.current);
  }, [direccion, tel, tipoConsegna, zonaManuale]); // eslint-disable-line

  // ── Helper: converte "HH:MM" in minuti dall'inizio della giornata ────────
  const toMin = (t) => { if (!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; };
  const toHora = (m) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

  // ── Auto-imposta ora quando la zona viene rilevata ────────────────────────
  useEffect(() => {
    // La prima disponibilità ora arriva da previewOrderTiming. Questo vecchio
    // calcolo locale resta spento: la zona serve solo a mostrare badge/hint.
  }, [zonaInfo]); // eslint-disable-line

  // ── Calcolo slot forno + proposta delivery (cascade-aware, schedule-based) ──
  // L'algoritmo:
  //   1. proposeForNewOrder(ordenes, newOrder) simula la giornata del driver
  //      considerando tempoGiro reale (haversine lat/lon) per ogni ordine e
  //      la cascade dei giri. Ritorna { ok, consegnaPropostaH, motivo, aggregato }.
  //   2. Il forno è calcolato a parte: conta pizze nello slot 10min di consegnaProposta
  //      arretrato di tg_new. Se pieno propone slot successivo.
  //   3. Il risultato finale combina i 2 vincoli.
  useEffect(() => {
    if (tipoConsegna !== "DOMICILIO" || !hora || !zonaInfo?.zona) {
      setSlotFeedback(null);
      return;
    }
    const zona = zonaInfo.zona;
    // Cascata unica risolviTempoAndata: Google ?? Haversine ?? zona.tempoGiro.
    const tgNew = risolviTempoAndata(zonaInfo.durataAndataMin, zonaInfo.lat, zonaInfo.lon, zona);
    const horaFornMin = toMin(hora) - tgNew;
    if (horaFornMin < 0) { setSlotFeedback(null); return; }
    const horaForno = toHora(horaFornMin);
    const slotOf = (min) => {
      const mArr = Math.round(min / 10) * 10;
      const h = Math.floor(mArr / 60), m = mArr % 60;
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    };
    const slot = slotOf(horaFornMin);

    // ── Conta pizze nello slot 10min usando tempoGiro reale di ogni ordine ──
    const MAX_SLOT = 4;
    const countPizzeSlot = (targetSlot) =>
      (ordenes || [])
        .filter(o => ["EN_COCINA","POR_CONFIRMAR","LISTO"].includes(o.estado))
        .filter(o => {
          if (!o.hora || !o.zona) return false;
          const zonaO = ZONE_DELIVERY.find(z => z.id === o.zona);
          if (!zonaO) return false;
          // Sorgente unica: o.forno_out (cascade-aware backend). Fallback legacy per
          // ordini pre-migration: ricalcolo locale con snapshot durata_andata_min.
          // Snooze visivo (ui_offset_min) → conta lo slot effettivo in cui la pizza esce per la cucina.
          const tgO = tempoAndata(o, zonaO);
          const baseFornoStr = o.forno_out || null;
          const fornoStr = baseFornoStr
            ? applyUiOffset(baseFornoStr, o.ui_offset_min)
            : null;
          const fornoMin = fornoStr ? toMin(fornoStr) : ((toMin(o.hora) - tgO) + (Number(o.ui_offset_min)||0));
          return slotOf(fornoMin) === targetSlot;
        })
        .reduce((s, o) => s + (o.items||[])
          .filter(it => it.n !== "Entrega a domicilio" && it.cat !== "Bebidas")
          .reduce((a, it) => a + (parseInt(it.q)||1), 0), 0);

    const pizzeSlot = countPizzeSlot(slot);
    const slotOk = pizzeSlot < MAX_SLOT;

    // Slot forno successivo libero, se quello richiesto è pieno
    let slotSuggerito = null;
    let consegnaSuggerita = null;
    if (!slotOk) {
      const allSlots = [];
      for (let t = 19*60+30; t <= 23*60; t += 10) allSlots.push(toHora(t));
      const idx = allSlots.indexOf(slot);
      for (let i = idx+1; i < allSlots.length; i++) {
        if (countPizzeSlot(allSlots[i]) < MAX_SLOT) { slotSuggerito = allSlots[i]; break; }
      }
      if (slotSuggerito) consegnaSuggerita = toHora(toMin(slotSuggerito) + tgNew);
    }

    // ── Proposta schedule-aware (cascade) ──────────────────────────────────
    const newOrderInfo = {
      hora,
      zona: zona.id,
      zona_lat: zonaInfo.lat ?? null,
      zona_lon: zonaInfo.lon ?? null,
      durata_andata_min: zonaInfo.durataAndataMin ?? null,
    };
    const propose = proposeForNewOrder(ordenes || [], newOrderInfo);

    // Driver attuale (override real-time da DRIVER_STATO config)
    const isInGiro = driverStato?.stato === "IN_GIRO";
    let driverRientro = null;
    if (isInGiro && driverStato.partito_alle) {
      const zonaDriverObj = ZONE_DELIVERY.find(z => z.id === driverStato.zona);
      if (zonaDriverObj) {
        const partMin = (new Date(driverStato.partito_alle).getHours()) * 60
          + new Date(driverStato.partito_alle).getMinutes();
        // zonaDriverObj.tempoGiro: giro IN CORSO del driver, non un indirizzo da risolvere
        driverRientro = toHora(partMin + zonaDriverObj.tempoGiro);
      }
    }

    setSlotFeedback({
      // Forno
      horaForno, slot, slotOk, load: pizzeSlot,
      slotSuggerito, consegnaSuggerita,
      tgNew,
      // Driver real-time
      isInGiro, driverRientro,
      // Schedule-aware proposal
      propose,
    });
  }, [hora, zonaInfo, tipoConsegna, ordenes, driverStato]); // eslint-disable-line

  // ── Backend timing autoritativo (Step 2 anti-cerotto) ───────────────────
  // Su cambio di indirizzo / tipo consegna / hora / zona manuale, chiediamo al
  // backend la verità su zona/durata/source/forno_out/warnings/driver/giro.
  // Debounce 450ms per non martellare l'endpoint mentre l'operatore digita.
  // Input GREZZI: niente durata/zona/geo calcolati dal frontend.
  useEffect(() => {
    if (!visible) { setBackendTiming(null); return; }
    if (tipoConsegna === "DOMICILIO" && direccion.trim().length < 5) {
      setBackendTiming(null);
      return;
    }
    let cancelled = false;
    setBackendTiming(null);
    setBackendTimingLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.previewOrderTiming({
          tipo_consegna: tipoConsegna,
          direccion: tipoConsegna === "DOMICILIO" ? direccion.trim() : null,
          tel: tel || null,
          hora: hora || null,
          zona_manuale: tipoConsegna === "DOMICILIO" ? zonaManuale : false,
          zona: (tipoConsegna === "DOMICILIO" && zonaManuale) ? (zonaInfo?.zona?.id || null) : null,
        });
        if (!cancelled) setBackendTiming(res || null);
      } catch (e) {
        if (!cancelled) {
          setBackendTiming(null);
          console.warn("[previewOrderTiming] failed:", e?.message || e);
        }
      } finally {
        if (!cancelled) setBackendTimingLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); setBackendTimingLoading(false); };
  }, [visible, tipoConsegna, direccion, hora, zonaManuale]); // eslint-disable-line

  useEffect(() => {
    if (!visible || tipoConsegna !== "DOMICILIO" || !backendTiming) return;
    if (horaTouchedByOperator) return;
    const firstAvailable = backendTiming.suggested_hora || backendTiming.hora_propuesta || null;
    if (!firstAvailable || firstAvailable === hora) return;
    horaCustom.current = false;
    setForzaHora(false);
    setHora(firstAvailable);
  }, [visible, tipoConsegna, backendTiming, horaTouchedByOperator, hora]);

  // Prefill quando il modal si apre
  useEffect(() => {
    if (visible && prefill) {
      if (prefill.nombre)        setNombre(prefill.nombre);
      if (prefill.tel)           setTel(prefill.tel);
      if (prefill.canal)         setCanal(prefill.canal);
      if (prefill.hora)          setHora(prefill.hora);
      // tipo_consegna ora è derivato dall'indirizzo — se prefill ha un indirizzo, si attiva da solo
      if (prefill.tipo_consegna === "DOMICILIO" && prefill.direccion) setDireccion(prefill.direccion);
      if (prefill.direccion)     setDireccion(prefill.direccion);
      if (prefill.direccion_note) setDireccionNote(prefill.direccion_note);
    }
    if (visible) {
      horaCustom.current = false;
      setHoraTouchedByOperator(false);
    }
    if (visible && !prefill?.hora) {
      const n = new Date();
      setHora(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
    }
    if (visible && !reqIdRef.current) {
      reqIdRef.current = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10));
    }
    if (!visible) { reset(); setForzaHora(false); }
  }, [visible]); // eslint-disable-line

  // Reset forzaHora e horaCustom quando l'operatore apre il popup delivery o cambia l'indirizzo
  // (zona potrebbe cambiare → ricalcolo ora necessario anche se l'operatore aveva toccato il campo)
  useEffect(() => {
    if (!showDeliveryPopup) return; // non resettare alla CHIUSURA: preserva forzaHora fino al submit
    setForzaHora(false);
  }, [showDeliveryPopup, direccion]);

  // ── Render extras badge per un item ─────────────────────────────────────
  const extrasLabel = (item) => {
    if (!item.sub) return null;
    const matches = item.sub.match(/\+[^,]+/g) || [];
    if (!matches.length) return item.sub;
    const names = matches.map(m => m.replace(/^\+/, "").trim()).join(", ");
    const extra = matches.length;
    return `+${extra} extra · ${names}`;
  };

  // Stato delivery unificato — combina la proposta schedule-aware del driver
  // con il vincolo forno. Il bottone "Aplicar sugerencia" usa questo.
  const deliveryStatus = useMemo(() => {
    if (backendTimingLoading && tipoConsegna === "DOMICILIO") {
      return { isBlocked: false, selectedH: hora || null, firstAvailableH: null, sugeridoH: null, outOfServiceWindow: false };
    }
    // Step 2 anti-cerotto: se il backend ha risposto, la DECISIONE conflitto/
    // suggerimento viene da lì (fonte unica). slotFeedback locale resta solo
    // fallback hint quando il backend non ha ancora risposto.
    if (backendTiming && backendTiming.tipo_consegna === "DOMICILIO" && hora) {
      const after = (backendTiming.warnings || []).some(w => w.code === "after_hours");
      const firstAvailableH = backendTiming.suggested_hora || backendTiming.hora_propuesta || null;
      const selectedH = horaTouchedByOperator
        ? (backendTiming.hora_propuesta || hora)
        : (firstAvailableH || backendTiming.hora_propuesta || hora);
      const suggestedH = firstAvailableH || null;
      const blockedByBackend = !!backendTiming.driver?.has_conflict;
      return {
        isBlocked: horaTouchedByOperator && blockedByBackend,
        selectedH,
        firstAvailableH,
        sugeridoH: suggestedH,
        outOfServiceWindow: after,
        fromBackend: true,
        horaTouchedByOperator,
      };
    }
    const sf = slotFeedback;
    if (!sf || !hora) return { isBlocked: false, selectedH: hora || null, sugeridoH: null, outOfServiceWindow: false };
    if (sf.propose?.outOfServiceWindow) {
      return { isBlocked: true, selectedH: hora, sugeridoH: null, outOfServiceWindow: true };
    }
    const toM = (t) => { if (!t) return null; const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
    const toH = (m) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
    const horaMin = toM(hora);
    // Vincoli combinati: driver schedule (propose) + forno (consegnaSuggerita)
    const limits = [];
    if (sf.propose && !sf.propose.ok && Number.isFinite(sf.propose.consegnaPropostaMin)) limits.push(sf.propose.consegnaPropostaMin);
    if (!sf.slotOk && sf.consegnaSuggerita) limits.push(toM(sf.consegnaSuggerita));
    if (limits.length === 0) return { isBlocked: false, selectedH: hora, sugeridoH: null, outOfServiceWindow: false };
    const sugMin = Math.ceil(Math.max(...limits) / 5) * 5;
    return { isBlocked: horaMin < sugMin, selectedH: hora, sugeridoH: toH(sugMin), outOfServiceWindow: false };
  }, [slotFeedback, hora, backendTiming, backendTimingLoading, tipoConsegna, horaTouchedByOperator]);

  const pickupKitchenStatus = useMemo(() => {
    if (tipoConsegna === "DOMICILIO" || !hora) return null;
    const draftOrder = {
      id: "__draft_pickup__",
      estado: "POR_CONFIRMAR",
      hora,
      items,
    };
    return getKitchenCapacityStatus([...(ordenes || []), draftOrder], hora);
  }, [tipoConsegna, hora, items, ordenes]);
  const showDeliveryOutOfServiceAlert = tipoConsegna === "DOMICILIO" && deliveryStatus.outOfServiceWindow;
  const showDeliveryAvailabilityLoading = tipoConsegna === "DOMICILIO" && !!direccion && zonaLoading === true;
  const hasOperationalInfo = pickupKitchenStatus || showDeliveryOutOfServiceAlert || showDeliveryAvailabilityLoading;
  const itemQtyTotal = items.reduce((s, i) => s + i.q, 0);
  const isCompact = items.length > 5;
  const rowControlSize = isCompact ? 36 : 38;
  const clienteOk = nombre.trim().length > 0;
  const contactAvailable = tel.trim().length > 0;
  const deliveryZona = zonaInfo?.zona;
  const deliveryZonaOk = !!deliveryZona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
  const deliveryFornoOut = backendTiming?.forno_out || slotFeedback?.horaForno || null;
  const deliveryDisponibilidadTop = useMemo(() => {
    if (tipoConsegna !== "DOMICILIO" || !deliveryZonaOk) return [];
    return buildDisponibilidad(ordenes, deliveryZona.id, deliveryFornoOut);
  }, [tipoConsegna, deliveryZonaOk, deliveryZona?.id, deliveryFornoOut, ordenes]);
  const deliveryRecommendationRef = backendTiming?.suggested_hora || backendTiming?.hora_propuesta || hora;
  const topRecommendedCompatibleGiro = !horaTouchedByOperator
    ? findRecommendedCompatibleGiro(deliveryDisponibilidadTop, deliveryZona?.id, deliveryRecommendationRef)
    : null;

  return (
    <>
      {/* ── Overlay + Sheet principale ─────────────────────────────────── */}
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: visible ? "flex" : "none",
        flexDirection: "column", justifyContent: "flex-end",
        pointerEvents: visible ? "auto" : "none"
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)"
        }} />

        <div onClick={e => e.stopPropagation()} style={{
          position: "relative", background: C.carbone,
          borderRadius: "22px 22px 0 0",
          height: "92dvh", maxHeight: "92vh", display: "flex", flexDirection: "column",
          boxShadow: "0 -10px 40px rgba(0,0,0,.5)", overflow: "hidden"
        }}>

          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: isCompact ? "6px 0 2px" : "10px 0 4px", flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.fumo }} />
          </div>

          {/* ── Header: canal + tipo consegna ─────────────────────────── */}
          <div style={{
            padding: isCompact ? "4px 16px 8px" : "6px 18px 12px",
            borderBottom: `1px solid ${C.fumo}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0
          }}>
            <div>
              <div style={{ color: C.bianco, fontWeight: 800, fontSize: 18 }}>Nuevo pedido</div>
              <div style={{ display: "flex", gap: isCompact ? 6 : 8, marginTop: isCompact ? 6 : 8 }}>
                {[{ id: "TEL", label: "📞 Teléfono" }, { id: "WA", label: "💬 WhatsApp" }, { id: "BANCO", label: "🏪 Barra" }].map(c => (
                  <button key={c.id} onClick={() => setCanal(c.id)} style={{
                    background: canal === c.id ? C.rosso : "transparent",
                    border: `1.5px solid ${canal === c.id ? C.rosso : C.fumo}`,
                    color: canal === c.id ? "#fff" : C.grigio,
                    borderRadius: 20, padding: isCompact ? "4px 11px" : "5px 14px", fontSize: isCompact ? 12 : 13, fontWeight: 600, cursor: "pointer"
                  }}>{c.label}</button>
                ))}
              </div>
              {/* Indicatore automatico ritiro/domicilio — solo informativo */}
              <div style={{ marginTop: isCompact ? 4 : 6, fontSize: 12, color: tipoConsegna === "DOMICILIO" ? "#F97316" : C.grigio, fontWeight: 600 }}>
                {tipoConsegna === "DOMICILIO" ? "🛵 Entrega a domicilio" : "🏪 Retiro en local"}
              </div>
            </div>
            <button onClick={handleClose} style={{
              background: C.fumo, color: C.grigio, border: "none",
              borderRadius: "50%", width: 32, height: 32, fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
            }}>✕</button>
          </div>

          {/* ── Corpo: top fisso + lista prodotti con scroll dedicato ───── */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Form cliente + delivery cards */}
            <div style={{ padding: isCompact ? "6px 14px" : "8px 16px", borderBottom: `1px solid ${C.fumo}`, display: "flex", flexDirection: "column", gap: isCompact ? 6 : 8, flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: isCompact ? 8 : 10 }}>
                <div style={{
                  background: "rgba(255,255,255,0.035)",
                  border: `1px solid ${clienteOk ? "rgba(34,197,94,0.34)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 12,
                  padding: isCompact ? "6px 8px" : "8px 10px",
                  display: "flex", flexDirection: "column", gap: isCompact ? 5 : 6,
                  minWidth: 0
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 900, letterSpacing: .8, textTransform: "uppercase" }}>
                      Cliente
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {clienteOk && (
                        <span title="Datos cliente OK" style={{
                          width: 20, height: 20, borderRadius: "50%",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: "#22C55E", color: "#08210f", fontSize: 13, fontWeight: 900
                        }}>✓</span>
                      )}
                      <button type="button"
                        onClick={e => e.preventDefault()}
                        title={contactAvailable ? "Contacto cliente (no envía nada automáticamente)" : "Añade un teléfono para contactar"}
                        style={{
                          width: 30, height: 30, borderRadius: 8,
                          border: `1.5px solid ${contactAvailable ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.16)"}`,
                          background: contactAvailable ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)",
                          color: contactAvailable ? "#86efac" : "rgba(255,255,255,0.35)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, cursor: "pointer", flexShrink: 0
                        }}>
                        {canal === "WA" ? "💬" : "📞"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: isCompact ? 6 : 8, alignItems: "stretch" }}>
                    <div style={{ flex: 1.45, position: "relative", minWidth: 0 }}>
                      <input value={nombre}
                        onChange={e => { setNombre(e.target.value); setClienteId(null); setShowSugerencias(true); }}
                        onFocus={() => { setNombreFocus(true); setShowSugerencias(true); }}
                        onBlur={() => { setNombreFocus(false); setTimeout(() => setShowSugerencias(false), 200); }}
                        placeholder="Nombre *"
                        style={{
                          width: "100%", background: C.carbone2, boxSizing: "border-box",
                          border: `1.5px solid ${nombre.length > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)"}`,
                          borderRadius: 9, color: "#fff", padding: isCompact ? "6px 34px 6px 10px" : "8px 36px 8px 12px", fontSize: 14, fontWeight: 700
                        }} />
                      <button type="button"
                        onClick={() => setPreferito(p => !p)}
                        title={preferito ? "Quitar de preferidos" : "Guardar como preferido"}
                        style={{
                          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", cursor: "pointer",
                          fontSize: 18, padding: 4, lineHeight: 1,
                          color: preferito ? "#FACC15" : "rgba(255,255,255,0.35)",
                          filter: preferito ? "drop-shadow(0 0 4px rgba(250,204,21,0.55))" : "none"
                        }}>
                        {preferito ? "★" : "☆"}
                      </button>
                      {showSugerencias && sugerencias.length > 0 && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                          marginTop: 4, background: C.carbone2,
                          border: "1px solid rgba(255,255,255,0.18)", borderRadius: 9,
                          boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
                          maxHeight: 220, overflowY: "auto"
                        }}>
                          {sugerencias.map(c => (
                            <div key={c.id}
                              onMouseDown={() => pickCliente(c)}
                              style={{
                                padding: "8px 10px", cursor: "pointer", fontSize: 13,
                                borderBottom: "1px solid rgba(255,255,255,0.06)",
                                display: "flex", alignItems: "center", gap: 8
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <span style={{ color: "#fff", fontWeight: 600 }}>
                                {c.alias || c.nombre}
                              </span>
                              {c.vip && <span title={`VIP · ${c.ordini_30gg} pedidos en 30 días`} style={{ color: "#FACC15", fontSize: 14 }}>⭐</span>}
                              <span style={{ flex: 1 }} />
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
                                {c.zona || c.direccion || (c.tel ? c.tel : "")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input value={tel} onChange={e => setTel(e.target.value)}
                      placeholder="Tel (opcional)" type="tel"
                      style={{
                        flex: 1, minWidth: 120, background: C.carbone2,
                        border: "1.5px solid rgba(255,255,255,0.18)",
                        borderRadius: 9, color: "#fff", padding: isCompact ? "6px 10px" : "8px 12px", fontSize: 14
                      }} />
                  </div>
                  {clienteAbitual && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "#86efac", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.28)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>
                        Cliente habitual
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 700 }}>
                        {clienteAbitual.total_pedidos || 0} pedidos
                      </span>
                      {clienteAbitual.direccion && (
                        <span style={{ color: "#bbf7d0", fontSize: 11, fontWeight: 700 }}>Dirección guardada</span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{
                  background: tipoConsegna === "DOMICILIO" ? "rgba(168,85,247,0.07)" : "rgba(255,255,255,0.035)",
                  border: `1px solid ${tipoConsegna === "DOMICILIO" ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 12,
                  padding: isCompact ? "6px 8px" : "8px 10px",
                  display: "flex", flexDirection: "column", gap: isCompact ? 5 : 6,
                  minWidth: 0
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 900, letterSpacing: .8, textTransform: "uppercase" }}>
                      Dirección de entrega
                    </div>
                    <button type="button" onClick={() => setShowDeliveryPopup(true)} style={{
                      background: "rgba(250,204,21,0.15)",
                      border: "1.5px solid rgba(250,204,21,0.55)",
                      color: "#fde68a",
                      borderRadius: 9,
                      padding: isCompact ? "5px 8px" : "6px 10px",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: "pointer",
                      flexShrink: 0
                    }}>
                      {tipoConsegna === "DOMICILIO" ? "Ver opciones" : "Abrir planificador"}
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 0.8fr)", gap: isCompact ? 6 : 8, alignItems: "stretch", minWidth: 0 }}>
                    <button type="button" onClick={() => setShowDeliveryPopup(true)} style={{
                      display: "flex", alignItems: "center", gap: 9,
                      background: C.carbone2,
                      border: deliveryStatus.isBlocked
                        ? "1.5px solid rgba(239,68,68,0.55)"
                        : tipoConsegna === "DOMICILIO"
                        ? "1.5px solid rgba(168,85,247,0.42)"
                        : "1.5px solid rgba(255,255,255,0.15)",
                      borderRadius: 10,
                      padding: isCompact ? "6px 9px" : "8px 10px",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                      minWidth: 0
                    }}>
                      {tipoConsegna === "DOMICILIO" && deliveryZona && <ZonaBadge zona={deliveryZona} size="sm" />}
                      <span style={{ fontSize: tipoConsegna === "DOMICILIO" ? 14 : 17, flexShrink: 0 }}>
                        {tipoConsegna === "DOMICILIO" ? "📍" : "🏪"}
                      </span>
                      <span style={{
                        color: tipoConsegna === "DOMICILIO" ? "#fff" : "rgba(255,255,255,0.48)",
                        fontSize: 13,
                        fontWeight: tipoConsegna === "DOMICILIO" ? 800 : 600,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {tipoConsegna === "DOMICILIO" ? direccion : "Añadir dirección de entrega"}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, flexShrink: 0 }}>✏️</span>
                    </button>
                    <div style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.045)",
                      border: "1px solid rgba(255,255,255,0.11)",
                      borderRadius: 10,
                      padding: isCompact ? "5px 8px" : "6px 9px",
                      minWidth: 0
                    }}>
                      <div style={{ color: "rgba(255,255,255,0.44)", fontSize: 9, fontWeight: 900, letterSpacing: .7, textTransform: "uppercase" }}>
                        {tipoConsegna === "DOMICILIO" ? "Entrega propuesta" : "Retirar a las"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                        <input type="time" value={hora} onChange={e => setHoraFromOperator(e.target.value)}
                          style={{ background: "transparent", border: "none", color: "#fff", padding: 0, fontSize: isCompact ? 16 : 18, fontWeight: 900, width: 88, outline: "none", lineHeight: 1 }} />
                        {tipoConsegna === "DOMICILIO" && (
                          <span style={{
                            color: deliveryStatus.isBlocked ? "#fca5a5" : "#86efac",
                            background: deliveryStatus.isBlocked ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                            border: `1px solid ${deliveryStatus.isBlocked ? "rgba(239,68,68,0.30)" : "rgba(34,197,94,0.30)"}`,
                            borderRadius: 999,
                            padding: "2px 7px",
                            fontSize: 10,
                            fontWeight: 900,
                            whiteSpace: "nowrap"
                          }}>
                            {deliveryStatus.isBlocked ? "Revisar" : "Compatible"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {tipoConsegna === "DOMICILIO" && (
                    <div style={{ color: "rgba(255,255,255,0.48)", fontSize: 10, fontWeight: 800 }}>
                      Salida horno <span style={{ color: deliveryFornoOut ? "#fde68a" : "rgba(255,255,255,0.45)", fontFamily: "'DM Mono',monospace" }}>{deliveryFornoOut || "—"}</span>
                    </div>
                  )}
                  {tipoConsegna === "DOMICILIO" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {(backendTiming?.zona || deliveryZona?.id) && (
                        <span style={{ color: "#ddd6fe", background: "rgba(168,85,247,0.13)", border: "1px solid rgba(168,85,247,0.28)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>
                          {backendTiming?.zona || deliveryZona?.id}{deliveryZona?.nome ? ` ${deliveryZona.nome}` : ""}
                        </span>
                      )}
                      {(backendTiming?.durata_andata_min != null || zonaInfo?.durataAndataMin != null) && (
                        <span style={{ color: "#bfdbfe", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>
                          {backendTiming?.durata_andata_min ?? zonaInfo?.durataAndataMin} min
                        </span>
                      )}
                      {(backendTiming?.geo_source || zonaInfo?.metodo) && (
                        <span style={{ color: "rgba(255,255,255,0.62)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                          {backendTiming?.geo_source || zonaInfo?.metodo}
                        </span>
                      )}
                      {backendTimingLoading && !backendTiming && (
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700 }}>Calculando…</span>
                      )}
                    </div>
                  )}
                  {tipoConsegna === "DOMICILIO" && (backendTiming?.giro?.suggested || topRecommendedCompatibleGiro) && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.22)",
                      borderRadius: 9,
                      padding: isCompact ? "5px 7px" : "6px 8px",
                      color: "#bbf7d0",
                      fontSize: 11,
                      fontWeight: 800
                    }}>
                      <span style={{ color: "#86efac" }}>Alternativa</span>
                      <span>
                        Giro compatible {(backendTiming?.giro?.zona || topRecommendedCompatibleGiro?.zona || deliveryZona?.id || "").trim()}
                        {(backendTiming?.giro?.slot_hora || topRecommendedCompatibleGiro?.slotHora) ? ` · ${backendTiming?.giro?.slot_hora || topRecommendedCompatibleGiro.slotHora}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {tipoConsegna === "DOMICILIO" && (backendTiming?.driver?.has_conflict && horaTouchedByOperator) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fca5a5", fontSize: 11, fontWeight: 700 }}>
                  <span>⚠️ {backendTiming.driver.message || "Driver ocupado"}</span>
                  {backendTiming.suggested_hora && (
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>
                      · sugerido {backendTiming.suggested_hora} (no se aplica solo)
                    </span>
                  )}
                </div>
              )}

              {tipoConsegna === "DOMICILIO" && (backendTiming?.warnings || [])
                .filter(w => w.code !== "driver_conflict")
                .map((w, i) => (
                  <div key={i} style={{ color: "#fbbf24", fontSize: 10, fontWeight: 700 }}>• {w.message}</div>
                ))}

              {hasOperationalInfo && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  background: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                  border: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "1.5px solid rgba(239,68,68,0.40)" : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 9,
                  padding: isCompact ? "6px 8px" : "8px 10px",
                }}>
                  <div style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: .8,
                    textTransform: "uppercase",
                  }}>
                    Info operativa
                  </div>
                  {pickupKitchenStatus && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: pickupKitchenStatus.overloaded ? "#fca5a5" : "#86efac",
                    }}>
                      <span>{pickupKitchenStatus.overloaded ? "⚠️" : "✅"}</span>
                      <span style={{ flex: 1 }}>
                        {pickupKitchenStatus.overloaded
                          ? <>Horno sobrecargado: {pickupKitchenStatus.pizzas}/{pickupKitchenStatus.capacity} pizzas en {pickupKitchenStatus.windowMinutes} min.{pickupKitchenStatus.suggestedHora ? <> Sugerido: {pickupKitchenStatus.suggestedHora}</> : null}</>
                          : <>Horno ok: {pickupKitchenStatus.pizzas}/{pickupKitchenStatus.capacity} pizzas en {pickupKitchenStatus.windowMinutes} min</>}
                      </span>
                    </div>
                  )}
                  {showDeliveryOutOfServiceAlert && (
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fca5a5",
                      lineHeight: 1.4,
                    }}>
                      <span>🚨</span>
                      <span style={{ flex: 1 }}>
                        Delivery no disponible después de las 23:00.
                        <br />
                        <span style={{ color: "rgba(255,255,255,0.68)", fontWeight: 600 }}>
                          Abre el detalle de domicilio para forzarlo como excepción.
                        </span>
                      </span>
                    </div>
                  )}
                  {showDeliveryAvailabilityLoading && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.72)",
                    }}>
                      <span style={{ flex: 1 }}>
                        Calculando zona y disponibilidad de delivery...
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Pill zona delivery (solo nel popup) ── */}
              {false && tipoConsegna === "DOMICILIO" && direccion.trim().length >= 5 && (() => {
                const zona = zonaInfo?.zona;
                const sugg = zona ? suggerisciOrario(zona.id, ordenes) : null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    {/* Badge zona rilevata o loading */}
                    {zonaLoading && !zonaManuale && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                        📍 Detectando zona...
                      </span>
                    )}
                    {!zonaLoading && zona && !zonaManuale && (
                      <span style={zonaBadgeStyle(zona)}>
                        {zona.id} · {zona.nome}
                      </span>
                    )}
                    {!zonaLoading && !zona && !zonaManuale && zonaInfo !== null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, color: "rgba(255,200,50,0.8)", fontWeight: 600 }}>
                          ⚠️ Zona no detectada
                        </span>
                        {direccion.trim() && (
                          <a
                            href={`https://www.google.com/maps/dir/${encodeURIComponent("Plaza Italica 8, Roquetas de Mar")}/${encodeURIComponent(direccion.trim() + ", Roquetas de Mar")}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{
                              background: "#1D4ED8", color: "#fff",
                              borderRadius: 6, padding: "2px 9px",
                              fontSize: 11, fontWeight: 800, textDecoration: "none"
                            }}
                          >
                            🗺 Ver ruta
                          </a>
                        )}
                      </div>
                    )}
                    {/* Selezione manuale zona — se zona già selezionata mostra solo badge + reset */}
                    {!zonaLoading && (zonaManuale && zona ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ ...zonaBadgeStyle(zona), fontSize: 13 }}>{zona.id} · {zona.nome}</span>
                        <button onClick={() => { setZonaManuale(false); setZonaInfo(null); }} style={{
                          background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                          color: "rgba(255,255,255,0.4)", borderRadius: 6,
                          padding: "2px 8px", fontSize: 11, cursor: "pointer"
                        }}>↺ auto</button>
                      </div>
                    ) : (!zona && !zonaManuale) ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        {ZONE_DELIVERY.map(z => (
                          <button key={z.id} onClick={() => {
                            setZonaInfo({ zona: z, lat: null, lon: null, metodo: "manuale" });
                            setZonaManuale(true);
                          }} style={{
                            background: "transparent",
                            border: `2px solid ${z.colore}`,
                            color: z.colore,
                            borderRadius: 8,
                            padding: "4px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}>{z.id}</button>
                        ))}
                      </div>
                    ) : null)}
                    {/* Pill suggerimento orario — visibile sia auto che manuale */}
                    {sugg && (
                      <button onClick={() => setHoraFromOperator(sugg.orario)} style={{
                        background: "rgba(0,151,167,0.1)",
                        border: "1px solid rgba(0,151,167,0.4)",
                        borderRadius: 6, padding: "2px 10px",
                        color: "#0097A7", fontSize: 11, fontWeight: 700, cursor: "pointer"
                      }}>
                        → {sugg.orario} · ya {sugg.nOrdini} pedido{sugg.nOrdini !== 1 ? "s" : ""} {zona?.id}
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* ── Feedback slot forno (solo nel popup) ── */}
              {false && tipoConsegna === "DOMICILIO" && slotFeedback && (() => {
                const sf = slotFeedback;
                const sc = sf.scenario;

                // Colori base per scenario
                const isOk  = ["A","C","D"].includes(sc);
                const isWarn= ["E"].includes(sc);
                const isErr = ["B","F"].includes(sc);
                const bgCol  = isOk ? "rgba(34,197,94,0.08)"   : isWarn ? "rgba(251,191,36,0.08)"  : "rgba(249,115,22,0.10)";
                const bdCol  = isOk ? "rgba(34,197,94,0.35)"   : isWarn ? "rgba(251,191,36,0.40)"  : "rgba(249,115,22,0.45)";
                const txCol  = isOk ? "#86efac"                : isWarn ? "#fde68a"                : "#fed7aa";

                // Riga 1: stato forno
                const fornoRow = (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{isOk ? "✅" : "⚠️"}</span>
                    <span style={{ color: txCol, fontWeight: 700, fontSize: 12 }}>
                      {sf.slotOk
                        ? <>Salida horno a las {sf.horaForno} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({sf.load}/4)</span></>
                        : <>Horno lleno a las {sf.horaForno} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>({sf.load}/4)</span></>
                      }
                    </span>
                  </div>
                );

                // Riga slot suggerito (scenari B/F)
                const slotRow = (!sf.slotOk && sf.slotSuggerito) ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>→</span>
                    <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
                      Primer slot libre: horno {sf.slotSuggerito}
                    </span>
                    <button onClick={() => setHoraFromOperator(sf.consegnaSuggerita)} style={{
                      background: "rgba(249,115,22,0.2)", border: "1px solid rgba(249,115,22,0.5)",
                      color: "#F97316", borderRadius: 6, padding: "2px 8px",
                      fontSize: 11, fontWeight: 700, cursor: "pointer"
                    }}>→ Entrega {sf.consegnaSuggerita}</button>
                  </div>
                ) : null;

                // Riga driver (scenari C/D/E/F)
                let driverRow = null;
                if (sf.isInGiro) {
                  let driverMsg, driverColor;
                  if (sc === "C") {
                    driverMsg   = `🛵 Driver en camino · misma zona · puede llevar este pedido`;
                    driverColor = "#86efac";
                  } else if (sc === "D") {
                    driverMsg   = `🛵 Driver vuelve ~${sf.driverRientro} · OK para esta entrega`;
                    driverColor = "#86efac";
                  } else if (sc === "E") {
                    driverMsg   = `🛵 Driver vuelve ~${sf.driverRientro} · puede llegar tarde al horno (${sf.horaForno})`;
                    driverColor = "#fde68a";
                  } else if (sc === "F") {
                    driverMsg   = `🛵 Driver en camino (vuelve ~${sf.driverRientro}) · horno también lleno`;
                    driverColor = "#fca5a5";
                  }
                  driverRow = (
                    <div style={{ fontSize: 12, color: driverColor, fontWeight: 600, paddingTop: 2 }}>
                      {driverMsg}
                    </div>
                  );
                }

                // Blocco conflitto zona — mostrato sopra tutto, molto visibile
                const conflictRow = sf.zonaConflict ? (() => {
                  const zonaObjs = sf.zonaConflict.zone
                    .map(id => ZONE_DELIVERY.find(z => z.id === id))
                    .filter(Boolean);
                  return (
                    <div style={{
                      borderRadius: 9, padding: "10px 12px",
                      background: "rgba(239,68,68,0.12)",
                      border: "2px solid rgba(239,68,68,0.6)",
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16 }}>🚨</span>
                        <span style={{ color: "#fca5a5", fontWeight: 800, fontSize: 13 }}>
                          Ya hay entrega a las {hora} en zona
                        </span>
                        {zonaObjs.map(z => (
                          <span key={z.id} style={{
                            background: z.colore, color: "#fff",
                            borderRadius: 6, padding: "2px 9px",
                            fontSize: 12, fontWeight: 900
                          }}>{z.id}</span>
                        ))}
                        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                          · el driver no puede estar en dos zonas
                        </span>
                      </div>
                      {sf.slotSenzaConflitto && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>→</span>
                          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
                            Próxima hora libre:
                          </span>
                          <button onClick={() => setHoraFromOperator(sf.slotSenzaConflitto)} style={{
                            background: "rgba(34,197,94,0.2)",
                            border: "1px solid rgba(34,197,94,0.5)",
                            color: "#86efac", borderRadius: 6, padding: "3px 10px",
                            fontSize: 12, fontWeight: 800, cursor: "pointer"
                          }}>
                            → {sf.slotSenzaConflitto}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })() : null;

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {conflictRow}
                    <div style={{
                      borderRadius: 9, padding: "8px 12px",
                      background: bgCol, border: `1px solid ${bdCol}`,
                      display: "flex", flexDirection: "column", gap: 5,
                    }}>
                      {fornoRow}
                      {slotRow}
                      {driverRow}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Header prodotti: resta visibile sopra la lista scrollabile ─ */}
            <div style={{
              flexShrink: 0,
              padding: isCompact ? "7px 14px" : "9px 16px",
              borderBottom: `1px solid ${C.fumo}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              background: C.carbone
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                <span style={{ color: C.bianco, fontSize: isCompact ? 13 : 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: .5 }}>
                  Productos
                </span>
                <span style={{ color: C.grigio, fontSize: 12, fontWeight: 700 }}>
                  {items.length} línea{items.length !== 1 ? "s" : ""} · {itemQtyTotal} item{itemQtyTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                onClick={() => { setEditingItem(null); setPickerVisible(true); }}
                style={{
                  flexShrink: 0,
                  minHeight: 38,
                  background: "rgba(232,52,28,0.12)",
                  border: `1.5px solid ${C.rosso}88`,
                  borderRadius: 10,
                  color: C.rosso,
                  padding: isCompact ? "0 12px" : "0 14px",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: "pointer"
                }}>
                + Añadir
              </button>
            </div>

            {/* ── Lista items: unico scroll principale prodotti ─────────── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isCompact ? "8px 14px" : "10px 16px" }}>

              {items.length === 0 ? (
                /* Stato vuoto */
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", minHeight: 180, padding: isCompact ? "20px 0" : "32px 0", gap: isCompact ? 8 : 12, opacity: 0.5
                }}>
                  <span style={{ fontSize: isCompact ? 32 : 40 }}>🍕</span>
                  <div style={{ color: C.grigio, fontSize: 14, fontWeight: 600 }}>Todavía no hay nada</div>
                  <div style={{ color: C.grigio, fontSize: 12 }}>Pulsa «+» para añadir</div>
                </div>
              ) : (
	                items.map(item => (
	                  <div key={item._uid} style={{
	                    display: "flex", alignItems: "center", gap: isCompact ? 8 : 10,
	                    minHeight: isCompact ? 50 : 58,
	                    padding: isCompact ? "6px 8px" : "9px 10px",
	                    marginBottom: isCompact ? 5 : 6,
	                    background: C.carbone2,
	                    borderRadius: isCompact ? 10 : 12,
	                    border: `1px solid ${C.fumo}`,
	                    cursor: "pointer"
                  }}
                    onClick={() => handleEditItem(item)}
                  >
	                    <span style={{ fontSize: isCompact ? 18 : 22, flexShrink: 0 }}>{item.e}</span>
	                    <div style={{ flex: 1, minWidth: 0 }}>
	                      <div style={{ color: C.bianco, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.n}
                      </div>
	                      {item.sub && (
	                        <div title={extrasLabel(item)} style={{ color: "#a855f7", fontSize: 11, fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
	                          {extrasLabel(item)}
	                        </div>
	                      )}
	                    </div>
	                    <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 5 : 6, flexShrink: 0 }}>
	                      <button onClick={e => { e.stopPropagation(); adj(item._uid, -1); }} style={{
	                        background: C.fumo, color: C.bianco, border: "none",
	                        borderRadius: 7, width: rowControlSize, height: rowControlSize, fontSize: 16, fontWeight: 800,
	                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
	                      }}>−</button>
                      <span style={{ color: C.bianco, fontWeight: 800, minWidth: 18, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>
                        {item.q}
                      </span>
	                      <button onClick={e => { e.stopPropagation(); adj(item._uid, +1); }} style={{
	                        background: C.fumo, color: C.bianco, border: "none",
	                        borderRadius: 7, width: rowControlSize, height: rowControlSize, fontSize: 16, fontWeight: 800,
	                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
	                      }}>+</button>
                    </div>
                    <span style={{ color: C.grigio, fontSize: 12, fontWeight: 700, minWidth: 44, textAlign: "right", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
                      {(item.p * item.q).toFixed(2)}€
                    </span>
	                    <button onClick={e => { e.stopPropagation(); handleRemoveItem(item._uid); }} style={{
	                      background: "transparent", color: C.grigio, border: `1px solid ${C.fumo}`,
	                      borderRadius: 7, width: rowControlSize, height: rowControlSize,
	                      fontSize: 14, cursor: "pointer", padding: 0, flexShrink: 0
	                    }}>🗑</button>
	                  </div>
	                ))
	              )}
	            </div>

	            {/* Nota generale (opzionale, collassabile) */}
	            <div style={{ padding: isCompact ? "0 14px 3px" : "0 16px 4px", flexShrink: 0, borderTop: `1px solid ${C.fumo}` }}>
              <button
                onClick={() => setShowNotaGen(v => !v)}
                style={{
                  background: "transparent", border: "none", color: C.grigio,
                  fontSize: 12, cursor: "pointer", padding: "4px 0"
                }}>
                {showNotaGen ? "▲ Ocultar nota general" : "▼ Añadir nota general"}
              </button>
              {showNotaGen && (
                <textarea value={nota} onChange={e => setNota(e.target.value)}
                  placeholder="Notas generales del pedido..."
                  rows={2}
                  style={{
                    width: "100%", background: C.carbone2,
                    border: "1.5px solid rgba(255,255,255,0.18)",
                    borderRadius: 9, color: "#fff",
                    padding: "8px 10px", fontSize: 12, resize: "none",
                    marginTop: 6, boxSizing: "border-box"
                  }} />
              )}
            </div>
          </div>

	          {/* ── Footer: totale + conferma ──────────────────────────────── */}
	          <div style={{
	            padding: isCompact ? "9px 14px" : "12px 16px",
	            borderTop: `1px solid ${C.fumo}`,
	            display: "flex", justifyContent: "space-between", alignItems: "center",
	            flexShrink: 0, background: C.carbone2
	          }}>
	            <div>
	              <div style={{ color: C.grigio, fontSize: 11 }}>Total · {itemQtyTotal} item{itemQtyTotal !== 1 ? "s" : ""}</div>
	              <div style={{ color: C.verde, fontWeight: 800, fontSize: isCompact ? 20 : 22, fontFamily: "'DM Mono',monospace" }}>{total}€</div>
              {tipoConsegna === "DOMICILIO" && (
                <div style={{ color: "#fb923c", fontSize: 10, fontWeight: 600, marginTop: 1 }}>🛵 incl. {DELIVERY_FEE.toFixed(2).replace(".",",")}€ entrega</div>
              )}
              {descuentoImporte > 0 && (
                <div style={{ color: "#F59E0B", fontSize: 10, fontWeight: 700, marginTop: 1 }}>
                  -{descuentoImporte.toFixed(2)}€ descuento · subtotal {totaleBase.toFixed(2)}€
                </div>
              )}
              {tipoConsegna === "DOMICILIO" && !zonaAssegnata && (
                <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 700, marginTop: 2 }}>⚠️ Zona no detectada</div>
              )}
              {/* Descuento */}
	              <div style={{ marginTop: isCompact ? 6 : 8 }}>
                <DescuentoInput
                  tipo={descuentoTipo}
                  valor={descuentoValor}
                  onChange={(t, v) => { setDescuentoTipo(t); setDescuentoValor(v); }}
                  totaleBase={totaleBase}
                  compact
                />
              </div>
              {/* Ya pagado toggle */}
	              <div style={{ marginTop: isCompact ? 6 : 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => { setYaPagedo(v => !v); setMetodoPago(""); }} style={{
                  background: yaPagedo ? "rgba(34,197,94,0.15)" : "transparent",
                  border: `1.5px solid ${yaPagedo ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.15)"}`,
                  color: yaPagedo ? "#4ADE80" : "rgba(255,255,255,0.4)",
                  borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer"
                }}>
                  {yaPagedo ? "✅" : "⬜"} Ya pagado
                </button>
                {yaPagedo && (<>
                  <button onClick={() => setMetodoPago("efectivo")} style={{
                    background: metodoPago === "efectivo" ? "#16A34A" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${metodoPago === "efectivo" ? "#16A34A" : "rgba(255,255,255,0.15)"}`,
                    color: "#fff", borderRadius: 8, padding: "4px 12px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer"
                  }}>💵 Efectivo</button>
                  <button onClick={() => setMetodoPago("tarjeta")} style={{
                    background: metodoPago === "tarjeta" ? "#2563EB" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${metodoPago === "tarjeta" ? "#2563EB" : "rgba(255,255,255,0.15)"}`,
                    color: "#fff", borderRadius: 8, padding: "4px 12px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer"
                  }}>💳 Tarjeta</button>
                </>)}
              </div>
            </div>
            <button onClick={handleConfirm} disabled={!ok || submitting} style={{
              background: (!ok || submitting) ? C.fumo : C.rosso,
              color: (!ok || submitting) ? C.grigio : "#fff",
	              border: "none", borderRadius: 12,
	              minHeight: 44, padding: isCompact ? "11px 18px" : "14px 24px", fontWeight: 800, fontSize: 15,
              boxShadow: (!ok || submitting) ? "none" : `0 4px 16px ${C.rosso}55`,
              cursor: submitting ? "wait" : (ok ? "pointer" : "default")
            }}>
              {submitting ? "Confirmando…" : "✅ Confirmar pedido"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Delivery Popup ─────────────────────────────────────────────── */}
      {showDeliveryPopup && (() => {
        const zona = zonaInfo?.zona;
        const sf   = slotFeedback;
        const sc   = sf?.scenario;
        const isOk   = ["A","C","D"].includes(sc);
        const isWarn = sc === "E";
        const bgCol  = isOk ? "rgba(34,197,94,0.08)" : isWarn ? "rgba(251,191,36,0.08)" : "rgba(249,115,22,0.10)";
        const bdCol  = isOk ? "rgba(34,197,94,0.35)" : isWarn ? "rgba(251,191,36,0.40)" : "rgba(249,115,22,0.45)";
        const txCol  = isOk ? "#86efac"              : isWarn ? "#fde68a"               : "#fed7aa";
        const zonaOkForDisponibilidad = !!zona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
        // forno_out del nuovo ordine (fonte più affidabile prima): backend → hint locale.
        const newOrderFornoOut = backendTiming?.forno_out || slotFeedback?.horaForno || null;
        const deliveryDisponibilidad = (!zonaLoading && zonaOkForDisponibilidad)
          ? buildDisponibilidad(ordenes, zona.id, newOrderFornoOut)
          : [];
        const giroRecommendationRef = backendTiming?.suggested_hora || backendTiming?.hora_propuesta || hora;
        const recommendedCompatibleGiro = !horaTouchedByOperator
          ? findRecommendedCompatibleGiro(deliveryDisponibilidad, zona?.id, giroRecommendationRef)
          : null;

        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px"
          }} onClick={() => setShowDeliveryPopup(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#1a1a2e",
              borderRadius: 20,
              width: "100%", maxWidth: 880,
              padding: "0 0 24px",
              boxShadow: "0 8px 60px rgba(0,0,0,0.7)",
              maxHeight: "85vh", overflowY: "auto"
            }}>
              {/* Spacer top */}
              <div style={{ height: 4 }} />

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🛵</span>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>Entrega a domicilio</span>
                </div>
                <button onClick={() => setShowDeliveryPopup(false)} style={{
                  background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8,
                  color: "#fff", width: 32, height: 32, fontSize: 16, cursor: "pointer"
                }}>✕</button>
              </div>

              <div style={{ padding: "20px 20px 0", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>

                {/* ── Columna izquierda: dirección, hora, zona, status, confirmar ── */}
                <div style={{ flex: "1 1 320px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Dirección */}
                <div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700,
                    letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Dirección</div>
                  <input value={direccion} onChange={e => setDireccion(e.target.value)}
                    placeholder="Calle, número..."
                    autoFocus
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.07)",
                      border: "1.5px solid rgba(249,115,22,0.5)",
                      borderRadius: 10, color: "#fff", padding: "11px 14px",
                      fontSize: 15, fontWeight: 500, boxSizing: "border-box", outline: "none"
                    }} />
                  <input value={direccionNote} onChange={e => setDireccionNote(e.target.value)}
                    placeholder="🏠 Planta, timbre, referencias (opcional)"
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 10, color: "#fff", padding: "9px 14px",
                      fontSize: 13, marginTop: 8, boxSizing: "border-box", outline: "none"
                    }} />
                </div>

                {/* Hora */}
                <div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700,
                    letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Hora de entrega</div>
                  <input type="time" value={hora}
                    onChange={e => { setForzaHora(false); setHoraFromOperator(e.target.value); }}
                    style={{
                      background: forzaHora ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.07)",
                      border: forzaHora ? "2px solid rgba(251,191,36,0.7)" : "1.5px solid rgba(255,255,255,0.2)",
                      borderRadius: 10, color: "#fff", padding: "10px 14px",
                      fontSize: 18, fontWeight: 700, outline: "none"
                    }} />
                  {forzaHora && (
                    <div style={{ marginTop: 4, fontSize: 11, color: "#fde68a", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                      <span>⚠️</span> Hora forzada por operador
                    </div>
                  )}
                </div>

                {/* Zona */}
                {direccion.trim().length >= 3 && (
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700,
                      letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Zona</div>
                    {zonaLoading && !zonaManuale && (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>Detectando zona...</span>
                    )}
                    {/* Zona confermata: polygon o manuale */}
                    {!zonaLoading && zona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache") && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ZonaBadge zona={zona} size="lg" />
                          {zonaManuale && (
                            <button onClick={() => { setZonaManuale(false); setZonaInfo(null); }} style={{
                              background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                              color: "rgba(255,255,255,0.4)", borderRadius: 6,
                              padding: "3px 10px", fontSize: 11, cursor: "pointer"
                            }}>↺ auto</button>
                          )}
                        </div>
                        {zonaInfo?.displayName && !zonaManuale && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                            📍 {zonaInfo.displayName.split(",").slice(0,2).join(",")}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Zona non trovata o solo keyword — selezione manuale obbligatoria */}
                    {!zonaLoading && (!zona || (zonaInfo?.metodo === "keyword" && !zonaManuale)) && zonaInfo !== null && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {zonaInfo?.metodo === "keyword" && zona ? (
                          <span style={{ fontSize: 12, color: "rgba(255,200,50,0.9)", fontWeight: 700 }}>
                            ⚠️ Calle no encontrada — selecciona zona manualmente
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "rgba(255,200,50,0.8)", fontWeight: 600 }}>⚠️ No detectada —</span>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {ZONE_DELIVERY.map(z => (
                            <button key={z.id} onClick={() => {
                              setZonaInfo({ zona: z, lat: null, lon: null, metodo: "manuale" });
                              setZonaManuale(true);
                            }} style={{
                              background: "transparent", border: `2px solid ${z.colore}`,
                              color: z.colore, borderRadius: 8,
                              padding: "5px 12px", cursor: "pointer",
                              display: "inline-flex", flexDirection: "column",
                              alignItems: "center", lineHeight: 1, gap: 2
                            }}>
                              <span style={{ fontSize: 13, fontWeight: 900 }}>{z.id}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8 }}>
                                {(z.nomeBreve || z.nome).toUpperCase()}
                              </span>
                            </button>
                          ))}
                          {direccion.trim() && (
                            <a href={`https://www.google.com/maps/dir/${encodeURIComponent("Plaza Italica 8, Roquetas de Mar")}/${encodeURIComponent(direccion.trim() + ", Roquetas de Mar")}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ background: "#1D4ED8", color: "#fff", borderRadius: 6,
                                padding: "4px 12px", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                              🗺 Ver ruta
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Suggerimento giro esistente nella stessa zona */}
                {!zonaLoading && zona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache") && (() => {
                  const sugg = suggerisciOrario(zona.id, ordenes);
                  if (!sugg) return null;
                  const toM = (t) => { const [h,m]=t.split(":").map(Number); return h*60+m; };
                  const toH = (m) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
                  const nowMin = new Date().getHours()*60 + new Date().getMinutes();
                  const tgReal = risolviTempoAndata(zonaInfo?.durataAndataMin, zonaInfo?.lat, zonaInfo?.lon, zona);
                  const horaFornoMin = toM(sugg.orario) - tgReal;
                  const fattibile = horaFornoMin >= nowMin + 5;

                  if (fattibile) {
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(0,151,167,0.1)", border: "1.5px solid rgba(0,151,167,0.5)",
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16 }}>🛵</span>
                        <span style={{ color: "#67e8f9", fontWeight: 700, fontSize: 13, flex: 1 }}>
                          Ya hay {sugg.nOrdini} pedido{sugg.nOrdini !== 1 ? "s" : ""} en {zona.id} a las {sugg.orario}
                        </span>
                        <button onClick={() => setHoraFromOperator(sugg.orario)} style={{
                          background: "rgba(0,151,167,0.3)", border: "1px solid rgba(0,151,167,0.7)",
                          color: "#fff", borderRadius: 8, padding: "6px 14px",
                          fontSize: 13, fontWeight: 800, cursor: "pointer"
                        }}>→ Añadir a este giro</button>
                      </div>
                    );
                  } else {
                    // Slot troppo vicino — trova il prossimo slot fattibile
                    const toH10 = (m) => { const r = Math.ceil(m/10)*10; return toH(r); };
                    const minForno = nowMin + 5;
                    const minConsegna = minForno + tgReal;
                    const prossimoSlot = toH10(minConsegna);
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(251,191,36,0.08)", border: "1.5px solid rgba(251,191,36,0.45)",
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13, flex: 1 }}>
                          Giro {zona.id} {sugg.orario} demasiado cerca — siguiente slot: {prossimoSlot}
                        </span>
                        <button onClick={() => setHoraFromOperator(prossimoSlot)} style={{
                          background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.6)",
                          color: "#fde68a", borderRadius: 8, padding: "6px 14px",
                          fontSize: 13, fontWeight: 800, cursor: "pointer"
                        }}>→ {prossimoSlot}</button>
                      </div>
                    );
                  }
                })()}

                {/* ── Status unificato: forno + driver (schedule-aware cascade) ── */}
                {(deliveryStatus.fromBackend || (!backendTimingLoading && sf)) && hora && zona && (() => {
                  if (deliveryStatus.fromBackend && backendTiming) {
                    const selectedH = deliveryStatus.selectedH || hora;
                    const firstAvailableH = deliveryStatus.firstAvailableH || deliveryStatus.sugeridoH;
                    const driverConflict = !!deliveryStatus.isBlocked;
                    const hasAlternative = driverConflict && firstAvailableH && firstAvailableH !== selectedH;
                    const fornoOut = backendTiming.forno_out || sf?.horaForno || "—";
                    const load = sf?.load != null ? ` (${sf.load}/4)` : "";

                    if (deliveryStatus.outOfServiceWindow) {
                      return (
                        <div style={{ borderRadius: 10, padding: "12px 14px",
                          background: forzaHora ? "rgba(251,191,36,0.10)" : "rgba(239,68,68,0.12)",
                          border: forzaHora ? "1.5px solid rgba(251,191,36,0.5)" : "2px solid rgba(239,68,68,0.6)",
                          display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{forzaHora ? "⚠️" : "🚨"}</span>
                            <span style={{ color: forzaHora ? "#fde68a" : "#fca5a5", fontWeight: 800, fontSize: 14 }}>
                              Delivery no disponible después de las 23:00. Puedes forzarlo solo como excepción especial.
                            </span>
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, paddingLeft: 26, lineHeight: 1.45 }}>
                            No se aplicará ninguna sugerencia automática fuera del horario normal.
                          </div>
                        </div>
                      );
                    }

                    if (driverConflict) {
                      return (
                        <div style={{ borderRadius: 10, padding: "12px 14px",
                          background: forzaHora ? "rgba(251,191,36,0.10)" : "rgba(239,68,68,0.12)",
                          border: forzaHora ? "1.5px solid rgba(251,191,36,0.5)" : "2px solid rgba(239,68,68,0.6)",
                          display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{forzaHora ? "⚠️" : "🚨"}</span>
                            <span style={{ color: forzaHora ? "#fde68a" : "#fca5a5", fontWeight: 800, fontSize: 14 }}>
                              Hora pedida: {selectedH}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", paddingLeft: 26, lineHeight: 1.45 }}>
                            {backendTiming.driver?.message || "Driver ocupado"}
                          </div>
                          {hasAlternative && (
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", paddingLeft: 26 }}>
                              Primera hora disponible: <strong style={{ color: "#86efac", fontWeight: 900, fontSize: 15 }}>{firstAvailableH}</strong>
                            </div>
                          )}
                          {!forzaHora && (
                            <div style={{ paddingLeft: 26 }}>
                              <button onClick={() => setForzaHora(true)} style={{
                                background: "rgba(251,191,36,0.12)", border: "1.5px solid rgba(251,191,36,0.6)",
                                color: "#fde68a", borderRadius: 8, padding: "5px 12px",
                                fontSize: 12, fontWeight: 800, cursor: "pointer"
                              }}>
                                ⚠️ Confirmar {selectedH} forzado
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.45)",
                        display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>✅</span>
                          <span style={{ color: "#86efac", fontWeight: 800, fontSize: 14 }}>
                            {recommendedCompatibleGiro
                              ? `Entrega separada seleccionada: ${selectedH}`
                              : `${horaTouchedByOperator ? "Propón al cliente" : "Primera hora disponible"}: ${selectedH}`}
                          </span>
                        </div>
                        {recommendedCompatibleGiro && (
                          <div style={{ fontSize: 12, color: "#67e8f9", fontWeight: 600, paddingLeft: 24, lineHeight: 1.4 }}>
                            🛵 Giro recomendado: {recommendedCompatibleGiro.slotHora} · pulsa «Usar giro» para usarlo
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", paddingLeft: 24 }}>
                          Salida horno {fornoOut}{load}
                        </div>
                        <div style={{ fontSize: 12, color: "#86efac", fontWeight: 600, paddingLeft: 24 }}>
                          🛵 Driver disponible
                        </div>
                      </div>
                    );
                  }

                  const toM = (t) => { if (!t) return null; const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
                  const toH = (m) => `${String(Math.floor(m/60)%24).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
                  const horaMin = toM(hora);
                  const isOutOfService = deliveryStatus.outOfServiceWindow || sf.propose?.outOfServiceWindow;

                  if (isOutOfService) {
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: forzaHora ? "rgba(251,191,36,0.10)" : "rgba(239,68,68,0.12)",
                        border: forzaHora ? "1.5px solid rgba(251,191,36,0.5)" : "2px solid rgba(239,68,68,0.6)",
                        display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{forzaHora ? "⚠️" : "🚨"}</span>
                          <span style={{ color: forzaHora ? "#fde68a" : "#fca5a5", fontWeight: 800, fontSize: 14 }}>
                            Delivery no disponible después de las 23:00. Puedes forzarlo solo como excepción especial.
                          </span>
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, paddingLeft: 26, lineHeight: 1.45 }}>
                          No se aplicará ninguna sugerencia automática fuera del horario normal.
                        </div>
                      </div>
                    );
                  }

                  // ── Sintesi vincoli per il render (display) ─────────────────────
                  // Costruiti da: sf.propose (driver schedule cascade) + forno
                  const driverConflicts = []; // {zona, hora, rientroH, rientroM} — giri bloccanti
                  const constraints = [];

                  // Vincolo forno (slot pizze pieno)
                  if (!sf.slotOk && sf.consegnaSuggerita) {
                    constraints.push({
                      kind: "forno",
                      minHora: toM(sf.consegnaSuggerita),
                      reason: `Horno lleno a las ${sf.slotSuggerito} (${sf.load}/4)`
                    });
                  }

                  // Vincolo driver: usa sf.propose (schedule-aware con cascade reale)
                  if (sf.propose && !sf.propose.ok) {
                    // Estrai giri bloccanti dalla simulazione (cascadeati realisticamente)
                    const giriBloccanti = (sf.propose.sim?.giri || [])
                      .filter(g => g.horaMin < horaMin);
                    giriBloccanti.forEach(g => {
                      driverConflicts.push({
                        zona: g.zona, hora: toH(g.horaMin),
                        // rientro REALE cascadeato, non teorico
                        rientroM: g.rientroMin, rientroH: toH(g.rientroMin)
                      });
                    });
                    constraints.push({
                      kind: "driverFuture",
                      minHora: sf.propose.consegnaPropostaMin,
                      reason: driverConflicts.length === 0 ? sf.propose.motivo : null,
                    });
                  }

                  // Override real-time driver IN_GIRO (DRIVER_STATO config) —
                  // aggiunge il check solo se non già coperto da propose
                  if (sf.isInGiro && sf.driverRientro && (!sf.propose || sf.propose.ok)) {
                    const driverMin = Math.ceil((toM(sf.driverRientro) + (sf.tgNew || zona.tempoGiro)) / 5) * 5;
                    const driverZona = driverStato?.zona || "otra zona";
                    constraints.push({
                      kind: "driverNow",
                      minHora: driverMin,
                      reason: `Driver en ${driverZona} ahora · vuelve ~${sf.driverRientro}`
                    });
                  }

                  // ── STATO OK ─────────────────────────────────────
                  if (constraints.length === 0) {
                    // Driver line dipende dall'aggregazione same-zone-slot e da DRIVER_STATO
                    let driverLine = `🛵 Driver disponible`;
                    if (sf.propose?.aggregato) {
                      driverLine = `🛵 Agregar al giro ${zona.id} ${sf.propose.giroEsistente?.hora} (${(sf.propose.giroEsistente?.count || 0) + 1}/${zona.maxOrdiniPerGiro})`;
                    } else if (sf.isInGiro && sf.driverRientro) {
                      driverLine = `🛵 Driver vuelve ~${sf.driverRientro} · OK`;
                    }
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.45)",
                        display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>✅</span>
                          <span style={{ color: "#86efac", fontWeight: 800, fontSize: 14 }}>
                            Propón al cliente: {hora}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", paddingLeft: 24 }}>
                          Salida horno {sf.horaForno} ({sf.load}/4)
                        </div>
                        <div style={{ fontSize: 12, color: "#86efac", fontWeight: 600, paddingLeft: 24 }}>
                          {driverLine}
                        </div>
                      </div>
                    );
                  }

                  // ── Stato non OK: blocco o warning ───────────────
                  // sugeridoH già calcolato in deliveryStatus useMemo (single source of truth)
                  const sugeridoH = deliveryStatus.sugeridoH || "??:??";
                  const isBlocked = deliveryStatus.isBlocked;

                  // Helper: una riga per ogni "tipo" di vincolo, aggregando i driverFuture
                  const renderConstraintLines = (color) => {
                    const lines = [];
                    constraints.forEach((c, i) => {
                      if (c.kind === "driverFuture" && driverConflicts.length > 0) {
                        const maxRientro = driverConflicts.reduce((a, b) => a.rientroM > b.rientroM ? a : b);
                        const elenco = driverConflicts
                          .map(d => `${d.zona} ${d.hora}`)
                          .join(" · ");
                        lines.push(
                          <div key={`c-${i}`} style={{ fontSize: 12, color, paddingLeft: 24, lineHeight: 1.5 }}>
                            🛵 Driver ocupado hasta ~{maxRientro.rientroH}
                            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>
                              Pedidos en curso: {elenco}
                            </div>
                          </div>
                        );
                      } else if (c.reason) {
                        lines.push(
                          <div key={`c-${i}`} style={{ fontSize: 12, color, paddingLeft: 24 }}>
                            · {c.reason}
                          </div>
                        );
                      }
                    });
                    return lines;
                  };

                  // ── STATO BLOCCATO ───────────────────────────────
                  // Se l'operatore ha forzato → box ridotto, conferma forzata in basso
                  if (isBlocked && forzaHora) {
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(251,191,36,0.10)", border: "1.5px solid rgba(251,191,36,0.5)",
                        display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>⚠️</span>
                          <span style={{ color: "#fde68a", fontWeight: 800, fontSize: 13 }}>
                            Hora {hora} forzada — el driver puede llegar tarde
                          </span>
                        </div>
                        <div style={{ paddingLeft: 24 }}>
                          <button onClick={() => setForzaHora(false)} style={{
                            background: "transparent", border: "1px solid rgba(255,255,255,0.25)",
                            color: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "4px 12px",
                            fontSize: 12, fontWeight: 700, cursor: "pointer"
                          }}>↩ Usar sugerencia {sugeridoH}</button>
                        </div>
                      </div>
                    );
                  }

                  if (isBlocked) {
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(239,68,68,0.12)", border: "2px solid rgba(239,68,68,0.6)",
                        display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🚨</span>
                          <span style={{ color: "#fca5a5", fontWeight: 800, fontSize: 14 }}>
                            {hora} no es posible
                          </span>
                        </div>
                        {renderConstraintLines("rgba(255,255,255,0.75)")}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, paddingLeft: 24, flexWrap: "wrap" }}>
                          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                            Hora sugerida: <strong style={{ color: "#86efac", fontWeight: 900, fontSize: 15 }}>{sugeridoH}</strong>
                          </span>
                          <button onClick={() => setForzaHora(true)} style={{
                            background: "rgba(251,191,36,0.12)", border: "1.5px solid rgba(251,191,36,0.6)",
                            color: "#fde68a", borderRadius: 8, padding: "5px 12px",
                            fontSize: 12, fontWeight: 800, cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5
                          }} title="Forzar la hora original — el driver puede llegar tarde">
                            ⚠️ Forzar {hora}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // ── STATO ATTENZIONE: hora OK ma con vincoli noti ─────
                  return (
                    <div style={{ borderRadius: 10, padding: "12px 14px",
                      background: "rgba(251,191,36,0.10)", border: "1.5px solid rgba(251,191,36,0.5)",
                      display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <span style={{ color: "#fde68a", fontWeight: 800, fontSize: 14 }}>
                          Propón al cliente: {hora} <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.55)", fontSize: 12 }}>· ajustado</span>
                        </span>
                      </div>
                      {renderConstraintLines("rgba(255,255,255,0.7)")}
                    </div>
                  );
                })()}

                {/* Tasto conferma — 3 stati visivi:
                    1. OK / sin zona     → verde (colore zona) "Entrega en {Q} confirmada"
                    2. BLOCKED no forzato → verde, APPLICA la sugerencia al click
                    3. BLOCKED forzato    → arancione/giallo, conferma hora forzata
                */}
                {(() => {
                  const { isBlocked, selectedH, sugeridoH, outOfServiceWindow } = deliveryStatus;
                  const zonaOk = zona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
                  let bg, label, onClick;
                  if (isBlocked && forzaHora) {
                    // Caso forzato — visivamente arancione/giallo per segnalare scelta non standard
                    bg = "linear-gradient(135deg, #F59E0B, #D97706)";
                    label = `⚠️ Confirmar ${selectedH || hora} forzado`;
                    onClick = () => {
                      if (deliveryStatus.fromBackend && selectedH && selectedH !== hora) {
                        setHoraFromOperator(selectedH);
                      }
                      setShowDeliveryPopup(false);
                    };
                  } else if (isBlocked && outOfServiceWindow) {
                    // Fuori orario servizio: nessuna sugerencia da applicare, solo forzatura esplicita.
                    bg = "linear-gradient(135deg, #F59E0B, #D97706)";
                    label = "⚠️ Forzar como excepción";
                    onClick = () => setForzaHora(true);
                  } else if (isBlocked && sugeridoH) {
                    // Caso BLOCKED non forzato — il click applica la prima disponibilità backend
                    bg = "linear-gradient(135deg, #16A34A, #15803D)";
                    label = `✅ Aplicar primera disponible ${sugeridoH} y confirmar`;
                    onClick = () => { setHoraFromOperator(sugeridoH); setShowDeliveryPopup(false); };
                  } else {
                    // Caso OK normale
                    bg = zonaOk ? zona.colore : "rgba(249,115,22,0.7)";
                    label = recommendedCompatibleGiro && selectedH
                      ? `✓ Confirmar entrega separada ${selectedH}`
                      : deliveryStatus.fromBackend && selectedH
                      ? `✓ Confirmar entrega ${selectedH}`
                      : zonaOk ? `✓ Entrega en ${zona.id} confirmada` : "✓ Confirmar dirección";
                    onClick = () => {
                      if (deliveryStatus.fromBackend && selectedH && selectedH !== hora) {
                        setHora(selectedH);
                      }
                      setShowDeliveryPopup(false);
                    };
                  }
                  return (
                    <button onClick={onClick} style={{
                      width: "100%", padding: "15px",
                      background: bg,
                      border: "none", borderRadius: 12,
                      color: "#fff", fontWeight: 900, fontSize: 16,
                      cursor: "pointer", marginTop: 4,
                      boxShadow: zonaOk && !isBlocked ? `0 4px 20px ${zona.colore}55`
                        : isBlocked && forzaHora ? "0 4px 20px rgba(245,158,11,0.45)"
                        : isBlocked ? "0 4px 20px rgba(22,163,74,0.45)"
                        : "none"
                    }}>
                      {label}
                    </button>
                  );
                })()}
                </div>

                {/* ── Columna derecha: card Disponibilidad (lateral en desktop/tablet,
                    debajo en móvil via flex-wrap). Misma lógica de presentación. ── */}
                {!zonaLoading && zonaOkForDisponibilidad && (
                  <div style={{ flex: "1 1 300px", minWidth: 260 }}>
                    {(() => {
                      const disp = deliveryDisponibilidad;
                      return (
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 800,
                            letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Disponibilidad</div>
                          {disp.length === 0 ? (
                            <span style={{ fontSize: 14, color: "#86efac" }}>Sin giros activos · todo libre</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {disp.slice(0, 3).map(r => {
                                const isCompat = r.kind === "compatible";
                                const isNoAgg  = r.kind === "no_agregable";
                                const statusLabel = isCompat
                                  ? `Usar giro ${r.slotHora} →`
                                  : isNoAgg
                                  ? "No agregable"
                                  : (r.conflicto ? "Ocupado ⚠" : "Ocupado");
                                const statusColor = isCompat
                                  ? "#67e8f9"
                                  : isNoAgg
                                  ? "rgba(255,255,255,0.45)"
                                  : (r.conflicto ? "#fca5a5" : "rgba(255,255,255,0.5)");
                                return (
                                  <div key={r.key}
                                    onClick={isCompat ? () => setHoraFromOperator(r.slotHora) : undefined}
                                    title={isCompat
                                      ? `Agregar al giro ${r.zona} ${r.slotHora}`
                                      : isNoAgg
                                      ? `Giro ${r.zona} ${r.slotHora}: la pizza nueva saldría del horno demasiado tarde para este giro`
                                      : undefined}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10, fontSize: 15,
                                      padding: "10px 12px", borderRadius: 10,
                                      cursor: isCompat ? "pointer" : "default",
                                      background: isCompat ? "rgba(0,151,167,0.20)" : "rgba(255,255,255,0.04)",
                                      border: isCompat ? "1.5px solid rgba(0,151,167,0.75)" : "1px solid rgba(255,255,255,0.10)",
                                      opacity: isNoAgg ? 0.7 : 1,
                                    }}>
                                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: "#fff", minWidth: 104 }}>{r.range}</span>
                                    <span style={{
                                      fontSize: 14, fontWeight: 800, color: "#a5f3fc",
                                      background: isCompat ? "rgba(0,151,167,0.30)" : "rgba(0,151,167,0.12)",
                                      border: "1.5px solid rgba(0,151,167,0.85)", borderRadius: 7, padding: "2px 9px",
                                      cursor: isCompat ? "pointer" : "default"
                                    }}>[{r.zona}]</span>
                                    <span style={{
                                      marginLeft: "auto", fontWeight: 800, fontSize: 14,
                                      color: isCompat ? "#0b1220" : statusColor,
                                      background: isCompat ? "#67e8f9" : "transparent",
                                      borderRadius: isCompat ? 8 : 0,
                                      padding: isCompat ? "5px 12px" : 0,
                                    }}>
                                      {statusLabel}{r.count > 1 ? ` ·${r.count}` : ""}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ItemPickerModal ────────────────────────────────────────────── */}
      <ItemPickerModal
        visible={pickerVisible}
        onClose={() => { setPickerVisible(false); setEditingItem(null); }}
        onAdd={handleAdd}
        onUpdate={handleUpdate}
        itemEsistente={editingItem}
      />
    </>
  );
};

export default NuevoPedidoModal;
