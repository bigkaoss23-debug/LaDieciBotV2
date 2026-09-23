import { useState, useEffect, useRef, useMemo } from 'react';
import { C, genId, INGREDIENTI, calcTotale, DELIVERY_FEE, aplicarDescuento } from '../constants';
import { api } from '../api';
import { assegnaZonaDaKeyword, suggerisciOrario, zonaBadgeStyle, ZonaBadge, ZONE_DELIVERY, risolviTempoAndata, tempoAndata, proposeForNewOrder, BUFFER_OPS_DRIVER_MIN } from '../zones';
import ItemPickerModal from './ItemPickerModal';
import { applyUiOffset } from '../utils/uiOffset';
import { createLatestOnly, shouldGeocode, GEOCODE_DEBOUNCE_MS } from '../utils/nuevoPedidoGeocode';
import DescuentoInput from './ui/DescuentoInput';
import { getKitchenCapacityStatus, isPizzaItem } from '../core/kitchen/capacity';
import { formatManualGiroLabel, giroEarliestDeadlineMs, orderDeadlineHHMM, formatMadridHHMM } from './cocina/manualGiroCocina';

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

// [ENTREGA-MODAL] ▲/▼ del selettore PROGRAMADO: sposta un HH:MM di `delta` minuti (giro dell'orologio).
// Solo input dell'operatore: nessuna deadline derivata qui.
function shiftHoraHHMM(hora, delta) {
  const min = horaToMinStrict(hora);
  if (min == null) return null;
  const t = (((min + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function buildClosingOverrideNota(nota, hora) {
  const base = String(nota || "").trim();
  if (base.includes(CLOSING_TIME_OVERRIDE_MARKER)) return base;
  const marker = `[${CLOSING_TIME_OVERRIDE_MARKER} ${hora}]`;
  return base ? `${base}\n${marker}` : marker;
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
  // HOTFIX P1A: guardia "last-wins" per resolveAddress (vedi utils/nuevoPedidoGeocode).
  const latestGeocode = useRef(createLatestOnly());

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
  const [driverStato]    = useState(null);   // [FDV1] sempre null: nessuna telemetria rider

  // Scelta giro dell'operatore (popup GIRO → Unir)
  // giroIntent: null = pedido separado · { giro_id } = AGREGAR · { with_order_id } = CREAR GIRO
  const [giroIntent,  setGiroIntent]  = useState(null);

  // [ENTREGA-MODAL 2026-09-23] Popup "Entrega a domicilio": tre modalità esclusive.
  //   DIRECTO    → hora = proposta ASAP del backend (hora_preview della preview senza hora)
  //   PROGRAMADO → hora = ora scelta dall'operatore (unica ora modificabile a mano)
  //   GIRO       → hora = proposta ASAP + giro_intent sul giro compatibile scelto
  // entregaAsap = previewDeliveryV1 SENZA hora: deadline/compatibilità di un ordine "appena possibile".
  const [entregaModo,    setEntregaModo]    = useState("DIRECTO");
  const [entregaAsap,    setEntregaAsap]    = useState(null);
  const [programadoHora, setProgramadoHora] = useState("");
  const [giroSelKey,     setGiroSelKey]     = useState("");
  const [ahoraMs,        setAhoraMs]        = useState(() => Date.now());
  const [giroResumenId,  setGiroResumenId]  = useState("");

  // ItemPickerModal state
  const [pickerVisible,   setPickerVisible]   = useState(false);
  const [editingItem,     setEditingItem]     = useState(null); // null = nuovo, item = modifica

  // ── Tipo consegna: si determina automaticamente dall'indirizzo ─────────
  // Se l'indirizzo è compilato → DOMICILIO, altrimenti → RITIRO
  const tipoConsegna = direccion.trim().length > 0 ? "DOMICILIO" : "RITIRO";
  // [FDV1] Frozen Delivery V1: ogni DOMICILIO nasce con deadline = creazione + 55' (backend) e il giro lo decide
  // l'operatore. Niente rider / slot driver / hora scelta a mano per il delivery.
  const isFdv1Delivery = tipoConsegna === "DOMICILIO";

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
    setGiroIntent(null);
    setEntregaModo("DIRECTO"); setEntregaAsap(null); setProgramadoHora(""); setGiroSelKey(""); setGiroResumenId("");
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
      // [ORIGINE-ORDINI 2026-09-22] Nuevo Pedido ha due sole origini: TEL e BANCO.
      //   TEL   = richiesta arrivata dall'esterno (telefonata, oppure messaggio
      //           ricevuto sul telefono della pizzeria e trascritto dall'operatore).
      //   BANCO = ordine nato in loco (banco, terrazza, consumazione locale).
      // Il bottone "💬 WhatsApp" è stato rimosso per decisione business: un ordine
      // WhatsApp trascritto a mano è un TEL. Di conseguenza questo percorso non
      // produce più né "MANUAL" né "WA":
      //   - "MANUAL" resta solo come valore LEGACY degli ordini storici (accettato
      //     in lettura dal tab Tel via belongsToPedidos, mai più scritto da qui);
      //   - "WA" resta riservato al flusso bot, che non passa da questo modal.
      // Il fallback del ternario è TEL, non MANUAL: se un prefill inietta un valore
      // sconosciuto (era il bug BARRA→MANUAL del microfix 3b14c6f) l'ordine finisce
      // nel bucket telefonico corretto e nel tab Tel, non in una discarica.
      // wa_id resta vuoto: NON è un marcatore d'origine. (Il backend LIVE ci scrive
      // comunque il tel — difetto noto e documentato, fuori da questo ciclo.)
      canal: canal === "BANCO" ? "BANCO" : "TEL",
      wa_id: "",
      items: items.map(i => ({ ...i })),
      nota: notaFinale, hora, ts: Date.now(), estado: "POR_CONFIRMAR",
      tipo_consegna: tipoConsegna,
      // [FDV1] il backend fissa delivery_deadline_at = ts + 55' nella INSERT; `hora` resta la promessa al cliente.
      ...(tipoConsegna === "DOMICILIO" && giroIntent ? { giro_intent: giroIntent } : {}),
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

  // [FDV1] DRIVER_STATO non viene più letto: il rider non è una variabile del Planner (driverStato resta null).

  // Traccia se l'operatore ha toccato manualmente l'orario
  const horaCustom = useRef(false);
  const setHoraFromOperator = (nextHora) => {
    horaCustom.current = true;
    setHoraTouchedByOperator(true);
    setHora(nextHora);
    // [ENTREGA-MODAL] un'ora digitata a mano è una hora programmata: esce da DIRECTO/GIRO.
    setEntregaModo("PROGRAMADO");
    setGiroIntent(null);
  };

  // ── Geocoding zona — debounce 800ms sull'indirizzo ─────────────────────
  // ENGINE UNICO: chiama api.resolveAddress sul backend (stessa cascata del bot WhatsApp).
  // Server-side: cache → cliente → Google → Nominatim → Photon → keyword.
  // Backend cacha automaticamente, qui niente saveGeoCache da gestire.
  useEffect(() => {
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    // HOTFIX P1A: ogni run invalida un'eventuale resolveAddress ancora in volo
    // (l'indirizzo è cambiato) → la risposta vecchia NON aggiornerà più lo stato.
    const isCurrent = latestGeocode.current.begin();
    if (!shouldGeocode({ tipoConsegna, direccion, zonaManuale })) {
      // Indirizzo troppo corto in DOMICILIO non-manuale → azzera la zona.
      // (RITIRO / zona manuale: si lascia zonaInfo com'è, come prima.)
      if (tipoConsegna === "DOMICILIO" && !zonaManuale && direccion.trim().length < 5) {
        setZonaInfo(null);
        setZonaLoading(false);
      }
      return;
    }
    setZonaLoading(true);
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await api.resolveAddress(direccion, { tel: tel || null });
        if (!isCurrent()) return; // indirizzo cambiato nel frattempo → ignora (last-wins)
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
        if (!isCurrent()) return;
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
        if (isCurrent()) setZonaLoading(false);
      }
    }, GEOCODE_DEBOUNCE_MS);
    return () => { clearTimeout(geocodeTimer.current); latestGeocode.current.cancel(); };
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
        // Solo le pizze da forno occupano lo slot: Cocina, Bebidas e Postres non pizza no.
        .reduce((s, o) => s + (o.items||[])
          .filter(isPizzaItem)
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
    // [FDV1] il delivery non usa più il timing rider (previewOrderTiming): vedi previewDeliveryV1 sotto.
    if (tipoConsegna === "DOMICILIO") { setBackendTiming(null); return; }
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
    }, GEOCODE_DEBOUNCE_MS); // HOTFIX P1A: debounce allineato a resolveAddress (~600ms)
    return () => { cancelled = true; clearTimeout(t); setBackendTimingLoading(false); };
  }, [visible, tipoConsegna, direccion, hora, zonaManuale]); // eslint-disable-line

  useEffect(() => {
    if (!visible || tipoConsegna !== "DOMICILIO" || !backendTiming) return;
    if (horaTouchedByOperator) return;
    const firstAvailable = backendTiming.suggested_hora || backendTiming.hora_proposta || null;
    if (!firstAvailable || firstAvailable === hora) return;
    horaCustom.current = false;
    setForzaHora(false);
    setHora(firstAvailable);
  }, [visible, tipoConsegna, backendTiming, horaTouchedByOperator, hora]);

  // [FDV1] deadline preview + giro compatibile (zona, deadline ±15', capienza, stato). Sola lettura;
  // ricaricata ogni 30 s.
  //
  // [DEADLINE-HORA 2026-09-22] La preview manda anche `hora`, così mostra lo STESSO
  // límite che il backend scriverà: deadline = max(creazione + 55', hora promessa).
  // La risoluzione Madrid / mezzanotte / DST vive SOLO nel backend
  // (core/delivery/deadline.js): qui non si duplica nulla, si spedisce la hora grezza.
  //
  // Nessun feedback loop: `hora` alimenta la preview, ma la preview può riscrivere
  // `hora` UNA sola volta (guardia fdv1HoraPrefilled) e mai dopo che l'operatore
  // l'ha toccata (horaCustom / horaTouchedByOperator). Dopo quel momento la preview
  // aggiorna soltanto il límite mostrato.
  const fdv1Zona = zonaAssegnata ? (zonaInfo?.zona?.id || null) : null;
  const fdv1HoraPrefilled = useRef(false);
  useEffect(() => { if (!visible) fdv1HoraPrefilled.current = false; }, [visible]);
  // Solo una HH:MM valida viaggia nel payload: una hora a metà digitazione ("2", "21:")
  // verrebbe scartata dal parser backend, quindi non vale una richiesta.
  const fdv1HoraValida = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(hora || "").trim()) ? hora.trim() : "";
  // Debounce: senza, ogni tasto nel campo ora sarebbe una request.
  const [fdv1HoraDebounced, setFdv1HoraDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setFdv1HoraDebounced(fdv1HoraValida), 350);
    return () => clearTimeout(t);
  }, [fdv1HoraValida]);
  useEffect(() => {
    if (!visible || !isFdv1Delivery) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.previewDeliveryV1({ zona: fdv1Zona, hora: fdv1HoraDebounced || undefined });
        if (cancelled || !res || !res.ok) return;
        // Proposta iniziale DIRECTO (UNA volta, solo se l'operatore non l'ha toccata): così
        // un DOMICILIO salvato senza aprire il popup parte con la hora ASAP del backend.
        // [ENTREGA-MODAL 2026-09-23] Nessun "Hora límite" viene più mostrato nel form.
        if (res.hora_preview && !fdv1HoraPrefilled.current && !horaCustom.current && !horaTouchedByOperator) {
          fdv1HoraPrefilled.current = true;
          setHora(res.hora_preview);
        }
      } catch (e) {
        if (!cancelled) console.warn("[previewDeliveryV1] failed:", e?.message || e);
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [visible, isFdv1Delivery, fdv1Zona, fdv1HoraDebounced]); // eslint-disable-line
  useEffect(() => { setGiroIntent(null); }, [fdv1Zona]);

  // [ENTREGA-MODAL 2026-09-23] AHORA: orologio informativo, tick solo a popup aperto.
  useEffect(() => {
    if (!showDeliveryPopup) return;
    setAhoraMs(Date.now());
    const t = setInterval(() => setAhoraMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, [showDeliveryPopup]);
  const ahoraMinuto = Math.floor(ahoraMs / 60000);

  // Preview ASAP (senza hora): hora_preview = proposta DIRECTO, giro_candidates/giro_suggestion = GIRO.
  // Ricaricata a ogni cambio di minuto di AHORA, così DIRECTO segue l'orologio. Solo lettura.
  useEffect(() => {
    if (!showDeliveryPopup || !isFdv1Delivery) return;
    let cancelled = false;
    const zonaRichiesta = fdv1Zona;
    api.previewDeliveryV1({ zona: zonaRichiesta })
      .then(res => { if (!cancelled && res && res.ok) setEntregaAsap({ ...res, _zona: zonaRichiesta }); })
      .catch(e => { if (!cancelled) console.warn("[previewDeliveryV1 asap] failed:", e?.message || e); });
    return () => { cancelled = true; };
  }, [showDeliveryPopup, isFdv1Delivery, fdv1Zona, ahoraMinuto]); // eslint-disable-line

  // Giri compatibili = SOLO quelli restituiti dal backend per la zona corrente.
  // `giro_candidates` (lista completa) se il backend la espone, altrimenti il solo `giro_suggestion`.
  const entregaGiroCandidates = useMemo(() => {
    if (!entregaAsap || !fdv1Zona || entregaAsap._zona !== fdv1Zona) return [];
    if (Array.isArray(entregaAsap.giro_candidates)) return entregaAsap.giro_candidates.filter(Boolean);
    return entregaAsap.giro_suggestion ? [entregaAsap.giro_suggestion] : [];
  }, [entregaAsap, fdv1Zona]);
  const giroCandKey = (c) => (c.kind === "GIRO" ? `g:${c.giro_id}` : `o:${c.order_id}`);
  const giroCandIntent = (c) => (c.kind === "GIRO" ? { giro_id: c.giro_id } : { with_order_id: c.order_id });
  const giroOptionLabel = (c) => {
    if (c.kind === "GIRO") {
      const ms = giroEarliestDeadlineMs(c.giro_id, ordenes);
      return [c.label || formatManualGiroLabel({ id: c.giro_id }), fdv1Zona, formatMadridHHMM(ms)].filter(Boolean).join(" · ");
    }
    const o = (ordenes || []).find(x => x && x.id === c.order_id);
    return [c.order_id, fdv1Zona, o ? orderDeadlineHHMM(o) : null].filter(Boolean).join(" · ");
  };

  // Sintesi read-only fuori dal popup (una sola, nessun secondo orologio, nessuna deadline).
  // DIRECTO prima che la preview abbia proposto l'ora: "—" (la hora di apertura non è una proposta).
  const modoResumen = entregaModo === "GIRO" && !giroIntent ? "DIRECTO" : entregaModo;
  const horaResumenPronta = horaCustom.current || fdv1HoraPrefilled.current;
  const entregaResumen = modoResumen === "GIRO"
    ? `GIRO · ${giroResumenId || (giroIntent && (giroIntent.with_order_id || formatManualGiroLabel({ id: giroIntent.giro_id }))) || "—"}`
    : `${modoResumen} · ${(horaResumenPronta && hora) || "—"}`;

  // All'apertura del popup: PROGRAMADO parte dalla hora corrente, GIRO dal giro già scelto (se ancora compatibile).
  useEffect(() => {
    if (!showDeliveryPopup) return;
    setProgramadoHora(hora || "");
    setGiroSelKey(giroIntent ? (giroIntent.giro_id ? `g:${giroIntent.giro_id}` : `o:${giroIntent.with_order_id}`) : "");
  }, [showDeliveryPopup]); // eslint-disable-line

  // Scelta dell'operatore: fissa hora (+ giro_intent solo per GIRO) e chiude il popup.
  // Il backend calcola la deadline al salvataggio: max(ts + 55', hora). Qui nessun calcolo.
  const elegirEntrega = (modo, horaElegida, intent, resumenId = "") => {
    if (!horaElegida) return;
    setGiroResumenId(modo === "GIRO" ? resumenId : "");
    fdv1HoraPrefilled.current = true;
    horaCustom.current = true;
    setForzaHora(false);
    setHora(horaElegida);
    setGiroIntent(modo === "GIRO" ? intent : null);
    setEntregaModo(modo);
    setShowDeliveryPopup(false);
  };

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
      const firstAvailableH = backendTiming.suggested_hora || backendTiming.hora_proposta || null;
      const selectedH = horaTouchedByOperator
        ? (backendTiming.hora_proposta || hora)
        : (firstAvailableH || backendTiming.hora_proposta || hora);
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
          height: "92vh", display: "flex", flexDirection: "column",
          boxShadow: "0 -10px 40px rgba(0,0,0,.5)"
        }}>

          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px", flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.fumo }} />
          </div>

          {/* ── Header: canal + tipo consegna ─────────────────────────── */}
          <div style={{
            padding: "6px 18px 12px",
            borderBottom: `1px solid ${C.fumo}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0
          }}>
            <div>
              <div style={{ color: C.bianco, fontWeight: 800, fontSize: 18 }}>Nuevo pedido</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {/* [ORIGINE-ORDINI 2026-09-22] Due sole origini. "💬 WhatsApp"
                    rimosso: un ordine WhatsApp trascritto a mano è un TEL. */}
                {[{ id: "TEL", label: "📞 Teléfono" }, { id: "BANCO", label: "🏪 Barra" }].map(c => (
                  <button key={c.id} onClick={() => setCanal(c.id)} style={{
                    background: canal === c.id ? C.rosso : "transparent",
                    border: `1.5px solid ${canal === c.id ? C.rosso : C.fumo}`,
                    color: canal === c.id ? "#fff" : C.grigio,
                    borderRadius: 20, padding: "5px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer"
                  }}>{c.label}</button>
                ))}
              </div>
              {/* Indicatore automatico ritiro/domicilio — solo informativo */}
              <div style={{ marginTop: 6, fontSize: 12, color: tipoConsegna === "DOMICILIO" ? "#F97316" : C.grigio, fontWeight: 600 }}>
                {tipoConsegna === "DOMICILIO" ? "🛵 Entrega a domicilio" : "🏪 Retiro en local"}
              </div>
            </div>
            <button onClick={handleClose} style={{
              background: C.fumo, color: C.grigio, border: "none",
              borderRadius: "50%", width: 32, height: 32, fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
            }}>✕</button>
          </div>

          {/* ── Corpo scrollabile ──────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column" }}>

            {/* Form cliente */}
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.fumo}`, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 2, position: "relative" }}>
                  <input value={nombre}
                    onChange={e => { setNombre(e.target.value); setClienteId(null); setShowSugerencias(true); }}
                    onFocus={() => { setNombreFocus(true); setShowSugerencias(true); }}
                    onBlur={() => { setNombreFocus(false); setTimeout(() => setShowSugerencias(false), 200); }}
                    placeholder="👤 Nombre *"
                    style={{
                      width: "100%", background: C.carbone2, boxSizing: "border-box",
                      border: `1.5px solid ${nombre.length > 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)"}`,
                      borderRadius: 9, color: "#fff", padding: "9px 36px 9px 12px", fontSize: 14, fontWeight: 500
                    }} />
                  {/* Bottone Preferito: grigio off → giallo on */}
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
                  {/* Dropdown suggerimenti */}
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
                  placeholder="📞 Tel (opcional)" type="tel"
                  style={{
                    flex: 1, background: C.carbone2,
                    border: "1.5px solid rgba(255,255,255,0.18)",
                    borderRadius: 9, color: "#fff", padding: "9px 12px", fontSize: 14
                  }} />
                {/* [ENTREGA-MODAL 2026-09-23] Il campo hora qui è SOLO RITIRO ("Retirar a las").
                    In DOMICILIO l'unico controllo editabile di `hora` è PROGRAMADO nel popup:
                    niente "Hora cliente", niente "Hora límite", niente secondo orologio. */}
                {tipoConsegna !== "DOMICILIO" ? (
                <div data-testid="hora-ritiro" style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: C.carbone2, border: "1.5px solid rgba(255,255,255,0.22)",
                  borderRadius: 9, padding: "7px 12px", minWidth: 130
                }}>
                  <span style={{ fontSize: 16 }}>🕐</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase", lineHeight: 1 }}>
                      Retirar a las
                    </span>
                    <input type="time" value={hora} onChange={e => setHoraFromOperator(e.target.value)}
                      style={{ background: "transparent", border: "none", color: "#fff", padding: 0, fontSize: 14, fontWeight: 700, width: 80, outline: "none", lineHeight: 1 }} />
                  </div>
                </div>
                ) : zonaInfo?.durataAndataMin != null && (
                    <span title="Tiempo de ida en coche (Google)" style={{
                      alignSelf: "center",
                      display: "inline-flex", alignItems: "center", gap: 3,
                      color: "#fdba74", fontSize: 11, fontWeight: 700,
                      fontFamily: "'DM Mono',monospace",
                      background: "rgba(249,115,22,0.12)",
                      border: "1px solid rgba(249,115,22,0.3)",
                      borderRadius: 6, padding: "2px 6px", lineHeight: 1
                    }}>
                      ida ~{zonaInfo.durataAndataMin} min
                    </span>
                )}
              </div>

              {/* ── Step 2 anti-cerotto: timing AUTORITATIVO dal backend ──────── */}
              {/* Fonte unica: zona/durata/source/forno_out/warnings/driver/giro
                  arrivano dal backend (previewOrderTiming). Il frontend mostra,
                  non ricalcola. */}
              {!isFdv1Delivery && tipoConsegna === "DOMICILIO" && (backendTiming || backendTimingLoading) && (
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 9, padding: "8px 10px", fontSize: 11,
                  display: "flex", flexDirection: "column", gap: 6
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 800, letterSpacing: .6, textTransform: "uppercase", fontSize: 9 }}>
                      Backend
                    </span>
                    {backendTimingLoading && !backendTiming && (
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Calculando…</span>
                    )}
                    {backendTiming?.zona && (
                      <span style={{ color: "#fff", fontWeight: 700 }}>Zona {backendTiming.zona}</span>
                    )}
                    {backendTiming?.durata_andata_min != null && (
                      <span title="Duración de ida (backend)" style={{
                        color: "#fdba74", fontFamily: "'DM Mono',monospace", fontWeight: 700,
                        background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)",
                        borderRadius: 6, padding: "1px 6px"
                      }}>🛵 {backendTiming.durata_andata_min}min</span>
                    )}
                    {backendTiming?.geo_source && (
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                        {backendTiming.geo_source}
                      </span>
                    )}
                    {backendTiming?.forno_out && (
                      <span title="Salida del horno (backend)" style={{
                        color: "#86efac", fontFamily: "'DM Mono',monospace", fontWeight: 700,
                        background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
                        borderRadius: 6, padding: "1px 6px"
                      }}>🔥 {backendTiming.forno_out}</span>
                    )}
                  </div>

                  {/* Conflicto driver: advisory, NO cambia la hora automáticamente */}
                  {backendTiming?.driver?.has_conflict && horaTouchedByOperator && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fca5a5" }}>
                      <span>⚠️ {backendTiming.driver.message || "Driver ocupado"}</span>
                      {backendTiming.suggested_hora && (
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>
                          · sugerido {backendTiming.suggested_hora} (no se aplica solo)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Giro compatible sugerido */}
                  {backendTiming?.giro?.suggested && (
                    <div style={{ color: "#93c5fd" }}>
                      🔁 Compatible con giro {backendTiming.giro.manual_giro_id}
                      {backendTiming.giro.orders?.length ? ` (${backendTiming.giro.orders.length} pedidos)` : ""}
                    </div>
                  )}

                  {/* Warnings (duración estimada / sin verificar / zona) */}
                  {(backendTiming?.warnings || [])
                    .filter(w => w.code !== "driver_conflict")
                    .map((w, i) => (
                      <div key={i} style={{ color: "#fbbf24", fontSize: 10 }}>• {w.message}</div>
                    ))}
                </div>
              )}

              {/* Badge cliente abituale */}
              {clienteAbitual && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.35)",
                  borderRadius: 9, padding: "6px 10px", fontSize: 11
                }}>
                  <span style={{ fontSize: 14 }}>✨</span>
                  <span style={{ flex: 1, color: "#86efac", fontWeight: 600 }}>
                    Cliente habitual · {clienteAbitual.total_pedidos || 0} pedidos
                    {clienteAbitual.direccion && <span style={{ color: "#bbf7d0", fontWeight: 400 }}> · dir. guardada</span>}
                  </span>
                </div>
              )}

              {/* ── Trigger delivery popup ── */}
              {(() => {
                const zona = zonaInfo?.zona;
                const hasDir = direccion.trim().length > 0;
                const hasConflict = !isFdv1Delivery && deliveryStatus.isBlocked;
                return (
                  <button onClick={() => setShowDeliveryPopup(true)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: hasDir ? "rgba(249,115,22,0.08)" : C.carbone2,
                    border: hasConflict
                      ? "2px solid rgba(239,68,68,0.7)"
                      : hasDir
                      ? "1.5px solid rgba(249,115,22,0.5)"
                      : "1.5px solid rgba(255,255,255,0.15)",
                    borderRadius: 10, padding: "10px 14px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                    transition: "border-color 0.2s"
                  }}>
                    {hasDir ? (
                      <>
                        {zona && <ZonaBadge zona={zona} size="sm" />}
                        {hasConflict && (
                          <span style={{ fontSize: 14, flexShrink: 0 }}>🚨</span>
                        )}
                        <span style={{ color: "#fff", fontSize: 13, fontWeight: 600, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {direccion}
                        </span>
                        {/* [ENTREGA-MODAL] sintesi read-only della scelta: DIRECTO · HH:MM | PROGRAMADO · HH:MM | GIRO · <id> */}
                        <span data-testid="entrega-resumen" style={{ color: "rgba(249,115,22,0.9)", fontSize: 13,
                          fontWeight: 800, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                          {entregaResumen}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, flexShrink: 0 }}>✏️</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 18 }}>📍</span>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                          Añadir dirección de entrega
                        </span>
                        <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>→</span>
                      </>
                    )}
                  </button>
                );
              })()}

              {hasOperationalInfo && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  background: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                  border: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "1.5px solid rgba(239,68,68,0.40)" : "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 9,
                  padding: "8px 10px",
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

            {/* ── Lista items ─────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: "10px 16px" }}>

              {items.length === 0 ? (
                /* Stato vuoto */
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", padding: "32px 0", gap: 12, opacity: 0.5
                }}>
                  <span style={{ fontSize: 40 }}>🍕</span>
                  <div style={{ color: C.grigio, fontSize: 14, fontWeight: 600 }}>Todavía no hay nada</div>
                  <div style={{ color: C.grigio, fontSize: 12 }}>Pulsa «+» para añadir</div>
                </div>
              ) : (
                items.map(item => (
                  <div key={item._uid} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px",
                    marginBottom: 6,
                    background: C.carbone2,
                    borderRadius: 12,
                    border: `1px solid ${C.fumo}`,
                    cursor: "pointer"
                  }}
                    onClick={() => handleEditItem(item)}
                  >
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{item.e}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.bianco, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.n}
                      </div>
                      {item.sub && (
                        <div style={{ color: "#a855f7", fontSize: 11, fontWeight: 500, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {extrasLabel(item)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); adj(item._uid, -1); }} style={{
                        background: C.fumo, color: C.bianco, border: "none",
                        borderRadius: 6, width: 26, height: 26, fontSize: 15, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                      }}>−</button>
                      <span style={{ color: C.bianco, fontWeight: 800, minWidth: 18, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>
                        {item.q}
                      </span>
                      <button onClick={e => { e.stopPropagation(); adj(item._uid, +1); }} style={{
                        background: C.fumo, color: C.bianco, border: "none",
                        borderRadius: 6, width: 26, height: 26, fontSize: 15, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
                      }}>+</button>
                    </div>
                    <span style={{ color: C.grigio, fontSize: 12, fontWeight: 700, minWidth: 44, textAlign: "right", fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
                      {(item.p * item.q).toFixed(2)}€
                    </span>
                    <button onClick={e => { e.stopPropagation(); handleRemoveItem(item._uid); }} style={{
                      background: "transparent", color: C.grigio, border: "none",
                      fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0
                    }}>🗑</button>
                  </div>
                ))
              )}

              {/* Bottone + Añadir */}
              <button
                onClick={() => { setEditingItem(null); setPickerVisible(true); }}
                style={{
                  width: "100%", marginTop: items.length > 0 ? 8 : 0,
                  background: "rgba(232,52,28,0.1)",
                  border: `2px dashed ${C.rosso}88`,
                  borderRadius: 12, color: C.rosso,
                  padding: "12px 0", fontWeight: 800, fontSize: 15,
                  cursor: "pointer", letterSpacing: 0.3
                }}>
                + Añadir pizza, bebida o postre
              </button>
            </div>

            {/* Nota generale (opzionale, collassabile) */}
            <div style={{ padding: "0 16px 4px" }}>
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
            padding: "12px 16px",
            borderTop: `1px solid ${C.fumo}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexShrink: 0, background: C.carbone2
          }}>
            <div>
              <div style={{ color: C.grigio, fontSize: 11 }}>Total · {items.reduce((s, i) => s + i.q, 0)} item{items.reduce((s, i) => s + i.q, 0) !== 1 ? "s" : ""}</div>
              <div style={{ color: C.verde, fontWeight: 800, fontSize: 22, fontFamily: "'DM Mono',monospace" }}>{total}€</div>
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
              <div style={{ marginTop: 8 }}>
                <DescuentoInput
                  tipo={descuentoTipo}
                  valor={descuentoValor}
                  onChange={(t, v) => { setDescuentoTipo(t); setDescuentoValor(v); }}
                  totaleBase={totaleBase}
                  compact
                />
              </div>
              {/* Ya pagado toggle */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
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
              padding: "14px 24px", fontWeight: 800, fontSize: 15,
              boxShadow: (!ok || submitting) ? "none" : `0 4px 16px ${C.rosso}55`,
              cursor: submitting ? "wait" : (ok ? "pointer" : "default")
            }}>
              {submitting ? "Confirmando…" : "✅ Confirmar pedido"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Delivery Popup ─────────────────────────────────────────────── */}
      {/* [ENTREGA-MODAL 2026-09-23] Tre modalità, una scelta: DIRECTO · PROGRAMADO · GIRO.
          AHORA è solo informativa (orologio, non cliccabile). Nessun calcolo di deadline qui:
          l'ora di DIRECTO e i giri compatibili arrivano da previewDeliveryV1 (backend). */}
      {showDeliveryPopup && (() => {
        const zona = zonaInfo?.zona;
        const zonaConfermata = !!zona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
        const directoHora = entregaAsap?.hora_preview || null;
        const programadoValida = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(programadoHora || "").trim());
        const giroCands = entregaGiroCandidates;
        const giroSel = giroCands.find(c => giroCandKey(c) === giroSelKey) || giroCands[0] || null;
        const modoActivo = entregaModo === "GIRO" && !giroIntent ? "DIRECTO" : entregaModo;

        const card = (accent, bg, active, disabled) => ({
          display: "flex", flexDirection: "column", gap: 14, padding: 16, borderRadius: 16,
          background: bg, border: `${active ? 2.5 : 1.5}px solid ${accent}`,
          boxShadow: active ? `0 0 0 3px ${accent}33, 0 8px 28px ${accent}22` : "none",
          opacity: disabled ? 0.4 : 1, minWidth: 0,
        });
        const icono = (accent) => ({
          width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
          background: `${accent}22`, border: `1.5px solid ${accent}`,
        });
        const titulo = { color: "#fff", fontWeight: 900, fontSize: 17, letterSpacing: 0.5, lineHeight: 1.1 };
        const subtitulo = { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 3 };
        const valorBox = {
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          minHeight: 58, borderRadius: 12, background: "rgba(0,0,0,0.22)",
          border: "1.5px solid rgba(255,255,255,0.18)", boxSizing: "border-box", width: "100%",
        };
        const accion = (bg, enabled) => ({
          width: "100%", padding: "14px 10px", border: "none", borderRadius: 12,
          background: enabled ? bg : "rgba(255,255,255,0.08)",
          color: enabled ? "#fff" : "rgba(255,255,255,0.35)",
          fontWeight: 900, fontSize: 17, cursor: enabled ? "pointer" : "default", marginTop: "auto",
        });
        const etiqueta = { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 };

        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px"
          }} onClick={() => setShowDeliveryPopup(false)}>
            <div data-testid="entrega-modal" onClick={e => e.stopPropagation()} style={{
              background: "linear-gradient(160deg, #2a2560 0%, #1c1b44 45%, #16162e 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 20,
              width: "100%", maxWidth: 900,
              padding: "0 0 20px",
              boxShadow: "0 8px 60px rgba(0,0,0,0.7)",
              maxHeight: "92vh", overflowY: "auto", boxSizing: "border-box"
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🛵</span>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 20 }}>Entrega a domicilio</span>
                </div>
                <button type="button" aria-label="Cerrar" onClick={() => setShowDeliveryPopup(false)} style={{
                  background: "rgba(255,255,255,0.10)", border: "none", borderRadius: 10,
                  color: "#fff", width: 40, height: 40, fontSize: 18, cursor: "pointer"
                }}>✕</button>
              </div>

              {/* ── Parte alta: dirección · zona · AHORA ── */}
              <div style={{ padding: "18px 20px 0", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <div style={etiqueta}>Dirección</div>
                  <input value={direccion} onChange={e => setDireccion(e.target.value)}
                    placeholder="📍 Calle, número..."
                    autoFocus
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.07)",
                      border: "1.5px solid rgba(255,255,255,0.22)",
                      borderRadius: 12, color: "#fff", padding: "12px 14px",
                      fontSize: 16, fontWeight: 700, boxSizing: "border-box", outline: "none"
                    }} />
                  <input value={direccionNote} onChange={e => setDireccionNote(e.target.value)}
                    placeholder="🏠 Planta, timbre, referencias (opcional)"
                    style={{
                      width: "100%", background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 12, color: "#fff", padding: "10px 14px",
                      fontSize: 14, marginTop: 8, boxSizing: "border-box", outline: "none"
                    }} />
                </div>

                {/* Zona */}
                <div data-testid="entrega-zona" style={{ flex: zonaConfermata || zonaLoading || !zonaInfo ? "0 0 auto" : "1 1 100%", minWidth: 0 }}>
                  <div style={etiqueta}>Zona</div>
                  {direccion.trim().length >= 3 && zonaLoading && !zonaManuale && (
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>…</span>
                  )}
                  {direccion.trim().length >= 3 && !zonaLoading && zonaConfermata && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ZonaBadge zona={zona} size="lg" />
                      {zonaManuale && (
                        <button type="button" onClick={() => { setZonaManuale(false); setZonaInfo(null); }} style={{
                          background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                          color: "rgba(255,255,255,0.45)", borderRadius: 6,
                          padding: "3px 10px", fontSize: 11, cursor: "pointer"
                        }}>↺ auto</button>
                      )}
                    </div>
                  )}
                  {/* Zona non trovata o solo keyword — selezione manuale obbligatoria */}
                  {direccion.trim().length >= 3 && !zonaLoading && (!zona || (zonaInfo?.metodo === "keyword" && !zonaManuale)) && zonaInfo !== null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      {ZONE_DELIVERY.map(z => (
                        <button type="button" key={z.id} onClick={() => {
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
                          🗺
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* AHORA — solo informativa: orologio reale, NON cliccabile, NON è un orario di consegna */}
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "stretch", gap: 16 }}>
                  <div aria-hidden="true" style={{ width: 1, background: "rgba(255,255,255,0.12)" }} />
                  <div data-testid="entrega-ahora" role="status" style={{
                    pointerEvents: "none", userSelect: "none", cursor: "default",
                    minWidth: 170, padding: "10px 18px", borderRadius: 14,
                    border: "1.5px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.03)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4
                  }}>
                    <span style={{ ...etiqueta, marginBottom: 0 }}>Ahora</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.92)" }}>
                      <span style={{ fontSize: 22, opacity: 0.7 }}>🕐</span>
                      <span style={{ fontSize: 38, fontWeight: 900, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>
                        {formatMadridHHMM(ahoraMs) || "—"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Tre modalità ── */}
              <div style={{ padding: "18px 20px 0", display: "grid", gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>

                {/* 1 — DIRECTO */}
                <div data-testid="entrega-directo" style={card("#34d399", "rgba(16,185,129,0.07)", modoActivo === "DIRECTO", false)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={icono("#34d399")}>⚡</span>
                    <div>
                      <div style={titulo}>DIRECTO</div>
                      <div style={subtitulo}>Enviar ahora</div>
                    </div>
                  </div>
                  <div data-testid="entrega-directo-hora" style={{ ...valorBox, background: "transparent", border: "1.5px solid transparent",
                    color: "#6ee7b7", fontSize: 44, fontWeight: 900, fontFamily: "'DM Mono',monospace" }}>
                    {directoHora || "—"}
                  </div>
                  <button type="button" data-testid="entrega-directo-elegir" disabled={!directoHora}
                    onClick={() => elegirEntrega("DIRECTO", directoHora, null)}
                    style={accion("linear-gradient(135deg, #22c55e, #16a34a)", !!directoHora)}>Elegir</button>
                </div>

                {/* 2 — PROGRAMADO: l'unica ora modificabile a mano */}
                <div data-testid="entrega-programado" style={card("#fb923c", "rgba(249,115,22,0.07)", modoActivo === "PROGRAMADO", false)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={icono("#fb923c")}>🗓️</span>
                    <div>
                      <div style={titulo}>PROGRAMADO</div>
                      <div style={subtitulo}>Elegir hora de entrega</div>
                    </div>
                  </div>
                  <div style={{ ...valorBox, padding: "0 6px 0 14px", border: "1.5px solid rgba(251,146,60,0.55)" }}>
                    {/* ▲/▼ sostituiscono l'icona nativa del picker (Chrome); su iPad il tap apre comunque la ruota */}
                    <style>{`[data-testid="entrega-programado-hora"]::-webkit-calendar-picker-indicator{display:none}`}</style>
                    <input type="time" data-testid="entrega-programado-hora" value={programadoHora}
                      onChange={e => setProgramadoHora(e.target.value)}
                      style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                        color: "#fff", fontSize: 32, fontWeight: 900, fontFamily: "'DM Mono',monospace", textAlign: "center" }} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {[["▲", 5, "+5"], ["▼", -5, "-5"]].map(([sym, delta, lbl]) => (
                        <button type="button" key={lbl} aria-label={lbl}
                          onClick={() => setProgramadoHora(h => shiftHoraHHMM(h || directoHora, delta) || h)}
                          style={{ background: "transparent", border: "none", color: "#fdba74",
                            fontSize: 14, lineHeight: 1, padding: "4px 8px", cursor: "pointer" }}>{sym}</button>
                      ))}
                    </div>
                  </div>
                  <button type="button" data-testid="entrega-programado-elegir" disabled={!programadoValida}
                    onClick={() => elegirEntrega("PROGRAMADO", programadoHora.trim(), null)}
                    style={accion("linear-gradient(135deg, #f97316, #ea580c)", programadoValida)}>Elegir</button>
                </div>

                {/* 3 — GIRO: solo i giri compatibili calcolati dal backend; nessun auto-grouping */}
                <div data-testid="entrega-giro" aria-disabled={giroCands.length === 0 ? "true" : undefined}
                  style={card("#38bdf8", "rgba(14,165,233,0.07)", modoActivo === "GIRO", giroCands.length === 0)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={icono("#38bdf8")}>👥</span>
                    <div>
                      <div style={titulo}>GIRO</div>
                      <div style={subtitulo}>Unir con otro pedido</div>
                    </div>
                  </div>
                  {giroCands.length === 0 && (
                    <div data-testid="entrega-giro-vacio" style={{ ...valorBox, color: "rgba(255,255,255,0.5)", fontSize: 30, fontWeight: 900 }}>—</div>
                  )}
                  {giroCands.length === 1 && (
                    <div data-testid="entrega-giro-unico" style={{ ...valorBox, border: "1.5px solid rgba(56,189,248,0.55)",
                      color: "#7dd3fc", fontSize: 19, fontWeight: 900, fontVariantNumeric: "tabular-nums", padding: "0 10px", textAlign: "center" }}>
                      {giroOptionLabel(giroCands[0])}
                    </div>
                  )}
                  {giroCands.length > 1 && (
                    <div style={{ ...valorBox, border: "1.5px solid rgba(56,189,248,0.55)", position: "relative", padding: "0 10px" }}>
                      <select data-testid="entrega-giro-select" value={giroSel ? giroCandKey(giroSel) : ""}
                        onChange={e => setGiroSelKey(e.target.value)}
                        style={{ width: "100%", appearance: "none", WebkitAppearance: "none", background: "transparent",
                          border: "none", outline: "none", color: "#7dd3fc", fontSize: 18, fontWeight: 900,
                          fontFamily: "inherit", fontVariantNumeric: "tabular-nums", textAlign: "center", textAlignLast: "center",
                          padding: "14px 20px 14px 0", cursor: "pointer", textOverflow: "ellipsis" }}>
                        {giroCands.map(c => (
                          <option key={giroCandKey(c)} value={giroCandKey(c)} style={{ background: "#1c1b44", color: "#fff" }}>
                            {giroOptionLabel(c)}
                          </option>
                        ))}
                      </select>
                      <span aria-hidden="true" style={{ position: "absolute", right: 14, color: "#7dd3fc", fontSize: 14, pointerEvents: "none" }}>▼</span>
                    </div>
                  )}
                  <button type="button" data-testid="entrega-giro-unir" disabled={!giroSel || !directoHora}
                    onClick={() => giroSel && elegirEntrega("GIRO", directoHora, giroCandIntent(giroSel), giroSel.kind === "GIRO" ? (giroSel.label || formatManualGiroLabel({ id: giroSel.giro_id })) : giroSel.order_id)}
                    style={accion("linear-gradient(135deg, #38bdf8, #0284c7)", !!giroSel && !!directoHora)}>Unir</button>
                </div>
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
