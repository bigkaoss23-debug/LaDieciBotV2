import { useState, useEffect, useRef, useMemo } from 'react';
import { C, genId, MENU, INGREDIENTI, calcTotale, DELIVERY_FEE, aplicarDescuento } from '../constants';
import { api, sb } from '../api';
import { assegnaZonaDaKeyword, zonaBadgeStyle, ZonaBadge, ZONE_DELIVERY, BUFFER_OPS_DRIVER_MIN } from '../zones';
// Migrazione planner-preview (2026-06-07): rimossi gli import di scheduling LOCALE
// (proposeForNewOrder / suggerisciOrario / risolviTempoAndata / tempoAndata). Il
// frontend Premium NON calcola disponibilità/lead-time/giri: la verità arriva dal
// backend (previewOrderTiming oggi, previewOrderPlanner appena deployato).
import ItemPickerModal from './ItemPickerModal';
import PremiumPlannerPopup from './PremiumPlannerPopup';
import DireccionInlinePanel from './DireccionInlinePanel';
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
.npfs .np-header{ display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 20px; border-bottom:1px solid rgba(208,184,145,0.22); flex-shrink:0; }
.npfs .np-title-row{ display:flex; align-items:center; gap:18px; min-width:0; flex-wrap:wrap; }
.npfs .np-header h1{ margin:0; color:#fbf6eb; font-size:21px; font-weight:900; line-height:1.05; letter-spacing:0; }
.npfs .np-kicker{ margin:0; color:#ffc93d; font-size:13px; font-weight:900; white-space:nowrap; }
/* P2: selettore origen Teléfono/Barra (canal TEL/BANCO) + WA read-only. */
.npfs .np-origen-wa{ display:inline-flex; align-items:center; gap:6px; color:#25D366; font-size:13px; font-weight:900; white-space:nowrap; }
.npfs .np-origen-seg{ display:inline-flex; align-items:center; border:1px solid rgba(208,184,145,0.32); border-radius:999px; overflow:hidden; }
.npfs .np-origen-opt{ appearance:none; border:0; background:transparent; color:#bcae93; font-size:12px; font-weight:800; padding:4px 12px; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:5px; }
.npfs .np-origen-opt:not(:last-child){ border-right:1px solid rgba(208,184,145,0.22); }
.npfs .np-origen-opt.is-active{ background:rgba(250,204,21,0.16); color:#ffd24a; }
/* Badge stato tipo ordine (P1a) — SOLO display, legge tipoConsegna; nessun toggle. */
/* P1a: stato statico (no pill/bottone) — solo testo colorato leggibile. */
.npfs .np-tipo-badge{ display:inline-flex; align-items:center; gap:6px; padding:2px 2px; font-size:13px; font-weight:900; letter-spacing:.3px; white-space:nowrap; }
.npfs .np-tipo-badge.is-ritiro{ color:#ffd24a; }
.npfs .np-tipo-badge.is-domicilio{ color:#7cc4ff; }
.npfs .np-close{ width:40px; height:40px; border:1px solid rgba(246,230,196,0.18); border-radius:10px; color:#fff8ed; background:rgba(255,255,255,0.03); font-size:24px; line-height:1; cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.npfs .np-close:hover{ background:rgba(255,255,255,0.07); }

/* Fixed top region (cards + banner + warnings) */
.npfs .np-fixedtop{ flex-shrink:0; display:flex; flex-direction:column; gap:10px; padding:12px 20px; }
/* align-items:start → il box Cliente prende solo l'altezza del suo contenuto e
   non viene stirato all'altezza del box Dirección (eliminava l'aria morta sotto). */
.npfs .np-top{ display:grid; grid-template-columns:0.95fr 1.05fr; gap:12px; align-items:start; }
.npfs .np-panel{ min-width:0; border:1px solid rgba(208,184,145,0.22); border-radius:10px; padding:14px; background:linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)), #11100e; display:flex; flex-direction:column; gap:0; }
.npfs .np-panel h2{ display:flex; align-items:center; gap:8px; margin:0 0 12px; color:#bcae93; font-size:13px; font-weight:900; text-transform:uppercase; letter-spacing:.5px; }
.npfs .np-customer-panel.is-ok{ border-color:rgba(88,210,125,0.34); }
.npfs .np-customer-panel h2::before{ content:"●"; color:#d7a84b; font-size:18px; }
.npfs .np-address-panel h2::before{ content:"◆"; color:#d7a84b; font-size:16px; }

/* Customer grid */
.npfs .np-customer-grid{ display:grid; grid-template-columns:minmax(0,1fr) 52px; gap:12px; }
.npfs .np-input-like{ min-width:0; min-height:46px; border:1px solid rgba(208,184,145,0.22); border-radius:10px; color:#fff7e8; background:rgba(255,255,255,0.025); display:flex; align-items:center; gap:10px; padding:0 14px; text-align:left; }
.npfs .np-input-like input{ flex:1; min-width:0; background:transparent; border:none; outline:none; color:#fff7e8; font-family:inherit; font-size:16px; font-weight:800; padding:0; }
.npfs .np-input-like input::placeholder{ color:rgba(255,247,232,0.4); font-weight:700; }
.npfs .np-name-field{ position:relative; }
.npfs .np-phone-field .np-phone-ic{ color:#d8cbb5; font-size:17px; flex-shrink:0; }
.npfs .np-icon-action{ min-height:46px; border:1px solid rgba(208,184,145,0.22); border-radius:10px; background:rgba(255,255,255,0.025); color:#fff4dc; display:grid; place-items:center; font-size:18px; font-weight:900; cursor:pointer; }
/* Contatto cliente (P1b): elemento INFORMATIVO neutro, non un'azione (era un
   bottone verde no-op che sembrava "enviar"). Niente verde-azione, cursor default. */
.npfs .np-contact-info{ min-height:46px; border:1px solid rgba(208,184,145,0.20); border-radius:10px; color:#bcae93; background:rgba(255,255,255,0.03); display:grid; place-items:center; font-size:18px; cursor:default; }
.npfs .np-ok{ flex:0 0 auto; width:28px; height:28px; display:grid; place-items:center; border-radius:999px; color:#062d16; background:#58d27d; font-size:17px; font-weight:900; }
.npfs .np-customer-flags{ width:fit-content; max-width:100%; display:flex; align-items:center; margin-top:14px; border:1px solid rgba(208,184,145,0.20); border-radius:10px; overflow:hidden; color:#efe4cc; background:rgba(255,255,255,0.025); font-weight:900; font-size:13px; }
.npfs .np-customer-flags span{ padding:11px 16px; white-space:nowrap; }
.npfs .np-customer-flags span + span{ border-left:1px solid rgba(208,184,145,0.28); }
.npfs .np-customer-flags span:first-child{ color:#ffd13d; }

/* Address panel */
.npfs .np-address-input{ width:100%; }
.npfs .np-address-input strong{ overflow:hidden; font-size:16px; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; font-weight:900; }
.npfs .np-address-input .np-address-text{ flex:1; min-width:0; font-size:16px; line-height:1.15; font-weight:900; color:#fff7ea; background:transparent; border:none; outline:none; padding:0; }
.npfs .np-address-input .np-address-text::placeholder{ color:rgba(255,247,234,0.45); font-weight:800; }
.npfs .np-address-note{ width:100%; margin-top:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12); border-radius:10px; color:#fff; padding:9px 14px; font-size:13px; box-sizing:border-box; outline:none; }
.npfs .np-address-ic{ font-size:20px; flex-shrink:0; }
.npfs .np-delivery-line{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; color:#e8dfd0; font-size:14px; font-weight:900; }
.npfs .np-delivery-line span{ display:inline-flex; align-items:center; gap:5px; border:1px solid rgba(208,184,145,0.18); border-radius:999px; padding:7px 12px; background:rgba(255,255,255,0.04); white-space:nowrap; }
.npfs .np-delivery-cards{ display:grid; grid-template-columns:1fr 1fr minmax(120px,auto); gap:10px; margin-top:12px; }
.npfs .np-dcard{ min-height:52px; border:1px solid rgba(208,184,145,0.18); border-radius:8px; padding:8px 12px; color:#f8f0df; background:rgba(255,255,255,0.025); display:flex; flex-direction:column; justify-content:center; }
.npfs .np-dcard small{ display:block; margin-bottom:3px; color:#c6b6a0; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
.npfs .np-dcard strong{ color:#fff3dc; font-size:16px; font-weight:900; }
.npfs .np-dcard input[type=time]{ background:transparent; border:none; outline:none; color:#fff3dc; font-family:'DM Mono',monospace; font-size:16px; font-weight:900; width:100%; padding:0; }
.npfs .np-dcard.is-deliv input[type=time]{ color:#7ee2a0; }
/* P7: CTA planner ben visibile (era quasi trasparente). Solo UI; wiring invariato. */
.npfs .np-recalc{ min-height:52px; border:1.5px solid rgba(250,204,21,0.85); border-radius:8px; padding:8px 12px; color:#2a2300; background:linear-gradient(180deg,#FACC15,#E0B400); font-size:14px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 2px 10px rgba(250,204,21,0.28); }
.npfs .np-recalc:hover{ background:linear-gradient(180deg,#ffd838,#efc400); }

/* Products head */
.npfs .np-products-head{ display:flex; align-items:center; justify-content:space-between; gap:14px; padding:10px 20px; flex-shrink:0; }
.npfs .np-products-head > div{ display:flex; align-items:center; gap:12px; min-width:0; }
.npfs .np-products-head h2{ margin:0; color:#fff7ed; font-size:16px; font-weight:900; text-transform:uppercase; }
.npfs .np-count-pill{ border:1px solid rgba(208,184,145,0.16); border-radius:999px; padding:5px 11px; color:#cfc3ae; background:rgba(255,255,255,0.025); font-weight:900; font-size:12px; white-space:nowrap; }
.npfs .np-gold-btn{ min-height:38px; border:1px solid rgba(246,189,59,0.36); border-radius:8px; padding:0 16px; color:#111; background:linear-gradient(180deg,#ffd866,#f4b82f); font-weight:900; font-size:14px; cursor:pointer; flex-shrink:0; }
.npfs .np-gold-btn:hover{ filter:brightness(1.05); }

/* (CSS quick-add rimossa con la barra Rápido.) */

/* Products list */
.npfs .np-products{ flex:1; min-height:0; overflow-y:auto; padding:0 20px 10px; -webkit-overflow-scrolling:touch; scrollbar-color:rgba(208,184,145,0.45) transparent; }
/* Riga prodotto: index | blocco principale (nome+prezzo su riga 1, nota+extra su
   riga 2) | azioni. Niente più cella nota schiacciata/troncata a destra. */
.npfs .np-row{ display:grid; grid-template-columns:34px minmax(0,1fr) auto; align-items:center; gap:14px; border:1px solid rgba(208,184,145,0.16); border-radius:8px; margin-bottom:8px; padding:9px 14px; background:linear-gradient(90deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)), #15130f; }
.npfs .np-index{ width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(208,184,145,0.24); border-radius:8px; color:#fff7e7; font-size:15px; font-weight:900; }
.npfs .np-row-main{ min-width:0; display:flex; flex-direction:column; gap:5px; }
.npfs .np-row-head{ display:flex; flex-wrap:wrap; align-items:center; gap:8px 10px; }
.npfs .np-pname{ flex:0 1 auto; min-width:0; max-width:100%; overflow:hidden; color:#fff7ea; font-size:15px; font-weight:900; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; }
/* P6: descrizione reale prodotto da MENU.sub (≠ item.sub variazioni). */
.npfs .np-pdesc{ color:#a99f8b; font-size:12.5px; font-weight:600; line-height:1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.npfs .np-price{ flex-shrink:0; color:#fff8ec; font-size:15px; font-weight:900; text-align:right; font-family:'DM Mono',monospace; }
/* Blocco destro riga prodotto: prezzo + azioni, centrati verticalmente (il prezzo
   non resta più "appeso" in alto accanto al nome con la riga a 3 livelli). */
.npfs .np-row-right{ display:flex; align-items:center; gap:14px; }
/* Riga 2 compatta: descrizione + nota cucina rossa + chip extra, tutto IN LINEA.
   Va a capo solo se non c'è spazio (flex-wrap), così la riga resta bassa. */
.npfs .np-row-desc{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
.npfs .np-row-meta{ display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.npfs .np-note-red{ display:inline-flex; align-items:center; gap:5px; border-radius:6px; padding:2px 9px; font-size:12px; font-weight:800; color:#ff8f7a; background:rgba(232,52,28,0.12); border:1px solid rgba(232,52,28,0.42); }
.npfs .np-extra-chip{ display:inline-flex; align-items:center; gap:5px; border-radius:6px; padding:2px 4px 2px 9px; font-size:12px; font-weight:800; color:#e9c98a; background:rgba(208,184,145,0.10); border:1px solid rgba(208,184,145,0.30); }
.npfs .np-extra-x{ display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; padding:0; border:none; border-radius:50%; background:transparent; color:#E8341C; font-size:13px; font-weight:900; line-height:1; cursor:pointer; }
.npfs .np-extra-x:hover{ background:rgba(232,52,28,0.18); }
.npfs .np-actions{ display:grid; grid-template-columns:repeat(5,auto); align-items:center; gap:8px; }
.npfs .np-actions button, .npfs .np-actions .np-qty{ width:34px; height:32px; display:grid; place-items:center; border:1px solid rgba(208,184,145,0.20); border-radius:8px; color:#fff5e4; background:rgba(255,255,255,0.035); font-size:16px; font-weight:900; cursor:pointer; padding:0; }
.npfs .np-actions .np-qty{ background:rgba(0,0,0,0.28); font-family:'DM Mono',monospace; cursor:default; }
/* Danger (🗑): separato dal "+" per ridurre il rischio di delete accidentale
   (P3). Solo spaziatura visiva, nessun cambio logico su handleRemoveItem. */
.npfs .np-actions .np-danger{ border-color:rgba(239,68,68,0.35); color:#fff; background:rgba(127,29,29,0.72); margin-left:10px; }
/* Zona editabile (P3): solo #idx + nome aprono l'edit (era l'intera riga →
   tap accidentale). I bottoni −/+/🗑 restano invariati. */
.npfs .np-edit-zone{ cursor:pointer; }
.npfs .np-empty{ height:100%; min-height:220px; display:grid; place-content:center; justify-items:center; gap:12px; color:#d3c5ae; text-align:center; }

/* Footer */
.npfs .np-footer{ display:grid; grid-template-columns:minmax(240px,1fr) auto auto minmax(190px,auto); align-items:center; gap:16px; padding:12px 20px; border-top:1px solid rgba(208,184,145,0.28); background:rgba(12,11,9,0.96); flex-shrink:0; }
.npfs .np-summary{ display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; min-width:0; }
.npfs .np-summary .np-items{ color:#efe4d0; font-size:15px; font-weight:900; }
.npfs .np-summary .np-total{ color:#fff3df; font-size:22px; font-weight:900; font-family:'DM Mono',monospace; }
.npfs .np-summary small{ color:#bcb09f; font-size:12px; font-weight:800; }
.npfs .np-confirm{ min-height:46px; border:1px solid rgba(74,222,128,0.36); border-radius:10px; color:#effff3; background:linear-gradient(180deg,#2eb45e,#218f4d); font-size:15px; font-weight:900; cursor:pointer; padding:0 18px; white-space:nowrap; }
.npfs .np-confirm:disabled{ color:#8a8276; background:#27231d; border-color:rgba(208,184,145,0.18); cursor:not-allowed; }

/* Responsive collapse — solo mobile vero. Tablet/finestre desktop strette
   (>=680px) restano sul layout orizzontale a 2 colonne così la lista prodotti
   resta visibile senza scroll forzato (no effetto "mobile ingrandito"). */
@media (max-width:680px){
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
  .npfs .np-row{ grid-template-columns:32px minmax(0,1fr); gap:10px; }
  .npfs .np-row-right{ grid-column:1 / -1; justify-content:flex-end; }
  /* Mobile (P3): tap target più comodo e 🗑 più staccato dal "+". */
  .npfs .np-actions button, .npfs .np-actions .np-qty{ width:44px; height:42px; }
  .npfs .np-actions .np-danger{ margin-left:16px; }
  /* Footer compatto: era 4 righe impilate (~261px, ~31% di uno schermo 844) e
     comprimeva il corpo scrollabile. Ora 3 righe: riepilogo / [descuento·pagado] /
     confirmar full-width. Riduce l'altezza ~30% liberando spazio per le card
     timing + productos. Confirmar resta full-width e grande (tap target). */
  .npfs .np-footer{ grid-template-columns:auto 1fr; gap:8px 10px; padding:10px 14px 12px; }
  .npfs .np-footer > .np-summary{ grid-column:1 / -1; gap:4px 14px; }
  .npfs .np-footer > .np-summary .np-total{ font-size:24px; }
  .npfs .np-footer > .np-summary .np-items{ font-size:18px; }
  .npfs .np-footer > .np-confirm{ grid-column:1 / -1; min-height:52px; }

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
  .npfs .np-icon-action, .npfs .np-contact-info{ min-height:48px; font-size:20px; }
  .npfs .np-address-input strong, .npfs .np-address-input .np-address-text{ font-size:18px; }
  .npfs .np-dcard{ min-height:52px; }
  .npfs .np-dcard strong, .npfs .np-dcard input[type=time]{ font-size:18px; }
  .npfs .np-customer-flags{ margin-top:10px; }
  .npfs .np-delivery-cards{ margin-top:12px; }
}
`;

const CLOSING_TIME_MIN = 23 * 60;
const CLOSING_TIME_ERROR = "Hora inválida.";
const CLOSING_TIME_OVERRIDE_MARKER = "FUERA_HORARIO_FORZADO";

// Quick-add (barra Rápido) rimossa dalla schermata principale (resta «Añadir producto» + picker).

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

// Overlay di stato del planner: loading oppure errore sicuro. NON mostra MAI
// proposte/orari/mappa — le proposte reali vivono SOLO in PremiumPlannerPopup,
// montato esclusivamente con un contract valido. Nessun mock/fixture qui.
const PlannerStatusOverlay = ({ loading, message, onClose }) => (
  <div
    onClick={onClose}
    style={{
      position: "fixed", inset: 0, zIndex: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: "#15130f", border: "1px solid rgba(208,184,145,0.28)",
        borderRadius: 14, padding: "26px 28px", width: "min(420px, 92vw)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)", textAlign: "center",
        color: "#f7f0df", fontFamily: "'Satoshi',Inter,system-ui,sans-serif",
      }}
    >
      {loading ? (
        <>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⟳</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Calculando propuestas…</div>
          <div style={{ fontSize: 13, color: "#bcae93", marginTop: 6 }}>Consultando el planner</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fca5a5" }}>Planner no disponible</div>
          <div style={{ fontSize: 13, color: "#e8dfd0", marginTop: 8, lineHeight: 1.4 }}>
            {message || "No se pudieron cargar las propuestas. Usa la hora manual."}
          </div>
        </>
      )}
      <button
        onClick={onClose}
        style={{
          marginTop: 18, minHeight: 42, padding: "0 22px",
          border: "1px solid rgba(208,184,145,0.4)", borderRadius: 9,
          background: "rgba(255,255,255,0.04)", color: "#fff5e4",
          fontWeight: 800, fontSize: 14, cursor: "pointer",
        }}
      >
        Cerrar
      </button>
    </div>
  </div>
);

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
  const [showPlannerLabPopup, setShowPlannerLabPopup] = useState(false);
  // Planner propuestas → strategic preview backend (read-only). Si valorizza SOLO
  // al click. null + showPlannerLabPopup = estado loading/error (NUNCA mock): el
  // popup de propuestas se monta solo con un contract válido.
  const [strategicPreview, setStrategicPreview] = useState(null);
  const [strategicError,   setStrategicError]   = useState("");
  // Loading state read-only: true mentre la preview backend è in volo (solo se c'è
  // hora). Render-only, nessun calcolo. Guard anti-stale: solo l'ultima richiesta
  // (o apertura/chiusura) può aggiornare preview/warning/loading.
  const [strategicLoading, setStrategicLoading] = useState(false);
  const strategicReqIdRef = useRef(0);
  // Ruta manual LAB → previewManualGiroRoute (read-only). El operador propone la
  // secuencia de paradas en el popup; aquí guardamos la preview backend + warning +
  // loading con el MISMO guard anti-stale del strategic. Nada de esto se usa para
  // escribir/guardar: solo render. null = sin ruta manual calculada todavía.
  const [manualRoutePreview, setManualRoutePreview] = useState(null);
  const [manualRouteWarning, setManualRouteWarning] = useState("");
  const [manualRouteLoading, setManualRouteLoading] = useState(false);
  const manualReqIdRef = useRef(0);
  // Override esplicito: l'operatore ha cliccato "Forzar HORA" ignorando la proposta
  const [forzaHora, setForzaHora] = useState(false);
  // "Para ahora" (RITIRO): in volo mentre chiediamo al backend il primo ritiro fattibile
  const [paraAhoraLoading, setParaAhoraLoading] = useState(false);
  // RITIRO in modalità "ritiro inmediato": l'ora è imposta dal backend (adesso +
  // cottura) e il campo ora è offuscato/non interattivo finché resta attiva.
  const [ritiroInmediato, setRitiroInmediato] = useState(false);
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
    setRitiroInmediato(false);
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

  // "Para ahora" (solo RITIRO): chiede al backend il primo ritiro fattibile
  // (adesso Madrid + cottura) e lo applica come hora. NESSUN calcolo locale:
  // il "+5" e l'ora di Madrid vivono nel backend (previewOrderTiming →
  // earliest_hora). Se il backend non lo espone ancora, non facciamo nulla.
  const aplicarParaAhora = async () => {
    // Toggle: se già in ritiro inmediato, lo spengo e l'ora torna editabile.
    if (ritiroInmediato) { setRitiroInmediato(false); return; }
    setParaAhoraLoading(true);
    try {
      const res = await api.previewOrderTiming({ tipo_consegna: "RITIRO" });
      const earliest = res && res.earliest_hora ? res.earliest_hora : null;
      if (earliest) {
        setHoraFromOperator(earliest);
        setRitiroInmediato(true);
      } else {
        console.warn("[paraAhora] backend sin earliest_hora (¿backend no desplegado?)");
      }
    } catch (err) {
      console.warn("[paraAhora] failed:", err?.message || err);
    } finally {
      setParaAhoraLoading(false);
    }
  };

  // "Ritiro inmediato" è RITIRO-only: se l'operatore inserisce un indirizzo
  // (→ DOMICILIO) lo spegniamo, così non resta un campo ora offuscato.
  useEffect(() => {
    if (tipoConsegna === "DOMICILIO" && ritiroInmediato) setRitiroInmediato(false);
  }, [tipoConsegna, ritiroInmediato]);

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

  // ── Planner propuestas — apertura ESPLICITA (mai automatica), SOLO dati reali ──
  // startTime = `hora` GIÀ scelta nel draft (no Date.now). Read-only: nessun ordine
  // creato/modificato. REGOLA V1: niente mock/LAB nel flusso operatore. Se manca
  // hora o il backend non risponde con un contract valido → stato di ERRORE sicuro
  // (mai dati finti). Il popup proposte si monta solo con strategicPreview valido.
  const openPlannerLab = async () => {
    setShowPlannerLabPopup(true);
    // Ogni apertura invalida le risposte in volo precedenti (anti-stale).
    const reqId = ++strategicReqIdRef.current;
    setStrategicPreview(null);
    if (!hora) {
      setStrategicLoading(false);
      setStrategicError("Falta la hora de entrega · elígela y vuelve a abrir el planner.");
      return;
    }
    setStrategicError("");
    setStrategicLoading(true);
    const pizzasCount = items.reduce((s, it) => s + (parseInt(it.q) || 1), 0);
    const input = {
      startTime: hora,
      currentOrderDraft: {
        tipoConsegna,
        zone: zonaInfo?.zona?.id || null,   // zona ya resuelta; null si aún no
        hora,
        horaFlexible: !forzaHora,
        pizzas: pizzasCount,
      },
    };
    try {
      const res = await api.previewStrategicOpportunities(input);
      // Anti-stale: scarta se nel frattempo è arrivata una nuova apertura/chiusura.
      if (reqId !== strategicReqIdRef.current) return;
      // SOLO contract strategic válido alimenta el render. Cualquier otra cosa
      // (contract inválido / 401 / error) → estado de error, NUNCA mock.
      if (res && res.contract === "premium-planner-strategic-preview-v1") {
        setStrategicPreview(res);
        setStrategicError("");
      } else if (res && res._status === 401) {
        setStrategicPreview(null);
        setStrategicError("Sesión expirada · vuelve a entrar. Usa la hora manual.");
      } else {
        setStrategicPreview(null);
        setStrategicError("Planner no disponible · usa la hora manual.");
      }
    } catch (e) {
      if (reqId !== strategicReqIdRef.current) return;
      setStrategicPreview(null);
      setStrategicError("Planner no disponible · usa la hora manual.");
      console.warn("[previewStrategicOpportunities] failed:", e?.message || e);
    } finally {
      if (reqId === strategicReqIdRef.current) setStrategicLoading(false);
    }
  };

  // Chiusura popup: invalida eventuali risposte in volo (anti-stale) e azzera il
  // loading/errore, così una risposta vecchia non sporca un popup chiuso/riaperto.
  const closePlannerLab = () => {
    strategicReqIdRef.current++;
    setStrategicLoading(false);
    setStrategicError("");
    // Invalida también la ruta manual en vuelo y limpia su preview/warning.
    manualReqIdRef.current++;
    setManualRouteLoading(false);
    setManualRoutePreview(null);
    setManualRouteWarning("");
    setShowPlannerLabPopup(false);
  };

  // ── Ruta manual LAB — calcula la routeTimeline de una secuencia propuesta ────
  // `selectedStops` llega YA construido por el popup (pedido actual + anclas
  // clicadas, en orden). Aquí SOLO validamos (hora + zona resueltas), añadimos el
  // currentOrderDraft no-PII y llamamos al backend read-only. startTime = `hora`
  // del draft (NO Date.now). NO crea/modifica ordenes, NO toca `hora`. La respuesta
  // se usa solo para render. Guard anti-stale: solo la última petición/cierre vale.
  const calcManualRoute = async (selectedStops) => {
    const reqId = ++manualReqIdRef.current;
    if (!hora) {
      setManualRouteLoading(false);
      setManualRoutePreview(null);
      setManualRouteWarning("startTime mancante (hora no elegida) · backend NO llamado");
      return;
    }
    // Zona del pedido actual: la del stop current_order que arma el popup (puede
    // ser la zona resuelta real O una elegida a mano en modo LAB, sin geo); si no,
    // cae en la zona ya resuelta del draft. NO se resuelve geo aquí.
    const currentStop = Array.isArray(selectedStops)
      ? selectedStops.find((s) => s && s.type === "current_order")
      : null;
    const curZone = (currentStop && currentStop.zone) || zonaInfo?.zona?.id || null;
    if (!curZone) {
      setManualRouteLoading(false);
      setManualRoutePreview(null);
      setManualRouteWarning("Zona del pedido actual sin resolver · backend NO llamado");
      return;
    }
    if (!Array.isArray(selectedStops) || selectedStops.length === 0) {
      setManualRoutePreview(null);
      setManualRouteWarning("Sin paradas seleccionadas");
      return;
    }
    setManualRouteWarning("");
    setManualRoutePreview(null);
    setManualRouteLoading(true);
    const pizzasCount = items.reduce((s, it) => s + (parseInt(it.q) || 1), 0);
    const input = {
      startTime: hora,
      currentOrderDraft: {
        tipoConsegna,
        zone: curZone,
        hora,
        horaFlexible: !forzaHora,
        pizzas: pizzasCount,
      },
      selectedStops,
      includeReturn: true,
      includeCrossZone: true,
    };
    try {
      const res = await api.previewManualGiroRoute(input);
      if (reqId !== manualReqIdRef.current) return;
      if (res && res.contract === "premium-planner-manual-giro-route-preview-v1") {
        setManualRoutePreview(res);
        setManualRouteWarning("");
      } else if (res && res._status === 401) {
        setManualRoutePreview(null);
        setManualRouteWarning("Sesión expirada o autorización requerida");
      } else {
        setManualRoutePreview(null);
        setManualRouteWarning("Backend ruta manual no disponible (contract inválido / unknown action)");
      }
    } catch (e) {
      if (reqId !== manualReqIdRef.current) return;
      setManualRoutePreview(null);
      setManualRouteWarning("Backend ruta manual falló (internal_error / red)");
      console.warn("[previewManualGiroRoute] failed:", e?.message || e);
    } finally {
      if (reqId === manualReqIdRef.current) setManualRouteLoading(false);
    }
  };

  // Limpia la preview manual (botón "Limpiar ruta" en el popup) e invalida vuelos.
  const clearManualRoute = () => {
    manualReqIdRef.current++;
    setManualRouteLoading(false);
    setManualRoutePreview(null);
    setManualRouteWarning("");
  };

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

  // ── Parsing item.sub: separa nota cucina libera dagli ingredienti extra ──
  // Sorgente unica per il display della riga prodotto. NON tocca item.sub salvato.
  //   "+Jamón cocido, +Jamón cocido, cortar en 4"
  //     → { note: "cortar en 4", extras: [{name:"Jamón cocido", qty:2}] }
  const splitItemSub = (sub) => {
    const parts = String(sub || "").split(",").map(s => s.trim()).filter(Boolean);
    const order = [];           // nomi extra nell'ordine di prima comparsa
    const counts = {};
    const notes = [];           // testo non-extra (variazioni / nota libera)
    parts.forEach(p => {
      if (p.startsWith("+")) {
        const name = p.replace(/^\+/, "").trim();
        if (!(name in counts)) order.push(name);
        counts[name] = (counts[name] || 0) + 1;
      } else {
        notes.push(p);
      }
    });
    return { note: notes.join(", "), extras: order.map(n => ({ name: n, qty: counts[n] })) };
  };
  // Label testuale (tooltip): "cortar en 4 · Jamón cocido ×2, Pancetta"
  const formatExtrasLabel = (sub) => {
    const { note, extras } = splitItemSub(sub);
    const extrasStr = extras.map(e => e.qty > 1 ? `${e.name} ×${e.qty}` : e.name).join(", ");
    if (!extrasStr) return note || null;
    return note ? `${note} · ${extrasStr}` : extrasStr;
  };
  const extrasLabel = (item) => formatExtrasLabel(item.sub);

  // Rimuove UNA occorrenza di un extra direttamente dalla riga prodotto principale.
  // Stessa logica di ItemPickerModal.removeExtra (−1 occorrenza di "+nome" + −prezzo
  // dall'item.p per-unità), ma applicata all'item del parent via handleUpdate (_uid).
  // NON cambia il formato di item.sub né il prezzo base.
  const removeExtraFromItem = (item, ingName) => {
    const ing = INGREDIENTI.find(g => g.n === ingName);
    const parts = String(item.sub || "").split(",").map(s => s.trim()).filter(Boolean);
    let rimosso = false;
    const newParts = parts.filter(p => {
      if (!rimosso && p === "+" + ingName) { rimosso = true; return false; }
      return true;
    });
    if (!rimosso) return;
    handleUpdate({
      ...item,
      p: ing ? Math.max(0, Math.round((item.p - ing.prezzo) * 100) / 100) : item.p,
      sub: newParts.join(", ")
    });
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
          width: "min(1280px, calc(100vw - 32px))",
          height: "94dvh", maxHeight: "94vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,.6)", overflow: "hidden"
        }}>
          <style>{NPFS_CSS}</style>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <header className="np-header">
            <div className="np-title-row">
              <h1>Nuevo Pedido</h1>
              {/* Badge stato tipo (P1a): solo display, riflette tipoConsegna (derivato dall'indirizzo). */}
              <span className={`np-tipo-badge ${tipoConsegna === "DOMICILIO" ? "is-domicilio" : "is-ritiro"}`}>
                {tipoConsegna === "DOMICILIO" ? "🛵 DOMICILIO" : "🏪 RITIRO"}
              </span>
              {/* P2: origen — WA read-only; altrimenti selettore Teléfono/Barra
                  legato a `canal` (TEL/BANCO), già salvato in createOrden. */}
              {canal === "WA" ? (
                <span className="np-origen-wa" title="Origen: WhatsApp (no editable)">💬 WhatsApp</span>
              ) : (
                <span className="np-origen-seg" role="group" aria-label="Origen del pedido">
                  <button type="button"
                    className={`np-origen-opt${canal !== "BANCO" ? " is-active" : ""}`}
                    aria-pressed={canal !== "BANCO"}
                    onClick={() => setCanal("TEL")}>☎ Teléfono</button>
                  <button type="button"
                    className={`np-origen-opt${canal === "BANCO" ? " is-active" : ""}`}
                    aria-pressed={canal === "BANCO"}
                    onClick={() => setCanal("BANCO")}>🍺 Barra</button>
                </span>
              )}
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
                    {/* Contatto cliente — elemento informativo neutro, NON un'azione (P1b) */}
                    <span className="np-contact-info" role="img" aria-disabled="true"
                      aria-label="Contacto cliente (informativo, no envía nada)"
                      title={contactAvailable ? "Contacto cliente (informativo, no envía nada)" : "Añade un teléfono para contactar"}>
                      {canal === "WA" ? "💬" : "📞"}
                    </span>
                  </div>
                  {clienteAbitual && (
                    <div className="np-customer-flags">
                      <span>★ Cliente habitual</span>
                      <span>{clienteAbitual.total_pedidos || 0} pedidos</span>
                      {clienteAbitual.direccion && <span>Dirección guardada</span>}
                    </div>
                  )}
                </section>

                <DireccionInlinePanel
                  tipoConsegna={tipoConsegna}
                  direccion={direccion}
                  setDireccion={setDireccion}
                  direccionNote={direccionNote}
                  setDireccionNote={setDireccionNote}
                  deliveryZona={deliveryZona}
                  zonaInfo={zonaInfo}
                  zonaLoading={zonaLoading}
                  zonaManuale={zonaManuale}
                  setZonaInfo={setZonaInfo}
                  setZonaManuale={setZonaManuale}
                  zoneOptions={ZONE_DELIVERY}
                  ZonaBadgeComponent={ZonaBadge}
                  backendTiming={backendTiming}
                  backendTimingLoading={backendTimingLoading}
                  deliveryFornoOut={deliveryFornoOut}
                  hora={hora}
                  setHoraFromOperator={setHoraFromOperator}
                  deliveryStatus={deliveryStatus}
                  onOpenPlannerLab={openPlannerLab}
                  onParaAhora={aplicarParaAhora}
                  paraAhoraLoading={paraAhoraLoading}
                  ritiroInmediato={ritiroInmediato}
                />
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
                        : <>Horno {pickupKitchenStatus.pizzas}/{pickupKitchenStatus.capacity} · {pickupKitchenStatus.windowMinutes} min</>}
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

            {/* ── Inline planner hint (consejero read-only, auto-fetched) ─── */}
            {(plannerPreviewLoading || plannerPreview || plannerPreviewError) && (
              <div style={{
                padding: "5px 24px",
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                borderBottom: "1px solid rgba(208,184,145,0.10)",
                fontSize: 11, fontWeight: 700,
              }}>
                {plannerPreviewLoading && !plannerPreview && (
                  <span style={{ color: "rgba(255,255,255,0.38)", fontStyle: "italic" }}>⟳ Planner calculando…</span>
                )}
                {!plannerPreviewLoading && plannerPreviewError && (
                  <span style={{ color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>{plannerPreviewError}</span>
                )}
                {plannerPreview && (
                  <>
                    {/* P4(b): pill verde "Planner OK" rimossa (rumore happy-path).
                        Resta solo l'indicatore di blocco; blocker/warning/hora/giro sotto invariati. */}
                    {plannerOk === false && (
                      <span style={{
                        color: "#fca5a5",
                        background: "rgba(239,68,68,0.10)",
                        border: "1px solid rgba(239,68,68,0.26)",
                        borderRadius: 999, padding: "2px 8px",
                      }}>
                        ⚠ Bloqueado
                      </span>
                    )}
                    {plannerBlockers.length > 0 && (
                      <span style={{ color: "#fca5a5" }}>
                        {plannerBlockers[0]?.message || String(plannerBlockers[0])}
                      </span>
                    )}
                    {plannerOk !== false && (plannerRecommendation?.hora_proposta || plannerRecommendation?.suggested_hora) && (
                      <span style={{ color: "#d1fae5" }}>
                        → {plannerRecommendation.hora_proposta || plannerRecommendation.suggested_hora}
                      </span>
                    )}
                    {plannerOk !== false && plannerGiro?.slot_hora && (
                      <span style={{ color: "#a5f3fc" }}>
                        🔄 {plannerGiro.slot_hora}{plannerGiro.zona ? ` · ${plannerGiro.zona}` : ""}
                      </span>
                    )}
                    {plannerWarnings.slice(0, 2).map((w, i) => (
                      <span key={i} style={{ color: "#fbbf24" }}>
                        · {w?.message || String(w)}
                      </span>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── Header prodotti ─────────────────────────────────────────── */}
            <div className="np-products-head">
              <div>
                <h2>Productos</h2>
                <span className="np-count-pill">{items.length} línea{items.length !== 1 ? "s" : ""} · {itemQtyTotal} item{itemQtyTotal !== 1 ? "s" : ""}</span>
              </div>
              <button className="np-gold-btn" onClick={() => { setEditingItem(null); setPickerVisible(true); }}>⊕ Añadir producto</button>
            </div>

            {/* Quick-add (barra Rápido) rimossa: solo «Añadir producto» (sopra) + picker. */}

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
                  <div key={item._uid} className="np-row">
                    <span className="np-index np-edit-zone" onClick={() => handleEditItem(item)} title="Editar producto">{idx + 1}</span>
                    <div className="np-row-main">
                      {(() => {
                        const menuDesc = (MENU.find(m => String(m.id) === String(item.id)) || {}).sub;
                        const { note, extras } = splitItemSub(item.sub);
                        return (
                          <>
                            {/* Riga 1: nome prodotto + chip extra IN LINEA accanto al nome. */}
                            <div className="np-row-head" title={extrasLabel(item) || undefined}>
                              <strong className="np-pname np-edit-zone" onClick={() => handleEditItem(item)} title="Editar producto">{item.n}</strong>
                              {extras.map((ex, i) => (
                                <span key={i} className="np-extra-chip">
                                  {ex.name}{ex.qty > 1 ? ` ×${ex.qty}` : ""}
                                  <button
                                    type="button"
                                    className="np-extra-x"
                                    title={`Quitar ${ex.name}`}
                                    aria-label={`Quitar ${ex.name}`}
                                    onClick={e => { e.stopPropagation(); removeExtraFromItem(item, ex.name); }}
                                  >×</button>
                                </span>
                              ))}
                            </div>
                            {/* Riga 2: descrizione reale dal MENU (MENU.sub) + SOLO la nota
                                cucina rossa. Gli extra stanno sulla riga 1. */}
                            {(menuDesc || note) && (
                              <div className="np-row-desc">
                                {menuDesc && <span className="np-pdesc">{menuDesc}</span>}
                                {note && <span className="np-note-red">⚠ {note}</span>}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="np-row-right">
                      <strong className="np-price">{(item.p * item.q).toFixed(2)}€</strong>
                      <div className="np-actions" aria-label={`Acciones ${item.n}`}>
                        <button title="Editar ingredientes" onClick={e => { e.stopPropagation(); handleEditItem(item); }}>✎</button>
                        <button title="Quitar una unidad" onClick={e => { e.stopPropagation(); adj(item._uid, -1); }}>−</button>
                        <strong className="np-qty">{item.q}</strong>
                        <button title="Añadir una unidad" onClick={e => { e.stopPropagation(); adj(item._uid, +1); }}>+</button>
                        <button className="np-danger" title="Eliminar" onClick={e => { e.stopPropagation(); handleRemoveItem(item._uid); }}>🗑</button>
                      </div>
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

      {/* ── Planner propuestas (apertura esplicita dal botón delivery) ──────────
          SOLO dati reali read-only: il popup proposte si monta ESCLUSIVAMENTE con
          un contract strategic valido (strategicPreview). Loading/errore → overlay
          di stato sicuro, MAI la fixture mock. Nessuna scrittura ordine. */}
      {showPlannerLabPopup && (
        strategicPreview ? (
          <PremiumPlannerPopup
            onClose={closePlannerLab}
            data={strategicPreview}
            labWarning=""
            loading={false}
            manualCurrentZone={zonaInfo?.zona?.id || null}
            manualStartTime={hora || null}
            manualRoutePreview={manualRoutePreview}
            manualRouteLoading={manualRouteLoading}
            manualRouteWarning={manualRouteWarning}
            onCalcManualRoute={calcManualRoute}
            onClearManualRoute={clearManualRoute}
          />
        ) : (
          <PlannerStatusOverlay
            loading={strategicLoading}
            message={strategicError}
            onClose={closePlannerLab}
          />
        )
      )}

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
