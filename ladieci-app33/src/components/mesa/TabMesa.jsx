import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../constants";
import { createMesaRequestId, describeMesaError, mesaApi } from "../../mesa/mesaApi";
import { normalizeOrderLine } from "../../menu/normalizeOrderLine";
import OrderLineView from "../order/OrderLineView";
import HybridFloorScene, { hybridSceneCss } from "./HybridFloorScene";
import {
  HYBRID_TOKENS, cameraFrame, sceneGeometry, tableFootprint, tableGeometry, unprojectScreenPoint,
} from "./hybridScene";

// MESA_HYBRID_3D — renderer selection only, never a domain switch. Off, this
// file behaves byte-identically to before: same markup, same CSS, same drag
// arithmetic, same tests. On, the floor gains an SVG scene behind the tiles
// and each tile becomes a transparent, correctly-projected control over it.
// Same flag convention as REACT_APP_MESA_ENABLED / the dynamic-menu flags.
const MESA_HYBRID_3D = process.env.REACT_APP_MESA_HYBRID_3D_ENABLED === "true";

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
// Mirrors the exact `canEdit`/`canManageReservations` checks the component
// itself uses below -- exported so MesaPhoneShell's Más screen can decide
// which secondary actions to offer without duplicating (and risking drift
// from) this same role logic.
function canEditMesaRoom(role) {
  return role === "admin" || role === "owner";
}
function canManageMesaReservations(role) {
  return RESERVATION_ROLES.has(role);
}

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

