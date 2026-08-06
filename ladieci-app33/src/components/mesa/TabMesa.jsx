import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../../constants";
import { createMesaRequestId, describeMesaError, mesaApi } from "../../mesa/mesaApi";

const euro = (value) => new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2,
}).format(Number(value) || 0);

const METHODS = [
  { id: "efectivo", label: "Efectivo", icon: "💵", color: "#16A34A" },
  { id: "tarjeta", label: "Tarjeta", icon: "💳", color: "#2563EB" },
  { id: "bizum", label: "Bizum", icon: "📱", color: "#8B5CF6" },
];

const RESERVATION_ROLES = new Set(["admin", "operator", "owner", "cashier", "waiter", "shift_manager", "legacy_operator"]);
const MADRID_TIMEZONE = "Europe/Madrid";

// Three operative shapes, always offered in this exact order everywhere
// (creation, edit, this picker, tests, the verification harness): Redonda ->
// Cuadrada -> Rectangular. Round and square never vary; only the rectangle
// has a second, longer preset.
const BASE_SHAPES = [
  { shape: "round", label: "Redonda" },
  { shape: "square", label: "Cuadrada" },
  { shape: "rectangle", label: "Rectangular" },
];
// 6/8 plazas are the only capacity-affecting picks -- choosing a base SHAPE
// never touches capacity (it would silently clobber a value the operator
// already typed or already saved on an existing table); choosing a plazas
// PRESET is itself an explicit capacity choice, so it fills the field.
const RECTANGLE_LENGTHS = [
  { shapePreset: "standard", label: "6 plazas", capacity: 6 },
  { shapePreset: "long", label: "8 plazas", capacity: 8 },
];
// shape+shapePreset -> CSS variant class. Round/square only ever have
// "standard"; only rectangle distinguishes standard(6)/long(8).
function variantIdOf(shape, shapePreset) {
  return shape === "rectangle" && shapePreset === "long" ? "rectangle-long" : shape;
}
// Mirrors the fixed pixel widths in the .mesa-table.* CSS rules below. Height
// never varies (always 100px), so only the horizontal drag margin needs to
// account for it -- a wide rectangle-long card needs more clearance from the
// board edge than a round/square one or its dragged edge clips against the
// board's own overflow:hidden.
function cardWidthOf(shape, shapePreset) {
  if (shape === "rectangle") return shapePreset === "long" ? 168 : 132;
  return 100;
}

// ── Position resolution: valid saved coordinates are never touched, missing
// ones get a deterministic fallback, out-of-range-but-real numbers get
// clamped. See the root-cause note on the backend's buildFloor() --
// Number(null) used to collapse every never-positioned table to the exact
// same (0,0) point; the backend now sends null through untouched, and this
// is where that null actually gets turned into a real, readable position.
//
// Approximate per-shape margin as a PERCENTAGE of the board, calibrated
// against this app's primary ~360-400px mobile board width (the same range
// pointerMove's own Math.max(7, ...) floor is calibrated for) -- adequate
// for keeping a card's edge on-canvas without needing a live
// getBoundingClientRect() measurement at render time, which drag already
// does precisely when it actually matters (mid-drag).
function marginPctFor(shape, shapePreset) {
  const px = cardWidthOf(shape, shapePreset);
  return Math.min(30, Math.max(12, Math.round((px / 2 / 380) * 100)));
}
function isFiniteCoord(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function clampPct(value, marginPct) {
  return Math.max(marginPct, Math.min(100 - marginPct, value));
}
// Grid slot for the Nth table (of `total`) that needs a fallback position --
// pure function of (index, total) only, so "same tables + same sala = same
// layout" holds regardless of network response order. Up to 3 columns, as
// many rows as needed; margin uses the single largest shape margin in play
// so no fallback-placed table can clip regardless of which shape lands in
// which cell.
function fallbackGridSlot(index, total, marginPct) {
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(total))));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const usable = 100 - marginPct * 2;
  const x = cols === 1 ? 50 : marginPct + (col / (cols - 1)) * usable;
  const y = rows === 1 ? 50 : marginPct + (row / (rows - 1)) * usable;
  return { x, y };
}
// Resolves final render positions for a floor's tables. Never mutates or
// reorders the input, never calls the API -- purely a render-time
// derivation, recomputed fresh every time from whatever the floor actually
// has (idempotent by construction: same input array => same output).
function resolveTablePositions(tables) {
  const missing = tables
    .filter((table) => !isFiniteCoord(table.x) || !isFiniteCoord(table.y))
    // Stable order independent of API/array order, so the SAME set of
    // under-positioned tables always lands in the SAME grid cells.
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number));
  const missingIds = new Set(missing.map((table) => table.id));
  const fallbackMargin = missing.length
    ? Math.max(...missing.map((table) => marginPctFor(table.shape, table.shapePreset)))
    : 0;
  const slotByTableId = new Map(missing.map((table, index) => [table.id, fallbackGridSlot(index, missing.length, fallbackMargin)]));

  return tables.map((table) => {
    if (missingIds.has(table.id)) {
      const slot = slotByTableId.get(table.id);
      return { ...table, x: slot.x, y: slot.y };
    }
    const marginPct = marginPctFor(table.shape, table.shapePreset);
    const x = clampPct(table.x, marginPct);
    const y = clampPct(table.y, marginPct);
    // Only touch it if clamping actually changed something -- a validly
    // saved position must come back byte-identical, not a same-value copy.
    return (x === table.x && y === table.y) ? table : { ...table, x, y };
  });
}

// Short Spanish label for a comanda's kitchen state, shown in the table's own
// popup so a waiter never has to open "Ver cuenta" just to see where an order
// stands.
function commandStateLabel(estado) {
  if (estado === "LISTO") return "Listo para servir";
  if (estado === "EN_COCINA") return "En cocina";
  if (estado === "RETIRADO") return "Servido";
  if (estado === "POR_CONFIRMAR") return "Por confirmar";
  return estado || "—";
}

function madridFields(value = new Date()) {
  const out = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(value instanceof Date ? value : new Date(value)).forEach((part) => {
    if (part.type !== "literal") out[part.type] = part.value;
  });
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    time: `${String(Number(out.hour) % 24).padStart(2, "0")}:${out.minute}`,
  };
}

function reservationLocalFields(reservation) {
  return reservation?.reservedAt ? madridFields(reservation.reservedAt) : madridFields(new Date(Date.now() + 60 * 60 * 1000));
}

// THE one shared rule for "is this reservation relevant right now" -- floor
// tiles (tableState below), the table popup's collapsible Reserva section,
// its "Ver reservas de la noche" count, and Reservas · Beta's own list all
// route through this, so none of them can ever disagree about the same
// booking. Relevant means: booked, dated today, and its reserved window
// (reservedAt through reservedAt+durationMinutes) hasn't fully elapsed --
// without the window check a booking from hours ago that nobody ever seated
// or cancelled would read as "still relevant" forever; without the date
// check, a stale prior-day booking would too. A missing/invalid duration
// falls back to this app's own fixed reservation length (2h, same default
// ReservationModal itself uses) rather than treating it as zero-length.
function isRelevantReservation(reservation, now = new Date()) {
  if (!reservation || reservation.status !== "booked") return false;
  if (madridFields(reservation.reservedAt).date !== madridFields(now).date) return false;
  const durationMinutes = Number(reservation.durationMinutes) > 0 ? Number(reservation.durationMinutes) : 120;
  const windowEndsMs = new Date(reservation.reservedAt).getTime() + durationMinutes * 60000;
  return now.getTime() < windowEndsMs;
}

function bookedForToday(table, now = new Date()) {
  return (table?.reservations || [])
    .filter((reservation) => isRelevantReservation(reservation, now))
    .sort((a, b) => String(a.reservedAt).localeCompare(String(b.reservedAt)));
}

function reservationDateLabel(reservation) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: MADRID_TIMEZONE, weekday: "short", day: "2-digit", month: "2-digit",
  }).format(new Date(reservation.reservedAt));
}

function reservationTimeLabel(reservation) {
  return madridFields(reservation.reservedAt).time;
}

// Fill is a strict 1:1 function of physical state only -- green=free (nobody
// seated, no relevant future booking), yellow=free-now-but-booked-tonight,
// red=occupied (clients seated). Fill never changes with kitchen/order state;
// that is carried entirely by the border (see tableBorder below), so nobody
// can mistake an occupied table for free/reserved regardless of its order.
const STATUS = {
  free: { label: "Libre", color: "#22C55E", bg: "rgba(34,197,94,.18)" },
  reserved: { label: "Reservada", color: "#EAB308", bg: "rgba(234,179,8,.20)" },
  occupied: { label: "Ocupada", color: "#EF4444", bg: "rgba(239,68,68,.22)" },
};

function tableState(table, todayReservations) {
  if (table.status === "open") return STATUS.occupied;
  return todayReservations.length > 0 ? STATUS.reserved : STATUS.free;
}

// Border is a second, independent signal layered on top of the fill:
// free/reserved -> border matches the fill color (unchanged from before).
// occupied -> border is red with NO comanda sent yet, green once at least one
// comanda has been confirmed and sent to Cocina. The fill stays occupied-red
// either way (checked by callers), so an order's existence is legible without
// ever letting a table read as "free".
function tableBorder(state, hasOrders) {
  if (state !== STATUS.occupied) return { color: state.color, thick: false };
  return { color: hasOrders ? "#22C55E" : "#EF4444", thick: true };
}

function hasReadyOrder(table) {
  return table.status === "open" && (table.session?.commands || []).some((command) => command.state === "LISTO");
}

