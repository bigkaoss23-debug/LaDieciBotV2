import { useState, useEffect, useRef, useMemo } from 'react';
import { C, genId, INGREDIENTI, calcTotale, DELIVERY_FEE, aplicarDescuento } from '../constants';
import { api, sb } from '../api';
import { assegnaZonaDaKeyword, zonaBadgeStyle, ZonaBadge, ZONE_DELIVERY, BUFFER_OPS_DRIVER_MIN } from '../zones';
// Migrazione planner-preview (2026-06-07): rimossi gli import di scheduling LOCALE
// (proposeForNewOrder / suggerisciOrario / risolviTempoAndata / tempoAndata). Il
// frontend Premium NON calcola disponibilità/lead-time/giri: la verità arriva dal
// backend (previewOrderTiming oggi, previewOrderPlanner appena deployato).
import ItemPickerModal from './ItemPickerModal';
import { applyUiOffset } from '../utils/uiOffset';
import DescuentoInput from './ui/DescuentoInput';
import { getKitchenCapacityStatus } from '../core/kitchen/capacity';

// ──────────────────────────────────────────────────────────────────────────
// Foglio di stile scoped (.npfs) — "visual foundation" allineata al mockup
// __mockups__/NuevoPedidoModalCompactMockup.css. Palette calda oro/avana,
// desktop-first con collasso mobile <900px. Scoped sotto .npfs per non
// toccare la palette globale C (condivisa con Cocina/Entregas).
// ──────────────────────────────────────────────────────────────────────────
const NPFS_CSS = `
.npfs{ font-family:'Satoshi',Inter,-apple-system,system-ui,sans-serif; color:#f7f0df; }
.npfs *{ box-sizing:border-box; }

/* Header */
.npfs .np-header{ display:flex; align-items:center; justify-content:space-between; gap:18px; padding:14px 24px; border-bottom:1px solid rgba(208,184,145,0.22); flex-shrink:0; }
.npfs .np-title-row{ display:flex; align-items:center; gap:24px; min-width:0; flex-wrap:wrap; }
.npfs .np-header h1{ margin:0; color:#fbf6eb; font-size:32px; font-weight:900; line-height:1.05; letter-spacing:0; }
.npfs .np-kicker{ margin:0; color:#ffc93d; font-size:17px; font-weight:900; white-space:nowrap; }
.npfs .np-close{ width:52px; height:52px; border:1px solid rgba(246,230,196,0.18); border-radius:10px; color:#fff8ed; background:rgba(255,255,255,0.03); font-size:30px; line-height:1; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.npfs .np-close:hover{ background:rgba(255,255,255,0.07); }

/* Fixed top region (cards + banner + warnings) */
.npfs .np-fixedtop{ flex-shrink:0; display:flex; flex-direction:column; gap:12px; padding:14px 24px; }
.npfs .np-top{ display:grid; grid-template-columns:0.95fr 1.05fr; gap:14px; }
.npfs .np-panel{ min-width:0; border:1px solid rgba(208,184,145,0.22); border-radius:10px; padding:18px; background:linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)), #11100e; display:flex; flex-direction:column; gap:0; }
.npfs .np-panel h2{ display:flex; align-items:center; gap:10px; margin:0 0 16px; color:#bcae93; font-size:15px; font-weight:900; text-transform:uppercase; letter-spacing:.5px; }
.npfs .np-customer-panel.is-ok{ border-color:rgba(88,210,125,0.34); }
.npfs .np-customer-panel h2::before{ content:"●"; color:#d7a84b; font-size:18px; }
.npfs .np-address-panel h2::before{ content:"◆"; color:#d7a84b; font-size:16px; }

/* Customer grid */
.npfs .np-customer-grid{ display:grid; grid-template-columns:minmax(0,1fr) 60px; gap:14px; }
.npfs .np-input-like{ min-width:0; min-height:60px; border:1px solid rgba(208,184,145,0.22); border-radius:10px; color:#fff7e8; background:rgba(255,255,255,0.025); display:flex; align-items:center; gap:12px; padding:0 16px; text-align:left; }
.npfs .np-input-like input{ flex:1; min-width:0; background:transparent; border:none; outline:none; color:#fff7e8; font-family:inherit; font-size:23px; font-weight:800; padding:0; }
.npfs .np-input-like input::placeholder{ color:rgba(255,247,232,0.4); font-weight:700; }
.npfs .np-name-field{ position:relative; }
.npfs .np-phone-field .np-phone-ic{ color:#d8cbb5; font-size:22px; flex-shrink:0; }
.npfs .np-icon-action{ min-height:60px; border:1px solid rgba(208,184,145,0.22); border-radius:10px; background:rgba(255,255,255,0.025); color:#fff4dc; display:grid; place-items:center; font-size:22px; font-weight:900; cursor:pointer; }
.npfs .np-whatsapp{ min-height:60px; border:1px solid rgba(74,222,128,0.35); border-radius:10px; color:#fff; background:linear-gradient(180deg,#37b968,#159447); display:grid; place-items:center; font-size:24px; cursor:pointer; }
.npfs .np-ok{ flex:0 0 auto; width:28px; height:28px; display:grid; place-items:center; border-radius:999px; color:#062d16; background:#58d27d; font-size:17px; font-weight:900; }
.npfs .np-customer-flags{ width:fit-content; max-width:100%; display:flex; align-items:center; margin-top:14px; border:1px solid rgba(208,184,145,0.20); border-radius:10px; overflow:hidden; color:#efe4cc; background:rgba(255,255,255,0.025); font-weight:900; font-size:13px; }
.npfs .np-customer-flags span{ padding:11px 16px; white-space:nowrap; }
.npfs .np-customer-flags span + span{ border-left:1px solid rgba(208,184,145,0.28); }
.npfs .np-customer-flags span:first-child{ color:#ffd13d; }

/* Address panel */
.npfs .np-address-input{ width:100%; }
.npfs .np-address-input strong{ overflow:hidden; font-size:23px; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; font-weight:900; }
.npfs .np-address-ic{ font-size:20px; flex-shrink:0; }
.npfs .np-delivery-line{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; color:#e8dfd0; font-size:14px; font-weight:900; }
.npfs .np-delivery-line span{ display:inline-flex; align-items:center; gap:5px; border:1px solid rgba(208,184,145,0.18); border-radius:999px; padding:7px 12px; background:rgba(255,255,255,0.04); white-space:nowrap; }
.npfs .np-delivery-cards{ display:grid; grid-template-columns:1fr 1fr minmax(140px,auto); gap:12px; margin-top:16px; }
.npfs .np-dcard{ min-height:64px; border:1px solid rgba(208,184,145,0.18); border-radius:8px; padding:10px 14px; color:#f8f0df; background:rgba(255,255,255,0.025); display:flex; flex-direction:column; justify-content:center; }
.npfs .np-dcard small{ display:block; margin-bottom:3px; color:#c6b6a0; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
.npfs .np-dcard strong{ color:#fff3dc; font-size:22px; font-weight:900; }
.npfs .np-dcard input[type=time]{ background:transparent; border:none; outline:none; color:#fff3dc; font-family:'DM Mono',monospace; font-size:22px; font-weight:900; width:100%; padding:0; }
.npfs .np-dcard.is-deliv input[type=time]{ color:#7ee2a0; }
.npfs .np-recalc{ min-height:64px; border:1px solid rgba(208,184,145,0.18); border-radius:8px; padding:10px 14px; color:#fff8ee; background:rgba(255,255,255,0.02); font-size:15px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.npfs .np-recalc:hover{ background:rgba(255,255,255,0.05); }

/* Products head */
.npfs .np-products-head{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 24px; flex-shrink:0; }
.npfs .np-products-head > div{ display:flex; align-items:center; gap:14px; min-width:0; }
.npfs .np-products-head h2{ margin:0; color:#fff7ed; font-size:23px; font-weight:900; text-transform:uppercase; }
.npfs .np-count-pill{ border:1px solid rgba(208,184,145,0.16); border-radius:999px; padding:6px 12px; color:#cfc3ae; background:rgba(255,255,255,0.025); font-weight:900; font-size:13px; white-space:nowrap; }
.npfs .np-gold-btn{ min-height:46px; border:1px solid rgba(246,189,59,0.36); border-radius:8px; padding:0 18px; color:#111; background:linear-gradient(180deg,#ffd866,#f4b82f); font-weight:900; font-size:16px; cursor:pointer; flex-shrink:0; }
.npfs .np-gold-btn:hover{ filter:brightness(1.05); }

/* Products list */
.npfs .np-products{ flex:1; min-height:0; overflow-y:auto; padding:0 24px 10px; -webkit-overflow-scrolling:touch; scrollbar-color:rgba(208,184,145,0.45) transparent; }
.npfs .np-row{ min-height:66px; display:grid; grid-template-columns:44px minmax(120px,0.7fr) minmax(200px,1.6fr) 92px auto; align-items:center; gap:16px; border:1px solid rgba(208,184,145,0.16); border-radius:8px; margin-bottom:8px; padding:10px 16px; background:linear-gradient(90deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)), #15130f; cursor:pointer; }
.npfs .np-index{ width:44px; height:44px; display:grid; place-items:center; border:1px solid rgba(208,184,145,0.24); border-radius:8px; color:#fff7e7; font-size:20px; font-weight:900; }
.npfs .np-product-name{ min-width:0; }
.npfs .np-product-name strong{ display:block; overflow:hidden; color:#fff7ea; font-size:20px; font-weight:900; line-height:1.1; text-overflow:ellipsis; white-space:nowrap; }
.npfs .np-note{ margin:0; overflow:hidden; color:#ffd439; font-size:16px; font-weight:800; text-overflow:ellipsis; white-space:nowrap; }
.npfs .np-note-muted{ color:#8f887b; }
.npfs .np-price{ color:#fff8ec; font-size:18px; font-weight:900; text-align:right; font-family:'DM Mono',monospace; }
.npfs .np-actions{ display:grid; grid-template-columns:repeat(5,auto); align-items:center; gap:10px; }
.npfs .np-actions button, .npfs .np-actions .np-qty{ width:46px; height:44px; display:grid; place-items:center; border:1px solid rgba(208,184,145,0.20); border-radius:8px; color:#fff5e4; background:rgba(255,255,255,0.035); font-size:20px; font-weight:900; cursor:pointer; padding:0; }
.npfs .np-actions .np-qty{ background:rgba(0,0,0,0.28); font-family:'DM Mono',monospace; cursor:default; }
.npfs .np-actions .np-danger{ border-color:rgba(239,68,68,0.35); color:#fff; background:rgba(127,29,29,0.72); }
.npfs .np-empty{ height:100%; min-height:220px; display:grid; place-content:center; justify-items:center; gap:12px; color:#d3c5ae; text-align:center; }

/* Footer */
.npfs .np-footer{ display:grid; grid-template-columns:minmax(280px,1fr) auto auto minmax(210px,auto); align-items:center; gap:20px; padding:14px 24px; border-top:1px solid rgba(208,184,145,0.28); background:rgba(12,11,9,0.96); flex-shrink:0; }
.npfs .np-summary{ display:flex; align-items:baseline; gap:18px; flex-wrap:wrap; min-width:0; }
.npfs .np-summary .np-items{ color:#efe4d0; font-size:22px; font-weight:900; }
.npfs .np-summary .np-total{ color:#fff3df; font-size:30px; font-weight:900; font-family:'DM Mono',monospace; }
.npfs .np-summary small{ color:#bcb09f; font-size:14px; font-weight:800; }
.npfs .np-confirm{ min-height:56px; border:1px solid rgba(74,222,128,0.36); border-radius:10px; color:#effff3; background:linear-gradient(180deg,#2eb45e,#218f4d); font-size:20px; font-weight:900; cursor:pointer; padding:0 20px; white-space:nowrap; }
.npfs .np-confirm:disabled{ color:#8a8276; background:#27231d; border-color:rgba(208,184,145,0.18); cursor:not-allowed; }

/* Responsive collapse */
@media (max-width:900px){
  .npfs .np-header{ padding:12px 14px; }
  .npfs .np-header h1{ font-size:24px; }
  .npfs .np-title-row{ gap:10px; }
  .npfs .np-close{ width:42px; height:42px; font-size:26px; }
  .npfs .np-fixedtop{ padding:12px 14px; gap:10px; }
  .npfs .np-top{ grid-template-columns:1fr; }
  .npfs .np-panel{ padding:14px; }
  .npfs .np-customer-grid{ grid-template-columns:1fr; }
  .npfs .np-customer-flags{ width:100%; flex-wrap:wrap; }
  .npfs .np-delivery-cards{ grid-template-columns:1fr 1fr; }
  .npfs .np-products-head{ padding:10px 14px; }
  .npfs .np-products{ padding:0 14px 10px; }
  .npfs .np-row{ grid-template-columns:38px minmax(80px,0.9fr) 1fr; gap:10px; }
  .npfs .np-price{ display:none; }
  .npfs .np-actions{ grid-column:1 / -1; justify-content:flex-end; }
  .npfs .np-footer{ grid-template-columns:1fr; gap:12px; padding:12px 14px; }

  /* Mobile/tablet portrait: il blocco superiore (cliente+dirección) impilato
     riempiva tutta la viewport e schiacciava la lista prodotti a ~10px. Qui
     facciamo scorrere l'intero corpo (unico <div> figlio di .npfs) invece
     della sola lista interna, così i prodotti mantengono altezza usabile. Il
     footer è fratello del corpo → resta sempre visibile. */
  .npfs > div{ overflow-y:auto !important; -webkit-overflow-scrolling:touch; }
  .npfs .np-products{ flex:0 0 auto; min-height:240px; overflow:visible; }

  /* Top cards più compatte: leggibili ma non dominanti */
  .npfs .np-fixedtop{ gap:8px; }
  .npfs .np-panel{ padding:12px; }
  .npfs .np-panel h2{ margin:0 0 10px; font-size:13px; }
  .npfs .np-input-like{ min-height:48px; }
  .npfs .np-input-like input{ font-size:18px; }
  .npfs .np-icon-action, .npfs .np-whatsapp{ min-height:48px; font-size:20px; }
  .npfs .np-address-input strong{ font-size:18px; }
  .npfs .np-dcard{ min-height:52px; }
  .npfs .np-dcard strong, .npfs .np-dcard input[type=time]{ font-size:18px; }
  .npfs .np-customer-flags{ margin-top:10px; }
  .npfs .np-delivery-cards{ margin-top:12px; }
}
`;

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
function buildDisponibilidad(ordenes) {
  const toM = (t) => { if (!t) return null; const [h, m] = String(t).split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  const rows = [];
  const byKey = new Map();
  for (const o of (ordenes || [])) {
    if (!o || o.tipo_consegna !== "DOMICILIO") continue;
    if (!DISPONIBILIDAD_STATES.includes(o.estado)) continue;
    if (!o.zona || !o.hora) continue;
    const start = o.salida_driver_estimada || o.forno_out || null;
    const end = o.entrega_estimada || o.hora || null;
    if (!start && !end) continue;
    const startMin = toM(start) ?? toM(end);
    const key = `${o.zona}|${start || end}`;
    if (byKey.has(key)) { byKey.get(key).count += 1; continue; }
    const row = {
      key,
      zona: o.zona,
      startMin,
      range: (start && end && start !== end) ? `${start}–${end}` : (start || end),
      slotHora: end || start,
      kind: "info",
      conflicto: o.conflicto_driver === true,
      count: 1,
    };
    byKey.set(key, row);
    rows.push(row);
  }
  rows.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
  return rows;
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
  // slotFeedback: motore di scheduling LOCALE rimosso (planner/backend è la fonte).
  // Resta come costante null così i consumatori residui sono inerti senza calcolo.
  const [slotFeedback] = useState(null);
  // Step 2 anti-cerotto: timing delivery AUTORITATIVO dal backend (fonte unica).
  // Popolato da api.previewOrderTiming. Il frontend MOSTRA questi valori (zona,
  // durata, source, forno_out, warnings, driver conflict, suggested_hora);
  // slotFeedback/proposeForNewOrder locali restano solo come hint UI live mentre
  // si digita, NON come decisione né come dato salvato.
  const [backendTiming,    setBackendTiming]    = useState(null);
  const [backendTimingLoading, setBackendTimingLoading] = useState(false);
  const [horaTouchedByOperator, setHoraTouchedByOperator] = useState(false);
  // ── Planner preview (contract "nuevo-pedido-planner-preview-v1") ──────────
  // Fonte unica backend per disponibilità/lead-time/giri. Il frontend MOSTRA il
  // contract, non lo ricalcola. Se il backend non risponde (es. action non
  // ancora deployata) → plannerPreviewError = "Planner no disponible", NESSUN
  // calcolo locale di fallback.
  const [plannerPreview,        setPlannerPreview]        = useState(null);
  const [plannerPreviewLoading, setPlannerPreviewLoading] = useState(false);
  const [plannerPreviewError,   setPlannerPreviewError]   = useState("");
  const [plannerPreviewLastKey, setPlannerPreviewLastKey] = useState("");
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

  // ── Planner preview backend (contract "nuevo-pedido-planner-preview-v1") ──
  // Sostituisce il vecchio motore di scheduling LOCALE: niente proposeForNewOrder /
  // risolviTempoAndata / conteggio slot forno calcolati nel frontend. Su cambio
  // input rilevante chiamiamo api.previewOrderPlanner e MOSTRIAMO il contract.
  // Debounce 450ms + guard su input-key per non rifare chiamate identiche.
  // Se il backend non risponde (es. action non ancora deployata) → errore safe
  // "Planner no disponible", NESSUN calcolo locale di fallback.
  useEffect(() => {
    if (!visible) {
      setPlannerPreview(null); setPlannerPreviewError(""); setPlannerPreviewLoading(false);
      return;
    }
    // Dati minimi: RITIRO basta hora; DOMICILIO serve direccion sufficiente.
    if (tipoConsegna === "DOMICILIO" && direccion.trim().length < 5) {
      setPlannerPreview(null); setPlannerPreviewError(""); setPlannerPreviewLoading(false);
      return;
    }
    const pizzasCount = items.reduce((s, it) => s + (parseInt(it.q) || 1), 0);
    const input = {
      tipo_consegna: tipoConsegna,
      direccion: tipoConsegna === "DOMICILIO" ? direccion.trim() : null,
      tel: tel || null,
      hora: hora || null,
      zona_manuale: tipoConsegna === "DOMICILIO" ? zonaManuale : false,
      zona: (tipoConsegna === "DOMICILIO" && zonaManuale) ? (zonaInfo?.zona?.id || null) : null,
      pizzas_count: pizzasCount,
    };
    const key = JSON.stringify(input);
    if (key === plannerPreviewLastKey) return; // input invariato → no rifetch

    let cancelled = false;
    setPlannerPreviewLoading(true);
    setPlannerPreviewError("");
    const t = setTimeout(async () => {
      try {
        const res = await api.previewOrderPlanner(input);
        if (cancelled) return;
        // Guard di validità contract: accetta solo planner read-only v1.
        // ok:true e ok:false sono ENTRAMBI contract validi → li conserviamo e il
        // rendering distingue (recommendation vs blocker). Solo contract/source
        // mancanti = "Planner no disponible". NESSUN calcolo locale di fallback.
        if (res && res.contract === "nuevo-pedido-planner-preview-v1" && res.source === "planner") {
          setPlannerPreview(res);
          setPlannerPreviewError("");
        } else {
          setPlannerPreview(null);
          setPlannerPreviewError("Planner no disponible");
        }
        setPlannerPreviewLastKey(key);
      } catch (e) {
        if (cancelled) return;
        setPlannerPreview(null);
        setPlannerPreviewError("Planner no disponible");
        setPlannerPreviewLastKey(key);
        console.warn("[previewOrderPlanner] failed:", e?.message || e);
      } finally {
        if (!cancelled) setPlannerPreviewLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [visible, tipoConsegna, direccion, hora, zonaManuale, items]); // eslint-disable-line

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
    const firstAvailable = backendTiming.suggested_hora || backendTiming.hora_proposta || null;
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
  const itemQtyTotal = items.reduce((s, i) => s + i.q, 0);
  const isCompact = items.length > 5;
  const clienteOk = nombre.trim().length > 0;
  const contactAvailable = tel.trim().length > 0;
  const deliveryZona = zonaInfo?.zona;
  const deliveryZonaOk = !!deliveryZona && (zonaManuale || zonaInfo?.metodo === "polygon" || zonaInfo?.metodo === "cache");
  const deliveryFornoOut = backendTiming?.forno_out || slotFeedback?.horaForno || null;

  // ── Helper planner preview (display-only, mai decisione locale) ──────────
  const plannerRecommendation = plannerPreview?.recommendation || null;
  const plannerGeo            = plannerPreview?.geo || null;
  const plannerGiro           = plannerPreview?.giro || null;
  const plannerWarnings       = plannerPreview?.warnings || [];
  const plannerBlockers       = plannerPreview?.blockers || [];
  // ok:false è un contract VALIDO (errore deciso dal backend), non un guasto.
  // null = nessun preview ancora; true/false = esito del planner.
  const plannerOk             = plannerPreview ? plannerPreview.ok !== false : null;
  // Il backend espone geo.source; normalizziamo anche un eventuale geo_source.
  const plannerGeoSource      = plannerGeo?.source || plannerGeo?.geo_source || null;
  // Superficie contract non ancora renderizzata: difesa contro null/array vuoti.
  const plannerAlternatives   = plannerPreview?.alternatives || [];
  const plannerAvailability   = plannerPreview?.availability_rows || [];

  return (
    <>
      {/* ── Overlay + Sheet principale ─────────────────────────────────── */}
      <div onClick={handleClose} style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: visible ? "flex" : "none",
        flexDirection: "column", justifyContent: "center", alignItems: "center",
        pointerEvents: visible ? "auto" : "none"
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,.75)", backdropFilter: "blur(4px)"
        }} />

        <div className="npfs" onClick={e => e.stopPropagation()} style={{
          position: "relative",
          background: "linear-gradient(145deg,#090908 0%,#10100f 48%,#070707 100%)",
          borderRadius: 18,
          width: "min(1540px, calc(100vw - 24px))",
          height: "94dvh", maxHeight: "94vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)", overflow: "hidden"
        }}>
          <style>{NPFS_CSS}</style>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <header className="np-header">
            <div className="np-title-row">
              <h1>Nuevo Pedido</h1>
              <p className="np-kicker">☎ Origen: Teléfono · {tipoConsegna === "DOMICILIO" ? "Entrega a domicilio" : "Retiro en local"}</p>
            </div>
            <button className="np-close" onClick={handleClose} aria-label="Cerrar">×</button>
          </header>

          {/* ── Corpo: top fisso + lista prodotti con scroll dedicato ───── */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Form cliente + delivery cards */}
            <div className="np-fixedtop">
              <div className="np-top">
                <section className={`np-panel np-customer-panel${clienteOk ? " is-ok" : ""}`} aria-label="Cliente">
                  <h2>Cliente</h2>
                  <div className="np-customer-grid">
                    {/* Nombre + autocomplete */}
                    <div className="np-input-like np-name-field">
                      <input value={nombre}
                        onChange={e => { setNombre(e.target.value); setClienteId(null); setShowSugerencias(true); }}
                        onFocus={() => { setNombreFocus(true); setShowSugerencias(true); }}
                        onBlur={() => { setNombreFocus(false); setTimeout(() => setShowSugerencias(false), 200); }}
                        placeholder="Nombre *" />
                      {clienteOk && <span className="np-ok" title="Datos cliente OK">✓</span>}
                      {showSugerencias && sugerencias.length > 0 && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                          marginTop: 4, background: "#15130f",
                          border: "1px solid rgba(208,184,145,0.28)", borderRadius: 10,
                          boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
                          maxHeight: 240, overflowY: "auto"
                        }}>
                          {sugerencias.map(c => (
                            <div key={c.id}
                              onMouseDown={() => pickCliente(c)}
                              style={{
                                padding: "10px 12px", cursor: "pointer", fontSize: 14,
                                borderBottom: "1px solid rgba(208,184,145,0.12)",
                                display: "flex", alignItems: "center", gap: 8
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <span style={{ color: "#fff7ea", fontWeight: 700 }}>
                                {c.alias || c.nombre}
                              </span>
                              {c.vip && <span title={`VIP · ${c.ordini_30gg} pedidos en 30 días`} style={{ color: "#FACC15", fontSize: 14 }}>⭐</span>}
                              <span style={{ flex: 1 }} />
                              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                                {c.zona || c.direccion || (c.tel ? c.tel : "")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Preferito (slot azione icona) */}
                    <button type="button" className="np-icon-action"
                      onClick={() => setPreferito(p => !p)}
                      title={preferito ? "Quitar de preferidos" : "Guardar como preferido"}
                      style={preferito ? { color: "#FACC15", borderColor: "rgba(250,204,21,0.5)", background: "rgba(250,204,21,0.12)" } : undefined}>
                      {preferito ? "★" : "☆"}
                    </button>
                    {/* Telefono */}
                    <div className="np-input-like np-phone-field">
                      <span className="np-phone-ic">☎</span>
                      <input value={tel} onChange={e => setTel(e.target.value)}
                        placeholder="Tel (opcional)" type="tel" />
                    </div>
                    {/* Contatto cliente — no-op (non invia nulla) */}
                    <button type="button" className="np-whatsapp"
                      onClick={e => e.preventDefault()}
                      title={contactAvailable ? "Contacto cliente (no envía nada automáticamente)" : "Añade un teléfono para contactar"}>
                      {canal === "WA" ? "💬" : "📞"}
                    </button>
                  </div>
                  {clienteAbitual && (
                    <div className="np-customer-flags">
                      <span>★ Cliente habitual</span>
                      <span>{clienteAbitual.total_pedidos || 0} pedidos</span>
                      {clienteAbitual.direccion && <span>Dirección guardada</span>}
                    </div>
                  )}
                </section>

                <section className="np-panel np-address-panel" aria-label="Dirección de entrega">
                  <h2>Dirección de entrega</h2>
                  {/* Indirizzo — solo display (il planner si apre da Recalcular) */}
                  <div className="np-input-like np-address-input" style={{ cursor: "default" }}>
                    {tipoConsegna === "DOMICILIO" && deliveryZona && <ZonaBadge zona={deliveryZona} size="sm" />}
                    <span className="np-address-ic">{tipoConsegna === "DOMICILIO" ? "📍" : "🏪"}</span>
                    <strong style={{ color: tipoConsegna === "DOMICILIO" ? "#fff7ea" : "rgba(255,247,234,0.5)" }}>
                      {tipoConsegna === "DOMICILIO" ? direccion : "Añadir dirección de entrega"}
                    </strong>
                  </div>

                  {/* Pills zona / minuti / fonte (solo domicilio, se disponibili) */}
                  {tipoConsegna === "DOMICILIO" && (
                    <div className="np-delivery-line">
                      {(backendTiming?.zona || deliveryZona?.id) && (
                        <span>🗺 {backendTiming?.zona || deliveryZona?.id}{deliveryZona?.nome ? ` ${deliveryZona.nome}` : ""}</span>
                      )}
                      {(backendTiming?.durata_andata_min != null || zonaInfo?.durataAndataMin != null) && (
                        <span>↻ {backendTiming?.durata_andata_min ?? zonaInfo?.durataAndataMin} min</span>
                      )}
                      {(backendTiming?.geo_source || zonaInfo?.metodo) && (
                        <span>📡 {backendTiming?.geo_source || zonaInfo?.metodo}</span>
                      )}
                      {backendTimingLoading && !backendTiming && <span>Calculando…</span>}
                    </div>
                  )}

                  {/* Card orari: entrega estimada / salida horno / recalcular */}
                  <div className="np-delivery-cards">
                    <div className={`np-dcard${tipoConsegna === "DOMICILIO" ? " is-deliv" : ""}`}>
                      <small>{tipoConsegna === "DOMICILIO" ? "Entrega estimada" : "Retirar a las"}</small>
                      <input type="time" value={hora} onChange={e => setHoraFromOperator(e.target.value)} />
                    </div>
                    <div className="np-dcard">
                      <small>Salida horno</small>
                      <strong>{tipoConsegna === "DOMICILIO" ? (deliveryFornoOut || "—") : (hora || "—")}</strong>
                    </div>
                    <button type="button" className="np-recalc" onClick={() => setShowDeliveryPopup(true)}>◎ Recalcular</button>
                  </div>

                  {/* Stato compatibilità delivery + giro alternativo */}
                  {tipoConsegna === "DOMICILIO" && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        color: deliveryStatus.isBlocked ? "#fca5a5" : "#86efac",
                        background: deliveryStatus.isBlocked ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                        border: `1px solid ${deliveryStatus.isBlocked ? "rgba(239,68,68,0.30)" : "rgba(34,197,94,0.30)"}`,
                        borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap"
                      }}>
                        {deliveryStatus.isBlocked ? "Revisar" : "Compatible"}
                      </span>
                      {backendTiming?.giro?.suggested && (
                        <span style={{ color: "#bbf7d0", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 800 }}>
                          Giro compatible {(backendTiming?.giro?.zona || deliveryZona?.id || "").trim()}
                          {backendTiming?.giro?.slot_hora ? ` · ${backendTiming.giro.slot_hora}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </section>
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
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  background: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
                  border: (pickupKitchenStatus?.overloaded || showDeliveryOutOfServiceAlert) ? "1px solid rgba(239,68,68,0.40)" : "1px solid rgba(208,184,145,0.18)",
                  borderRadius: 999,
                  padding: isCompact ? "4px 12px" : "5px 14px",
                  width: "fit-content", maxWidth: "100%",
                  fontSize: 12, fontWeight: 700,
                }}>
                  {pickupKitchenStatus && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: pickupKitchenStatus.overloaded ? "#fca5a5" : "#86efac" }}>
                      <span>{pickupKitchenStatus.overloaded ? "⚠️" : "✅"}</span>
                      {pickupKitchenStatus.overloaded
                        ? <>Horno sobrecargado {pickupKitchenStatus.pizzas}/{pickupKitchenStatus.capacity} · {pickupKitchenStatus.windowMinutes} min{pickupKitchenStatus.suggestedHora ? ` · sug. ${pickupKitchenStatus.suggestedHora}` : ""}</>
                        : <>Horno OK {pickupKitchenStatus.pizzas}/{pickupKitchenStatus.capacity} · {pickupKitchenStatus.windowMinutes} min</>}
                    </span>
                  )}
                  {showDeliveryOutOfServiceAlert && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fca5a5" }}>
                      <span>🚨</span> Delivery no disponible después de las 23:00 · ábrelo para forzar
                    </span>
                  )}
                  {showDeliveryAvailabilityLoading && (
                    <span style={{ color: "rgba(255,255,255,0.72)" }}>Calculando zona y disponibilidad…</span>
                  )}
                </div>
              )}

              {/* ── Pill zona delivery (solo nel popup) ── */}
              {false && tipoConsegna === "DOMICILIO" && direccion.trim().length >= 5 && (() => {
                const zona = zonaInfo?.zona;
                const sugg = null; // suggerisciOrario locale rimosso (planner è la fonte)
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

            {/* ── Header prodotti ─────────────────────────────────────────── */}
            <div className="np-products-head">
              <div>
                <h2>Productos</h2>
                <span className="np-count-pill">{items.length} línea{items.length !== 1 ? "s" : ""} · {itemQtyTotal} item{itemQtyTotal !== 1 ? "s" : ""}</span>
              </div>
              <button className="np-gold-btn" onClick={() => { setEditingItem(null); setPickerVisible(true); }}>⊕ Añadir producto</button>
            </div>

            {/* ── Lista items: unico scroll principale prodotti ───────── */}
            <div className="np-products">

              {items.length === 0 ? (
                /* Stato vuoto */
                <div className="np-empty">
                  <span style={{ fontSize: 40 }}>🍕</span>
                  <strong style={{ color: "#e7dcc4", fontSize: 17, fontWeight: 900 }}>Todavía no hay nada</strong>
                  <span style={{ color: "#a99f8b", fontSize: 14 }}>Pulsa «Añadir producto» para empezar</span>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={item._uid} className="np-row" onClick={() => handleEditItem(item)}>
                    <span className="np-index">{idx + 1}</span>
                    <div className="np-product-name">
                      <strong>{item.n}</strong>
                    </div>
                    <p className={item.sub ? "np-note" : "np-note np-note-muted"} title={item.sub ? extrasLabel(item) : undefined}>
                      {item.sub ? extrasLabel(item) : "—"}
                    </p>
                    <strong className="np-price">{(item.p * item.q).toFixed(2)}€</strong>
                    <div className="np-actions" aria-label={`Acciones ${item.n}`}>
                      <button title="Editar ingredientes" onClick={e => { e.stopPropagation(); handleEditItem(item); }}>✎</button>
                      <button title="Quitar una unidad" onClick={e => { e.stopPropagation(); adj(item._uid, -1); }}>−</button>
                      <strong className="np-qty">{item.q}</strong>
                      <button title="Añadir una unidad" onClick={e => { e.stopPropagation(); adj(item._uid, +1); }}>+</button>
                      <button className="np-danger" title="Eliminar" onClick={e => { e.stopPropagation(); handleRemoveItem(item._uid); }}>🗑</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Nota generale (opzionale, collassabile) */}
            <div style={{ padding: "6px 24px 8px", flexShrink: 0, borderTop: "1px solid rgba(208,184,145,0.18)" }}>
              <button
                onClick={() => setShowNotaGen(v => !v)}
                style={{
                  background: "transparent", border: "none", color: "#bcae93",
                  fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "4px 0"
                }}>
                {showNotaGen ? "▲ Ocultar nota general" : "▼ Añadir nota general"}
              </button>
              {showNotaGen && (
                <textarea value={nota} onChange={e => setNota(e.target.value)}
                  placeholder="Notas generales del pedido..."
                  rows={2}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(208,184,145,0.22)",
                    borderRadius: 8, color: "#fff7e8",
                    padding: "8px 10px", fontSize: 13, resize: "none",
                    marginTop: 6, boxSizing: "border-box"
                  }} />
              )}
            </div>
          </div>

          {/* ── Footer: totale + conferma ─────────────────────────── */}
          <footer className="np-footer">
            <div className="np-summary">
              <span className="np-items">{itemQtyTotal} item{itemQtyTotal !== 1 ? "s" : ""}</span>
              <span className="np-total">Total {total}€</span>
              {tipoConsegna === "DOMICILIO" && (
                <small>Incl. {DELIVERY_FEE.toFixed(2).replace(".", ",")}€ entrega</small>
              )}
              {descuentoImporte > 0 && (
                <small style={{ color: "#f0b429" }}>−{descuentoImporte.toFixed(2)}€ desc · subtotal {totaleBase.toFixed(2)}€</small>
              )}
              {tipoConsegna === "DOMICILIO" && !zonaAssegnata && (
                <small style={{ color: "#fbbf24" }}>⚠️ Zona no detectada</small>
              )}
            </div>

            {/* Descuento (componente esistente, non modificato) */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <DescuentoInput
                tipo={descuentoTipo}
                valor={descuentoValor}
                onChange={(t, v) => { setDescuentoTipo(t); setDescuentoValor(v); }}
                totaleBase={totaleBase}
                compact
              />
            </div>

            {/* Ya pagado + metodo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { setYaPagedo(v => !v); setMetodoPago(""); }} style={{
                background: yaPagedo ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${yaPagedo ? "rgba(34,197,94,0.5)" : "rgba(208,184,145,0.22)"}`,
                color: yaPagedo ? "#7ee2a0" : "#cfc3ae",
                borderRadius: 8, padding: "9px 12px", fontSize: 15, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap"
              }}>
                {yaPagedo ? "☑" : "☐"} Pagado
              </button>
              {yaPagedo && (<>
                <button onClick={() => setMetodoPago("efectivo")} style={{
                  background: metodoPago === "efectivo" ? "#16A34A" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${metodoPago === "efectivo" ? "#16A34A" : "rgba(208,184,145,0.22)"}`,
                  color: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontWeight: 800, cursor: "pointer"
                }}>💵 Efectivo</button>
                <button onClick={() => setMetodoPago("tarjeta")} style={{
                  background: metodoPago === "tarjeta" ? "#2563EB" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${metodoPago === "tarjeta" ? "#2563EB" : "rgba(208,184,145,0.22)"}`,
                  color: "#fff", borderRadius: 8, padding: "9px 12px", fontSize: 14, fontWeight: 800, cursor: "pointer"
                }}>💳 Tarjeta</button>
              </>)}
            </div>

            <button className="np-confirm" onClick={handleConfirm} disabled={!ok || submitting}
              style={(!ok || submitting) ? undefined : { boxShadow: "0 6px 20px rgba(33,143,77,0.4)" }}>
              {submitting ? "Confirmando…" : "✓ Confirmar pedido"}
            </button>
          </footer>
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
        const deliveryDisponibilidad = (!zonaLoading && zonaOkForDisponibilidad)
          ? buildDisponibilidad(ordenes)
          : [];

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

                {/* ── Propuestas / Planner (fonte unica backend, display-only) ── */}
                {tipoConsegna === "DOMICILIO" && (plannerPreviewLoading || plannerPreviewError || plannerPreview) && (() => {
                  if (plannerPreviewLoading && !plannerPreview) {
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.14)",
                        color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: 700 }}>
                        Consultando planner…
                      </div>
                    );
                  }
                  if (plannerPreviewError || !plannerPreview) {
                    // Solo per contract/source mancante o failure reale: il planner
                    // è l'unica fonte, NESSUN calcolo locale. Se non c'è, lo diciamo.
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(251,191,36,0.08)", border: "1.5px solid rgba(251,191,36,0.45)",
                        display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>⚠️</span>
                        <span style={{ color: "#fde68a", fontWeight: 700, fontSize: 13 }}>
                          {plannerPreviewError || "Planner no disponible"}
                        </span>
                      </div>
                    );
                  }
                  if (plannerOk === false) {
                    // Contract VALIDO ma il planner ha deciso ok:false → mostriamo i
                    // blocker/warning SPECIFICI del backend (es. "No se pudo resolver
                    // la dirección"), non il generico "Planner no disponible".
                    const errMsg = plannerPreview?.error?.message || null;
                    const blk = plannerBlockers.length
                      ? plannerBlockers
                      : (errMsg ? [{ message: errMsg }] : [{ message: "Planner no disponible" }]);
                    return (
                      <div style={{ borderRadius: 10, padding: "12px 14px",
                        background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.45)",
                        display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>🛰</span>
                          <span style={{ color: "#fca5a5", fontWeight: 800, fontSize: 13 }}>
                            Planner sin propuesta{plannerGeo?.zona ? ` · ${plannerGeo.zona}` : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 2 }}>
                          {blk.map((b, i) => (
                            <span key={`okfb${i}`} style={{ color: "#fca5a5", fontWeight: 700 }}>⛔ {b.message || b.code || "Bloqueo"}</span>
                          ))}
                          {plannerWarnings.map((w, i) => (
                            <span key={`okfw${i}`} style={{ color: "#fde68a" }}>⚠️ {w.message || w.code || "Aviso"}</span>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  const rec = plannerRecommendation || {};
                  const hasWarn = plannerWarnings.length > 0 || plannerBlockers.length > 0;
                  return (
                    <div style={{ borderRadius: 10, padding: "12px 14px",
                      background: hasWarn ? "rgba(251,191,36,0.08)" : "rgba(34,197,94,0.08)",
                      border: `1.5px solid ${hasWarn ? "rgba(251,191,36,0.45)" : "rgba(34,197,94,0.45)"}`,
                      display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>🛰</span>
                        <span style={{ color: hasWarn ? "#fde68a" : "#86efac", fontWeight: 800, fontSize: 14 }}>
                          Planner{rec.recommended_hora ? ` · ${rec.recommended_hora}` : ""}
                        </span>
                        {plannerGiro?.recommended && (
                          <span style={{ color: "#bbf7d0", background: "rgba(34,197,94,0.10)",
                            border: "1px solid rgba(34,197,94,0.25)", borderRadius: 999,
                            padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>
                            Giro recomendado{plannerGiro?.slot_hora ? ` · ${plannerGiro.slot_hora}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", paddingLeft: 24, display: "flex", flexWrap: "wrap", gap: 12 }}>
                        {rec.forno_out && <span>Salida horno {rec.forno_out}</span>}
                        {rec.salida_driver && <span>🛵 Salida {rec.salida_driver}</span>}
                        {rec.entrega_estimada && <span>📦 Entrega {rec.entrega_estimada}</span>}
                        {plannerGeo?.zona && <span>🗺 {plannerGeo.zona}{plannerGeoSource ? ` · ${plannerGeoSource}` : ""}</span>}
                        {(plannerAlternatives.length > 0 || plannerAvailability.length > 0) && (
                          <span>↔ {plannerAlternatives.length} alt{plannerAvailability.length ? ` · ${plannerAvailability.length} slots` : ""}</span>
                        )}
                      </div>
                      {hasWarn && (
                        <div style={{ fontSize: 12, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 2 }}>
                          {plannerBlockers.map((b, i) => (
                            <span key={`b${i}`} style={{ color: "#fca5a5", fontWeight: 700 }}>⛔ {b.message || b.code || "Bloqueo"}</span>
                          ))}
                          {plannerWarnings.map((w, i) => (
                            <span key={`w${i}`} style={{ color: "#fde68a" }}>⚠️ {w.message || w.code || "Aviso"}</span>
                          ))}
                        </div>
                      )}
                      {rec.recommended_hora && rec.recommended_hora !== hora && (
                        <div style={{ paddingLeft: 24 }}>
                          <button onClick={() => setHoraFromOperator(rec.recommended_hora)} style={{
                            background: "rgba(34,197,94,0.14)", border: "1.5px solid rgba(34,197,94,0.5)",
                            color: "#86efac", borderRadius: 8, padding: "5px 12px",
                            fontSize: 12, fontWeight: 800, cursor: "pointer"
                          }}>→ Usar hora sugerida {rec.recommended_hora}</button>
                        </div>
                      )}
                    </div>
                  );
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
                            {`${horaTouchedByOperator ? "Propón al cliente" : "Primera hora disponible"}: ${selectedH}`}
                          </span>
                        </div>
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
                    label = deliveryStatus.fromBackend && selectedH
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
                                const statusLabel = r.conflicto ? "Ocupado ⚠" : "En curso";
                                const statusColor = r.conflicto ? "#fca5a5" : "rgba(255,255,255,0.5)";
                                return (
                                  <div key={r.key}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10, fontSize: 15,
                                      padding: "10px 12px", borderRadius: 10,
                                      background: "rgba(255,255,255,0.04)",
                                      border: "1px solid rgba(255,255,255,0.10)",
                                    }}>
                                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: "#fff", minWidth: 104 }}>{r.range}</span>
                                    <span style={{
                                      fontSize: 14, fontWeight: 800, color: "#a5f3fc",
                                      background: "rgba(0,151,167,0.12)",
                                      border: "1.5px solid rgba(0,151,167,0.85)", borderRadius: 7, padding: "2px 9px",
                                    }}>[{r.zona}]</span>
                                    <span style={{
                                      marginLeft: "auto", fontWeight: 800, fontSize: 14,
                                      color: statusColor,
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