// ── Responsive footprint: saved x/y are percentages of the board, so their
// ON-SCREEN separation shrinks with the board's own width -- but each
// shape's PIXEL size used to stay fixed (round/square always 100px;
// rectangle/rectangle-long only stepped down once, at the same 620px
// breakpoint .mesa-board's own min-height already uses). Below ~500px
// board width that mismatch made independently-valid saved coordinates
// (e.g. Mesa 4 at x=30,y=62 and Mesa 6 at x=50,y=50 -- only 20% apart
// horizontally) collide on screen, confirmed live on real staging data at
// every required phone width. BOARD_WIDTH_REFERENCE reuses that existing
// 620px breakpoint as the width at/above which a shape keeps its original
// full size (tablet/desktop -- already collision-free there); below it,
// every shape shrinks together via the same CSS container-query-driven
// scale, so it's continuous and needs no resize listener or extra render.
// TABLE_MIN_SCALE floors round/square at 64px -- comfortably above the
// ~44-48px minimum mobile tap target -- on the narrowest supported phones.
const BOARD_WIDTH_REFERENCE = 620;
const TABLE_MIN_SCALE = 0.64;
function responsiveTableSize(basePx) {
  const min = Math.round(basePx * TABLE_MIN_SCALE);
  const cqw = Math.round((basePx / BOARD_WIDTH_REFERENCE * 100) * 1000) / 1000;
  return `clamp(${min}px,${cqw}cqw,${basePx}px)`;
}
// Numeric mirror of what the CSS clamp() above resolves to for a given real
// board width -- JSDOM (this app's test runner) never runs real layout, so
// there is no way to assert on actual rendered pixels the way the browser
// itself was used to verify this fix. This is the test-support stand-in:
// same three constants, same formula, kept in lockstep with
// responsiveTableSize() by construction rather than duplicated by hand.
function previewResponsiveTablePx(basePx, boardWidthPx) {
  const min = Math.round(basePx * TABLE_MIN_SCALE);
  const preferred = (basePx / BOARD_WIDTH_REFERENCE) * boardWidthPx;
  return Math.max(min, Math.min(basePx, preferred));
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
/* MESA_MAP_LOCAL_SPOTLIGHT -- reversing the prior slice's room-level
   lighting on purpose: painting light on the floor plane (a central pool,
   asymmetric ambient sources) reads as a static backdrop, and worse,
   doesn't move when a table does. Light now belongs to each table (see
   .mesa-table::before below) and travels with it automatically, since it's
   that same element's own pseudo-content. The floor's only job now is to
   stay a dark, high-contrast, mostly-neutral surface that makes each
   table's own local glow read clearly -- three restrained layers:
   1. a soft dark band right at the top edge -- the one cue that reads as
      "a wall is behind this", not just a flat panel.
   2. a gentle all-around vignette -- corners and edges settle a little
      darker than the middle, without any brightness peak of its own.
   3. a dark, mostly-neutral material gradient (no warm/colored blobs).
   The grid pseudo-element (below) is unaffected -- still absent in normal
   mode, still restored during room-editing via .editing. NOTE: this
   comment is literal <style> textContent at runtime (inside the css
   template string) -- avoid spelling either editing-entry-point's nav
   label in here, see MesaPhoneShell.test.js's Más-screen assertions. */
.mesa-board{position:relative;min-height:420px;border:1px solid rgba(208,184,145,.22);border-radius:22px;overflow:hidden;background:linear-gradient(180deg,rgba(0,0,0,.3) 0%,transparent 9%),radial-gradient(ellipse 118% 92% at 50% 42%,transparent 48%,rgba(0,0,0,.3) 80%,rgba(0,0,0,.58) 100%),linear-gradient(180deg,#131110,#0a0908 55%,#050403 100%);box-shadow:inset 0 0 70px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.04)}
/* Fully absent in normal operator mode -- the reference floor shows no
   grid line at all -- and only fades in for room-editing mode (.editing,
   see the board's own className below), where positioning genuinely
   benefits from it. Pure opacity toggle -- the grid geometry itself, and
   every drag/pointer calculation, are untouched by this. NOTE: this
   comment is literal <style> textContent at runtime (inside the css
   template string) -- MesaPhoneShell.test.js's Más-screen tests assert
   <main> textContent stays scoped to Más's own content, so avoid spelling
   either editing-entry-point's nav label in here. */
.mesa-board:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:32px 32px;pointer-events:none;opacity:0;transition:opacity .2s ease}
.mesa-board.editing:before{opacity:1}
/* The card shows only number + capacity + up to two small corner badges --
   nothing that varies in length (no name, no price, no free text) -- so a
   single fixed box already covers every state and this never needs per-state
   sizing. Badges are absolutely positioned outside the flow, so they can
   never change the box's own height and cause the translate(-50%,-50%)
   recentering jump that a min-height card had. */
/* box-sizing:border-box is what makes the "occupied" border able to go from
   2px to 4px (see .mesa-table.thick below) without growing the box: width/
   height stay the outer, rendered size regardless of border-width. */
/* MESA_MAP_LOCAL_SPOTLIGHT -- table = surface + puck-side + local spotlight
   + shadow, as ONE moving visual unit (the brief's own framing). The puck
   side (first box-shadow layer, 0 4px 0 0 <solid color>) is what actually
   sells the angled/perspective read: a perfectly flat top-down disc would
   show only its top face, never a visible edge beneath the rim, so a
   thin solid-color step right under the border is the cheapest possible
   way to imply "this is being viewed from slightly above/in front", with
   zero risk to drag geometry -- it's a box-shadow value, box-shadow never
   participates in layout or hit-testing. The side's own color is a
   darkened color-mix() of --tc (the same border color already driving the
   ring), so it reads as "this table's own edge in shadow", not a generic
   grey slab. Contact + cast shadow (next two layers) are unchanged in
   spirit from the prior slice -- tight near-black right at the base of
   that side, soft and offset further out. background-color stays the
   exact semantic --tb fill; background-image only layers ambient top
   light on the face itself. See .mesa-table::before below for the local
   floor spotlight -- the OTHER half of this same visual unit. */
.mesa-table{box-sizing:border-box;position:absolute;transform:translate(-50%,-50%);width:100px;height:100px;padding:8px;overflow:visible;-webkit-tap-highlight-color:transparent;border-style:solid;border-width:2px;border-color:var(--tc);color:#fff;background-color:var(--tb);background-image:radial-gradient(ellipse 92% 70% at 40% 16%,rgba(255,255,255,.16),rgba(255,255,255,0) 62%),linear-gradient(172deg,rgba(255,255,255,.07) 0%,rgba(0,0,0,0) 42%,rgba(0,0,0,.30) 100%);box-shadow:0 4px 0 0 color-mix(in srgb,var(--tc) 55%,black),inset 0 1px 1px rgba(255,255,255,.22),inset 0 -10px 15px rgba(0,0,0,.34);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;touch-action:none;user-select:none;transition:box-shadow .15s,filter .15s}
/* MESA_MAP_FINAL_SHADOW -- root cause of the "halo without an interrupting
   shadow" complaint: a plain (non-inset) box-shadow on .mesa-table itself
   paints at the very BOTTOM of this element's own local stack -- behind
   the element's own background, and behind every pseudo-element it owns,
   even one with a negative z-index (see .mesa-table::before above). The
   previous version kept the contact/cast shadow AS .mesa-table's own
   box-shadow, so the warm spotlight (painted later, on top, per normal
   pseudo-element stacking) was silently washing it out in exactly the
   ring where they overlap -- the table's own edge. Moving the floor
   shadow into its own ::after, given a z-index one step above the
   spotlight's ::before, fixes the paint order directly: spotlight paints
   first (furthest back), this shadow paints second (on top of the
   spotlight, visibly darkening/interrupting it right under the table),
   the table's own opaque face paints last (on top of both). inset:0 +
   border-radius:inherit means this pseudo-element's own box exactly
   follows the table's current shape (round/square/rectangle/rectangle-
   long) -- its box itself stays invisible (no fill), only its box-shadow
   (which DOES render on top of ::before, being this element's own content
   layer rather than its background layer) is visible. pointer-events:none
   keeps it decorative-only, same as the spotlight. Floor (.mesa-board)
   and spotlight (::before's size/color) are deliberately untouched this
   pass -- this is a shadow-only fix. */
.mesa-table::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;box-shadow:0 2px 2px rgba(0,0,0,.65),0 8px 10px rgba(0,0,0,.48),0 24px 34px -6px rgba(0,0,0,.62)}
/* MESA_MAP_LOCAL_SPOTLIGHT -- the local floor glow, the other half of the
   table+spotlight+shadow unit. A pseudo-element of .mesa-table itself
   (not a separate DOM node, not painted on .mesa-board) so it moves
   atomically with the table on every drag frame -- there is no separate
   position to reconcile, so no static residue at an old coordinate is
   even possible by construction. --tg (set inline alongside --tc/--tb,
   see the floor render loop) is occupancy-only -- deliberately NOT --tc,
   so a reserved-but-free table's amber border never turns its spotlight
   gold (the brief's own "not status overload" instruction).
   MESA_MAP_LOCAL_SPOTLIGHT_V2 -- the color itself is now mostly-neutral
   warm amber with only a light, controlled contamination from --tg (16%
   at the brightest stop, fading to 9% further out -- real light desaturates
   as it dims, so the falloff itself gets warmer/less colored, not just
   dimmer). A first version mixed --tg in at 55%, which produced a strongly
   saturated green/red halo that read as neon/LED rather than ambient
   light -- direct user feedback against a real reference photo. State
   (free/occupied) still lives primarily on the table's own border/fill
   (--tc/--tb, untouched here); the floor spotlight is deliberately a much
   quieter signal than that -- state color belongs on the table itself, the
   floor glow should read as mostly-neutral ambient light, not a colored
   status indicator of its own. The outer color-mix() of each stop blends
   toward transparent (not just
   a low peak alpha) so the glow's own brightness tapers along with its
   saturation. z-index:-1 keeps it behind this element's own opaque
   background (so the table's own face is never tinted by its own glow,
   and the halo genuinely only shows in the ring beyond the table's edge,
   where the floor is exposed); pointer-events:none keeps the enlarged box
   purely decorative -- the real tap/hit target stays exactly the table's
   own width/height, unlisted here on purpose since a hit-target change is
   explicitly out of scope. */
.mesa-table::before{content:"";position:absolute;inset:-32px;z-index:-2;pointer-events:none;background:radial-gradient(ellipse at center,color-mix(in srgb,color-mix(in srgb,var(--tg,#22C55E) 16%,#e8ac52 84%) 46%,transparent) 0%,color-mix(in srgb,color-mix(in srgb,var(--tg,#22C55E) 9%,#e8ac52 91%) 20%,transparent) 32%,transparent 60%)}
.mesa-table:hover{filter:brightness(1.08);box-shadow:0 4px 0 0 color-mix(in srgb,var(--tc) 60%,black),0 0 16px color-mix(in srgb,var(--tc) 24%,transparent),inset 0 1px 1px rgba(255,255,255,.26),inset 0 -10px 15px rgba(0,0,0,.34)}
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
/* Responsive footprint override -- see responsiveTableSize() above for the
   shared formula/reasoning. @supports keeps this a pure progressive
   enhancement: a browser that doesn't understand container query units
   ignores this whole block and the fixed px rules above stand untouched,
   so nothing here can ever regress an unsupported browser below today's
   already-shipped fixed-size behavior. */
@supports (container-type: inline-size) {
.mesa-board{container-type:inline-size}
.mesa-table{width:${responsiveTableSize(100)};height:${responsiveTableSize(100)}}
.mesa-table.rectangle{width:${responsiveTableSize(132)}}
.mesa-table.rectangle-long{width:${responsiveTableSize(168)}}
}
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
/* FREE_TABLE_OPEN_LATENCY_01 -- immediate per-table tap feedback while its
   own open() round-trip is in flight (see openingIds' comment). Scoped to
   this one tile only -- every other table keeps its normal fill/cursor and
   stays fully tappable. pointer-events:none only blocks a second tap on
   THIS same table; the ref-based dedupe in openWalkIn already guarded
   against that, this is belt-and-braces plus the visual cue. */
.mesa-table.opening{opacity:.55;filter:grayscale(.35);cursor:wait;pointer-events:none}
.mesa-table.selected{box-shadow:0 0 0 3px rgba(247,240,223,.75),0 4px 0 0 color-mix(in srgb,var(--tc) 55%,black),inset 0 1px 1px rgba(255,255,255,.22),inset 0 -10px 15px rgba(0,0,0,.34)}
@keyframes mesa-ready-pulse{0%,100%{box-shadow:0 4px 0 0 color-mix(in srgb,var(--tc) 55%,black),inset 0 1px 1px rgba(255,255,255,.22),inset 0 -10px 15px rgba(0,0,0,.34),0 0 0 0 rgba(34,197,94,0)}50%{box-shadow:0 4px 0 0 color-mix(in srgb,var(--tc) 55%,black),inset 0 1px 1px rgba(255,255,255,.22),inset 0 -10px 15px rgba(0,0,0,.34),0 0 22px 7px rgba(34,197,94,.65)}}
.mesa-table.ready-pulse{animation:mesa-ready-pulse 1.35s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){
  .mesa-table.ready-pulse{animation:none;filter:brightness(1.22);box-shadow:0 4px 0 0 color-mix(in srgb,var(--tc) 55%,black),inset 0 1px 1px rgba(255,255,255,.22),inset 0 -10px 15px rgba(0,0,0,.34),0 0 14px 3px rgba(34,197,94,.6)}
}
.mesa-number{font-size:26px;font-weight:900;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.mesa-capacity{font-size:11px;font-weight:800;color:#e7dcc7;display:flex;align-items:center;gap:3px}
.mesa-badge{position:absolute;z-index:2;border-radius:999px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,.4)}
/* MESA_PHONE_VISUAL_PARITY_V2 -- a restrained icon badge, not a text pill:
   shown whenever a table has a relevant reservation tonight, independent of
   occupied/free fill (see reservationBadge in the floor render below). The
   .conflict variant (booked reservation on a table that's already occupied
   by someone else) recolors the badge red -- an ADDITIONAL signal layered on
   top of the occupied-red fill, never a replacement for it. */
.mesa-badge-reserved{top:-8px;right:-8px;width:23px;height:23px;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;background:linear-gradient(180deg,#F3CA6A,#D7A84B 55%,#9C7A2E);border:2px solid #0b0b0a}
.mesa-badge-reserved.conflict{background:linear-gradient(180deg,#FB8A7C,#EF4444 55%,#B91C1C)}
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
/* P1_D_LISTA_THEME_01 -- .mesa-row above is written for plain <div> rows
   nested inside an already-dark .mesa-modal (VerCuentaModal's payment-method
   list, etc.), so it never needed its own background/color/appearance reset.
   MesaListaView renders its rows as native <button> elements instead (a real
   tap target, not just a modal list item) -- a bare <button> pulls in the
   browser's own light UA chrome (white/grey face, dark text) for every
   property this class doesn't set, which is exactly the "bright white
   surface in a dark app" bug. --mesa-row-bg/-fg are real custom properties,
   not just a comment: today they only ever resolve to their fallback (this
   app has no theme layer yet), but a future Light-mode pass can override
   them from an ancestor (e.g. a data-theme="light" rule) without touching
   this component again -- documented, not built, per this slice's own scope. */
.mesa-row-tap{-webkit-appearance:none;appearance:none;font-family:inherit;background-color:var(--mesa-row-bg,rgba(255,255,255,.035));background-image:linear-gradient(165deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%);color:var(--mesa-row-fg,#f7f0df);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px 14px;margin-bottom:10px;box-shadow:0 6px 16px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.05);transition:transform .12s,box-shadow .12s}
.mesa-row-tap:last-child{margin-bottom:0}
.mesa-row-tap:active{transform:scale(.985);box-shadow:0 2px 8px rgba(0,0,0,.32)}
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
/* MESA_PHONE_VISUAL_PARITY_V2 -- reservation-agenda rows (ReservationAgendaRow).
   .mesa-row (existing) still supplies the flex/gap layout; these add the
   elevated-card depth + the conflict-tinted variant. Declared after
   .mesa-row on purpose so its border/background/radius/padding win the
   cascade for that shared class without needing !important. NOTE: this
   comment block is literal <style> textContent at runtime (it lives inside
   the css template string) -- MesaPhoneShell.test.js's Más-screen tests
   assert the phone shell's <main> textContent stays scoped to Más's own
   content while TabMesa (source of this stylesheet) stays mounted-but-
   hidden behind it, so avoid spelling this screen's nav label in here. */
.mesa-reservation-row{cursor:pointer;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 13px;margin-bottom:9px;background:rgba(255,255,255,.035);box-shadow:0 6px 14px rgba(0,0,0,.26);transition:transform .12s,box-shadow .12s}
.mesa-reservation-row:last-child{margin-bottom:0}
.mesa-reservation-row:active{transform:scale(.985)}
.mesa-reservation-row.conflict{background:rgba(239,68,68,.11);border-color:rgba(239,68,68,.4)}
.mesa-reservation-time{font-size:17px;font-weight:900;font-variant-numeric:tabular-nums;flex-shrink:0;min-width:46px}
.mesa-reservation-row.conflict .mesa-reservation-time{color:#ff9c90}
.mesa-reservation{border:1px solid rgba(239,68,68,.38);border-radius:14px;padding:12px;background:rgba(239,68,68,.09);margin-top:9px}.mesa-reservation-main{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.mesa-reservation-name{font-size:15px;font-weight:950}.mesa-reservation-time{color:#ff8d83;font-size:16px;font-weight:950;white-space:nowrap}.mesa-reservation-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.mesa-btn.small{padding:7px 10px;border-radius:10px;font-size:12px}.mesa-btn.red{background:#C62828;border-color:#EF4444;color:#fff}.mesa-textarea{min-height:88px;resize:vertical}.mesa-menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mesa-menu-action{min-height:72px;text-align:left;display:flex;flex-direction:column;justify-content:center}.mesa-menu-action strong{font-size:14px}.mesa-menu-action span{font-size:11px;color:#a99d89;margin-top:3px}
/* P1_D_TABLE_FIRST_01 -- MesaWorkspace's compactCard presentation (phone
   shell only, compact prop -- see the compactCard branch below). A dedicated
   overlay/card pair, NOT a variant of .mesa-overlay/.mesa-modal, so nothing
   here can ever affect any other modal in this file (VerCuentaModal,
   ReservationAgenda, TableContextPopup, the non-compact MesaWorkspace
   itself, etc. all keep their exact current behavior everywhere, including
   inside this same shell). True flexbox center, not bottom-anchored; a
   stronger dim+blur than the shared overlay's own; a card that sizes to its
   own now-genuinely-compact content instead of stretching full-width/near-
   full-height -- this is what replaces "almost the entire screen goes dark,
   a tiny sheet clings to the bottom".
*/
.mesa-table-card-overlay{position:fixed;inset:0;z-index:1200;background:rgba(6,5,4,.74);backdrop-filter:blur(11px);display:flex;align-items:center;justify-content:center;padding:20px}
.mesa-table-card{width:min(400px,100%);max-height:86vh;overflow:auto;border:1px solid rgba(208,184,145,.3);border-radius:22px;background:#14120f;color:#f8f0df;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.mesa-table-card-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 18px 6px;background:#14120f}
.mesa-table-card-body{padding:6px 18px 20px}
/* A "compact section" is the shared visual language for COMANDAS/RESERVAS:
   muted/quiet when there is nothing to report, a brighter border+label+dot
   once there's something the operator should notice -- same rule, same
   markup, both sections, so they can never visually drift apart. */
.mesa-card-section{border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px;margin-top:10px;cursor:pointer}
.mesa-card-section:first-child{margin-top:0}
.mesa-card-section.muted{opacity:.62}
.mesa-card-section.active{border-color:rgba(215,168,75,.4);background:rgba(215,168,75,.07)}
.mesa-card-section-label{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#9f9380}
.mesa-card-section.active .mesa-card-section-label{color:#e9c983}
.mesa-card-section-summary{margin-top:5px;font-size:14px;font-weight:700}
.mesa-card-section.muted .mesa-card-section-summary{color:#7c7263;font-weight:600}
/* MESA_NAV_CONSOLIDATION_01 -- the compact card's own in-place back control,
   replacing the title only while a subview (Cuenta/Cerrar mesa) is showing.
   Same weight/size as the title it replaces so the head never visually
   jumps; a plain button, not a new visual language. */
.mesa-card-back{display:flex;align-items:center;gap:8px;background:none;border:none;padding:0;margin:0;font:inherit;font-weight:950;font-size:20px;color:inherit;cursor:pointer;text-align:left}
.mesa-print-layer{display:none}.mesa-print-sheet{width:58mm;margin:0 auto;color:#000;background:#fff;font:12px/1.35 'DM Mono',monospace}.mesa-print-sheet h1,.mesa-print-sheet h2,.mesa-print-sheet p{margin:0}.mesa-print-sheet .sep{border-top:1px dashed #000;margin:8px 0}.mesa-print-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.mesa-print-row span:first-child{min-width:0;overflow-wrap:anywhere}.mesa-print-total{font-size:18px;font-weight:900;text-align:right;margin:8px 0}.mesa-print-center{text-align:center}.mesa-print-small{font-size:10px}
@media(max-width:620px){.mesa-board{min-height:440px}.mesa-summary{grid-template-columns:1fr 1fr}.mesa-form-grid,.mesa-menu-grid{grid-template-columns:1fr}.mesa-methods{grid-template-columns:1fr}.mesa-modal-body{padding:15px}.mesa-modal-head{padding:14px 15px}}
/* Phone: every modal in this component becomes a near-full-screen bottom
   sheet instead of a small floating card with dead space on all sides --
   anchored to the bottom edge, full width, rounded top corners only,
   safe-area-aware so the home-indicator area on notched iPhones never
   covers the last row of actions. */
@media(max-width:480px){
  .mesa-overlay{align-items:flex-end;padding:0}
  .mesa-modal{width:100%;max-width:100%;max-height:94vh;border-radius:20px 20px 0 0;border-left:none;border-right:none;border-bottom:none}
  /* The only sheets that force real height: ones with actual comanda
     content to show (size="tall" on Modal, see MesaWorkspace). Free/
     reserved/no-order sheets stay their natural shrink-to-content height --
     short on purpose, not padded out to match. 70-85vh range as specified;
     80vh split the difference. */
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
//
// MESA_NAV_CONSOLIDATION_01 -- the focus-trap/Escape behavior below is
// shared with the compact in-place CerrarMesaConfirm further down (same
// confirmation, same keyboard rules; only the container differs -- a
// standalone overlay here, in-place content inside the already-open compact
// card there).
function useCerrarMesaFocusTrap({ cancelRef, confirmRef, busy, onCancel }) {
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
}

function CerrarMesaDialog({ tableNumber, empty, busy, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  useCerrarMesaFocusTrap({ cancelRef, confirmRef, busy, onCancel });

  return <div className="mesa-overlay" onClick={() => { if (!busy) onCancel(); }}>
    <div className="mesa-modal" role="alertdialog" aria-modal="true" aria-labelledby="cerrar-mesa-title" aria-describedby="cerrar-mesa-body"
      style={{ width: "min(420px, 100%)" }} onClick={(event) => event.stopPropagation()}>
      <div className="mesa-modal-head">
        <div id="cerrar-mesa-title" style={{ fontWeight: 950, fontSize: 19 }}>{`Cerrar Mesa ${tableNumber}`}</div>
      </div>
      <div className="mesa-modal-body">
        <p id="cerrar-mesa-body" className="mesa-muted">
          {empty ? "La mesa está vacía y no tiene comandas ni pagos." : "La mesa quedará libre para nuevos clientes."}
        </p>
        {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="mesa-actions" style={{ marginTop: 16 }}>
          <button ref={cancelRef} className="mesa-btn" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button ref={confirmRef} className="mesa-btn danger" disabled={busy} onClick={onConfirm}>{busy ? "Cerrando…" : "Cerrar mesa"}</button>
        </div>
      </div>
    </div>
  </div>;
}

// MESA_NAV_CONSOLIDATION_01 -- compact-card in-place variant of the same
// confirmation (identical copy, identical blockers/handlers, passed straight
// through from MesaWorkspace; identical focus-trap via the shared hook
// above). Rendered as plain content inside the compact card's own body (see
// the compactCard branch of MesaWorkspace below) -- never a second
// .mesa-overlay/.mesa-modal, so there is no nested-overlay stacking on
// phone. The non-compact path keeps using the standalone CerrarMesaDialog
// above, byte-for-byte unchanged.
function CerrarMesaConfirm({ tableNumber, empty, busy, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  useCerrarMesaFocusTrap({ cancelRef, confirmRef, busy, onCancel });

  return <div role="alertdialog" aria-labelledby="cerrar-mesa-title-inline" aria-describedby="cerrar-mesa-body-inline" data-testid="mesa-card-view-close-confirm">
    <div id="cerrar-mesa-title-inline" style={{ fontWeight: 950, fontSize: 19 }}>{`Cerrar Mesa ${tableNumber}`}</div>
    <p id="cerrar-mesa-body-inline" className="mesa-muted" style={{ marginTop: 8 }}>
      {empty ? "La mesa está vacía y no tiene comandas ni pagos." : "La mesa quedará libre para nuevos clientes."}
    </p>
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
    <div className="mesa-actions" style={{ marginTop: 16 }}>
      <button ref={cancelRef} className="mesa-btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button ref={confirmRef} className="mesa-btn danger" disabled={busy} onClick={onConfirm}>{busy ? "Cerrando…" : "Cerrar mesa"}</button>
    </div>
  </div>;
}

// Item detail list for the "Comanda por confirmar" draft panel -- was two
// byte-identical copies (compactCard vs Modal branch of MesaWorkspace below),
// each hand-rolling its own extras/removedIngredients/notes interpretation
// straight off the emitted shape. That interpretation silently went blank
// for a custom pizza (PizzaCustomBuilder's raw item has no .extras/.notes/
// .removedIngredients/.classicName -- see menu/normalizeOrderLine.js), so
// the operator saw "1x Pizza a tu gusto" with no ingredients here even
// though the same draft's ingredients were visible inside the picker's own
// drawer. One list, normalized once, used by both branches.
// classNames/styles reproduce exactly what the two removed blocks rendered
// (.mesa-muted + fontSize:12 for extras/removed, .mesa-command-note for the
// note -- see the .mesa-muted/.mesa-command-note rules in this file's own
// <style> block) so this migration changes NO visual output for the fields
// that already rendered; it only adds the ones that silently didn't.
const draftLineClassNames = { extras: "mesa-muted", removed: "mesa-muted", note: "mesa-command-note" };
const draftLineStyles = { extras: { fontSize: 12 }, removed: { fontSize: 12 } };

function DraftItemsList({ items }) {
  return <>
    {items.map((item, index) => (
      <div key={item._uid || index} style={{ marginBottom: index < items.length - 1 ? 8 : 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <OrderLineView line={normalizeOrderLine(item)} showQuantityPrefix
              classNames={draftLineClassNames} styles={draftLineStyles} />
          </div>
          <strong>{euro((Number(item.p) || 0) * (Number(item.q) || 0))}</strong>
        </div>
      </div>
    ))}
  </>;
}

// Shared comanda card -- the ONE place a comanda's product list ever renders
// (MesaWorkspace; nowhere else). Collapsed by default: a table with several
// comandas must stay scannable (number + state + time), and the full product/
// modifier/note detail is one tap away, not always-on screen real estate.
// action is an optional per-command control (MesaWorkspace wires "✓ Servida"
// through it for a ready comanda).
function CommandCard({ command, action, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const productCount = (command.items || []).reduce((sum, item) => sum + (Number(item.q) || 1), 0);
  return <div className="mesa-command-card">
    <button type="button" onClick={() => setExpanded((value) => !value)} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
      border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left",
    }}>
      <strong>Comanda #{command.commandNumber}</strong>
      <span className="mesa-chip" style={command.state === "LISTO" ? { borderColor: "#22C55E", color: "#22C55E" } : undefined}>{commandStateLabel(command.state)}</span>
      <span className="mesa-muted" style={{ marginLeft: "auto" }}>{command.time || "ahora"}</span>
      <span style={{ color: "#a99d89", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>⌄</span>
    </button>
    {!expanded && <div className="mesa-muted" style={{ fontSize: 12, marginTop: 4 }}>{productCount} producto{productCount === 1 ? "" : "s"}</div>}
    {expanded && <>
      <div className="mesa-muted" style={{ fontSize: 12, marginTop: 6 }}>{productCount} producto{productCount === 1 ? "" : "s"}</div>
      {(command.items || []).length > 0 && <ul className="mesa-command-items">
        {command.items.map((item, index) => <li key={index}>{Number(item.q) > 1 ? `${item.q}× ` : ""}{item.n}</li>)}
      </ul>}
      {command.note && <div className="mesa-command-note">Nota: {command.note}</div>}
      {action && <div style={{ marginTop: 8, display: "flex" }}>{action}</div>}
    </>}
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

// VerCuentaModal -- the ONLY financial surface. Total/Cobrado/Pendiente,
// payment actions, printable tickets, Pendiente de pago. It never creates or
// lists comandas (that's MesaWorkspace, which opens this by button, not the
// other way around) -- "Elegir productos" here is a partial-payment line
// picker (which already-billed lines this payment settles), not a second
// order-creator, so it stays exactly as-is.
// "A la romana" is removed as a UI entry point (rejected product decision):
// no equal_split payment button. "Imprimir división" is KEPT and semantically
// decoupled from it -- its content (a single ticket with an equal per-person
// subtotal, no separate accounts created) is exactly the shape a future
// "Dividir por persona" print would need, so the underlying computation
// (equalShares) and this read-only preview survive; only its printed title
// changes from "A LA ROMANA" to the neutral "DIVISIÓN POR PERSONA". The
// equal_split PAYMENT mode itself is untouched at the API/PaymentModal level
// -- no backend or ledger change, only this entry point is gone.
//
// MESA_NAV_CONSOLIDATION_01 -- VerCuentaBody below holds every bit of this
// state/logic; VerCuentaModal is now a thin Modal wrapper around it (used by
// the non-compact path, unchanged). The compact card's in-place "account"
// view renders VerCuentaBody directly, no Modal wrapper, so there is no
// second overlay -- same totals, same actions, same mesaApi calls either way.
function VerCuentaBody({ table, onRefresh, onPrint }) {
  const [paymentMode, setPaymentMode] = useState(null);
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
    title: "DIVISIÓN POR PERSONA", tableNumber: table.number,
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

  return <>
    <div className="mesa-summary">
      <div className="mesa-stat"><small>Total</small><strong>{euro(session.total)}</strong></div>
      <div className="mesa-stat"><small>Cobrado</small><strong style={{ color: "#65d995" }}>{euro(session.paid)}</strong></div>
      <div className="mesa-stat"><small>Pendiente</small><strong style={{ color: "#ffc65c" }}>{euro(session.outstanding)}</strong></div>
      <div className="mesa-stat"><small>Personas</small><strong>{session.coversTotal == null ? "—" : `${session.coversRemaining}/${session.coversTotal}`}</strong></div>
    </div>
    {table.status === "open" && <>
      <div className="mesa-actions">
        {session.outstanding > 0 && <button className="mesa-btn green" onClick={() => setPaymentMode("full")}>Cobrar todo</button>}
        {remainingLines.length > 0 && <button className="mesa-btn" onClick={() => setPaymentMode("item_selection")}>Elegir productos</button>}
        {session.outstanding > 0 && <button className="mesa-btn" onClick={() => setPaymentMode("custom_amount")}>Importe libre</button>}
      </div>
      <div className="mesa-actions">
        {session.outstanding > 0 && <button className="mesa-btn gold" onClick={() => onPrint(billDocument())}>🖨 Cuenta pendiente</button>}
        {shares.length > 0 && <button className="mesa-btn" onClick={() => onPrint(splitDocument())}>🖨 Imprimir división</button>}
      </div>
    </>}
    {paymentTotals.length > 0 && <div className="mesa-section"><h3>Cobrado por método</h3>{paymentTotals.map(([method, amount]) => <div className="mesa-row" key={method}><span>{METHODS.find((item) => item.id === method)?.label || method}</span><strong>{euro(amount)}</strong></div>)}</div>}
    {remainingLines.length > 0 && <div className="mesa-section"><h3>Pendiente de pago</h3>{remainingLines.map((line) => <div className="mesa-row" key={line.id}><span>{line.description}</span><strong>{euro(line.remaining)}</strong></div>)}</div>}
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
    {paymentMode && <PaymentModal table={table} mode={paymentMode} onClose={() => setPaymentMode(null)} onPaid={paid} />}
  </>;
}

// Thin wrapper for the non-compact (tablet/desktop) path -- unchanged
// behavior, unchanged markup: VerCuentaBody's content inside the same
// shared Modal it always rendered.
function VerCuentaModal({ table, onClose, onRefresh, onPrint }) {
  return <Modal title={`Mesa ${table.number} · Cuenta`} onClose={onClose}>
    <VerCuentaBody table={table} onRefresh={onRefresh} onPrint={onPrint} />
  </Modal>;
}

// MesaWorkspace -- the ONE operative surface for an occupied table (replaces
// the old TableContextPopup-occupied-branch + TableDetail split, which
// rendered the same comanda list in two different modals reachable from the
// same tap). Comandas, Nueva comanda and Cerrar mesa live here; anything
// financial (totals, payment, printable tickets) is one explicit "Ver
// cuenta" tap away, in VerCuentaModal, never inlined here.
function MesaWorkspace({
  table, onClose, onNewCommand, onRefresh, onPrint,
  canManageReservations, onEditReservation, onViewNight, onChanged, onOpened,
  notify, draft, onClearDraft, onSendToCocina,
  // P1_D_TABLE_FIRST_01 -- phone shell only (compact prop threaded straight
  // through from the main TabMesa render, see below). Every state/handler
  // above and below is 100% shared; only the final `return` branches, so the
  // non-compact (tablet/desktop) path stays byte-identical to before this
  // slice, everywhere it's reached, including outside this shell.
  compactCard = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAccount, setShowAccount] = useState(false);
  const [sendingDraft, setSendingDraft] = useState(false);
  // Collapsed by default, same as the free/reserved popup -- an occupied
  // table can still have a LATER reservation booked for tonight; that must
  // stay visible here too (it used to show in the old popup regardless of
  // occupied state), just never competing with the comandas for attention.
  const [reservationOpen, setReservationOpen] = useState(false);
  // Collapsed by default -- the draft must read as a compact one-line summary
  // inline in the workspace, not a second full-page view (see Fase 5 spec).
  const [draftExpanded, setDraftExpanded] = useState(false);
  // compactCard only: the detailed per-comanda list is collapsed behind the
  // one-line aggregate summary by default (see the brief's own "do not dump
  // the entire order contents" instruction) -- unused, harmless, on the
  // non-compact path, same as every other single-branch-only state above
  // would be if it happened to not apply to one specific return.
  const [comandasExpanded, setComandasExpanded] = useState(false);
  const session = table.session;
  const hasOrders = (session?.commands?.length || 0) > 0;
  const todayReservations = bookedForToday(table);
  const nextReservation = todayReservations[0];
  const draftTotal = (draft?.items || []).reduce((sum, item) => sum + (Number(item.p) || 0) * (Number(item.q) || 0), 0);
  const draftItemCount = (draft?.items || []).reduce((sum, item) => sum + (Number(item.q) || 0), 0);

  const markServed = async (orderId) => {
    setBusy(true); setError("");
    try { await mesaApi.markServed(session.id, orderId); await onRefresh(); }
    catch (err) { setError(describeMesaError(err)); }
    finally { setBusy(false); }
  };
  const [confirmingClose, setConfirmingClose] = useState(false);
  const openCloseConfirm = () => setConfirmingClose(true);
  const cancelCloseConfirm = () => { if (!busy) { setConfirmingClose(false); setError(""); } };
  // MESA_NAV_CONSOLIDATION_01 -- derived, not a separate piece of state: the
  // compact card's in-place workspace view is 100% determined by the two
  // existing flags above, so it can never drift out of sync with them.
  // Read only inside the compactCard branch below; harmless/unused on the
  // non-compact path, same as comandasExpanded already is.
  const workspaceView = confirmingClose ? "close-confirm" : showAccount ? "account" : "detail";
  const backToDetail = () => { if (workspaceView === "account") setShowAccount(false); else cancelCloseConfirm(); };
  // P0-B.1 — a never-ordered table (coversTotal == null) still goes through
  // releaseEmptyTable; an occupied table (real comandas, possibly already
  // fully paid) goes through the new explicit closeTable. Same dialog, same
  // confirmation, same error banner either way -- the backend decides
  // whether the close is actually allowed right now (unpaid balance or
  // genuine pending Cocina work both come back as a normal error here, not
  // a crash or a silent no-op).
  const confirmClose = async () => {
    setBusy(true); setError("");
    try {
      if (session.coversTotal == null) await mesaApi.releaseEmptyTable(session.id);
      else await mesaApi.closeTable(session.id);
      setConfirmingClose(false); await onRefresh();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };
  // The real, authoritative Cocina submit -- the ONLY place a Mesa comanda
  // reaches the backend. One request, button disabled while in flight (both
  // guard a double tap); on failure the draft is untouched (setError only,
  // draft state itself lives one level up in ServicioPage and is never
  // touched here) so retrying reuses the exact same client_req_id already
  // baked into the draft. On success the draft is cleared and the floor
  // reloads, turning this same comanda into a normal compact/expandable card.
  const sendToCocina = async () => {
    if (!draft || sendingDraft) return;
    setSendingDraft(true); setError("");
    try {
      await onSendToCocina(session.id, table.number, draft);
      onClearDraft(session.id);
      await onRefresh();
    } catch (err) { setError(describeMesaError(err)); }
    finally { setSendingDraft(false); }
  };

  // "Mesa 6 (4 pax)" -- no "Ocupada", no second line, no cubiertos wording.
  // Unknown covers -> just "Mesa 6".
  const title = `Mesa ${table.number}${session.coversTotal != null ? ` (${session.coversTotal} pax)` : ""}`;

  // P1_D_TABLE_FIRST_01 -- centered focused table modal (phone shell only).
  // Reuses every handler/state above unchanged (Nueva comanda/Ver cuenta/
  // Cerrar mesa call the exact same functions the non-compact branch below
  // calls) -- only the presentation and the COMANDAS/RESERVAS summary
  // sections are new. Not a Modal (see the dedicated mesa-table-card-*
  // classes' own comment): a true centered card, sized to its own compact
  // content, dimming the map strongly behind it rather than anchoring a
  // bottom sheet that leaves most of the screen a meaningless dark void.
  //
  // MESA_NAV_CONSOLIDATION_01 -- Ver cuenta and Cerrar mesa used to mount as
  // a second, independent full-viewport overlay stacked on top of this same
  // card (VerCuentaModal / CerrarMesaDialog, each their own .mesa-overlay).
  // They now render in-place, inside this one card, swapped in by
  // workspaceView above -- one workspace, one modal layer, ever. The outer
  // "×" always closes the whole workspace (onClose, unchanged); the head's
  // back control only returns to "detail". Card dimensions, section styling
  // and every handler are untouched below -- composition only.
  if (compactCard) {
    // Same pure per-comanda product-count CommandCard already computes,
    // just summed across every comanda on this table -- not new money/
    // quantity logic, an aggregate of an already-used computation. Money
    // itself comes from session.total (the same authoritative figure
    // VerCuentaModal's own "Total" stat shows), never re-derived here.
    const totalArticles = (session.commands || []).reduce((sum, command) =>
      sum + (command.items || []).reduce((s, item) => s + (Number(item.q) || 1), 0), 0);
    const comandasSummary = hasOrders
      ? `Pedido en curso · ${totalArticles} artículo${totalArticles === 1 ? "" : "s"} · ${euro(session.total)}`
      : "Todavía no hay comandas.";
    const reservasSummary = nextReservation
      ? `${nextReservation.guestName} · ${reservationTimeLabel(nextReservation)}${todayReservations.length > 1 ? ` · +${todayReservations.length - 1} más` : ""}`
      : "Sin reserva para esta mesa.";
    return <div className="mesa-table-card-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mesa-table-card">
        <div className="mesa-table-card-head">
          {workspaceView === "detail"
            ? <div style={{ fontWeight: 950, fontSize: 20 }}>{title}</div>
            : <button type="button" className="mesa-card-back" data-testid="mesa-card-back" onClick={backToDetail} aria-label={`Volver a ${title}`}>
                <span aria-hidden="true">←</span> {title}
              </button>}
          <button className="mesa-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="mesa-table-card-body">
          {workspaceView === "detail" && <>
            {/* Tap toggles the detailed (existing, unmodified CommandCard)
                list -- never dumped open by default, per the brief's own
                "the operator only needs a compact summary" instruction. */}
            <div className={`mesa-card-section ${hasOrders ? "active" : "muted"}`} data-testid="mesa-card-comandas" onClick={() => setComandasExpanded((value) => !value)}>
              <div className="mesa-card-section-label">
                <i className="mesa-dot" style={{ width: 6, height: 6, background: hasOrders ? "#d7a84b" : "#5a5348" }} />
                Comandas
              </div>
              <div className="mesa-card-section-summary">{comandasSummary}</div>
              {hasOrders && comandasExpanded && <div className="mesa-commands-scroll" style={{ marginTop: 10 }} onClick={(event) => event.stopPropagation()}>
                {session.commands.map((command) => <CommandCard key={command.id} command={command}
                  action={command.state === "LISTO" ? <button className="mesa-btn green" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => markServed(command.id)}>✓ Servida</button> : null} />)}
              </div>}
            </div>

            {/* Tap opens the real, existing ReservationAgenda filtered to
                this table (onViewNight, unconditionally -- the non-compact
                branch below only exposes this once there are 2+ bookings;
                here it's the section's own always-available tap target,
                whether there are 0, 1 or several). Same data, same
                mesaApi, no parallel reservation store. */}
            <div className={`mesa-card-section ${nextReservation ? "active" : "muted"}`} data-testid="mesa-card-reservas" onClick={() => { if (canManageReservations) onViewNight(); }}>
              <div className="mesa-card-section-label">
                <i className="mesa-dot" style={{ width: 6, height: 6, background: nextReservation ? STATUS.reserved.color : "#5a5348" }} />
                Reservas
              </div>
              <div className="mesa-card-section-summary">{reservasSummary}</div>
            </div>

            {draft && <div className="mesa-section" data-testid="mesa-draft-panel">
              <button type="button" data-testid="mesa-draft-toggle" onClick={() => setDraftExpanded((value) => !value)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
                border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left",
              }}>
                <h3 style={{ margin: 0 }}>Comanda por confirmar</h3>
                <span className="mesa-muted" style={{ marginLeft: "auto" }}>{draftItemCount} artículo{draftItemCount === 1 ? "" : "s"} · {euro(draftTotal)}</span>
                <span style={{ color: "#a99d89", transform: draftExpanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>⌄</span>
              </button>
              {draftExpanded && <div className="mesa-command-card" style={{ marginTop: 8 }}>
                <DraftItemsList items={draft.items} />
                {draft.nota && <div className="mesa-command-note">Nota general: {draft.nota}</div>}
                <div style={{ marginTop: 8, textAlign: "right", fontWeight: 900 }}>{euro(draftTotal)}</div>
              </div>}
              <div className="mesa-actions">
                <button className="mesa-btn" disabled={sendingDraft} onClick={() => onNewCommand(table)}>Modificar</button>
                <button className="mesa-btn green" disabled={sendingDraft} onClick={sendToCocina}>{sendingDraft ? "Enviando…" : "Enviar a cocina"}</button>
              </div>
            </div>}

            {/* Same three actions, same handlers, same conditions as the
                non-compact branch -- only grouped under the new sections
                instead of a plain Modal. Nueva comanda strongest (primary),
                Ver cuenta clearly visible (gold), Cerrar mesa lower emphasis
                (plain) -- P0-B.1 semantics untouched either way. */}
            <div className="mesa-actions" style={{ marginTop: 16 }}>
              {!draft && <button className="mesa-btn primary" onClick={() => onNewCommand(table)}>＋ Nueva comanda</button>}
              {/* MESA_PHONE_VISUAL_PARITY_V2 -- gold only once there is a
                  real account to review (hasOrders, the exact same signal
                  the COMANDAS section above already uses); otherwise the
                  plain neutral .mesa-btn look Cerrar mesa already uses, so
                  the button never reads as "something needs your attention"
                  when the table has nothing billed yet. Still fully
                  tappable either way -- VerCuentaModal itself handles the
                  zero-total state, this only changes the visual weight. */}
              <button className={`mesa-btn${hasOrders ? " gold" : ""}`} onClick={() => setShowAccount(true)}>Ver cuenta</button>
              {!draft && <button className="mesa-btn" disabled={busy} onClick={openCloseConfirm}>Cerrar mesa</button>}
            </div>
            {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
          </>}
          {workspaceView === "account" && <div data-testid="mesa-card-view-account"><VerCuentaBody table={table} onRefresh={onRefresh} onPrint={onPrint} /></div>}
          {workspaceView === "close-confirm" && <CerrarMesaConfirm tableNumber={table.number} empty={session.coversTotal == null} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
        </div>
      </div>
    </div>;
  }

  return <>
    <Modal title={title} onClose={onClose} size={hasOrders || draft ? "tall" : undefined}>
      <div className="mesa-section" style={{ marginTop: 0 }}>
        <h3>Comandas</h3>
        {!hasOrders ? <div className="mesa-muted">Todavía no hay comandas.</div> : <div className="mesa-commands-scroll">
          {session.commands.map((command) => <CommandCard key={command.id} command={command}
            action={command.state === "LISTO" ? <button className="mesa-btn green" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => markServed(command.id)}>✓ Servida</button> : null} />)}
        </div>}
      </div>
      {/* Comanda por confirmar -- the local draft MesaOrderBuilder handed
          back via "Confirmar comanda". Open by default (unlike sent
          comandas): this IS the last check with the client before it
          reaches Cocina. Only "Enviar a cocina" here calls the backend. */}
      {draft && <div className="mesa-section" data-testid="mesa-draft-panel">
        <button type="button" data-testid="mesa-draft-toggle" onClick={() => setDraftExpanded((value) => !value)} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
          border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left",
        }}>
          <h3 style={{ margin: 0 }}>Comanda por confirmar</h3>
          <span className="mesa-muted" style={{ marginLeft: "auto" }}>{draftItemCount} artículo{draftItemCount === 1 ? "" : "s"} · {euro(draftTotal)}</span>
          <span style={{ color: "#a99d89", transform: draftExpanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>⌄</span>
        </button>
        {draftExpanded && <div className="mesa-command-card" style={{ marginTop: 8 }}>
          <DraftItemsList items={draft.items} />
          {draft.nota && <div className="mesa-command-note">Nota general: {draft.nota}</div>}
          <div style={{ marginTop: 8, textAlign: "right", fontWeight: 900 }}>{euro(draftTotal)}</div>
        </div>}
        <div className="mesa-actions">
          <button className="mesa-btn" disabled={sendingDraft} onClick={() => onNewCommand(table)}>Modificar</button>
          <button className="mesa-btn green" disabled={sendingDraft} onClick={sendToCocina}>{sendingDraft ? "Enviando…" : "Enviar a cocina"}</button>
        </div>
      </div>}
      <div className="mesa-actions">
        {!draft && <button className="mesa-btn primary" onClick={() => onNewCommand(table)}>＋ Nueva comanda</button>}
        {/* MESA_PHONE_VISUAL_PARITY_V2 -- same false-positive-gold fix as the
            compactCard branch above, applied here too since it is a shared
            visual-correctness rule (real state, not "the button merely
            exists"), not a phone-only concern. */}
        <button className={`mesa-btn${hasOrders ? " gold" : ""}`} onClick={() => setShowAccount(true)}>Ver cuenta</button>
        {!draft && <button className="mesa-btn" disabled={busy} onClick={openCloseConfirm}>Cerrar mesa</button>}
      </div>
      {nextReservation && <div className="mesa-section">
        <button type="button" onClick={() => setReservationOpen((value) => !value)}
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }}>
          <i className="mesa-dot" style={{ background: STATUS.reserved.color, flexShrink: 0 }} />
          <strong style={{ flex: 1 }}>Próxima reserva</strong>
          <span className="mesa-chip">Reservada</span>
          <span style={{ color: "#a99d89", transform: reservationOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
        </button>
        {reservationOpen && <div style={{ marginTop: 10 }}>
          <ReservationItem reservation={nextReservation} table={table} onEdit={onEditReservation} onChanged={onChanged} onOpened={onOpened} />
        </div>}
        {todayReservations.length > 1 && canManageReservations && <button className="mesa-btn small" style={{ marginTop: 9 }} onClick={onViewNight}>Ver reservas de la noche ({todayReservations.length})</button>}
      </div>}
      {error && !confirmingClose && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
    </Modal>
    {showAccount && <VerCuentaModal table={table} onClose={() => setShowAccount(false)} onRefresh={onRefresh} onPrint={onPrint} />}
    {confirmingClose && <CerrarMesaDialog tableNumber={table.number} empty={session.coversTotal == null} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
  </>;
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

// MESA_PHONE_VISUAL_PARITY_V2 -- compact, entirely-clickable agenda row (tap
// -> Modificar / mover); the floor popup's own ReservationItem stays the
// full-detail-plus-actions card, used only there where a single reservation
// is already in focus. `conflict` (booked reservation on a table someone
// else is already occupying) is a real, derived fact -- table.status is the
// same authoritative field the floor tiles' own fill color reads, not a
// fabricated UI state -- so this can never disagree with what Mapa/Lista show.
function ReservationAgendaRow({ table, reservation, onEdit }) {
  const conflict = table.status === "open";
  return <button type="button" className={`mesa-row mesa-reservation-row${conflict ? " conflict" : ""}`}
    style={{ width: "100%", textAlign: "left", font: "inherit", color: "inherit" }}
    onClick={() => onEdit(reservation)}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <div className="mesa-reservation-time">{reservationTimeLabel(reservation)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Mesa {table.number}</div>
        <div className="mesa-muted" style={{ fontSize: 12, marginTop: 1 }}>{reservation.guestName} · {reservation.coversTotal} persona{reservation.coversTotal === 1 ? "" : "s"}</div>
      </div>
    </div>
    <span className="mesa-chip" style={conflict
      ? { borderColor: "#EF4444", color: "#ff9c90", background: "rgba(239,68,68,.16)", whiteSpace: "nowrap", flexShrink: 0 }
      : { borderColor: "#22C55E", color: "#22C55E", background: "rgba(34,197,94,.14)", whiteSpace: "nowrap", flexShrink: 0 }}>
      {conflict ? "Conflicto · Ocupada" : "Confirmada"}
    </span>
  </button>;
}

// Reservas: search by name/phone and an optional per-table filter (used by
// the "Ver reservas de la noche" shortcut from a table's own popup). Full
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
  const todayLabel = new Intl.DateTimeFormat("es-ES", { timeZone: MADRID_TIMEZONE, weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  return <Modal title="Reservas" subtitle="Reservas activas de hoy" onClose={onClose} width={760} size="tall">
    <div className="mesa-muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: .3, textTransform: "uppercase", marginBottom: 12 }}>{todayLabel}</div>
    <div className="mesa-form-grid" style={{ marginBottom: 14 }}>
      <div><label className="mesa-label">Buscar por nombre o teléfono</label><input className="mesa-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Antonio o 600…" /></div>
      <div><label className="mesa-label">Mesa</label><select className="mesa-input" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}><option value="">Todas las mesas</option>{tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.number}</option>)}</select></div>
    </div>
    {/* MESA_PHONE_VISUAL_PARITY_V2 -- agenda-first: the actual list of
        tonight's reservations is the primary content on screen; "+ Nueva
        reserva" is a prominent CTA AFTER it, never leading the screen the
        way a big empty form would (see the brief's own "do not lead with a
        large empty form when reservations exist" instruction). Same
        handler/classes as before -- only its position in the tree moved. */}
    {rows.length === 0 ? <div className="mesa-muted">No hay reservas que coincidan.</div> : <div>
      {rows.map(({ table, reservation }) => <ReservationAgendaRow key={reservation.id} table={table} reservation={reservation} onEdit={onEdit} />)}
    </div>}
    <div className="mesa-actions" style={{ marginTop: 16 }}>
      <button className="mesa-btn gold" onClick={onNew} style={{ flex: 1, padding: "14px 16px", fontSize: 15 }}>＋ Nueva reserva</button>
    </div>
  </Modal>;
}

// The contextual popup for every tap that isn't an instant walk-in-open and
// isn't an occupied table (occupied -> MesaWorkspace directly, see the click
// handler in the main component below): free-with-a-tonight-reservation,
// reserved, and Personalizar sala editing. An occupied table only ever
// reaches this popup while editing (Ajustes/Eliminar) -- MesaWorkspace is the
// one and only place a comanda list or "Nueva comanda" renders, so this
// component carries neither, even in that edit-mode case.
// "Ver reserva" has no separate click: the reservation's full detail is
// always shown right here.
function TableContextPopup({
  table, canEdit, editing, canManageReservations,
  onClose, onOpenTable,
  onNewReservation, onEditReservation, onViewNight,
  onChanged, onOpened, onSettings,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Collapsed by default -- the reservation is background information here,
  // not the reason the popup opened. "Crear pedido" is always the first
  // thing a waiter sees; the reservation card only expands on request.
  const [reservationOpen, setReservationOpen] = useState(false);
  const todayReservations = bookedForToday(table);
  const nextReservation = todayReservations[0];
  // This popup only ever sees an occupied table while editing (Ajustes/
  // Eliminar) -- the click handler below routes a non-editing occupied tap
  // straight to MesaWorkspace. isOccupied is still needed to gate "Eliminar
  // mesa" (a table with an open account can't be deleted from the floor).
  const isOccupied = table.status === "open";

  const remove = async () => {
    if (isOccupied) { setError("Cobra la cuenta antes de eliminar esta mesa."); return; }
    if (!window.confirm(`¿Eliminar Mesa ${table.number} del plano? El historial se conservará.`)) return;
    setBusy(true); setError("");
    try {
      await mesaApi.saveTable(table.id, { tableNumber: table.number, displayName: `Mesa ${table.number}`, capacity: table.capacity, positionX: table.x, positionY: table.y, shape: table.shape, shapePreset: table.shapePreset, active: false });
      await onChanged(); onClose();
    } catch (err) { setError(describeMesaError(err)); setBusy(false); }
  };

  const subtitle = isOccupied ? "Ocupada" : nextReservation ? "Reservada" : "Libre";

  return <Modal title={`Mesa ${table.number}`} subtitle={subtitle} onClose={busy ? undefined : onClose} width={640}>
    <div className="mesa-menu-grid">
      {/* Strict separation: order/account actions only outside Personalizar
          sala, layout actions only inside it -- never both in the same
          grid. An occupied table never reaches this grid at all outside
          editing (see the click handler in the main component below) --
          MesaWorkspace is the only "take/see this table's order" surface.
          Labelled "Crear pedido" (not "Abrir mesa") on purpose -- to a
          waiter this button IS "start taking the order for this table";
          that it also opens the table's session first is an implementation
          detail, not a separate step they should have to think about. */}
      {!editing && !isOccupied && !nextReservation && <button className="mesa-btn mesa-menu-action primary" onClick={onOpenTable}><strong>＋ Crear pedido</strong><span>Un cliente se sienta ahora, sin consumir una reserva</span></button>}
      {!editing && !isOccupied && nextReservation && <button className="mesa-btn mesa-menu-action primary" onClick={onOpenTable}><strong>＋ Crear pedido</strong><span>La reserva futura seguirá activa.</span></button>}
      {canEdit && editing && <button className="mesa-btn mesa-menu-action gold" onClick={onSettings}><strong>Ajustes de mesa</strong><span>Número, capacidad y forma</span></button>}
      {canEdit && editing && <button className="mesa-btn mesa-menu-action red" disabled={busy} onClick={remove}><strong>Eliminar mesa</strong><span>Conserva todo el historial</span></button>}
    </div>
    {editing && <div className="mesa-banner" style={{ marginTop: 16 }}>Saliendo de Personalizar sala podrás tomar pedidos o cobrar esta mesa.</div>}

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
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 10 }}>{error}</div>}
  </Modal>;
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
export default function TabMesa({
  role, notify, onNewCommand, onCountChange, refreshKey = 0, compact = false,
  // Narrower than `compact`: hides only the Sala principal selector + Libre/
  // Reservada/Ocupada legend (dead weight once there's a single sala and the
  // three fill colors are already self-evident on the map), without also
  // pulling in `compact`'s height:100%/flex-column CSS -- that assumes a
  // parent that already promises a real flex height (the waiter-shell
  // embedding `compact` was built for), which this app's current ServicioPage
  // tab body does not, per the CSS's own comment on .mesa-root.compact.
  hideToolbar = false,
  // MESA_PHONE_SHELL_01 -- MesaPhoneShell's own Más screen is now the entry
  // point for Reservas/Personalizar sala on phone, so its Mapa view hides
  // this dock's normal (not-editing) row entirely, to match the approved
  // mockup's clean map with no button row of its own. Only the entry row:
  // once editing is actually active, "Añadir mesa"/"Salir de Personalizar
  // sala" stay visible regardless -- those are the map's own in-context
  // controls for a mode already in progress, not a Más entry point, and
  // there would be no other way to leave editing mode from the map itself.
  hideDock = false,
  mesaDrafts = {}, onClearDraft, onSendToCocina,
  // MESA_PHONE_SHELL_01 -- one-shot deep link for a caller that mounts this
  // component fresh (MesaPhoneShell's Mapa/Lista/Más screens) and needs it to
  // land already on a specific table/mode, exactly as if the operator had
  // tapped it themselves. `token` must change (e.g. Date.now()) to fire again
  // for the same type/tableId -- a stale object reference is intentionally a
  // no-op, not a repeat action.
  initialAction = null,
}) {
  const canEdit = canEditMesaRoom(role);
  const canManageReservations = canManageMesaReservations(role);
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
  // FREE_TABLE_OPEN_LATENCY_01 -- per-table (not global) pending state, purely
  // visual: the dead-simple ref-based dedupe below already prevents a second
  // request for the SAME table; this state exists only so that one specific
  // table's tile can show immediate tap feedback (dimmed, cursor:wait) while
  // its own open() round-trip is in flight, without touching any other table.
  const [openingIds, setOpeningIds] = useState(() => new Set());
  const boardRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(null);
  const openingWalkInRef = useRef(new Set());
  // MESA_HYBRID_3D -- the scene needs the board's real pixel box to build a
  // room from it. Measured on mount and on resize only, never per drag frame:
  // the drag path must not acquire a second layout read.
  const [boardBox, setBoardBox] = useState(null);

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
  // MESA_HYBRID_3D -- keep boardBox in step with the board's real size. Runs
  // only when the flag is on, so the default renderer gains no observer at
  // all. `loading` is a dependency because the board element does not exist
  // during the loading banner, so the observer has to re-attach once it does.
  useEffect(() => {
    if (!MESA_HYBRID_3D) return undefined;
    const node = boardRef.current;
    if (!node) return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBoardBox((prev) => (prev && prev.width === rect.width && prev.height === rect.height)
        ? prev : { width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  const selected = tables.find((table) => table.id === selectedId && table.active) || null;
  const menuTable = tables.find((table) => table.id === menuId && table.active) || null;
  const settingsTable = tables.find((table) => table.id === settingsId && table.active) || null;
  const activeTables = tables.filter((table) => table.active);
  const openEditor = (reservation = null, tableId = null) => {
    setMenuId(null); setShowReservations(false);
    setReservationEditor({ reservation, tableId: reservation?.tableId || tableId || activeTables[0]?.id || null });
  };
  // FREE_TABLE_OPEN_LATENCY_01 -- quiet on purpose: this used to be a bare
  // load(), which flips the component's GLOBAL `loading` flag and replaces
  // the entire mesa-board (every table button, for every table, not just
  // the one just opened) with a "Cargando el plano de mesas..." banner for
  // the ~400-500ms the floor refetch takes. During that window the whole
  // map was unmounted -- a second tap on ANY other table (e.g. closing this
  // one and opening a different free table right after) landed on nothing
  // and was silently lost, sometimes for 3-4 attempts in a row. `tables`
  // state still gets the same fresh floor data either way; quiet only skips
  // the blocking full-screen replacement, so the map -- and every other
  // table's own tap target -- stays live and interactive throughout.
  const opened = async (tableId) => {
    await load({ quiet: true });
    setMenuId(null); setShowReservations(false); setReservationEditor(null);
    setSelectedId(tableId);
  };
  // Single tap, no confirmation, no covers question -- covers are asked later,
  // atomically with the first comanda. Guarded against a double tap on the same
  // table firing two opens; a genuinely concurrent open from another device is
  // still safely rejected by the backend's own table-account-open guard.
  //
  // FREE_TABLE_OPEN_LATENCY_01 -- does NOT go through opened() (which awaits a
  // full quiet floor reload before showing the workspace): openTable's own
  // response is already authoritative for everything the workspace needs to
  // render (sessionId, coversTotal), and a table it just created cannot yet
  // have any commands/payments/total -- that's not an optimistic guess, it's
  // what "freshly opened" means per the backend's own contract (covers are
  // always NULL at open time; see mesaService.open()'s own comment). So the
  // workspace opens straight off that one response -- no second round trip
  // gates it -- while the floor's fuller shape (position/shape/reservations,
  // nothing the workspace itself needs) reconciles in the background, fired
  // but not awaited, so it can never block or re-delay the tap.
  const openWalkIn = async (table) => {
    if (openingWalkInRef.current.has(table.id)) return;
    openingWalkInRef.current.add(table.id);
    setOpeningIds((prev) => new Set(prev).add(table.id));
    try {
      const result = await mesaApi.openTable(table.id);
      setTables((current) => current.map((t) => t.id === table.id ? {
        ...t,
        status: "open",
        session: {
          id: result.sessionId, coversTotal: result.coversTotal ?? null,
          coversRemaining: 0, total: 0, paid: 0, outstanding: 0, nextEqualShare: 0,
          paymentTotals: {}, commands: [], lines: [], payments: [],
        },
      } : t));
      setMenuId(null); setShowReservations(false); setReservationEditor(null);
      setSelectedId(table.id);
      load({ quiet: true });
    } catch (err) {
      notify?.(`❌ ${describeMesaError(err)}`, C.rosso);
      await load({ quiet: true });
    } finally {
      openingWalkInRef.current.delete(table.id);
      setOpeningIds((prev) => { const next = new Set(prev); next.delete(table.id); return next; });
    }
  };
  // Covers (when the table's first comanda hasn't set them yet) are now asked
  // inside MesaOrderBuilder itself, not here -- this just opens it; the caller
  // (ServicioPage) reads table.session.coversTotal to decide which step the
  // builder opens on.
  const startNewCommand = (table) => onNewCommand(table);

  // MESA_PHONE_SHELL_01 -- applies `initialAction` exactly once per token.
  // "selectTable" replays the SAME branch a real tap on that table's own
  // button runs (free+unreserved -> open walk-in; open -> straight to the
  // workspace; anything else -> the quick menu) rather than a shortcut of
  // its own, so a table opened from Lista behaves identically to tapping it
  // on the map. Waits for `tables` to be populated (the floor's own load()
  // may still be in flight on a fresh mount) before resolving "selectTable".
  const appliedActionTokenRef = useRef(null);
  useEffect(() => {
    if (!initialAction || initialAction.token === appliedActionTokenRef.current) return;
    if (initialAction.type === "reservations") {
      appliedActionTokenRef.current = initialAction.token;
      setMenuId(null);
      // P1_D_TABLE_FIRST_01 -- this same action type now has two callers:
      // the bottom nav's global Reservas (no tableId -> explicit null,
      // never leaking a stale filter from a previous table-scoped open) and
      // the table modal's own RESERVAS section (tableId set -> same
      // filtered-agenda behavior "Ver reservas de la noche" already used).
      setReservationsFilterTableId(initialAction.tableId ?? null);
      setShowReservations(true);
      return;
    }
    if (initialAction.type === "editing") {
      appliedActionTokenRef.current = initialAction.token;
      setEditing(true);
      return;
    }
    if (initialAction.type === "selectTable") {
      const table = tables.find((t) => t.id === initialAction.tableId && t.active);
      if (!table) return; // tables still loading -- retry once they arrive
      appliedActionTokenRef.current = initialAction.token;
      const todayReservations = bookedForToday(table);
      if (!editing && table.status === "free" && todayReservations.length === 0) { openWalkIn(table); return; }
      if (!editing && table.status === "open") { setSelectedId(table.id); return; }
      setMenuId(table.id);
    }
  }, [initialAction, tables, editing]);

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
  // MESA_HYBRID_3D -- the camera frames where the tables ACTUALLY are (see
  // hybridScene's cameraFrame), which is what keeps the room from spending a
  // third of a phone screen on floor nobody put a table on.
  //
  // It is FROZEN for the whole of a drag. Without the freeze, dragging the
  // front-most table forward would widen the frame on every pointermove, the
  // camera would recompose under the finger, and every OTHER table would drift
  // sideways-and-up while the operator is trying to place one -- the table
  // would also lag its own finger, since the geometry that positions it keeps
  // changing beneath it. Freezing costs one ref and makes the drag behave
  // exactly as it did before framing existed.
  const frameFreezeRef = useRef(null);
  const [frameEpoch, setFrameEpoch] = useState(0);
  const hybridGeom = useMemo(
    () => ((MESA_HYBRID_3D && boardBox && boardBox.width > 0)
      ? sceneGeometry(boardBox.width, boardBox.height, HYBRID_TOKENS,
        frameFreezeRef.current || cameraFrame(tables))
      : null),
    // frameEpoch is the release signal from pointerUp; frameFreezeRef itself
    // is deliberately not a dependency (a ref never can be).
    [boardBox, tables, frameEpoch]
  );
  const pointerDown = (event, table) => {
    if (!editing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Captured BEFORE the first pointermove can move a table, so the frame
    // held for the rest of the gesture is the one the operator is looking at.
    frameFreezeRef.current = cameraFrame(tables);
    const drag = {
      id: table.id, pointerId: event.pointerId, moved: false, table,
      startX: event.clientX, startY: event.clientY,
    };
    // Record where inside the table the finger actually landed, so the table
    // follows the finger instead of snapping its centre under it on the first
    // move. Measured against the drawn TOP FACE, which is what the operator
    // sees and grabs -- the projection anchor is the floor point below it.
    if (hybridGeom && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const g = tableGeometry(table, hybridGeom);
      drag.grabDX = (event.clientX - rect.left) - g.topX;
      drag.grabDY = (event.clientY - rect.top) - g.topY;
    }
    dragRef.current = drag;
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
    // MESA_HYBRID_3D -- the pointer moves in SCREEN space but what gets stored
    // is always the logical floor coordinate, so a projected drag has to run
    // the inverse projection here. Saving projected pixels would silently
    // corrupt every saved position the moment the room geometry changed.
    // The clamps below are identical in both paths: they are logical-space
    // guards, and they must keep agreeing with resolveTablePositions'.
    let rawX;
    let rawY;
    if (hybridGeom) {
      const g = tableGeometry(drag.table, hybridGeom);
      const topX = (event.clientX - rect.left) - (drag.grabDX || 0);
      const topY = (event.clientY - rect.top) - (drag.grabDY || 0);
      const logical = unprojectScreenPoint(topX, topY + g.lift, hybridGeom);
      rawX = logical.x;
      rawY = logical.y;
    } else {
      rawX = ((event.clientX - rect.left) / rect.width) * 100;
      rawY = ((event.clientY - rect.top) / rect.height) * 100;
    }
    const x = Math.max(halfWidthPct, Math.min(100 - halfWidthPct, rawX));
    const y = Math.max(11, Math.min(89, rawY));
    dragRef.current = { ...drag, moved: true, table: { ...drag.table, x, y } };
    setTables((current) => current.map((table) => table.id === drag.id ? { ...table, x, y } : table));
  };
  const pointerUp = async (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // Release the camera and let it recompose around wherever the table ended
    // up. setFrameEpoch is what actually re-runs the geometry memo: clearing a
    // ref alone changes nothing React can see, so without it the room would
    // stay on the frozen frame until some unrelated state happened to change.
    frameFreezeRef.current = null;
    setFrameEpoch((n) => n + 1);
    if (drag.moved) {
      suppressClickRef.current = drag.id;
      window.setTimeout(() => { if (suppressClickRef.current === drag.id) suppressClickRef.current = null; }, 250);
      await savePosition(drag.table);
    }
  };
  // MESA_HYBRID_3D -- the descriptor the scene draws from. It calls the exact
  // same pure selectors the tile below uses (bookedForToday / tableState /
  // tableBorder / hasReadyOrder); it introduces no second source of truth and
  // no parallel state machine. The scene can only ever draw what the domain
  // already decided.
  const hybridVisualOf = (table) => {
    const todayReservations = bookedForToday(table);
    const state = tableState(table, todayReservations);
    const hasOrders = table.status === "open" && (table.session?.commands?.length || 0) > 0;
    return {
      id: table.id, x: table.x, y: table.y, number: table.number,
      shape: table.shape, capacity: table.capacity,
      // face tint follows OCCUPANCY; the rim follows the comanda signal --
      // the same two independent signals the default renderer already carries
      // in --tb and --tc, kept separate here for the same reason.
      stateKey: state === STATUS.occupied ? "occupied" : state === STATUS.reserved ? "reserved" : "free",
      rimColor: tableBorder(state, hasOrders).color,
      ready: !editing && hasReadyOrder(table),
      selected: table.id === menuId || table.id === selectedId,
      opening: openingIds.has(table.id),
    };
  };

  if (loading) return <div className="mesa-root"><style>{css}{MESA_HYBRID_3D ? hybridSceneCss : ""}</style><div className="mesa-banner">Cargando el plano de mesas…</div></div>;
  if (error && tables.length === 0) return <div className="mesa-root"><style>{css}{MESA_HYBRID_3D ? hybridSceneCss : ""}</style><div className="mesa-banner mesa-error">{error}</div><button className="mesa-btn" style={{ marginTop: 10 }} onClick={() => load()}>Reintentar</button></div>;

  return <div className={`mesa-root${compact ? " compact" : ""}`}><style>{css}{MESA_HYBRID_3D ? hybridSceneCss : ""}</style>
    {!compact && !hideToolbar && <div className="mesa-toolbar">
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
    <div className={`mesa-board${editing ? " editing" : ""}${hybridGeom ? " hybrid" : ""}`} ref={boardRef} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {/* MESA_HYBRID_3D -- the scene paints the room and the table bodies and
          is aria-hidden + pointer-events:none throughout. The tiles below stay
          the only controls and the only accessible nodes, which is what keeps
          a chair from ever becoming its own tap target. */}
      {/* The scene is handed the SAME geometry object the hit targets and the
          drag inverse projection use. It used to rebuild its own from
          width/height, which was safe only while the geometry depended on
          nothing but the box -- now that the camera also depends on where the
          tables are, a second copy could frame the room differently from the
          targets laid over it, and a tap would land on the wrong Mesa. */}
      {hybridGeom && <HybridFloorScene geom={hybridGeom}
        visuals={resolveTablePositions(activeTables).map(hybridVisualOf)} />}
      {resolveTablePositions(activeTables).map((table) => {
        const todayReservations = bookedForToday(table);
        const nextReservation = todayReservations[0];
        const state = tableState(table, todayReservations);
        const dragging = dragRef.current?.id === table.id;
        const hasOrders = table.status === "open" && (table.session?.commands?.length || 0) > 0;
        const border = tableBorder(state, hasOrders);
        // MESA_MAP_LOCAL_SPOTLIGHT -- the local floor spotlight (--tg, see
        // .mesa-table::before) is occupancy-only, deliberately NOT the same
        // signal as --tc/border.color: a free-but-reserved table's border is
        // amber (STATUS.reserved), and reusing that for the spotlight would
        // make every reservation glow gold on the floor -- explicitly the
        // "status overload" the brief warns against. The spotlight only
        // ever asks "is someone sitting here right now", same binary the
        // fill color's occupied-vs-not distinction already makes.
        const glowColor = state === STATUS.occupied ? STATUS.occupied.color : STATUS.free.color;
        // Ready-pulse is an OPERATIONAL signal ("a dish is waiting") and
        // Personalizar sala is an EDITING context ("I'm moving/resizing
        // tables") -- the two must never compete for attention on the same
        // tile, so the pulse (and its glow) is simply not applied while
        // editing. Fill color still tells tables apart; see .mesa-table.
        // is-editing for the neutral border that replaces the operational
        // red/green one during editing.
        const ready = !editing && hasReadyOrder(table);
        const selected = table.id === menuId || table.id === selectedId;
        // MESA_PHONE_VISUAL_PARITY_V2 -- the floor tile itself only ever
        // shows a small icon badge (a fact, at a glance) -- not the
        // reservation's clock time, which would read as a second number
        // competing with the table number for attention. Full reservation
        // detail (name, time, covers, phone) lives one tap away, inside the
        // popup. Reservation and occupancy are independent facts (see
        // isRelevantReservation/tableState): the badge shows whenever a
        // relevant reservation exists tonight, regardless of fill color: it
        // never replaces the occupied-red fill, only adds to it (.conflict).
        const reservationBadge = nextReservation ? { conflict: state === STATUS.occupied } : null;
        // FREE_TABLE_OPEN_LATENCY_01 -- per-table pending feedback, see
        // openingIds' own comment: immediate, scoped to this one tile only.
        const opening = openingIds.has(table.id);
        const classes = [
          "mesa-table", variantIdOf(table.shape, table.shapePreset),
          editing ? "is-editing" : "", dragging ? "is-dragging" : "",
          border.thick ? "thick" : "", ready ? "ready-pulse" : "", selected ? "selected" : "",
          opening ? "opening" : "", hybridGeom ? "hybrid" : "",
        ].filter(Boolean).join(" ");
        // MESA_HYBRID_3D -- the tile stops drawing itself and becomes a
        // transparent control laid exactly over what the scene drew. Its box
        // is the table PLUS its chairs (tableFootprint), so a tap on a chair
        // belonging to this Mesa opens this Mesa -- but not the light pool,
        // which is atmosphere, not a control. Same element, same handlers,
        // same class vocabulary: only its geometry source changes.
        const foot = hybridGeom ? tableFootprint(table, hybridGeom) : null;
        const geo = hybridGeom ? tableGeometry(table, hybridGeom) : null;
        const tileStyle = foot
          ? { left: foot.left, top: foot.top, width: foot.width, height: foot.height,
              "--tc": border.color, "--tb": state.bg, "--tg": glowColor }
          : { left: `${table.x}%`, top: `${table.y}%`, "--tc": border.color, "--tb": state.bg, "--tg": glowColor };
        return <button key={table.id} className={classes} style={tileStyle} onPointerDown={(event) => pointerDown(event, table)} onClick={() => {
          if (suppressClickRef.current === table.id) { suppressClickRef.current = null; return; }
          if (!editing && table.status === "free" && todayReservations.length === 0) { openWalkIn(table); return; }
          // An occupied table (outside Personalizar sala) goes straight to
          // MesaWorkspace -- the one operative surface for that table, no
          // intermediate quick-menu hop. Free-with-reservation and editing
          // still go through the popup (see TableContextPopup).
          if (!editing && table.status === "open") { setSelectedId(table.id); return; }
          setMenuId(table.id);
        }}>
          {reservationBadge && <span className={`mesa-badge mesa-badge-reserved${reservationBadge.conflict ? " conflict" : ""}`}
            style={foot ? { left: (geo.topX + geo.halfW * 0.58) - foot.left, top: (geo.topY - geo.halfH * 0.92) - foot.top, right: "auto" } : undefined}
            title={reservationBadge.conflict ? "Reserva en conflicto: mesa ya ocupada" : "Mesa reservada"} aria-label={reservationBadge.conflict ? "Reserva en conflicto" : "Reservada"}>🔖</span>}
          {foot
            // Labels stay DOM, not SVG: they keep the app's own typography,
            // stay screen-space (never foreshortened) and keep the exact
            // .mesa-number / .mesa-capacity contract the rest of the app and
            // the test suite already rely on. The person glyph is dropped
            // here only because the chairs now carry capacity spatially.
            ? <span className="mesa-hybrid-label" style={{ top: geo.topY - foot.top }}>
                <strong className="mesa-number" style={{ fontSize: Math.round(geo.R * 0.8) }}>{table.number}</strong>
                <span className="mesa-capacity" style={{ fontSize: Math.max(9, Math.round(geo.R * 0.235)) }}>máx {table.capacity ?? "—"}</span>
              </span>
            : <>
                <strong className="mesa-number">{table.number}</strong>
                <span className="mesa-capacity">👥 máx {table.capacity ?? "—"}</span>
              </>}
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
    {!(hideDock && !editing) && <div className="mesa-dock">
      {!editing && canManageReservations && <button className="mesa-btn primary" onClick={() => { setReservationsFilterTableId(null); setShowReservations(true); }}>📅 Reservas · Beta</button>}
      {canEdit && editing && <button className="mesa-btn gold" onClick={() => setShowAdd(true)}>＋ Añadir mesa</button>}
      {canEdit && <button className={`mesa-btn ${editing ? "primary" : ""}`} onClick={() => setEditing((value) => { const next = !value; if (!next) { setSettingsId(null); setShowAdd(false); setMenuId(null); } return next; })}>{editing ? "✓ Salir de Personalizar sala" : "🛠 Personalizar sala"}</button>}
      <button className="mesa-btn icon" title="Actualizar el plano" aria-label="Actualizar el plano" onClick={() => load()}>↻</button>
    </div>}
    {menuTable && <TableContextPopup
      table={menuTable} canEdit={canEdit} editing={editing} canManageReservations={canManageReservations}
      onClose={() => setMenuId(null)}
      onOpenTable={() => { setMenuId(null); openWalkIn(menuTable); }}
      onNewReservation={() => openEditor(null, menuTable.id)}
      onEditReservation={(reservation) => openEditor(reservation, menuTable.id)}
      onViewNight={() => { setMenuId(null); setReservationsFilterTableId(menuTable.id); setShowReservations(true); }}
      onChanged={() => load({ quiet: true })}
      onOpened={opened}
      onSettings={() => { setMenuId(null); setSettingsId(menuTable.id); }}
    />}
    {/* MESA_NAV_CONSOLIDATION_01 -- key={selected.id}: switching straight
        from one open table to another (without an intermediate close, e.g.
        tapping a second table's row while this one's workspace is already
        mounted) must fully remount MesaWorkspace, not just re-render it
        with new props. Without a key, React reuses the same instance across
        tables and its local state (error, busy, showAccount,
        confirmingClose, draftExpanded, comandasExpanded, ...) leaks from
        the old table into the new one -- table.id is the same stable,
        backend-issued identifier already used as the key for every table
        button on the floor above, never an array index. */}
    {selected?.status === "open" && <MesaWorkspace key={selected.id} table={selected} onClose={() => setSelectedId(null)} onNewCommand={startNewCommand} onRefresh={() => load({ quiet: true })} onPrint={setPrintDocument}
      canManageReservations={canManageReservations}
      onEditReservation={(reservation) => openEditor(reservation, selected.id)}
      onViewNight={() => { setSelectedId(null); setReservationsFilterTableId(selected.id); setShowReservations(true); }}
      onChanged={() => load({ quiet: true })}
      onOpened={opened}
      notify={notify}
      draft={mesaDrafts[selected.session.id] || null}
      onClearDraft={onClearDraft}
      onSendToCocina={onSendToCocina}
      compactCard={compact}
    />}
    {settingsTable && <TableSettingsModal table={settingsTable} onClose={() => setSettingsId(null)} onSaved={() => load()} />}
    {showAdd && <AddTableModal tables={tables} onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    {showReservations && <ReservationAgenda tables={activeTables} initialTableId={reservationsFilterTableId} onClose={() => { setShowReservations(false); setReservationsFilterTableId(null); }} onNew={() => openEditor(null, reservationsFilterTableId)} onEdit={(reservation) => openEditor(reservation)} onChanged={() => load({ quiet: true })} onOpened={opened} />}
    {reservationEditor && <ReservationModal tables={activeTables} initialTableId={reservationEditor.tableId} reservation={reservationEditor.reservation} onClose={() => setReservationEditor(null)} onSaved={() => load()} />}
    {printDocument && <PrintPreview document={printDocument} onClose={() => setPrintDocument(null)} />}
  </div>;
}

export { equalShares, hasReadyOrder, css as mesaCss, resolveTablePositions, isRelevantReservation, responsiveTableSize, previewResponsiveTablePx, BOARD_WIDTH_REFERENCE, TABLE_MIN_SCALE, STATUS, tableState, bookedForToday, canEditMesaRoom, canManageMesaReservations };