const css = `
.mesa-root{color:#f7f0df;font-family:'Satoshi',Inter,system-ui,sans-serif}
/* compact (waiter shell) only: the shell around this component already
   provides a real 100dvh flex column (header/tabs natural height, this
   root gets the rest) -- here the board itself becomes the one flexing
   element and the dock is just the last flex item, so it sits at the true
   bottom with zero gap and never floats, on phone or tablet alike. Plain
   embedding (e.g. inside ServicioPage's own tab body, no compact prop) is
   untouched: no ancestor there promises a real height, so forcing height:
   100% would just collapse to 0 -- this whole block only ever applies
   under .compact. */
.mesa-root.compact{display:flex;flex-direction:column;height:100%;min-height:0}
.mesa-root.compact .mesa-board{flex:1 1 auto;min-height:0}
.mesa-root.compact .mesa-dock{flex:0 0 auto;margin-top:8px}
.mesa-board{position:relative;min-height:420px;border:1px solid rgba(208,184,145,.22);border-radius:22px;overflow:hidden;background:radial-gradient(circle at 50% 45%,rgba(215,168,75,.08),transparent 50%),linear-gradient(135deg,#171512,#0d0c0b)}
.mesa-board:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:32px 32px;pointer-events:none}
/* The card shows only number + capacity + up to two small corner badges --
   nothing that varies in length (no name, no price, no free text) -- so a
   single fixed box already covers every state and this never needs per-state
   sizing. Badges are absolutely positioned outside the flow, so they can
   never change the box's own height and cause the translate(-50%,-50%)
   recentering jump that a min-height card had. */
/* box-sizing:border-box is what makes the "occupied" border able to go from
   2px to 4px (see .mesa-table.thick below) without growing the box: width/
   height stay the outer, rendered size regardless of border-width. */
.mesa-table{box-sizing:border-box;position:absolute;transform:translate(-50%,-50%);width:100px;height:100px;padding:8px;overflow:visible;-webkit-tap-highlight-color:transparent;border-style:solid;border-width:2px;border-color:var(--tc);color:#fff;background:var(--tb);box-shadow:0 8px 22px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.16);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:none;user-select:none;transition:box-shadow .15s,filter .15s}
.mesa-table:hover{filter:brightness(1.14);box-shadow:0 10px 26px rgba(0,0,0,.46),0 0 20px color-mix(in srgb,var(--tc) 28%,transparent)}
/* MESA_POINTER_TARGET_SHIFT fix -- the global button:active{transform:scale(.96)}
   (constants.js G, mounted app-wide) has higher specificity (0,1,1) than the bare
   .mesa-table{transform:translate(-50%,-50%)} above (0,1,0), so on native :active
   (real pointerdown, on mouse/touch/pen alike) it fully REPLACED this element's own
   transform -- CSS transform is a single property, never merged across rules --
   dropping the -50%,-50% centering. The tile's box-sizing:border-box footprint then
   rendered from its raw (un-centered) left/top, jumping down-right by half its own
   size before the matching pointerup/click ever fired, so the release always
   hit-tested the parent .mesa-board instead of the button: the tap silently did
   nothing. .mesa-table:active (0,2,0) outranks button:active (0,1,1), so pinning
   transform back here -- with no scale at all, since geometry must stay byte-identical
   through the whole gesture -- neutralizes it without touching the global button
   press effect anywhere else in the app. */
.mesa-table:active{transform:translate(-50%,-50%)}
.mesa-table.round{border-radius:999px}.mesa-table.square{border-radius:16px}.mesa-table.rectangle{width:132px;border-radius:16px}.mesa-table.rectangle-long{width:168px;border-radius:16px}
/* Edit mode: "estoy moviendo/editando mesas", never "estoy leyendo el estado
   de cocina" -- a flat, neutral dashed border replaces whatever operational
   color/thickness --tc and .thick were carrying, uniformly across every
   table regardless of its free/reserved/occupied fill (which stays, since
   the fill alone is still enough to tell tables apart while editing). The
   ready-pulse glow is suppressed entirely in edit mode (see the ready-pulse
   class no longer being applied while editing, in the render below) --
   editing must visually dominate over "a dish is ready", never compete
   with it.
   Two classes beat one on specificity, so this wins over the base
   .mesa-table{border-color:var(--tc)} / .thick{border-width:4px} rules
   without needing !important. */
.mesa-table.is-editing{border-style:dashed;border-color:rgba(224,214,194,.55);cursor:grab}
.mesa-table.is-editing.thick{border-width:2px}
.mesa-table.is-dragging{cursor:grabbing;z-index:4;filter:brightness(1.2)}
.mesa-table.thick{border-width:4px}
.mesa-table.selected{box-shadow:0 0 0 3px rgba(247,240,223,.75),0 8px 22px rgba(0,0,0,.34)}
@keyframes mesa-ready-pulse{0%,100%{box-shadow:0 8px 22px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.16),0 0 0 0 rgba(34,197,94,0)}50%{box-shadow:0 8px 22px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.16),0 0 22px 7px rgba(34,197,94,.65)}}
.mesa-table.ready-pulse{animation:mesa-ready-pulse 1.35s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){
  .mesa-table.ready-pulse{animation:none;filter:brightness(1.22);box-shadow:0 8px 22px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.16),0 0 14px 3px rgba(34,197,94,.6)}
}
.mesa-number{font-size:26px;font-weight:900;line-height:1}
.mesa-capacity{font-size:11px;font-weight:800;color:#e7dcc7;display:flex;align-items:center;gap:3px}
.mesa-badge{position:absolute;z-index:2;border-radius:999px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,.4)}
.mesa-badge-reserved{top:-9px;right:-9px;padding:3px 7px;font-size:9px;line-height:1.4;background:#EAB308;color:#241c02;white-space:nowrap;text-transform:uppercase;letter-spacing:.3px}
.mesa-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.mesa-legend{display:flex;gap:12px;flex-wrap:wrap;color:#b9ad99;font-size:12px;font-weight:800}.mesa-legend span{display:flex;align-items:center;gap:5px}.mesa-dot{width:8px;height:8px;border-radius:50%}
/* Edit-mode helper text: a single discreet line immediately above the
   dock, never a banner competing with the map above it. No responsive
   text-swap anymore -- one short sentence that always fits one line, so
   there's nothing that can ever wrap into a second and start eating into
   the map. */
.mesa-edit-note{padding:4px 2px;font-size:11px;font-weight:700;color:#9f9380;text-align:center;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Dock: the room/edit toggle plus its companion action swap contents below
   the map depending on mode -- same slot, never both, never stacked above
   the board. In compact (waiter shell) mode the dock is simply the last
   item of the root's own flex column (see .mesa-root.compact above) so it
   sits at the true bottom with no gap and no position:fixed viewport
   quirks; the mobile position:fixed treatment below is scoped to
   non-compact embeddings only (e.g. ServicioPage's own Mesa tab, which
   has no shell promising it a real height to flex against). */
.mesa-dock{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.mesa-dock .mesa-btn{flex:0 0 auto}
@media(max-width:620px){
  .mesa-root:not(.compact){padding-bottom:78px}
  .mesa-root:not(.compact) .mesa-dock{
    position:fixed;left:0;right:0;bottom:0;z-index:40;margin-top:0;flex-wrap:nowrap;gap:8px;
    padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));
    background:rgba(13,12,11,.94);backdrop-filter:blur(14px);
    border-top:1px solid rgba(208,184,145,.18);
    box-shadow:0 -8px 22px rgba(0,0,0,.3);
  }
  .mesa-root.compact .mesa-dock{
    flex-wrap:nowrap;gap:8px;padding-bottom:env(safe-area-inset-bottom,0px);
    background:rgba(13,12,11,.94);backdrop-filter:blur(14px);
    border-top:1px solid rgba(208,184,145,.18);
  }
  .mesa-dock .mesa-btn{flex:1 1 0;min-width:0;padding:13px 10px;text-align:center}
  .mesa-dock .mesa-btn.icon{flex:0 0 auto;padding:13px 14px}
}
.mesa-btn{border:1px solid rgba(208,184,145,.25);border-radius:12px;background:rgba(255,255,255,.05);color:#f9f2e5;padding:10px 14px;font-weight:850;cursor:pointer}.mesa-btn:hover{background:rgba(255,255,255,.09)}.mesa-btn:disabled{opacity:.4;cursor:wait}
.mesa-btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}.mesa-btn.gold{background:#d7a84b;border-color:#d7a84b;color:#211707}.mesa-btn.green{background:#178447;border-color:#20a85d}.mesa-btn.danger{color:#ff8f80;border-color:rgba(232,52,28,.55)}
.mesa-shape-grid{display:flex;gap:8px;flex-wrap:wrap}
.mesa-shape-btn{border:1px solid rgba(208,184,145,.25);border-radius:12px;background:rgba(255,255,255,.04);color:#e7dcc7;padding:10px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;font-weight:800;cursor:pointer;flex:1;min-width:76px}
.mesa-shape-btn.active{border-color:#d7a84b;background:rgba(215,168,75,.14);color:#f8ecd2}
.mesa-shape-icon{background:#5a5348;display:block}
.mesa-shape-btn.active .mesa-shape-icon{background:#d7a84b}
.mesa-shape-icon.round{width:26px;height:26px;border-radius:999px}
.mesa-shape-icon.square{width:26px;height:26px;border-radius:6px}
.mesa-shape-icon.rectangle{width:38px;height:22px;border-radius:6px}
.mesa-btn.small.active{border-color:#d7a84b;background:rgba(215,168,75,.14);color:#f8ecd2}
/* Lighter than a flat black-out on purpose -- enough to focus attention on
   the sheet without reading as "half the screen just went dead". The
   selected table's own glow ring (.mesa-table.selected) stays faintly
   visible through this, so the backdrop still reads as "this table,
   dimmed" rather than a blank wall. */
.mesa-overlay{position:fixed;inset:0;z-index:1200;background:rgba(8,7,6,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:18px}
.mesa-modal{width:min(760px,100%);max-height:92vh;overflow:auto;border:1px solid rgba(208,184,145,.28);border-radius:20px;background:#12110f;color:#f8f0df;box-shadow:0 26px 80px rgba(0,0,0,.68)}
.mesa-modal-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px 20px;border-bottom:1px solid rgba(208,184,145,.18);background:rgba(18,17,15,.96);backdrop-filter:blur(14px)}
.mesa-modal-body{padding:18px 20px 22px}.mesa-close{width:38px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#fff;font-size:21px;cursor:pointer}
.mesa-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:16px}.mesa-stat{border:1px solid rgba(208,184,145,.17);border-radius:13px;padding:11px;background:rgba(255,255,255,.025)}.mesa-stat small{display:block;color:#9f9380;font-size:10px;font-weight:800;text-transform:uppercase}.mesa-stat strong{display:block;margin-top:4px;font-size:17px}
.mesa-actions{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.mesa-section{margin-top:18px}.mesa-section h3{margin:0 0 9px;color:#d9c8aa;font-size:12px;text-transform:uppercase;letter-spacing:.8px}
.mesa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.065);padding:9px 2px;font-size:13px}.mesa-row:last-child{border-bottom:0}.mesa-muted{color:#978d7c}.mesa-chip{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.13);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;color:#ddd2bf}
/* A table with many comandas can grow taller than fits on screen -- this
   scrolls on its own, bounded, so the primary action buttons/close button
   that come AFTER it in the sheet never get pushed out of view (the whole
   point of the "tall" sheet is to show comandas without hiding the actions
   that act on them). */
.mesa-commands-scroll{max-height:42vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
.mesa-command-card{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.02)}
.mesa-command-card+.mesa-command-card{margin-top:8px}
.mesa-command-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mesa-command-head strong{font-size:13px}
.mesa-command-items{margin:6px 0 0;padding-left:18px;font-size:13px;color:#e7dcc7}
.mesa-command-items li{margin:2px 0}
.mesa-command-note{margin-top:6px;font-size:12px;color:#d9c8aa;font-style:italic}
.mesa-input{width:100%;box-sizing:border-box;border:1px solid rgba(208,184,145,.28);border-radius:11px;background:#0b0b0a;color:#fff;padding:12px 13px;font:inherit;outline:none}.mesa-input:focus{border-color:#d7a84b}
.mesa-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mesa-label{display:block;color:#b9ad99;font-size:12px;font-weight:800;margin-bottom:6px}.mesa-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mesa-method{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px 7px;background:rgba(255,255,255,.035);color:#fff;font-weight:850;cursor:pointer}.mesa-method.active{border-color:var(--mc);box-shadow:inset 0 0 0 1px var(--mc);background:color-mix(in srgb,var(--mc) 18%,transparent)}
.mesa-lines{max-height:260px;overflow:auto;border:1px solid rgba(208,184,145,.15);border-radius:12px;padding:4px 11px}.mesa-line-check{display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}.mesa-line-check:last-child{border-bottom:0}.mesa-line-check input{width:18px;height:18px;accent-color:#d7a84b}
.mesa-banner{border:1px solid rgba(56,189,248,.35);border-radius:13px;padding:12px 14px;background:rgba(56,189,248,.09);color:#b9eaff;font-size:13px;line-height:1.45}.mesa-error{border-color:rgba(232,52,28,.5);background:rgba(232,52,28,.1);color:#ffaaa0}
.mesa-reservation{border:1px solid rgba(239,68,68,.38);border-radius:14px;padding:12px;background:rgba(239,68,68,.09);margin-top:9px}.mesa-reservation-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mesa-reservation-name{font-size:15px;font-weight:950}.mesa-reservation-time{color:#ff8d83;font-size:16px;font-weight:950;white-space:nowrap}.mesa-reservation-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.mesa-btn.small{padding:7px 10px;border-radius:10px;font-size:12px}.mesa-btn.red{background:#C62828;border-color:#EF4444;color:#fff}.mesa-textarea{min-height:88px;resize:vertical}.mesa-menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mesa-menu-action{min-height:72px;text-align:left;display:flex;flex-direction:column;justify-content:center}.mesa-menu-action strong{font-size:14px}.mesa-menu-action span{font-size:11px;color:#a99d89;margin-top:3px}
.mesa-print-layer{display:none}.mesa-print-sheet{width:58mm;margin:0 auto;color:#000;background:#fff;font:12px/1.35 'DM Mono',monospace}.mesa-print-sheet h1,.mesa-print-sheet h2,.mesa-print-sheet p{margin:0}.mesa-print-sheet .sep{border-top:1px dashed #000;margin:8px 0}.mesa-print-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.mesa-print-row span:first-child{min-width:0;overflow-wrap:anywhere}.mesa-print-total{font-size:18px;font-weight:900;text-align:right;margin:8px 0}.mesa-print-center{text-align:center}.mesa-print-small{font-size:10px}
@media(max-width:620px){.mesa-board{min-height:440px}.mesa-table.rectangle{width:118px}.mesa-table.rectangle-long{width:146px}.mesa-summary{grid-template-columns:1fr 1fr}.mesa-form-grid,.mesa-menu-grid{grid-template-columns:1fr}.mesa-methods{grid-template-columns:1fr}.mesa-modal-body{padding:15px}.mesa-modal-head{padding:14px 15px}}
/* Phone: every modal in this component becomes a near-full-screen bottom
   sheet instead of a small floating card with dead space on all sides --
   anchored to the bottom edge, full width, rounded top corners only,
   safe-area-aware so the home-indicator area on notched iPhones never
   covers the last row of actions. */
@media(max-width:480px){
  .mesa-overlay{align-items:flex-end;padding:0}
  .mesa-modal{width:100%;max-width:100%;max-height:94vh;border-radius:20px 20px 0 0;border-left:none;border-right:none;border-bottom:none}
  /* The only sheets that force real height: ones with actual comanda
     content to show (size="tall" on Modal, see TableContextPopup/
     TableDetail). Free/reserved/no-order sheets stay their natural
     shrink-to-content height -- short on purpose, not padded out to match.
     70-85vh range as specified; 80vh split the difference. */
  .mesa-modal.tall{min-height:min(80vh,94vh)}
  .mesa-modal-body{padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}
}
@media print{body *{visibility:hidden!important}.mesa-print-layer,.mesa-print-layer *{visibility:visible!important}.mesa-print-layer{display:block!important;position:absolute;left:0;top:0;width:100%;background:#fff}.mesa-print-sheet{display:block!important} @page{size:58mm auto;margin:3mm}}
`;

// size="tall" is the one and only thing that makes a table's bottom sheet
// actively grow on phone (see .mesa-modal.tall in the mobile media query
// below) -- passed only when there's real comanda content to show. Every
// other table state (free, reserved, occupied-no-order) keeps the default
// shrink-to-content sizing, so the sheet stays exactly as short as its own
// (short) content, never artificially padded out. This is deliberately a
// binary switch, not a third "medium" size: a reserved table's sheet is
// already naturally medium-sized because the Reserva card is collapsed by
// default (see TableContextPopup), not because of anything sizing-related
// here.
function Modal({ title, subtitle, onClose, children, width = 760, size }) {
  return <div className="mesa-overlay" role="dialog" aria-modal="true">
    <div className={`mesa-modal${size === "tall" ? " tall" : ""}`} style={{ width: `min(${width}px, 100%)` }}>
      <div className="mesa-modal-head">
        <div><div style={{ fontWeight: 950, fontSize: 19 }}>{title}</div>{subtitle && <div className="mesa-muted" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</div>}</div>
        <button className="mesa-close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <div className="mesa-modal-body">{children}</div>
    </div>
  </div>;
}

// In-app replacement for window.confirm() on the "close an empty table"
// action. A native confirm() is indistinguishable, from application code, from
// an environment that silently auto-answers it (some embedded/automated
// browser contexts do exactly this) -- the app never learns the dialog was
// never truly shown to anyone. This dialog is real DOM the app fully
// controls: it always renders, always waits for a real click, and its result
// is never ambiguous. Escape and the backdrop both cancel; Tab is trapped
// between the two buttons since this is the only focusable content.
function CerrarMesaDialog({ tableNumber, busy, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { if (!busy) onCancel(); return; }
      if (event.key !== "Tab") return;
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return <div className="mesa-overlay" onClick={() => { if (!busy) onCancel(); }}>
    <div className="mesa-modal" role="alertdialog" aria-modal="true" aria-labelledby="cerrar-mesa-title" aria-describedby="cerrar-mesa-body"
      style={{ width: "min(420px, 100%)" }} onClick={(event) => event.stopPropagation()}>
      <div className="mesa-modal-head">
        <div id="cerrar-mesa-title" style={{ fontWeight: 950, fontSize: 19 }}>{`Cerrar Mesa ${tableNumber}`}</div>
      </div>
      <div className="mesa-modal-body">
        <p id="cerrar-mesa-body" className="mesa-muted">La mesa está vacía y no tiene comandas ni pagos.</p>
        {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="mesa-actions" style={{ marginTop: 16 }}>
          <button ref={cancelRef} className="mesa-btn" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button ref={confirmRef} className="mesa-btn danger" disabled={busy} onClick={onConfirm}>{busy ? "Cerrando…" : "Cerrar mesa"}</button>
        </div>
      </div>
    </div>
  </div>;
}

// Shared comanda card -- same format everywhere a comanda is listed (the
// table popup's quick summary and Ver cuenta's full detail), so a waiter
// never has to learn two different layouts for the same information.
// Real product names/quantities and the note, not just a count -- a count
// alone ("2 productos") told a waiter nothing about whether this was the
// margherita-and-a-coke table or the one with the food allergy note.
// action is an optional per-command control (only TableDetail wires
// "✓ Servida" through it; the popup stays a read-only glance, same as before).
function CommandCard({ command, action }) {
  const productCount = (command.items || []).reduce((sum, item) => sum + (Number(item.q) || 1), 0);
  return <div className="mesa-command-card">
    <div className="mesa-command-head">
      <strong>Comanda #{command.commandNumber}</strong>
      <span className="mesa-muted">{command.time || "ahora"}</span>
      <span className="mesa-chip" style={command.state === "LISTO" ? { borderColor: "#22C55E", color: "#22C55E" } : undefined}>{commandStateLabel(command.state)}</span>
      {action}
    </div>
    <div className="mesa-muted" style={{ fontSize: 12, marginTop: 4 }}>{productCount} producto{productCount === 1 ? "" : "s"}</div>
    {(command.items || []).length > 0 && <ul className="mesa-command-items">
      {command.items.map((item, index) => <li key={index}>{Number(item.q) > 1 ? `${item.q}× ` : ""}{item.n}</li>)}
    </ul>}
    {command.note && <div className="mesa-command-note">Nota: {command.note}</div>}
  </div>;
}

function equalShares(total, covers) {
  const cents = Math.max(0, Math.round(Number(total || 0) * 100));
  const count = Math.max(0, Math.floor(Number(covers || 0)));
  if (!cents || !count) return [];
  const base = Math.floor(cents / count);
  const extra = cents - (base * count);
  return Array.from({ length: count }, (_, index) => (base + (index < extra ? 1 : 0)) / 100);
}

function PrintPreview({ document, onClose }) {
  if (!document) return null;
  const rows = Array.isArray(document.rows) ? document.rows : [];
  return <Modal title="Vista previa" subtitle="Ticket no fiscal · 58 mm" onClose={onClose} width={500}>
    <div style={{ background: "#e8e8e8", padding: 18, borderRadius: 14 }}>
      <div className="mesa-print-sheet" style={{ padding: "5mm", boxShadow: "0 6px 26px rgba(0,0,0,.2)" }}>
        <h1 className="mesa-print-center" style={{ fontSize: 20 }}>LA DIECI</h1>
        <p className="mesa-print-center" style={{ fontWeight: 900 }}>{document.title}</p>
        <p className="mesa-print-center">MESA {document.tableNumber}</p>
        <div className="sep" />
        {rows.map((row, index) => <div className="mesa-print-row" key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        <div className="sep" />
        {document.totalLabel && <div className="mesa-print-total">{document.totalLabel} {euro(document.total)}</div>}
        {document.note && <p className="mesa-print-center" style={{ marginTop: 8 }}>{document.note}</p>}
        <div className="sep" />
        <p className="mesa-print-center mesa-print-small">Documento no fiscal · {new Date().toLocaleString("es-ES")}</p>
      </div>
    </div>
    <div className="mesa-actions" style={{ justifyContent: "flex-end" }}>
      <button className="mesa-btn" onClick={onClose}>Cerrar</button>
      <button className="mesa-btn gold" onClick={() => window.print()}>🖨 Imprimir</button>
    </div>
    <div className="mesa-print-layer">
      <div className="mesa-print-sheet" style={{ padding: "3mm" }}>
        <h1 className="mesa-print-center" style={{ fontSize: 20 }}>LA DIECI</h1>
        <p className="mesa-print-center" style={{ fontWeight: 900 }}>{document.title}</p>
        <p className="mesa-print-center">MESA {document.tableNumber}</p><div className="sep" />
        {rows.map((row, index) => <div className="mesa-print-row" key={`print-${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        <div className="sep" />{document.totalLabel && <div className="mesa-print-total">{document.totalLabel} {euro(document.total)}</div>}
        {document.note && <p className="mesa-print-center" style={{ marginTop: 8 }}>{document.note}</p>}
        <div className="sep" /><p className="mesa-print-center mesa-print-small">Documento no fiscal · {new Date().toLocaleString("es-ES")}</p>
      </div>
    </div>
  </Modal>;
}

function PaymentModal({ table, mode, onClose, onPaid }) {
  const session = table.session;
  const availableLines = session.lines.filter((line) => Number(line.remaining) > 0);
  const [method, setMethod] = useState("efectivo");
  const [amount, setAmount] = useState(mode === "custom_amount" ? "" : String(session.nextEqualShare || ""));
  const [coversSettled, setCoversSettled] = useState(mode === "full" ? session.coversRemaining : 1);
  const [lineIds, setLineIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Stable across a network retry: if the first request committed but its reply
  // was lost, the backend replays the same transaction instead of charging twice.
  const requestIdRef = useRef(createMesaRequestId("pay"));
  const selectedTotal = availableLines.filter((line) => lineIds.includes(line.id)).reduce((sum, line) => sum + Number(line.remaining), 0);
  const displayedAmount = mode === "full" ? session.outstanding : mode === "equal_split" ? session.nextEqualShare : mode === "item_selection" ? selectedTotal : Number(amount || 0);
  const modeTitle = { full: "Cobrar cuenta completa", equal_split: "Pago a la romana", item_selection: "Cobrar productos", custom_amount: "Cobrar importe libre" }[mode];

  const submit = async () => {
    if (mode === "item_selection" && lineIds.length === 0) { setError("Selecciona al menos un producto."); return; }
    if (!(displayedAmount > 0) || displayedAmount > Number(session.outstanding) + 0.001) { setError("El importe no es válido."); return; }
    setBusy(true); setError("");
    try {
      const result = await mesaApi.pay(session.id, {
        paymentMethod: method,
        mode,
        amount: mode === "custom_amount" ? Number(amount) : undefined,
        coversSettled: mode === "full" ? session.coversRemaining : Number(coversSettled),
        lineIds: mode === "item_selection" ? lineIds : undefined,
        clientRequestId: requestIdRef.current,
      });
      await onPaid(result, method);
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };

  return <Modal title={modeTitle} subtitle={`${table.name} · pendiente ${euro(session.outstanding)}`} onClose={busy ? undefined : onClose} width={610}>
    {mode === "equal_split" && <div className="mesa-banner">Quedan <strong>{session.coversRemaining}</strong> personas. Esta cuota es de <strong>{euro(session.nextEqualShare)}</strong>; los céntimos se ajustan automáticamente en la última cuota.</div>}
    {mode === "item_selection" && <div className="mesa-section"><h3>Productos pendientes</h3><div className="mesa-lines">
      {availableLines.map((line) => <label className="mesa-line-check" key={line.id}>
        <input type="checkbox" checked={lineIds.includes(line.id)} onChange={(event) => setLineIds((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} />
        <span>{line.description}</span><strong>{euro(line.remaining)}</strong>
      </label>)}
    </div></div>}
    {mode === "custom_amount" && <div className="mesa-section"><label className="mesa-label">Importe a cobrar</label><input className="mesa-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(",", "."))} placeholder="0,00" /></div>}
    {(mode === "item_selection" || mode === "custom_amount") && <div className="mesa-section"><label className="mesa-label">Personas que quedan saldadas con este pago</label><input className="mesa-input" type="number" min="0" max={session.coversRemaining} value={coversSettled} onChange={(event) => setCoversSettled(event.target.value)} /></div>}
    <div className="mesa-section"><h3>Método de este pago</h3><div className="mesa-methods">{METHODS.map((item) => <button key={item.id} className={`mesa-method ${method === item.id ? "active" : ""}`} style={{ "--mc": item.color }} onClick={() => setMethod(item.id)}>{item.icon} {item.label}</button>)}</div></div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18 }}><div><span className="mesa-muted">A cobrar</span><div style={{ fontSize: 24, fontWeight: 950 }}>{euro(displayedAmount)}</div></div><button className="mesa-btn green" disabled={busy} onClick={submit}>{busy ? "Registrando…" : "Confirmar cobro"}</button></div>
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
  </Modal>;
}

function TableDetail({ table, onClose, onNewCommand, onRefresh, onPrint }) {
  const [paymentMode, setPaymentMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const session = table.session;
  const shares = equalShares(session?.outstanding, session?.coversRemaining);
  const remainingLines = (session?.lines || []).filter((line) => Number(line.remaining) > 0);
  const paymentTotals = Object.entries(session?.paymentTotals || {}).filter(([, amount]) => Number(amount) !== 0);

  const billDocument = () => ({
    title: "CUENTA CLIENTE", tableNumber: table.number,
    rows: [
      ...remainingLines.map((line) => ({ label: line.description, value: euro(line.remaining) })),
      ...(paymentTotals.length ? [{ label: "Ya cobrado", value: euro(session.paid) }] : []),
    ],
    totalLabel: "PENDIENTE", total: session.outstanding,
    note: session.paid > 0 ? "Incluye únicamente lo que queda por pagar." : "Cuenta completa de la mesa.",
  });
  const splitDocument = () => ({
    title: "DIVISIÓN A LA ROMANA", tableNumber: table.number,
    rows: shares.map((share, index) => ({ label: `Persona ${index + 1}`, value: euro(share) })),
    totalLabel: "PENDIENTE", total: session.outstanding,
    note: `${session.coversRemaining} persona${session.coversRemaining === 1 ? "" : "s"} pendiente${session.coversRemaining === 1 ? "" : "s"}`,
  });
  const paid = async (result, method) => {
    const outstandingAfter = result.outstandingAfter == null
      ? Math.max(0, Math.round((Number(session.outstanding) - Number(result.amount)) * 100) / 100)
      : Number(result.outstandingAfter);
    setPaymentMode(null);
    onPrint({
      title: "RECIBO DE PAGO", tableNumber: table.number,
      rows: [
        { label: "Importe cobrado", value: euro(result.amount) },
        { label: "Método", value: METHODS.find((item) => item.id === method)?.label || method },
        { label: "Queda por pagar", value: euro(outstandingAfter) },
      ],
      totalLabel: "PAGADO", total: result.amount,
      note: outstandingAfter === 0 ? "Cuenta cerrada." : "Pago parcial registrado.",
    });
    await onRefresh();
  };
  const markServed = async (orderId) => {
    setBusy(true); setError("");
    try { await mesaApi.markServed(session.id, orderId); await onRefresh(); }
    catch (err) { setError(describeMesaError(err)); }
    finally { setBusy(false); }
  };
  const [confirmingClose, setConfirmingClose] = useState(false);
  const openCloseConfirm = () => setConfirmingClose(true);
  const cancelCloseConfirm = () => { if (!busy) { setConfirmingClose(false); setError(""); } };
  const confirmClose = async () => {
    setBusy(true); setError("");
    try { await mesaApi.releaseEmptyTable(session.id); setConfirmingClose(false); await onRefresh(); }
    catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };

  return <>
    <Modal title={`Mesa ${table.number}`} subtitle={`${STATUS.occupied.label}${session.coversTotal == null ? " · aún sin comensales" : ` · ${session.coversTotal} cubiertos`}`} onClose={onClose} size={session.commands.length > 0 ? "tall" : undefined}>
      <div className="mesa-summary">
        <div className="mesa-stat"><small>Total</small><strong>{euro(session.total)}</strong></div>
        <div className="mesa-stat"><small>Cobrado</small><strong style={{ color: "#65d995" }}>{euro(session.paid)}</strong></div>
        <div className="mesa-stat"><small>Pendiente</small><strong style={{ color: "#ffc65c" }}>{euro(session.outstanding)}</strong></div>
        <div className="mesa-stat"><small>Personas</small><strong>{session.coversTotal == null ? "—" : `${session.coversRemaining}/${session.coversTotal}`}</strong></div>
      </div>

      {table.status === "open" && <>
        <div className="mesa-actions">
          <button className="mesa-btn primary" onClick={() => { onClose(); onNewCommand(table); }}>＋ Nueva comanda</button>
          {session.coversTotal == null && <button className="mesa-btn danger" disabled={busy} onClick={openCloseConfirm}>Cerrar mesa</button>}
          {session.outstanding > 0 && <button className="mesa-btn green" onClick={() => setPaymentMode("full")}>Cobrar todo</button>}
          {session.outstanding > 0 && session.coversRemaining > 0 && <button className="mesa-btn" onClick={() => setPaymentMode("equal_split")}>A la romana · {euro(session.nextEqualShare)}</button>}
          {remainingLines.length > 0 && <button className="mesa-btn" onClick={() => setPaymentMode("item_selection")}>Elegir productos</button>}
          {session.outstanding > 0 && <button className="mesa-btn" onClick={() => setPaymentMode("custom_amount")}>Importe libre</button>}
        </div>
        <div className="mesa-actions">
          {session.outstanding > 0 && <button className="mesa-btn gold" onClick={() => onPrint(billDocument())}>🖨 Cuenta pendiente</button>}
          {shares.length > 0 && <button className="mesa-btn" onClick={() => onPrint(splitDocument())}>🖨 Imprimir división</button>}
        </div>
      </>}
      {paymentTotals.length > 0 && <div className="mesa-section"><h3>Cobrado por método</h3>{paymentTotals.map(([method, amount]) => <div className="mesa-row" key={method}><span>{METHODS.find((item) => item.id === method)?.label || method}</span><strong>{euro(amount)}</strong></div>)}</div>}
      <div className="mesa-section"><h3>Comandas de cocina</h3>{session.commands.length === 0 ? <div className="mesa-muted">Todavía no hay comandas.</div> : <div className="mesa-commands-scroll">
        {session.commands.map((command) => <CommandCard key={command.id} command={command}
          action={command.state === "LISTO" ? <button className="mesa-btn green" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => markServed(command.id)}>✓ Servida</button> : null} />)}
      </div>}</div>
      {remainingLines.length > 0 && <div className="mesa-section"><h3>Pendiente de pago</h3>{remainingLines.map((line) => <div className="mesa-row" key={line.id}><span>{line.description}</span><strong>{euro(line.remaining)}</strong></div>)}</div>}
      {error && !confirmingClose && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
    </Modal>
    {paymentMode && <PaymentModal table={table} mode={paymentMode} onClose={() => setPaymentMode(null)} onPaid={paid} />}
    {confirmingClose && <CerrarMesaDialog tableNumber={table.number} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
  </>;
}

// Covers are unknown when a table is opened (see openWalkIn) -- this modal is
// the one and only place they're asked, gating the FIRST comanda only. It never
// calls the API itself: it just collects a real number, then the caller opens
// the normal product-picking flow which submits covers atomically with the order.
function FirstCommandCoversModal({ table, onClose, onConfirm }) {
  const [covers, setCovers] = useState("");
  const [error, setError] = useState("");
  const confirm = () => {
    const count = Number(covers);
    if (!Number.isInteger(count) || count < 1 || count > 99) { setError("Indica un número de comensales válido."); return; }
    onConfirm(count);
  };
  return <Modal title={`Mesa ${table.number} · primera comanda`} subtitle="Indica los comensales reales antes de tomar el pedido" onClose={onClose} width={430}>
    <label className="mesa-label">Número de comensales</label>
    <input className="mesa-input" type="number" min="1" max="99" value={covers} onChange={(event) => { setCovers(event.target.value); setError(""); }} placeholder="Ej. 4" autoFocus />
    <div className="mesa-actions" style={{ justifyContent: "flex-end" }}><button className="mesa-btn" onClick={onClose}>Cancelar</button><button className="mesa-btn primary" onClick={confirm}>Continuar</button></div>
    {error && <div className="mesa-banner mesa-error">{error}</div>}
  </Modal>;
}

function ReservationItem({ reservation, table, onEdit, onChanged, onOpened }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const booked = reservation.status === "booked";
  const setStatus = async (status) => {
    const copy = status === "cancelled" ? "¿Cancelar esta reserva?" : "¿Marcar que el cliente no se presentó?";
    if (!window.confirm(copy)) return;
    setBusy(true); setError("");
    try {
      await mesaApi.setReservationStatus(reservation.id, reservation.version, status);
      await onChanged();
    } catch (err) { setError(describeMesaError(err)); }
    finally { setBusy(false); }
  };
  const open = async () => {
    setBusy(true); setError("");
    try {
      await mesaApi.openReservation(reservation.id, reservation.version);
      await onOpened(table.id);
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  return <div className="mesa-reservation">
    <div className="mesa-reservation-main">
      <div>
        <div className="mesa-reservation-name">{reservation.guestName} · {reservation.coversTotal} personas</div>
        <div className="mesa-muted" style={{ marginTop: 3 }}>{reservationDateLabel(reservation)} · Mesa {table.number}{reservation.guestPhone ? ` · ${reservation.guestPhone}` : ""}</div>
      </div>
      <div className="mesa-reservation-time">{reservationTimeLabel(reservation)}</div>
    </div>
    {reservation.note && <div style={{ fontSize: 12, marginTop: 8, color: "#dfd5c4" }}>{reservation.note}</div>}
    {booked && <div className="mesa-reservation-actions">
      <button className="mesa-btn small green" disabled={busy || table.status === "open"} onClick={open}>Confirmar reserva</button>
      <button className="mesa-btn small" disabled={busy} onClick={() => onEdit(reservation)}>Modificar / mover</button>
      <button className="mesa-btn small" disabled={busy} onClick={() => setStatus("no_show")}>No se presentó</button>
      <button className="mesa-btn small danger" disabled={busy} onClick={() => setStatus("cancelled")}>Cancelar</button>
    </div>}
    {reservation.status === "seated" && <div className="mesa-chip" style={{ marginTop: 9 }}>MESA ABIERTA</div>}
    {table.status === "open" && booked && <div className="mesa-muted" style={{ fontSize: 11, marginTop: 8 }}>Para recibir esta reserva, libera esta mesa o mueve la reserva a otra.</div>}
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 9 }}>{error}</div>}
  </div>;
}

function ReservationModal({ tables, initialTableId, reservation, onClose, onSaved }) {
  const initial = reservationLocalFields(reservation);
  const initialTable = tables.find((table) => table.id === (reservation?.tableId || initialTableId)) || tables[0];
  const [form, setForm] = useState({
    tableId: initialTable?.id || "",
    guestName: reservation?.guestName || "",
    guestPhone: reservation?.guestPhone || "",
    coversTotal: reservation?.coversTotal || Math.min(Number(initialTable?.capacity) || 4, 4),
    reservedLocalDate: initial.date,
    reservedLocalTime: initial.time,
    note: reservation?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const selectedTable = tables.find((table) => table.id === form.tableId);
    const coversTotal = Number(form.coversTotal);
    if (!selectedTable) { setError("Selecciona una mesa."); return; }
    if (!form.guestName.trim()) { setError("Indica el nombre del cliente."); return; }
    if (!Number.isInteger(coversTotal) || coversTotal < 1 || coversTotal > 99) { setError("Indica un número de cubiertos válido."); return; }
    if (selectedTable.capacity && coversTotal > Number(selectedTable.capacity)) { setError("Los cubiertos superan la capacidad máxima de esta mesa."); return; }
    setBusy(true); setError("");
    const payload = {
      guestName: form.guestName.trim(),
      guestPhone: form.guestPhone.trim() || null,
      coversTotal,
      reservedLocalDate: form.reservedLocalDate,
      reservedLocalTime: form.reservedLocalTime,
      note: form.note.trim() || null,
    };
    try {
      if (reservation) {
        await mesaApi.updateReservation(reservation.id, {
          ...payload, tableId: form.tableId, expectedVersion: reservation.version,
        });
      } else {
        await mesaApi.createReservation(form.tableId, payload);
      }
      await onSaved(); onClose();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  return <Modal title={reservation ? "Modificar / mover reserva" : "Nueva reserva"} subtitle="Duración reservada: 2 horas" onClose={busy ? undefined : onClose} width={650}>
    <div className="mesa-form-grid">
      <div><label className="mesa-label">Mesa</label><select className="mesa-input" value={form.tableId} onChange={(event) => setForm({ ...form, tableId: event.target.value })}>{tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.number} · {table.capacity || "—"} personas</option>)}</select></div>
      <div><label className="mesa-label">Nombre del cliente</label><input className="mesa-input" maxLength="120" value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} autoFocus /></div>
      <div><label className="mesa-label">Fecha</label><input className="mesa-input" type="date" value={form.reservedLocalDate} onChange={(event) => setForm({ ...form, reservedLocalDate: event.target.value })} /></div>
      <div><label className="mesa-label">Hora</label><input className="mesa-input" type="time" value={form.reservedLocalTime} onChange={(event) => setForm({ ...form, reservedLocalTime: event.target.value })} /></div>
      <div><label className="mesa-label">Número de cubiertos</label><input className="mesa-input" type="number" min="1" max="99" value={form.coversTotal} onChange={(event) => setForm({ ...form, coversTotal: event.target.value })} /></div>
      <div><label className="mesa-label">Teléfono</label><input className="mesa-input" type="tel" maxLength="40" value={form.guestPhone} onChange={(event) => setForm({ ...form, guestPhone: event.target.value })} /></div>
    </div>
    <div style={{ marginTop: 12 }}><label className="mesa-label">Nota</label><textarea className="mesa-input mesa-textarea" maxLength="1000" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>
    <div className="mesa-actions" style={{ justifyContent: "flex-end" }}><button className="mesa-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="mesa-btn gold" disabled={busy} onClick={save}>{busy ? "Guardando…" : reservation ? "Guardar cambios" : "Reservar mesa"}</button></div>
    {error && <div className="mesa-banner mesa-error">{error}</div>}
  </Modal>;
}

// Reservas · Beta: search by name/phone and an optional per-table filter (used
// by the "Ver reservas de la noche" shortcut from a table's own popup). Full
// date-range navigation, cross-day management and conflict tooling are left
// for a later slice -- this covers tonight's active bookings only, same as
// the data the floor already loads.
function ReservationAgenda({ tables, onClose, onNew, onEdit, onChanged, onOpened, initialTableId }) {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState(initialTableId || "");
  const needle = search.trim().toLowerCase();
  // Filtered through the exact same isRelevantReservation() the floor uses
  // (see its own comment) -- this is what makes "Reservas activas de hoy" in
  // the subtitle below actually true, instead of listing every booking ever
  // made regardless of date.
  const rows = tables.flatMap((table) => (table.reservations || [])
      .filter((reservation) => isRelevantReservation(reservation))
      .map((reservation) => ({ table, reservation })))
    .filter(({ table }) => !tableFilter || table.id === tableFilter)
    .filter(({ reservation }) => !needle
      || reservation.guestName?.toLowerCase().includes(needle)
      || reservation.guestPhone?.toLowerCase().includes(needle))
    .sort((a, b) => String(a.reservation.reservedAt).localeCompare(String(b.reservation.reservedAt)));
  return <Modal title="Reservas · Beta" subtitle="Reservas activas de hoy" onClose={onClose} width={760}>
    <div className="mesa-form-grid" style={{ marginBottom: 14 }}>
      <div><label className="mesa-label">Buscar por nombre o teléfono</label><input className="mesa-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Antonio o 600…" /></div>
      <div><label className="mesa-label">Mesa</label><select className="mesa-input" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}><option value="">Todas las mesas</option>{tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.number}</option>)}</select></div>
    </div>
    <div className="mesa-actions" style={{ marginTop: 0 }}><button className="mesa-btn gold" onClick={onNew}>＋ Nueva reserva</button></div>
    {/* Compact, entirely-clickable rows here (tap -> Modificar / mover); the
        floor popup's own ReservationItem stays the full-detail-plus-actions
        card, used only there where a single reservation is already in focus. */}
    {rows.length === 0 ? <div className="mesa-muted">No hay reservas que coincidan.</div> : rows.map(({ table, reservation }) => <div key={reservation.id} className="mesa-row" style={{ cursor: "pointer" }} onClick={() => onEdit(reservation)}>
      <span>{reservation.guestName} · Mesa {table.number} · {reservation.coversTotal} pax</span>
      <span className="mesa-chip">{reservationTimeLabel(reservation)}</span>
    </div>)}
  </Modal>;
}

// The single contextual popup covering every non-instant-open tap: content and
// actions branch on state (yellow=reserved, red=occupied without/with a
// comanda), plus the layout-editing extras when Personalizar sala is active.
// "Ver reserva" has no separate click: the reservation's full detail is always
// shown right here. In the occupied-with-orders branch, "Ver pedido"/"Ir al
// pago" both land on the same "Ver cuenta" screen -- this app has one unified
// account view (comandas + payment), not separate order/payment screens.
function TableContextPopup({
  table, canEdit, editing, canManageReservations,
  onClose, onOpenTable, onOpenAccount, onStartCommand,
  onNewReservation, onEditReservation, onViewNight,
  onChanged, onOpened, onSettings,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Collapsed by default -- the reservation is background information here,
  // not the reason the popup opened. "Crear pedido" (or the comanda summary
  // for an occupied table) is always the first thing a waiter sees; the
  // reservation card only expands on request.
  const [reservationOpen, setReservationOpen] = useState(false);
  const todayReservations = bookedForToday(table);
  const nextReservation = todayReservations[0];
  const isOccupied = table.status === "open";
  const session = table.session;
  const hasOrders = isOccupied && (session?.commands?.length || 0) > 0;

  const remove = async () => {
    if (isOccupied) { setError("Cobra la cuenta antes de eliminar esta mesa."); return; }
    if (!window.confirm(`¿Eliminar Mesa ${table.number} del plano? El historial se conservará.`)) return;
    setBusy(true); setError("");
    try {
      await mesaApi.saveTable(table.id, { tableNumber: table.number, displayName: `Mesa ${table.number}`, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, shapePreset: table.shapePreset, active: false });
      await onChanged(); onClose();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  const [confirmingClose, setConfirmingClose] = useState(false);
  const openCloseConfirm = () => setConfirmingClose(true);
  const cancelCloseConfirm = () => { if (!busy) { setConfirmingClose(false); setError(""); } };
  const confirmClose = async () => {
    setBusy(true); setError("");
    try { await mesaApi.releaseEmptyTable(session.id); setConfirmingClose(false); await onChanged(); onClose(); }
    catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };

  const subtitle = isOccupied ? (hasOrders ? "Ocupada" : "Ocupada · sin comanda")
    : nextReservation ? "Reservada" : "Libre";

  return <>
  <Modal title={`Mesa ${table.number}`} subtitle={subtitle} onClose={busy ? undefined : onClose} width={640} size={hasOrders ? "tall" : undefined}>
    {isOccupied && !hasOrders && <div className="mesa-banner" style={{ marginTop: 0 }}>Ningún pedido enviado.</div>}

    {/* Real comanda content right in the popup -- product names and note,
        not just a count -- so a waiter can see what's actually going on at
        this table without leaving to "Ver cuenta", which stays the one
        place for payment. Own bounded scroll region: on a table with many
        comandas this can grow past what fits on screen, but it must never
        push the primary actions below it out of view (see .mesa-commands-
        scroll), and it's what makes the sheet actually tall instead of a
        short popup floating over a mostly-empty backdrop (see the "tall"
        size passed to Modal above). */}
    {isOccupied && hasOrders && <div className="mesa-section" style={{ marginTop: 0 }}>
      <h3>Comandas</h3>
      <div className="mesa-commands-scroll">
        {(session.commands || []).map((command) => <CommandCard key={command.id} command={command} />)}
      </div>
    </div>}

    <div className="mesa-menu-grid" style={{ marginTop: isOccupied ? 16 : 0 }}>
      {/* Strict separation: order/account actions only outside Personalizar
          sala, layout actions only inside it -- never both in the same
          grid. Editing a table's shape/capacity is a different job from
          taking its order, and mixing the two invites tapping "Eliminar
          mesa" while meaning to tap "Ver cuenta" (or vice versa). A waiter
          (canEdit=false) never sees editing=true at all, so this changes
          nothing for them.
          Labelled "Crear pedido" (not "Abrir mesa") on purpose -- to a
          waiter this button IS "start taking the order for this table";
          that it also opens the table's session first is an implementation
          detail, not a separate step they should have to think about. */}
      {!editing && !isOccupied && !nextReservation && <button className="mesa-btn mesa-menu-action primary" onClick={onOpenTable}><strong>＋ Crear pedido</strong><span>Un cliente se sienta ahora, sin consumir una reserva</span></button>}
      {!editing && !isOccupied && nextReservation && <button className="mesa-btn mesa-menu-action primary" onClick={onOpenTable}><strong>＋ Crear pedido</strong><span>La reserva futura seguirá activa.</span></button>}
      {!editing && isOccupied && !hasOrders && <>
        <button className="mesa-btn mesa-menu-action green" onClick={onStartCommand}><strong>Crear pedido</strong><span>Primera comanda de esta mesa</span></button>
        <button className="mesa-btn mesa-menu-action" disabled={busy} onClick={openCloseConfirm}><strong>Cerrar mesa</strong><span>Todavía no hay ningún pedido</span></button>
      </>}
      {!editing && isOccupied && hasOrders && <>
        <button className="mesa-btn mesa-menu-action green" onClick={onStartCommand}><strong>Añadir pedido</strong><span>Nueva comanda para esta mesa</span></button>
        <button className="mesa-btn mesa-menu-action gold" onClick={onOpenAccount}><strong>Ver cuenta</strong><span>Pedidos, cobros y pago</span></button>
      </>}
      {canEdit && editing && <button className="mesa-btn mesa-menu-action gold" onClick={onSettings}><strong>Ajustes de mesa</strong><span>Número, capacidad y forma</span></button>}
      {canEdit && editing && <button className="mesa-btn mesa-menu-action red" disabled={busy} onClick={remove}><strong>Eliminar mesa</strong><span>Conserva todo el historial</span></button>}
    </div>
    {editing && <div className="mesa-banner" style={{ marginTop: isOccupied ? 16 : 0 }}>Saliendo de Personalizar sala podrás tomar pedidos o cobrar esta mesa.</div>}

    {/* Reservation: collapsed by default, one tap to expand -- background
        information here, never competing with the primary action above for
        attention (see reservationOpen state comment). */}
    {nextReservation && <div className="mesa-section" style={{ marginTop: 16 }}>
      <button type="button" onClick={() => setReservationOpen((value) => !value)}
        style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }}>
        <i className="mesa-dot" style={{ background: STATUS.reserved.color, flexShrink: 0 }} />
        <strong style={{ flex: 1 }}>{isOccupied ? "Próxima reserva" : "Reserva"}</strong>
        <span className="mesa-chip">Reservada</span>
        <span style={{ color: "#a99d89", transform: reservationOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
      </button>
      {reservationOpen && <div style={{ marginTop: 10 }}>
        <ReservationItem reservation={nextReservation} table={table} onEdit={onEditReservation} onChanged={onChanged} onOpened={onOpened} />
      </div>}
    </div>}

    {/* Secondary, compact actions -- deliberately smaller than the primary
        grid above so "start a new, unrelated booking" never reads as equal
        weight to the actions that act on THIS table/reservation. */}
    {(canManageReservations || (todayReservations.length > 1 && canManageReservations)) && <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
      {todayReservations.length > 1 && canManageReservations && <button className="mesa-btn small" onClick={onViewNight}>Ver reservas de la noche ({todayReservations.length})</button>}
      {canManageReservations && <button className="mesa-btn small gold" onClick={onNewReservation}>＋ Nueva reserva</button>}
    </div>}
    {error && !confirmingClose && <div className="mesa-banner mesa-error" style={{ marginTop: 10 }}>{error}</div>}
  </Modal>
  {confirmingClose && <CerrarMesaDialog tableNumber={table.number} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
  </>;
}

// Visual shape choice: three icon buttons instead of a text dropdown, always
// in Redonda -> Cuadrada -> Rectangular order. Choosing a base shape NEVER
// touches capacity -- only the explicit 6/8 plazas preset (itself a capacity
// choice) does, via onCapacityPreset. This is deliberate: switching an
// EXISTING table's shape must never silently overwrite a capacity the
// operator already saved or already typed this session.
function ShapePicker({ shape, shapePreset, onShape, onCapacityPreset }) {
  return <div>
    <div className="mesa-shape-grid">
      {BASE_SHAPES.map((option) => <button key={option.shape} type="button"
        className={`mesa-shape-btn ${shape === option.shape ? "active" : ""}`}
        onClick={() => onShape(option.shape, "standard")}>
        <span className={`mesa-shape-icon ${option.shape}`} />
        <span>{option.label}</span>
      </button>)}
    </div>
    {shape === "rectangle" && <div className="mesa-shape-grid" style={{ marginTop: 8 }}>
      {RECTANGLE_LENGTHS.map((option) => <button key={option.shapePreset} type="button"
        className={`mesa-btn small ${shapePreset === option.shapePreset ? "active" : ""}`}
        onClick={() => { onShape("rectangle", option.shapePreset); onCapacityPreset(option.capacity); }}>
        {option.label}
      </button>)}
    </div>}
  </div>;
}

function AddTableModal({ tables, onClose, onSaved }) {
  const nextNumber = Math.max(0, ...tables.map((table) => Number(table.number) || 0)) + 1;
  const [form, setForm] = useState({ tableNumber: nextNumber, displayName: `Mesa ${nextNumber}`, capacity: 4, shape: "square", shapePreset: "standard" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const tableNumber = Number(form.tableNumber);
    const capacity = Number(form.capacity);
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999) { setError("Indica un número de mesa válido."); return; }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 99) { setError("Indica una capacidad máxima válida."); return; }
    setBusy(true); setError("");
    try {
      // NOT a fixed (50,50) -- that put every newly added table on the exact
      // same point, dead center, indistinguishable from one another until
      // manually dragged apart (a guaranteed-overlap bug in its own right,
      // separate from the null-coordinate one). Placed in the "next" cell of
      // the same deterministic fallback grid the floor itself uses when a
      // table lacks a position; still expected to be dragged into its real
      // spot afterward (see the subtitle below), but never starts stacked.
      const activeCount = tables.filter((table) => table.active).length;
      const { x: positionX, y: positionY } = fallbackGridSlot(activeCount, activeCount + 1, marginPctFor(form.shape, form.shapePreset));
      await mesaApi.saveTable("new", { tableNumber, displayName: `Mesa ${tableNumber}`, capacity, positionX, positionY, shape: form.shape, shapePreset: form.shapePreset, active: true });
      await onSaved(); onClose();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  return <Modal title="Añadir mesa" subtitle="Después podrás moverla en Personalizar sala" onClose={busy ? undefined : onClose} width={520}>
    <div className="mesa-form-grid"><div><label className="mesa-label">Número de mesa</label><input className="mesa-input" type="number" min="1" max="999" value={form.tableNumber} onChange={(event) => setForm({ ...form, tableNumber: event.target.value, displayName: `Mesa ${event.target.value}` })} /></div><div><label className="mesa-label">Capacidad máxima</label><input className="mesa-input" type="number" min="1" max="99" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div></div>
    <div style={{ marginTop: 12 }}><label className="mesa-label">Forma</label><ShapePicker shape={form.shape} shapePreset={form.shapePreset} onShape={(shape, shapePreset) => setForm((current) => ({ ...current, shape, shapePreset }))} onCapacityPreset={(capacity) => setForm((current) => ({ ...current, capacity }))} /></div>
    <div className="mesa-actions" style={{ justifyContent: "flex-end" }}><button className="mesa-btn" onClick={onClose}>Cancelar</button><button className="mesa-btn gold" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Añadir"}</button></div>{error && <div className="mesa-banner mesa-error">{error}</div>}
  </Modal>;
}

function TableSettingsModal({ table, onClose, onSaved }) {
  const [form, setForm] = useState({ tableNumber: table.number, capacity: table.capacity || 4, shape: table.shape || "square", shapePreset: table.shapePreset || "standard" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const payload = () => {
    const tableNumber = Number(form.tableNumber);
    const capacity = Number(form.capacity);
    if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > 999) throw new Error("table_number");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 99) throw new Error("capacity");
    return { tableNumber, displayName: `Mesa ${tableNumber}`, capacity, positionX: table.x, positionY: table.y, shape: form.shape, shapePreset: form.shapePreset, active: true };
  };
  const save = async () => {
    let next;
    try { next = payload(); }
    catch (err) { setError(err.message === "capacity" ? "Indica una capacidad máxima válida." : "Indica un número de mesa válido."); return; }
    setBusy(true); setError("");
    try { await mesaApi.saveTable(table.id, next); await onSaved(); onClose(); }
    catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  const remove = async () => {
    if (table.status === "open") { setError("Cobra la cuenta antes de eliminar esta mesa."); return; }
    if (!window.confirm(`¿Eliminar Mesa ${table.number} del plano? El historial se conservará.`)) return;
    setBusy(true); setError("");
    try {
      await mesaApi.saveTable(table.id, { tableNumber: table.number, displayName: `Mesa ${table.number}`, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, shapePreset: table.shapePreset, active: false });
      await onSaved(); onClose();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  return <Modal title="Ajustes de mesa" subtitle={`Mesa ${table.number} · Personalizar sala`} onClose={busy ? undefined : onClose} width={520}>
    <div className="mesa-form-grid"><div><label className="mesa-label">Número de mesa</label><input className="mesa-input" type="number" min="1" max="999" value={form.tableNumber} onChange={(event) => setForm({ ...form, tableNumber: event.target.value })} /></div><div><label className="mesa-label">Capacidad máxima</label><input className="mesa-input" type="number" min="1" max="99" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></div></div>
    <div style={{ marginTop: 12 }}><label className="mesa-label">Forma</label><ShapePicker shape={form.shape} shapePreset={form.shapePreset} onShape={(shape, shapePreset) => setForm((current) => ({ ...current, shape, shapePreset }))} onCapacityPreset={(capacity) => setForm((current) => ({ ...current, capacity }))} /></div>
    <div className="mesa-actions" style={{ justifyContent: "space-between", marginTop: 20 }}>
      <button className="mesa-btn red" disabled={busy} onClick={remove}>Eliminar mesa</button>
      <div style={{ display: "flex", gap: 8 }}><button className="mesa-btn" disabled={busy} onClick={onClose}>Cancelar</button><button className="mesa-btn gold" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar ajustes"}</button></div>
    </div>
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 10 }}>{error}</div>}
  </Modal>;
}

// compact=true is the waiter-shell presentation: no "Sala principal" selector
// (the shell's own header already shows it) and no Libre/Reservada/Ocupada
// legend (the same three fill colors are self-evident once you're looking at
// only Mesa, and the legend was real estate the mobile mockup didn't have
// room for). Nothing about role/data/behavior changes -- purely the toolbar's
// left-hand block is skipped; the Reservas·Beta / Personalizar sala dock
// (already role-gated below) renders exactly the same either way.
export default function TabMesa({ role, notify, onNewCommand, onCountChange, refreshKey = 0, compact = false }) {
  const canEdit = role === "admin" || role === "owner";
  const canManageReservations = RESERVATION_ROLES.has(role);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showReservations, setShowReservations] = useState(false);
  const [reservationsFilterTableId, setReservationsFilterTableId] = useState(null);
  const [reservationEditor, setReservationEditor] = useState(null);
  const [printDocument, setPrintDocument] = useState(null);
  const [coversPromptTable, setCoversPromptTable] = useState(null);
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(null);
  const openingWalkInRef = useRef(new Set());

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await mesaApi.floor({ includeInactive: canEdit });
      setTables(result.tables || []); setError("");
      onCountChange?.((result.tables || []).filter((table) => table.active && (table.status === "open" || bookedForToday(table).length > 0)).length);
    } catch (err) { setError(describeMesaError(err)); }
    finally { if (!quiet) setLoading(false); }
  }, [canEdit, onCountChange]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { const timer = setInterval(() => load({ quiet: true }), 10000); return () => clearInterval(timer); }, [load]);

  const selected = tables.find((table) => table.id === selectedId && table.active) || null;
  const menuTable = tables.find((table) => table.id === menuId && table.active) || null;
  const settingsTable = tables.find((table) => table.id === settingsId && table.active) || null;
  const activeTables = tables.filter((table) => table.active);
  const openEditor = (reservation = null, tableId = null) => {
    setMenuId(null); setShowReservations(false);
    setReservationEditor({ reservation, tableId: reservation?.tableId || tableId || activeTables[0]?.id || null });
  };
  const opened = async (tableId) => {
    await load();
    setMenuId(null); setShowReservations(false); setReservationEditor(null);
    setSelectedId(tableId);
  };
  // Single tap, no confirmation, no covers question -- covers are asked later,
  // atomically with the first comanda. Guarded against a double tap on the same
  // table firing two opens; a genuinely concurrent open from another device is
  // still safely rejected by the backend's own table-account-open guard.
  const openWalkIn = async (table) => {
    if (openingWalkInRef.current.has(table.id)) return;
    openingWalkInRef.current.add(table.id);
    try {
      await mesaApi.openTable(table.id);
      await opened(table.id);
    } catch (err) {
      notify?.(`❌ ${describeMesaError(err)}`, C.rosso);
      await load({ quiet: true });
    } finally {
      openingWalkInRef.current.delete(table.id);
    }
  };
  // The first comanda on a walk-in Mesa asks for real covers before the product
  // picker opens; later comandas already have session.coversTotal and skip this.
  const startNewCommand = (table) => {
    if (table.session?.coversTotal == null) { setCoversPromptTable(table); return; }
    onNewCommand(table);
  };
  const confirmFirstCommandCovers = (count) => {
    const table = coversPromptTable;
    setCoversPromptTable(null);
    onNewCommand(table, count);
  };

  const savePosition = async (table) => {
    try {
      await mesaApi.saveTable(table.id, { tableNumber: table.number, displayName: table.name, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, shapePreset: table.shapePreset, active: true });
    } catch (err) { notify?.(`❌ ${describeMesaError(err)}`, C.rosso); await load({ quiet: true }); }
  };
  // Drag only ever "activates" past DRAG_THRESHOLD_PX of real pointer travel.
  // Without this, a plain tap -- which always carries a pixel or two of
  // jitter between pointerdown and pointerup, on both mouse and touch --
  // was read as a completed drag: the table got its position nudged and
  // saved by a fraction of a percent, and the click that should have opened
  // the menu / Ajustes de mesa got suppressed by pointerUp below. Below the
  // threshold nothing about the table changes and the click fires normally;
  // only once the pointer has genuinely traveled is it committed as a drag.
  const DRAG_THRESHOLD_PX = 6;
  const pointerDown = (event, table) => {
    if (!editing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: table.id, pointerId: event.pointerId, moved: false, table,
      startX: event.clientX, startY: event.clientY,
    };
  };
  const pointerMove = (event) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const traveled = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (traveled < DRAG_THRESHOLD_PX) return;
    }
    const rect = board.getBoundingClientRect();
    // Horizontal margin keeps the table's own width clear of the board edge --
    // wider shapes (rectangle/rectangle-long) need proportionally more room
    // than round/square, or their dragged-to-the-edge half would clip against
    // the board's overflow:hidden. Vertical margin stays fixed: height never
    // varies by shape.
    const halfWidthPct = Math.max(7, (cardWidthOf(drag.table.shape, drag.table.shapePreset) / 2 / rect.width) * 100);
    const x = Math.max(halfWidthPct, Math.min(100 - halfWidthPct, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(11, Math.min(89, ((event.clientY - rect.top) / rect.height) * 100));
    dragRef.current = { ...drag, moved: true, table: { ...drag.table, x, y } };
    setTables((current) => current.map((table) => table.id === drag.id ? { ...table, x, y } : table));
  };
  const pointerUp = async (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      suppressClickRef.current = drag.id;
      window.setTimeout(() => { if (suppressClickRef.current === drag.id) suppressClickRef.current = null; }, 250);
      await savePosition(drag.table);
    }
  };
  if (loading) return <div className="mesa-root"><style>{css}</style><div className="mesa-banner">Cargando el plano de mesas…</div></div>;
  if (error && tables.length === 0) return <div className="mesa-root"><style>{css}</style><div className="mesa-banner mesa-error">{error}</div><button className="mesa-btn" style={{ marginTop: 10 }} onClick={() => load()}>Reintentar</button></div>;

  return <div className={`mesa-root${compact ? " compact" : ""}`}><style>{css}</style>
    {!compact && <div className="mesa-toolbar">
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {/* Single room today; the selector stays a real <select> (not a static
            label) so a future second sala (e.g. terraza) is additive UI only --
            no Personalizar sala / floor-loading logic branches on it yet. */}
        <select className="mesa-input" style={{ width: "auto", fontWeight: 900 }} value="principal" onChange={() => {}} aria-label="Sala">
          <option value="principal">Sala principal</option>
        </select>
        <div className="mesa-legend">{Object.entries(STATUS).map(([id, item]) => <span key={id}><i className="mesa-dot" style={{ background: item.color }} />{item.label}</span>)}</div>
      </div>
    </div>}
    <div className="mesa-board" ref={boardRef} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {resolveTablePositions(activeTables).map((table) => {
        const todayReservations = bookedForToday(table);
        const nextReservation = todayReservations[0];
        const state = tableState(table, todayReservations);
        const dragging = dragRef.current?.id === table.id;
        const hasOrders = table.status === "open" && (table.session?.commands?.length || 0) > 0;
        const border = tableBorder(state, hasOrders);
        // Ready-pulse is an OPERATIONAL signal ("a dish is waiting") and
        // Personalizar sala is an EDITING context ("I'm moving/resizing
        // tables") -- the two must never compete for attention on the same
        // tile, so the pulse (and its glow) is simply not applied while
        // editing. Fill color still tells tables apart; see .mesa-table.
        // is-editing for the neutral border that replaces the operational
        // red/green one during editing.
        const ready = !editing && hasReadyOrder(table);
        const selected = table.id === menuId || table.id === selectedId;
        // The floor tile itself only ever shows "Reservado" (a fact, at a
        // glance) -- not the reservation's clock time, which used to sit in
        // this same corner badge and reads as a second number competing with
        // the table number for attention. Full reservation detail (name,
        // time, covers, phone) lives one tap away, inside the popup.
        const isReservedFree = state === STATUS.reserved && !!nextReservation;
        const classes = [
          "mesa-table", variantIdOf(table.shape, table.shapePreset),
          editing ? "is-editing" : "", dragging ? "is-dragging" : "",
          border.thick ? "thick" : "", ready ? "ready-pulse" : "", selected ? "selected" : "",
        ].filter(Boolean).join(" ");
        return <button key={table.id} className={classes} style={{ left: `${table.x}%`, top: `${table.y}%`, "--tc": border.color, "--tb": state.bg }} onPointerDown={(event) => pointerDown(event, table)} onClick={() => {
          if (suppressClickRef.current === table.id) { suppressClickRef.current = null; return; }
          if (!editing && table.status === "free" && todayReservations.length === 0) { openWalkIn(table); return; }
          setMenuId(table.id);
        }}>
          {isReservedFree && <span className="mesa-badge mesa-badge-reserved">Reservada</span>}
          <strong className="mesa-number">{table.number}</strong>
          <span className="mesa-capacity">👥 máx {table.capacity ?? "—"}</span>
        </button>;
      })}
    </div>
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 10 }}>{error}</div>}
    {/* A single discreet line just above the dock -- not a banner competing
        with the map above it. Deliberately one short sentence, no
        responsive long-form variant, so it can never wrap or grow. */}
    {editing && <div className="mesa-edit-note">Arrastra para mover · Toca para editar</div>}
    {/* Dock: same slot below the map, never stacked with the toolbar above
        it. Normal mode offers Reservas·Beta + Personalizar sala; editing
        replaces that with Añadir mesa + Salir de Personalizar sala --
        Reservas·Beta is unavailable while editing, not just hidden
        alongside a second control. In compact mode it's simply the last
        item of the root's own flex column (see .mesa-root.compact), so it
        sits at the true bottom with no gap; non-compact keeps the old
        position:fixed phone treatment (see the .mesa-dock media query). */}
    <div className="mesa-dock">
      {!editing && canManageReservations && <button className="mesa-btn primary" onClick={() => { setReservationsFilterTableId(null); setShowReservations(true); }}>📅 Reservas · Beta</button>}
      {canEdit && editing && <button className="mesa-btn gold" onClick={() => setShowAdd(true)}>＋ Añadir mesa</button>}
      {canEdit && <button className={`mesa-btn ${editing ? "primary" : ""}`} onClick={() => setEditing((value) => { const next = !value; if (!next) { setSettingsId(null); setShowAdd(false); } return next; })}>{editing ? "✓ Salir de Personalizar sala" : "🛠 Personalizar sala"}</button>}
      <button className="mesa-btn icon" title="Actualizar el plano" aria-label="Actualizar el plano" onClick={() => load()}>↻</button>
    </div>
    {menuTable && <TableContextPopup
      table={menuTable} canEdit={canEdit} editing={editing} canManageReservations={canManageReservations}
      onClose={() => setMenuId(null)}
      onOpenTable={() => { setMenuId(null); openWalkIn(menuTable); }}
      onOpenAccount={() => { setMenuId(null); setSelectedId(menuTable.id); }}
      onStartCommand={() => { setMenuId(null); startNewCommand(menuTable); }}
      onNewReservation={() => openEditor(null, menuTable.id)}
      onEditReservation={(reservation) => openEditor(reservation, menuTable.id)}
      onViewNight={() => { setMenuId(null); setReservationsFilterTableId(menuTable.id); setShowReservations(true); }}
      onChanged={() => load({ quiet: true })}
      onOpened={opened}
      onSettings={() => { setMenuId(null); setSettingsId(menuTable.id); }}
    />}
    {selected?.status === "open" && <TableDetail table={selected} onClose={() => setSelectedId(null)} onNewCommand={startNewCommand} onRefresh={() => load({ quiet: true })} onPrint={setPrintDocument} />}
    {coversPromptTable && <FirstCommandCoversModal table={coversPromptTable} onClose={() => setCoversPromptTable(null)} onConfirm={confirmFirstCommandCovers} />}
    {settingsTable && <TableSettingsModal table={settingsTable} onClose={() => setSettingsId(null)} onSaved={() => load()} />}
    {showAdd && <AddTableModal tables={tables} onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    {showReservations && <ReservationAgenda tables={activeTables} initialTableId={reservationsFilterTableId} onClose={() => { setShowReservations(false); setReservationsFilterTableId(null); }} onNew={() => openEditor()} onEdit={(reservation) => openEditor(reservation)} onChanged={() => load({ quiet: true })} onOpened={opened} />}
    {reservationEditor && <ReservationModal tables={activeTables} initialTableId={reservationEditor.tableId} reservation={reservationEditor.reservation} onClose={() => setReservationEditor(null)} onSaved={() => load()} />}
    {printDocument && <PrintPreview document={printDocument} onClose={() => setPrintDocument(null)} />}
  </div>;
}

export { equalShares, hasReadyOrder, css as mesaCss, resolveTablePositions, isRelevantReservation };
