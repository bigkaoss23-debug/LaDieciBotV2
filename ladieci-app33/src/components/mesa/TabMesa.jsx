import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../constants";
import { createMesaRequestId, describeMesaError, mesaApi, MESA_DUPLICATE_PAYMENT_CODE } from "../../mesa/mesaApi";
import { normalizeOrderLine } from "../../menu/normalizeOrderLine";
import OrderLineView from "../order/OrderLineView";
import HybridFloorScene, { hybridSceneCss } from "./HybridFloorScene";
import { groupTicketLines, selectionTotals, selectableCount, personShares, amountForPersons } from "./paymentHubTicket";
import {
  ROOM_Y_MIN, ROOM_Y_MAX, sceneGeometry, tableFootprint, tableGeometry, unprojectScreenPoint,
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
// SMOKE FIX — the states that make "Cerrar mesa" fail. This is a PRESENTATION
// mirror of the backend rule (MESA_TABLE_HAS_ACTIVE_ORDERS), not a new
// contract: the RPC remains the authority and still refuses on its own. It
// exists so the UI stops offering an action that cannot succeed. Fail-safe by
// construction: if this list is ever too narrow the button is merely enabled
// and the backend refuses exactly as it does today.
const CLOSE_BLOCKING_STATES = new Set(["EN_COCINA", "LISTO"]);
export function commandsBlockingClose(session) {
  return (session?.commands || []).filter((command) => CLOSE_BLOCKING_STATES.has(command?.state));
}

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

// formatClockTime(value) -- ACC-01's Ultimas Cuentas modal (below) needs a
// bare "HH:MM" for a session/payment timestamp that may legitimately be
// absent (a just-opened session has no closedAt yet). It reuses the SAME
// Madrid-timezone convention as reservationTimeLabel just above, so a closed
// account reads in the identical clock the rest of Mesa already uses --
// nothing new is invented here.
//
// madridFields itself is NOT null-safe for this purpose: its default param
// turns undefined into "now", and it happily converts null into the Unix
// epoch (both would print a plausible-looking wrong time instead of an
// honest blank), and it throws on an unparsable string. All three cases are
// guarded here explicitly rather than trusted to fall through.
function formatClockTime(value) {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return madridFields(date).time;
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
// occupied -> red with NO comanda sent yet, amber once at least one comanda has
// been confirmed and sent to Cocina. Both stay inside the occupied colour
// family and are thick, so an order's existence is legible without the table
// ever reading as free.
//
// UAT-P2-A -- "comanda sent" used to be drawn in #22C55E, which is byte-for-byte
// STATUS.free.color. On the Hybrid 3D floor the occupied fill is only .22 alpha,
// so the border is what the eye actually reads: a busy table with food in the
// kitchen was rendered with the free-table green and was indistinguishable from
// an empty one at a glance (proven live 2026-08-20, Mesa 3 and Mesa 6 both with
// comandas En cocina looked identical to the free Mesa 2/4/5). Amber is already
// this app's "active work" accent (Cocina badge), keeps FREE / OCCUPIED /
// RESERVED mutually distinct, and needs no layout or density change.
const OCCUPIED_BORDER_IDLE = "#EF4444";   // seated, nothing ordered yet
const OCCUPIED_BORDER_ACTIVE = "#F97316"; // seated, comanda(s) in the kitchen
function tableBorder(state, hasOrders) {
  if (state !== STATUS.occupied) return { color: state.color, thick: false };
  return { color: hasOrders ? OCCUPIED_BORDER_ACTIVE : OCCUPIED_BORDER_IDLE, thick: true };
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
/* Capacity picker. Chips sized for a thumb (44px minimum touch target) and
   laid out on a fluid grid so five options fit a 375px phone without wrapping
   awkwardly, while the "Otra" field keeps every value 1..99 reachable. */
.mesa-capacity-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.mesa-capacity-btn{min-height:46px;border:1.5px solid rgba(208,184,145,.25);border-radius:12px;
  background:rgba(255,255,255,.04);color:#e7dcc7;font-size:17px;font-weight:900;cursor:pointer;
  display:flex;align-items:center;justify-content:center}
.mesa-capacity-btn.active{border-color:#C4A87A;background:rgba(196,168,122,.18);color:#F0D9A8}
.mesa-capacity-custom{display:flex;align-items:center;gap:10px;margin-top:9px}
.mesa-capacity-custom .mesa-label{margin:0;flex-shrink:0}
.mesa-capacity-custom .mesa-input{flex:1;min-width:0}
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
/* ── PAYMENT HUB MESA V1 ────────────────────────────────────────────────
   The approved Ver cuenta surface: ticket, three actions, one drawer, one
   secondary print. Everything is scoped under .mesa-hub so no other Mesa
   modal can inherit it. */
.mesa-hub{display:block}
.mesa-hub-ticket{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);border-radius:16px;padding:14px 16px}
.mesa-hub-ticket-title{margin:0 0 10px;color:#d9c8aa;font-size:13px;font-weight:900;letter-spacing:.4px;text-transform:none}
.mesa-hub-lines{border-top:1px dashed rgba(255,255,255,.14);padding-top:4px}
.mesa-hub-line{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px}
.mesa-hub-line:last-child{border-bottom:0}
.mesa-hub-qty{color:#d7a84b;font-weight:900;min-width:16px;text-align:left;flex:0 0 auto}
.mesa-hub-desc{flex:1 1 auto;min-width:0;color:#f4ecdd;overflow-wrap:anywhere}
.mesa-hub-amount{flex:0 0 auto;font-weight:800;color:#f4ecdd}
.mesa-hub-empty{color:#978d7c;font-size:13px;padding:10px 0}
/* V1.1 — the ticket doubles as the product picker while Por productos is on. */
/* break-word, not anywhere: a product name must wrap between words, never
   mid-word ("Margherit / a Classica" on a bill a guest is reading). */
.mesa-hub-desc{display:flex;flex-direction:column;gap:1px;flex:1 1 auto;min-width:0;overflow-wrap:break-word}
.mesa-hub-name{color:#f4ecdd}
.mesa-hub-alias{color:#978d7c;font-size:11.5px}
.mesa-hub-line.paid .mesa-hub-name,.mesa-hub-line.paid .mesa-hub-amount{color:#8d8474}
.mesa-hub-paid-tag{flex:0 0 auto;border:1px solid rgba(101,217,149,.34);color:#65d995;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800;letter-spacing:.3px}
.mesa-hub-pickhint{color:#d7a84b;font-size:11.5px;margin:-4px 0 8px}
/* Selection state line for a row being picked in Por productos. Sits under
   the row, indented to read as part of it, and only appears once at least
   one unit of that row is selected -- the row itself carries the "tap to
   add a unit" interaction, this line carries the one clear way back down.
   MOBILE UX HARDENING -- replaces the old always-visible +/- stepper pair:
   tapping the whole row now IS the increment, so there is exactly one
   control left here (minus), never two competing ways to reach the same
   count. */
.mesa-hub-qty-step{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 6px 9px 37px;border-bottom:1px solid rgba(255,255,255,.06)}
.mesa-hub-qty-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:0 0 auto;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.04);color:#d7a84b;cursor:pointer;padding:0}
.mesa-hub-qty-btn:hover{background:rgba(215,168,75,.14);border-color:rgba(215,168,75,.4)}
.mesa-hub-qty-count{color:#d7a84b;font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.mesa-hub-pending-tag{flex:0 0 auto;color:#a99d89;font-size:10.5px;font-weight:800}
.mesa-hub-ticket.picking{border-color:rgba(215,168,75,.34)}
/* The whole row is the tap target -- no separate checkbox or +/- pair
   competing with it (MOBILE UX HARDENING). min-height keeps it a real touch
   target on the phone; the phone media query below grows it further. */
.mesa-hub-line.selectable{width:100%;-webkit-appearance:none;appearance:none;font:inherit;text-align:left;background:none;border:0;border-bottom:1px solid rgba(255,255,255,.06);border-radius:10px;cursor:pointer;padding:9px 6px;min-height:46px}
.mesa-hub-line.selectable:hover:not(:disabled){background:rgba(255,255,255,.04)}
.mesa-hub-line.selectable:disabled{cursor:not-allowed}
.mesa-hub-line.selectable.selected{background:rgba(215,168,75,.12);border-bottom-color:rgba(215,168,75,.3)}
/* The three ways to pay a part of the bill. */
.mesa-hub-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.mesa-hub-mode{padding:10px 6px;border:1px solid rgba(255,255,255,.10);border-radius:11px;background:rgba(255,255,255,.03);color:#efe6d5;font:inherit;font-size:12.5px;font-weight:820;cursor:pointer;line-height:1.2}
.mesa-hub-mode:hover:not(:disabled){background:rgba(255,255,255,.07)}
.mesa-hub-mode:disabled{opacity:.35;cursor:not-allowed}
.mesa-hub-mode.active{border-color:#d7a84b;background:rgba(215,168,75,.13);color:#f8ecd2}
.mesa-hub-selected{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px;padding:11px 12px;border-radius:11px;background:rgba(255,255,255,.04);color:#cfc4b0;font-size:13px}
.mesa-hub-selected strong{color:#f8ecd2;font-size:20px;font-weight:950}
.mesa-hub-persons{display:flex;flex-wrap:wrap;gap:8px}
.mesa-hub-person{min-width:52px;min-height:48px;flex:1 1 52px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.035);color:#efe6d5;font:inherit;font-size:16px;font-weight:900;cursor:pointer}
.mesa-hub-person:hover{background:rgba(255,255,255,.07)}
.mesa-hub-person.active{border-color:#d7a84b;background:rgba(215,168,75,.15);color:#f8ecd2}
.mesa-hub-totals{border-top:1px dashed rgba(255,255,255,.14);margin-top:8px;padding-top:10px}
.mesa-hub-total-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:4px 0;font-size:14px;color:#e6dcc9}
.mesa-hub-total-row strong{font-weight:800}
.mesa-hub-total-row.outstanding{margin-top:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,.10);color:#d7a84b;font-size:17px}
.mesa-hub-total-row.outstanding strong{color:#d7a84b;font-size:22px;font-weight:950}
/* Exactly three, always the same three, always equal width. */
.mesa-hub-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0 0}
.mesa-hub-action{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:78px;padding:12px 6px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.03);color:#efe6d5;font:inherit;font-size:13px;font-weight:850;cursor:pointer;text-align:center;line-height:1.2}
.mesa-hub-action:hover:not(:disabled){background:rgba(255,255,255,.07)}
.mesa-hub-action:disabled{opacity:.38;cursor:not-allowed}
.mesa-hub-action.active{border-color:#d7a84b;background:rgba(215,168,75,.10);color:#f8ecd2}
.mesa-hub-icon{color:#d7a84b;flex:0 0 auto}
.mesa-hub-print .mesa-hub-icon{color:inherit}
/* One drawer, visually tethered to the row of actions above it. */
.mesa-hub-drawer{position:relative;margin-top:12px;border:1px solid rgba(215,168,75,.34);border-radius:16px;background:rgba(215,168,75,.045);padding:14px 14px 16px}
.mesa-hub-field{margin-bottom:14px}
.mesa-hub-field:last-child{margin-bottom:0}
.mesa-hub-field-label{color:#a99d89;font-size:12px;font-weight:800;margin-bottom:8px}
.mesa-hub-bigamount{font-size:28px;font-weight:950;color:#f8ecd2}
.mesa-hub-choices{display:grid;gap:10px;margin-bottom:14px}
@media(min-width:520px){.mesa-hub-choices{grid-template-columns:1fr 1fr}}
.mesa-hub-choice{display:flex;align-items:center;gap:11px;width:100%;padding:13px 13px;border:1px solid rgba(255,255,255,.10);border-radius:13px;background:rgba(255,255,255,.035);color:#efe6d5;font:inherit;cursor:pointer;text-align:left;min-height:56px}
.mesa-hub-choice:hover:not(:disabled){background:rgba(255,255,255,.07)}
.mesa-hub-choice:disabled{opacity:.38;cursor:not-allowed}

.mesa-hub-choice-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.mesa-hub-choice-text strong{font-size:14px;font-weight:880}
.mesa-hub-choice-text small{color:#978d7c;font-size:11.5px}
.mesa-hub-choice-chevron{flex:0 0 auto;color:#978d7c;font-size:19px}
/* The shared .mesa-methods collapses to one column under 620px. The approved
   hub keeps all three side by side on the phone, icon over label. Scoped to
   the drawer and higher-specificity, so any other consumer of .mesa-methods
   keeps the stacked phone layout it has always had. */
.mesa-hub-drawer .mesa-methods{grid-template-columns:repeat(3,1fr)}
.mesa-hub-drawer .mesa-method{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:70px;padding:11px 5px;font-size:12.5px;line-height:1.2;text-align:center}
.mesa-hub-drawer .mesa-method-icon{font-size:19px;line-height:1}
.mesa-hub-confirm{width:100%;min-height:48px;font-size:15px}
.mesa-hub-back{margin-bottom:14px}
.mesa-hub-soon{display:flex;flex-direction:column;gap:5px}
.mesa-hub-soon strong{color:#d7a84b;font-size:13px}
.mesa-hub-soon span{color:#978d7c;font-size:12.5px;line-height:1.5}
/* DUP-01 — a question, styled as one. Gold (the hub's own accent) rather than
   the .mesa-error red, because "Registrar igualmente" is a normal, correct
   operator action and must not read as forcing past a fault. */
.mesa-hub-dup{margin-top:12px;border:1px solid rgba(215,168,75,.55);border-radius:16px;background:rgba(215,168,75,.10);padding:14px}
.mesa-hub-dup-title{display:block;color:#f8ecd2;font-size:15px;font-weight:900}
.mesa-hub-dup-amount{margin-top:6px;color:#d7a84b;font-size:26px;font-weight:950;line-height:1.1}
.mesa-hub-dup-text{margin:8px 0 14px;color:#e6dcc9;font-size:13.5px;line-height:1.5}
/* Stacked on the phone so neither action is a thumb-width target; side by side
   only once there is genuinely room for both. */
.mesa-hub-dup-actions{display:grid;grid-template-columns:1fr;gap:10px}
@media(min-width:420px){.mesa-hub-dup-actions{grid-template-columns:1fr 1fr}}
.mesa-hub-dup-btn{min-height:48px;font-size:15px}
/* Secondary, and it reads as secondary. */
.mesa-hub-print{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:12px;min-height:50px;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.025);color:#cfc4b0;font:inherit;font-size:14px;font-weight:800;cursor:pointer}
.mesa-hub-print:hover{background:rgba(255,255,255,.06);color:#efe6d5}
.mesa-card-back-text{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;line-height:1.2}
.mesa-card-back-text small{font-size:11.5px;font-weight:700}
.mesa-actions{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}.mesa-section{margin-top:18px}.mesa-section h3{margin:0 0 9px;color:#d9c8aa;font-size:12px;text-transform:uppercase;letter-spacing:.8px}
.mesa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.065);padding:9px 2px;font-size:13px}.mesa-account-history-item{width:100%;background:none;border:0;border-bottom:1px solid rgba(255,255,255,.065);color:inherit;font:inherit;cursor:pointer;text-align:left;min-height:44px}.mesa-account-history-item:hover{background:rgba(255,255,255,.045)}.mesa-row:last-child{border-bottom:0}.mesa-muted{color:#978d7c}.mesa-chip{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.13);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;color:#ddd2bf}
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
.mesa-command-card{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.02)}
.mesa-command-card+.mesa-command-card{margin-top:8px}
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
.mesa-print-layer{display:none}.mesa-print-sheet{width:58mm;margin:0 auto;color:#000;background:#fff;font:12px/1.35 'DM Mono',monospace}.mesa-print-sheet h1,.mesa-print-sheet h2,.mesa-print-sheet p{margin:0}.mesa-print-sheet .sep{border-top:1px dashed #000;margin:8px 0}.mesa-print-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.mesa-print-row span:first-child{min-width:0;overflow-wrap:anywhere}.mesa-print-total{font-size:18px;font-weight:900;text-align:right;margin:8px 0}.mesa-print-summary{margin:4px 0}.mesa-print-summary .mesa-print-row{font-size:11px}.mesa-print-credit strong{font-weight:700}.mesa-print-accrued strong{font-weight:700}.mesa-print-center{text-align:center}.mesa-print-small{font-size:10px}
@media(max-width:620px){.mesa-board{min-height:440px}.mesa-summary{grid-template-columns:1fr 1fr}.mesa-form-grid,.mesa-menu-grid{grid-template-columns:1fr}.mesa-methods{grid-template-columns:1fr}.mesa-modal-body{padding:15px}.mesa-modal-head{padding:14px 15px}}
/* Phone: every modal in this component becomes a near-full-screen bottom
   sheet instead of a small floating card with dead space on all sides --
   anchored to the bottom edge, full width, rounded top corners only,
   safe-area-aware so the home-indicator area on notched iPhones never
   covers the last row of actions. */
@media(max-width:480px){
  .mesa-overlay:not(.compact){align-items:flex-end;padding:0}
  .mesa-modal:not(.compact){width:100%;max-width:100%;max-height:94vh;border-radius:20px 20px 0 0;border-left:none;border-right:none;border-bottom:none}
  /* The only sheets that force real height: ones with actual comanda
     content to show (size="tall" on Modal, see MesaWorkspace). Free/
     reserved/no-order sheets stay their natural shrink-to-content height --
     short on purpose, not padded out to match. 70-85vh range as specified;
     80vh split the difference. */
  .mesa-modal.tall{min-height:min(80vh,94vh)}
  .mesa-modal-body{padding-bottom:calc(22px + env(safe-area-inset-bottom,0px))}
  /* compact (e.g. LineDetailSheet): stays a small centered card, own tighter
     padding so it doesn't inherit the big-drawer safe-area bottom padding
     meant for a sheet actually anchored to the device edge. */
  .mesa-modal.compact .mesa-modal-body{padding-bottom:15px}
}
@media print{body *{visibility:hidden!important}.mesa-print-layer,.mesa-print-layer *{visibility:visible!important}.mesa-print-layer{display:block!important;position:absolute;left:0;top:0;width:100%;background:#fff}.mesa-print-sheet{display:block!important} @page{size:58mm auto;margin:3mm}}
/* ── MESA WORKSPACE UI V2 — the approved table-workspace layout (current
   order, prior settled order, upcoming booking, actions). Same premium
   dark/gold family as the Payment Hub above (.mesa-hub-*), reused where the
   visual language is identical (paid-line muting, qty/desc/amount layout)
   and only extended where the mockup's own card needs something the hub
   didn't: an always-open, gold-bordered "current" card instead of a
   collapsed section. NOTE: this comment is literal <style> textContent at
   runtime (it lives inside the css template string) -- MesaPhoneShell's own
   "Más screen stays scoped" tests assert on the ABSENCE of specific nav
   labels in the whole container's textContent, so this block deliberately
   never spells any of them, same convention as the reservation-agenda-row
   comment further up in this same stylesheet. ── */
.mesa-current-card{border:1px solid rgba(215,168,75,.4);border-radius:16px;padding:14px 15px 15px;background:rgba(215,168,75,.055)}
/* Secondary: a real card, but not the live surface. */
.mesa-current-card.is-muted{border-color:rgba(255,255,255,.10);background:rgba(255,255,255,.025)}
.mesa-current-card.is-muted .mesa-current-eyebrow{color:rgba(255,255,255,.42)}
/* The unsent draft, while it exists, IS the live surface. */
.mesa-draft-card{margin-bottom:14px;border-color:rgba(215,168,75,.55);box-shadow:0 0 22px rgba(215,168,75,.10)}
.mesa-current-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mesa-current-head-toggle{width:100%;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.mesa-current-eyebrow{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#e9c983}
.mesa-current-count{border-color:rgba(215,168,75,.4);background:rgba(215,168,75,.14);color:#f3d9a4}
.mesa-current-chevron{color:#a99d89;transition:transform .15s;flex-shrink:0}
.mesa-current-collapsed{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:#c9bd9f;font-size:12.5px;font-weight:700}
.mesa-current-status{display:flex;align-items:center;gap:7px;margin-top:8px;color:#c9bd9f;font-size:12.5px}
.mesa-current-status .mesa-hub-icon{color:#a99d89}
.mesa-current-items{border-top:1px dashed rgba(215,168,75,.28);margin-top:11px;padding-top:2px}
.mesa-current-item{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px;width:100%;background:none;border-left:0;border-right:0;border-top:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.mesa-current-item:last-child{border-bottom:0}
.mesa-current-item:hover{background:rgba(255,255,255,.04)}
.mesa-current-qty{flex:0 0 auto;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(215,168,75,.16);border:1px solid rgba(215,168,75,.4);color:#f3d9a4;font-size:12px;font-weight:900}
.mesa-current-desc{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;overflow-wrap:break-word}
.mesa-current-name{color:#f4ecdd;font-weight:700}
.mesa-current-alias{color:#978d7c;font-size:11.5px}
.mesa-current-amount{flex:0 0 auto;font-weight:800;color:#f4ecdd}
.mesa-current-more{display:block;width:100%;text-align:center;margin-top:8px;padding:8px;background:none;border:0;border-top:1px solid rgba(255,255,255,.07);color:#d7a84b;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.mesa-current-more:hover{color:#f3d9a4}
.mesa-current-add{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;margin-top:10px;padding:9px;background:rgba(215,168,75,.09);border:1px dashed rgba(215,168,75,.4);border-radius:10px;color:#e9c983;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.mesa-current-add:hover{background:rgba(215,168,75,.16)}
.mesa-current-total{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:11px;padding-top:11px;border-top:1px solid rgba(215,168,75,.3);font-size:12px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:#e9c983}
.mesa-current-total strong{color:#f3d9a4;font-size:22px;font-weight:950;letter-spacing:0;text-transform:none}
.mesa-current-actions{display:flex;flex-direction:column;gap:9px;margin:15px 0 0}
.mesa-current-cta-primary{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:54px;font-size:16px}
.mesa-current-cta-row{display:flex;gap:9px}
.mesa-current-cta-row .mesa-btn{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;font-size:14.5px}
.mesa-resumen-list{margin-top:10px;border-top:1px dashed rgba(255,255,255,.09);padding-top:2px}
.mesa-resumen-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13.5px}
.mesa-resumen-row:last-child{border-bottom:0}
.mesa-resumen-number{flex:0 0 auto;color:#c9bd9f;font-weight:800}
.mesa-resumen-state{flex:1 1 auto;color:#a99d89;font-weight:700}
.mesa-resumen-state.paid{color:#65d995}
.mesa-resumen-amount{flex:0 0 auto;color:#f4ecdd;font-weight:800}
@media(max-width:480px){.mesa-current-card{padding:13px 13px 14px}}
/* MOBILE UX HARDENING -- the minus is the one remaining manual control once
   the row itself carries the +1 tap, so on the phone it gets a full 44px
   touch target instead of the tablet's already-comfortable 34px. */
@media(max-width:480px){.mesa-hub-qty-btn{width:44px;height:44px}}
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
// MESA V2.1.1 -- `compact` opts a modal OUT of the phone bottom-sheet
// treatment below (@media(max-width:480px) .mesa-overlay/.mesa-modal), so a
// small popup (e.g. LineDetailSheet) stays a genuinely centered card at every
// viewport instead of stretching into a near-full-screen sheet anchored to
// the bottom edge -- the right presentation for "big drawer with real
// content" (Ver cuenta, Cerrar mesa) is the wrong one for "a few read-only
// facts about one product".
function Modal({ title, subtitle, onClose, children, width = 760, size, compact = false }) {
  return <div className={`mesa-overlay${compact ? " compact" : ""}`} role="dialog" aria-modal="true">
    <div className={`mesa-modal${size === "tall" ? " tall" : ""}${compact ? " compact" : ""}`} style={{ width: `min(${width}px, 100%)` }}>
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

function CerrarMesaDialog({ tableNumber, empty, blocked = 0, busy, error, onCancel, onConfirm }) {
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
        <p id="cerrar-mesa-body" className="mesa-muted" data-testid="cerrar-mesa-body">
          {blocked > 0
            ? "Faltan comandas por servir."
            : empty ? "La mesa está vacía y no tiene comandas ni pagos." : "La mesa quedará libre para nuevos clientes."}
        </p>
        {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="mesa-actions" style={{ marginTop: 16 }}>
          <button ref={cancelRef} className="mesa-btn" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button ref={confirmRef} className="mesa-btn danger" data-testid="cerrar-mesa-confirm" disabled={busy || blocked > 0} onClick={onConfirm}>{busy ? "Cerrando…" : "Cerrar mesa"}</button>
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
function CerrarMesaConfirm({ tableNumber, empty, blocked = 0, busy, error, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  useCerrarMesaFocusTrap({ cancelRef, confirmRef, busy, onCancel });

  return <div role="alertdialog" aria-labelledby="cerrar-mesa-title-inline" aria-describedby="cerrar-mesa-body-inline" data-testid="mesa-card-view-close-confirm">
    <div id="cerrar-mesa-title-inline" style={{ fontWeight: 950, fontSize: 19 }}>{`Cerrar Mesa ${tableNumber}`}</div>
    <p id="cerrar-mesa-body-inline" className="mesa-muted" style={{ marginTop: 8 }} data-testid="cerrar-mesa-body">
      {blocked > 0
        ? "Faltan comandas por servir."
        : empty ? "La mesa está vacía y no tiene comandas ni pagos." : "La mesa quedará libre para nuevos clientes."}
    </p>
    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
    <div className="mesa-actions" style={{ marginTop: 16 }}>
      <button ref={cancelRef} className="mesa-btn" disabled={busy} onClick={onCancel}>Cancelar</button>
      <button ref={confirmRef} className="mesa-btn danger" data-testid="cerrar-mesa-confirm" disabled={busy || blocked > 0} onClick={onConfirm}>{busy ? "Cerrando…" : "Cerrar mesa"}</button>
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

// ═══ MESA WORKSPACE UI V2.1 — real command boundaries ═══
// V2 (previous slice) split COMANDA ACTUAL / RESUMEN by a LINE-level signal
// (paidInFull), grouping every unpaid line of the whole sitting into one
// card regardless of which real comanda sent it -- three separate kitchen
// tickets (#1/#2/#3) rendered fused into a single "Comanda actual" the
// instant none of them were paid yet. That was wrong: a comanda sent to
// Cocina is a real, identifiable unit and must stay one.
//
// THE FIX IS PURELY A PROJECTION FIX, NOT A NEW MODEL. Every line already
// carries `orderId` (table_order_lines.order_id, see mesaService.js's
// normalizeLinesBySession) and every command already carries its own `id`,
// `commandNumber`, `state`, `time` and server-authoritative `total`
// (order.totale, see projectSessionAccount) -- session.commands arrives
// ordered oldest-to-newest (orders queried `order=ts.asc` in mesaDao.js), so
// the LAST entry is always the most recently sent real comanda. Grouping
// `session.lines` by `orderId` before calling groupTicketLines() (unchanged,
// still the Payment Hub's own function) is the entire fix.
//   COMANDA ACTUAL      -- the single most recent real comanda.
//   RESUMEN DE COMANDAS -- every OTHER real comanda, each with its own real
//                          state (kitchen state, or "Pagada" only when every
//                          one of its lines is actually paidInFull -- never
//                          "cerrada" for a comanda that is merely not-newest).
//   RESERVAS            -- unchanged, see ReservasSection below (Fase 7).
// Money is still never re-derived: command.total is the same order.totale
// the backend already computed: it is read, not summed from lines.
function ComandaActualCard({ session, draft, busy, onMarkServed, onAddItems, onSelectLine }) {
  const [expanded, setExpanded] = useState(true);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const commands = session?.commands || [];
  const current = commands.length > 0 ? commands[commands.length - 1] : null;
  const commandLines = current
    ? (session?.lines || []).filter((line) => String(line.orderId) === String(current.id))
    : [];
  const ticketRows = groupTicketLines(commandLines);
  const totalArticles = ticketRows.reduce((sum, row) => sum + row.quantity, 0);
  const statusLabel = current ? commandStateLabel(current.state) : null;

  const VISIBLE_ROWS = 4;
  const visibleRows = itemsExpanded ? ticketRows : ticketRows.slice(0, VISIBLE_ROWS);
  const hiddenCount = ticketRows.length - visibleRows.length;

  // SMOKE FIX — there is nothing to show and something else IS live. An empty
  // gold "Comanda actual" card next to a real 10-item draft told the operator
  // the wrong thing about which surface was active, so it is simply not drawn.
  if (!current && draft) return null;

  if (!current) {
    // Still nothing sent, and no draft either: an empty state is honest here,
    // but it is not an active surface and must not be dressed as one.
    return <section className="mesa-current-card is-muted" data-testid="mesa-current-card">
      <div className="mesa-current-head">
        <span className="mesa-current-eyebrow">
          <i className="mesa-dot" style={{ width: 6, height: 6, background: "rgba(255,255,255,.28)" }} />
          Comanda actual
        </span>
      </div>
      <div className="mesa-hub-empty" data-testid="mesa-current-empty">Todavía no hay comandas.</div>
    </section>;
  }

  // A sent comanda is real, but while a draft is pending it is history, not
  // the active surface: the draft above carries the highlight.
  return <section className={`mesa-current-card${draft ? " is-muted" : ""}`} data-testid="mesa-current-card">
    <button type="button" className="mesa-current-head mesa-current-head-toggle" data-testid="mesa-current-toggle"
      aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <span className="mesa-current-eyebrow">
        <i className="mesa-dot" style={{ width: 6, height: 6, background: "#d7a84b" }} />
        Comanda actual
      </span>
      <span className="mesa-chip mesa-current-count" data-testid="mesa-current-count">Comanda {current.commandNumber}</span>
      <span className="mesa-current-chevron" aria-hidden="true"
        style={{ transform: expanded ? "rotate(180deg)" : "none" }}>⌄</span>
    </button>

    {/* Accordion, collapsed: still informative -- number, real kitchen
        state, article count and total never disappear (Fase 2 spec). */}
    {!expanded && <div className="mesa-current-collapsed" data-testid="mesa-current-collapsed">
      <span>{current.time || "—"} · {statusLabel}</span>
      <span>{totalArticles} artículo{totalArticles === 1 ? "" : "s"} · {euro(current.total)}</span>
    </div>}

    {expanded && <>
      <div className="mesa-current-status">
        <HubIcon d={ICON_CLOCK} size={15} />
        <span>{current.time || "ahora"} · {statusLabel}</span>
        {current.state === "LISTO" && <button type="button" className="mesa-btn green small" style={{ marginLeft: "auto" }}
          disabled={busy} onClick={() => onMarkServed(current.id)}>✓ Servida</button>}
      </div>

      {ticketRows.length > 0 ? <>
        <div className="mesa-current-items" data-testid="mesa-current-items">
          {/* Tappable row, no pencil (Fase 5) -- opens a compact read-only
              detail sheet. Edit capability is a separate, audited decision
              (Fase 6); this only fixes "no pencil, but still interactive". */}
          {visibleRows.map((row) => <button type="button" className="mesa-current-item" key={row.key} data-testid="mesa-current-item"
            onClick={() => onSelectLine({ command: current, row })}>
            <span className="mesa-current-qty">{row.quantity}×</span>
            <span className="mesa-current-desc">
              <span className="mesa-current-name">{row.label.primary}</span>
              {row.label.secondary && <small className="mesa-current-alias">{row.label.secondary}</small>}
            </span>
            <strong className="mesa-current-amount">{euro(row.amount)}</strong>
          </button>)}
        </div>
        {hiddenCount > 0 && <button type="button" className="mesa-current-more" data-testid="mesa-current-expand"
          onClick={() => setItemsExpanded(true)}>Mostrar otros {hiddenCount} artículo{hiddenCount === 1 ? "" : "s"}</button>}
        {itemsExpanded && ticketRows.length > VISIBLE_ROWS && <button type="button" className="mesa-current-more"
          data-testid="mesa-current-collapse" onClick={() => setItemsExpanded(false)}>Mostrar menos</button>}
      </> : <div className="mesa-hub-empty" data-testid="mesa-current-empty">
        El detalle por producto todavía no está disponible.
      </div>}

      {/* Fase 3 -- same callback as the bottom "Nueva comanda", never a
          second implementation. Hidden while a draft exists: the draft
          panel below already offers its own "Modificar" entry point into
          the exact same picker. */}
      {!draft && <button type="button" className="mesa-current-add" data-testid="mesa-current-add" onClick={onAddItems}>
        <HubIcon d={ICON_PLUS_CIRCLE} size={15} />Añadir artículos
      </button>}

      <div className="mesa-current-total" data-testid="mesa-current-total">
        <span>Total comanda</span><strong>{euro(current.total)}</strong>
      </div>
    </>}
  </section>;
}

// Command-aware, not line-aware (Fase 4). Lists every OTHER real comanda of
// this sitting, most recent first, each with its own true state -- a
// comanda still EN_COCINA never reads as "cerrada" just because it isn't
// the newest one; "Pagada" is shown only when every one of ITS OWN lines is
// paidInFull (the same authoritative signal Payment Hub already treats as
// settled), never assumed from being non-current. Muted/collapsed when
// there is nothing else to show, same section language as Reservas below.
function ResumenComandasSection({ session }) {
  const [expanded, setExpanded] = useState(false);
  const commands = session?.commands || [];
  const others = commands.length > 1 ? commands.slice(0, -1) : [];
  const hasOthers = others.length > 0;

  const linesByOrder = new Map();
  for (const line of session?.lines || []) {
    const key = String(line.orderId);
    if (!linesByOrder.has(key)) linesByOrder.set(key, []);
    linesByOrder.get(key).push(line);
  }
  const rows = [...others].reverse().map((command) => {
    const lines = linesByOrder.get(String(command.id)) || [];
    const rowsForCommand = groupTicketLines(lines);
    const paidInFull = lines.length > 0 && rowsForCommand.every((row) => row.paidInFull);
    return { command, paidInFull };
  });
  const othersTotal = others.reduce((sum, command) => sum + (Number(command.total) || 0), 0);

  return <div className={`mesa-card-section ${hasOthers ? "active" : "muted"}`} data-testid="mesa-resumen-section"
    onClick={hasOthers ? () => setExpanded((value) => !value) : undefined} style={{ cursor: hasOthers ? "pointer" : "default" }}>
    <div className="mesa-card-section-label">
      <HubIcon d={ICON_RECEIPT} size={15} />
      Resumen de comandas
      {hasOthers && <span data-testid="mesa-resumen-chevron" style={{ marginLeft: "auto", color: "#a99d89", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>}
    </div>
    {hasOthers
      ? <div className="mesa-card-section-summary" data-testid="mesa-resumen-summary">
          {others.length} comanda{others.length === 1 ? "" : "s"} anterior{others.length === 1 ? "" : "es"} · {euro(othersTotal)}
        </div>
      : <div className="mesa-card-section-summary" data-testid="mesa-resumen-empty">Sin otras comandas en esta mesa.</div>}
    {hasOthers && expanded && <div className="mesa-resumen-list" data-testid="mesa-resumen-items"
      onClick={(event) => event.stopPropagation()}>
      {rows.map(({ command, paidInFull }) => <div className="mesa-resumen-row" key={command.id} data-testid="mesa-resumen-row">
        <span className="mesa-resumen-number">Comanda {command.commandNumber}</span>
        <span className={`mesa-resumen-state${paidInFull ? " paid" : ""}`} data-testid="mesa-resumen-state">
          {paidInFull ? "Pagada" : commandStateLabel(command.state)}
        </span>
        <strong className="mesa-resumen-amount">{euro(command.total)}</strong>
      </div>)}
    </div>}
  </div>;
}

// Fase 5 -- compact, read-only tap target for a product row (no pencil).
// Deliberately shows detail only, no edit actions: whether an already-sent
// comanda can be safely edited post-send is a separate, audited question
// (Fase 6) with its own STOP clause; this sheet exists independently of
// that answer so a row is never a dead tap.
function LineDetailSheet({ payload, onClose }) {
  const { command, row } = payload;
  return <Modal title={row.label.primary} subtitle={row.label.secondary || undefined} onClose={onClose} width={420} compact>
    <div data-testid="mesa-line-detail">
      <div className="mesa-row"><span>Comanda</span><strong>{command.commandNumber}</strong></div>
      <div className="mesa-row"><span>Estado Cocina</span><strong>{commandStateLabel(command.state)}</strong></div>
      <div className="mesa-row"><span>Cantidad</span><strong>{row.quantity}</strong></div>
      <div className="mesa-row"><span>Importe</span><strong>{euro(row.amount)}</strong></div>
      <div className="mesa-row"><span>Pago</span>
        <strong style={{ color: row.paidInFull ? "#65d995" : "#ffc65c" }}>{row.paidInFull ? "Pagado" : "Pendiente"}</strong>
      </div>
    </div>
  </Modal>;
}

// Same muted/active card language, same underlying data (bookedForToday) the
// floor tiles and every other Reservas surface in this file already share --
// see isRelevantReservation's own header comment. Tapping opens the real
// ReservationAgenda already filtered to this table (onViewNight), the exact
// same destination the compact phone card always used; no new reservation
// system, no new backend call.
function ReservasSection({ todayReservations, nextReservation, canManageReservations, onOpen }) {
  const summary = nextReservation
    ? `${nextReservation.guestName} · ${reservationTimeLabel(nextReservation)}${nextReservation.coversTotal != null ? ` · ${nextReservation.coversTotal} pax` : ""}${todayReservations.length > 1 ? ` · +${todayReservations.length - 1} más` : ""}`
    : "Sin reserva para esta mesa.";
  return <div className={`mesa-card-section ${nextReservation ? "active" : "muted"}`} data-testid="mesa-reservas-section"
    onClick={() => { if (canManageReservations) onOpen(); }} style={{ cursor: canManageReservations ? "pointer" : "default" }}>
    <div className="mesa-card-section-label">
      <HubIcon d={ICON_CALENDAR} size={15} />
      Reservas
    </div>
    <div className="mesa-card-section-summary">{summary}</div>
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

// TKT-01 (2026-08-21 forensic audit) -- CHARGES AND CREDITS ARE NOT THE SAME
// KIND OF ROW, and this renderer used to draw them as if they were.
//
// billDocument() appended the "Ya cobrado" credit into the very same `rows`
// array as the item charges, and every row went through one identical
// <span>label</span><strong>value</strong>. On the real 2026-08-20 Mesa 4 case
// -- 101.00 already settled, then a second comanda of 27.50 -- the printed bill
// read:
//
//     La Pulga            13,00 €
//     Il Tulipano Nero    14,50 €
//     Ya cobrado         101,00 €     <-- a CREDIT, drawn exactly like a charge
//     ------------------------------
//     PENDIENTE           27,50 €
//
// The rows scan as 128,50 € of charges above a total of 27,50 €. Nothing on the
// paper distinguishes money owed from money already taken.
//
// `rows` is now CHARGES ONLY. Reconciliation lines live in `summary`, are drawn
// in their own block below a separator, and a credit carries an explicit minus
// sign. The arithmetic is untouched -- the same session.total / session.paid /
// session.outstanding as before, only honestly labelled.
// TKT-01 — the customer bill, as a pure function of the session so its economic
// meaning is directly testable without a DOM.
//
// `rows` is CHARGES ONLY: the lines still owed. Anything already collected is a
// CREDIT and goes in `summary`, which PrintSheet draws in its own block with an
// explicit minus sign. When the table has paid something, the reconciliation
// states all three numbers, so the pending figure is arrived at rather than
// merely asserted:
//
//     Total consumido    128,50 €      (session.total)
//     Ya cobrado       − 101,00 €      (session.paid, credit)
//     PENDIENTE          27,50 €       (session.outstanding)
//
// Every number is the backend's own, unchanged — buildFloor already computes
// total/paid/outstanding from table_order_lines minus payment_allocations. This
// function only decides how they are laid out and labelled; it performs no
// arithmetic of its own beyond reading `paid > 0`.
export function buildBillDocument(session, tableNumber) {
  const lines = (session?.lines || []).filter((line) => Number(line.remaining) > 0);
  const hasPaid = Number(session?.paid) > 0;
  return {
    title: "CUENTA CLIENTE",
    tableNumber,
    rows: lines.map((line) => ({ label: line.description, value: euro(line.remaining) })),
    summary: hasPaid ? [
      { label: "Total consumido", value: euro(session.total) },
      { label: "Ya cobrado", value: euro(session.paid), credit: true },
    ] : [],
    totalLabel: "PENDIENTE",
    total: session?.outstanding,
    note: hasPaid ? "Arriba, solo lo que queda por pagar." : "Cuenta completa de la mesa.",
  };
}

function PrintSheet({ document, rows, summary, padding, boxShadow, keyPrefix }) {
  return (
    <div className="mesa-print-sheet" style={{ padding, ...(boxShadow ? { boxShadow } : {}) }}>
      <h1 className="mesa-print-center" style={{ fontSize: 20 }}>LA DIECI</h1>
      <p className="mesa-print-center" style={{ fontWeight: 900 }}>{document.title}</p>
      <p className="mesa-print-center">MESA {document.tableNumber}</p>
      <div className="sep" />
      {rows.map((row, index) => (
        <div className="mesa-print-row" key={`${keyPrefix}row-${row.label}-${index}`}>
          <span>{row.label}</span><strong>{row.value}</strong>
        </div>
      ))}
      {summary.length > 0 && <>
        <div className="sep" />
        <div className="mesa-print-summary">
          {summary.map((row, index) => (
            <div
              className={`mesa-print-row ${row.credit ? "mesa-print-credit" : "mesa-print-accrued"}`}
              key={`${keyPrefix}sum-${row.label}-${index}`}>
              <span>{row.label}</span>
              <strong>{row.credit ? `− ${row.value}` : row.value}</strong>
            </div>
          ))}
        </div>
      </>}
      <div className="sep" />
      {document.totalLabel && <div className="mesa-print-total">{document.totalLabel} {euro(document.total)}</div>}
      {document.note && <p className="mesa-print-center" style={{ marginTop: 8 }}>{document.note}</p>}
      <div className="sep" />
      <p className="mesa-print-center mesa-print-small">Documento no fiscal · {new Date().toLocaleString("es-ES")}</p>
    </div>
  );
}

function PrintPreview({ document, onClose }) {
  if (!document) return null;
  const rows = Array.isArray(document.rows) ? document.rows : [];
  const summary = Array.isArray(document.summary) ? document.summary : [];
  return <Modal title="Vista previa" subtitle="Ticket no fiscal · 58 mm" onClose={onClose} width={500}>
    <div style={{ background: "#e8e8e8", padding: 18, borderRadius: 14 }}>
      <PrintSheet document={document} rows={rows} summary={summary}
        padding="5mm" boxShadow="0 6px 26px rgba(0,0,0,.2)" keyPrefix="" />
    </div>
    <div className="mesa-actions" style={{ justifyContent: "flex-end" }}>
      <button className="mesa-btn" onClick={onClose}>Cerrar</button>
      <button className="mesa-btn gold" onClick={() => window.print()}>🖨 Imprimir</button>
    </div>
    <div className="mesa-print-layer">
      <PrintSheet document={document} rows={rows} summary={summary}
        padding="3mm" keyPrefix="print-" />
    </div>
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
// equal_split PAYMENT mode itself is untouched at the API/RPC level
// -- no backend or ledger change, only this entry point is gone.
//
// MESA_NAV_CONSOLIDATION_01 -- VerCuentaBody below holds every bit of this
// state/logic; VerCuentaModal is now a thin Modal wrapper around it (used by
// the non-compact path, unchanged). The compact card's in-place "account"
// view renders VerCuentaBody directly, no Modal wrapper, so there is no
// second overlay -- same totals, same actions, same mesaApi calls either way.
// Decorative only. Rendered as SVG, not glyphs, so a button's accessible
// name and textContent stay exactly its label -- "Cobrar todo", not
// "▭ Cobrar todo".
const HubIcon = ({ d, size = 20 }) => (
  <svg className="mesa-hub-icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);
const ICON_WALLET = <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M16 12h3" /></>;
const ICON_SPLIT = <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M12 5.5v13" /></>;
const ICON_TAG = <><path d="M20.6 12.6 12 21.2 2.8 12V2.8H12z" /><circle cx="7.6" cy="7.6" r="1.4" /></>;
const ICON_BASKET = <><path d="M3 8h18l-1.6 11.2H4.6z" /><path d="M8.5 8 12 3l3.5 5" /></>;
const ICON_PENCIL = <><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" /></>;
const ICON_PRINTER = <><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="7.5" rx="2" /><rect x="7" y="15" width="10" height="5.5" rx="1" /></>;
// MESA WORKSPACE UI V2 -- fine outline icons for the new table workspace,
// same HubIcon convention as the Payment Hub set above (stroke only,
// currentColor, no fills, no emoji).
const ICON_CLOCK = <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>;
const ICON_RECEIPT = <><path d="M6 3h12v17.5l-2.5-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 20.5z" /><path d="M9 8h6M9 12h6" /></>;
const ICON_CALENDAR = <><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" /><path d="M8 3v5M16 3v5M3.5 10.5h17" /></>;
const ICON_PLUS_CIRCLE = <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>;
const ICON_CLOSE_CIRCLE = <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>;
const ICON_MINUS = <><path d="M6 12h12" /></>;

function VerCuentaBody({ table, onRefresh, onPrint }) {
  // PAYMENT HUB MESA V1.1 — the approved V1 surface, with the redundant hops
  // taken out of it. Layout, colours, typography and the three primary actions
  // are unchanged; what changed is how few taps each one costs.
  //
  // Pago parcial now offers EXACTLY three ways, and no more:
  //   POR PRODUCTOS  the ticket above becomes the picker. There is no second
  //                  dialog listing the same products again — you tap the
  //                  lines you are charging, right where you are reading them.
  //   POR PERSONAS   splits the OUTSTANDING balance across the table's real
  //                  remaining covers. Nothing else: not the lifecycle, not
  //                  the kitchen, not the close, not the ticket items.
  //   IMPORTE LIBRE  a number and a method. It no longer asks how many people
  //                  it settles, because a free amount does not know.
  //
  // THE MONEY IS THE SERVER'S. Every charge is still one mesa_post_payment_v1
  // call in a mode Mesa already had. Por productos sends the REAL line ids and
  // the server sums those lines' own remaining; Por personas and Importe libre
  // send custom_amount. Nothing here computes what will be charged — it only
  // computes what the operator is shown before they confirm.
  //
  // COVERS ARE A PAYMENT DETAIL, NOT A HEADLINE. covers_settled exists only so
  // "por personas" can mean something; it is deliberately absent from the
  // summary (no "Personas 0/2"), and the two modes that cannot know how many
  // people they settle send 0 rather than silently consuming a share.
  const session = table.session;
  const [action, setAction] = useState(null);
  const [partialMode, setPartialMode] = useState(null);
  // SMOKE FIX — how many UNITS of each grouped row are selected, not merely
  // which rows. "4 × Heineken" is four real backend lines, so 1/4 is a real,
  // exactly-priced selection rather than an approximation.
  const [selectedKeys, setSelectedKeys] = useState(() => new Map());
  const [persons, setPersons] = useState(null);
  const [freeAmount, setFreeAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // DUP-01 — the payment the backend flagged as duplicate-LOOKING, held here
  // until the operator says which it is. `null` = nothing pending. It stores
  // the ORIGINAL body verbatim, so confirming re-sends the same payment rather
  // than rebuilding one from whatever the drawer happens to hold by then.
  const [duplicate, setDuplicate] = useState(null);
  // One id per opened charge: stable across a failed retry so the backend
  // replays instead of double-charging, fresh for a genuinely new payment.
  // DUP-01 leans on exactly this: the confirmed retry reuses this same id, so
  // it stays ONE logical payment attempt and every existing idempotency
  // guarantee (unique key, request_hash, double-tap, network retry) still holds.
  const requestIdRef = useRef(createMesaRequestId("pay"));

  const ticketRows = groupTicketLines(session?.lines);
  const outstanding = Number(session?.outstanding) || 0;
  const coversRemaining = Number(session?.coversRemaining) || 0;
  const isOpen = table.status === "open";
  const canCharge = isOpen && outstanding > 0;
  const picking = action === "pago_parcial" && partialMode === "productos";
  const selection = selectionTotals(ticketRows, selectedKeys);
  const shares = personShares(outstanding, coversRemaining);
  const personsAmount = persons ? amountForPersons(outstanding, coversRemaining, persons) : 0;
  const freeValue = Number(String(freeAmount).replace(",", "."));

  const billDocument = () => buildBillDocument(session, table.number);
  const resetDrawer = () => {
    setPartialMode(null); setSelectedKeys(new Map()); setPersons(null); setFreeAmount("");
  };
  const paid = async (result, usedMethod) => {
    const outstandingAfter = result.outstandingAfter == null
      ? Math.max(0, Math.round((Number(session.outstanding) - Number(result.amount)) * 100) / 100)
      : Number(result.outstandingAfter);
    setAction(null); resetDrawer(); setBusy(false); setDuplicate(null);
    onPrint({
      title: "RECIBO DE PAGO", tableNumber: table.number,
      rows: [
        { label: "Importe cobrado", value: euro(result.amount) },
        { label: "Método", value: METHODS.find((item) => item.id === usedMethod)?.label || usedMethod },
        { label: "Queda por pagar", value: euro(outstandingAfter) },
      ],
      totalLabel: "PAGADO", total: result.amount,
      // UAT-P3 -- paying does NOT close the table session.
      note: outstandingAfter === 0 ? "Cuenta pagada. Cierra la mesa para liberarla." : "Pago parcial registrado.",
    });
    await onRefresh();
  };
  // What this charge is worth, for the confirmation copy only. Never sent, and
  // never used to decide anything: item_selection is priced by the server from
  // the line ids, and `full` is whatever the server says outstanding is.
  const chargeAmount = (body) => {
    if (body?.mode === "full") return outstanding;
    if (body?.amount != null) return Number(body.amount);
    if (body?.mode === "item_selection") return selection.amount;
    return null;
  };
  // ONE charge path for all three modes — full, custom_amount and
  // item_selection all arrive here, so DUP-01 covers Cobrar todo, Por personas,
  // Por productos and Importe libre without any per-screen special case.
  //
  // `confirmed` is the ONLY thing that changes between the first attempt and
  // the operator-confirmed retry. Everything else — mode, amount, method,
  // coversSettled, lineIds and the clientRequestId — is re-sent verbatim.
  const charge = async (body, { confirmed = false } = {}) => {
    setBusy(true); setError("");
    try {
      const result = await mesaApi.pay(session.id, {
        ...body,
        clientRequestId: requestIdRef.current,
        // Absent on the normal path: the flag is an operator decision, and a
        // payment nobody was asked about must never carry it.
        ...(confirmed ? { confirmDuplicate: true } : {}),
      });
      await paid(result, method);
    } catch (err) {
      // A duplicate-LOOKING first attempt is not a failure — it is a question.
      // On the confirmed retry we deliberately do NOT re-open the dialog: the
      // operator has already answered it, so anything coming back now is real
      // and is shown as the error it is (the dictionary has honest copy for
      // this code too). That is also what makes a confirm loop impossible.
      // `err.code` is checked truthy FIRST on purpose: a rejection carrying no
      // code must never match a constant that is itself undefined (which is
      // exactly what a stale module mock produces). Fail towards the normal
      // error path — never towards inventing a duplicate question.
      if (!confirmed && err?.code && err.code === MESA_DUPLICATE_PAYMENT_CODE) {
        setDuplicate({ body, method, amount: chargeAmount(body) });
        setBusy(false);
        return;
      }
      setError(describeMesaError(err)); setBusy(false); setDuplicate(null);
    }
  };
  const cancelDuplicate = () => {
    // Explicitly NOT a payment path: no request, no new clientRequestId, no
    // local paid state. The account is left exactly as the backend has it —
    // one payment recorded, the second never attempted.
    setDuplicate(null);
  };
  const confirmDuplicatePayment = () => {
    if (!duplicate) return;
    const pending = duplicate;
    setDuplicate(null);
    return charge(pending.body, { confirmed: true });
  };

  // Mode "full" is byte-identical to what Mesa has always sent.
  const submitFull = () => {
    if (!(outstanding > 0)) { setError("El importe no es válido."); return; }
    return charge({ paymentMethod: method, mode: "full", coversSettled: session.coversRemaining });
  };
  // The server recomputes the amount from these very ids before charging.
  // coversSettled 0: choosing products says nothing about how many people ate.
  const submitProducts = () => {
    if (selection.lineIds.length === 0) { setError("Selecciona al menos un producto."); return; }
    return charge({ paymentMethod: method, mode: "item_selection", lineIds: selection.lineIds, coversSettled: 0 });
  };
  // The ONE place covers mean anything: N shares of the outstanding balance,
  // and N covers marked settled so the next split knows what is left.
  const submitPersons = () => {
    if (!persons || !(personsAmount > 0)) { setError("Elige cuántas personas pagan."); return; }
    return charge({ paymentMethod: method, mode: "custom_amount", amount: personsAmount, coversSettled: persons });
  };
  // coversSettled 0: a free amount cannot know whom it settles, and must not
  // quietly consume somebody's share.
  const submitFree = () => {
    if (!(freeValue > 0) || freeValue > outstanding + 0.001) { setError("El importe no es válido."); return; }
    return charge({ paymentMethod: method, mode: "custom_amount", amount: freeValue, coversSettled: 0 });
  };

  const openAction = (next) => {
    setError(""); resetDrawer(); setDuplicate(null);
    if (action !== next) requestIdRef.current = createMesaRequestId("pay");
    setAction((current) => (current === next ? null : next));
  };
  const openPartial = (next) => {
    setError(""); setSelectedKeys(new Map()); setPersons(null); setFreeAmount(""); setDuplicate(null);
    requestIdRef.current = createMesaRequestId("pay");
    setPartialMode((current) => (current === next ? null : next));
  };
  // MOBILE UX HARDENING -- the row IS the stepper now: tapping it adds
  // exactly one unit (clamped at the row's payable capacity), and minus takes
  // one away. Down to zero it deselects the row entirely, so nothing here can
  // ever disagree with what selectionTotals() charges.
  const stepRow = (row, delta) => {
    if (row.paidInFull) return;
    setError("");
    setSelectedKeys((current) => {
      const next = new Map(current);
      const max = selectableCount(row);
      const now = next.has(row.key) ? next.get(row.key) : 0;
      const wanted = Math.max(0, Math.min(max, now + delta));
      if (wanted === 0) next.delete(row.key); else next.set(row.key, wanted);
      return next;
    });
  };

  const methodPicker = (
    <div className="mesa-hub-field">
      <div className="mesa-hub-field-label">Método de pago</div>
      <div className="mesa-methods">
        {METHODS.map((item) => (
          <button key={item.id} type="button" className={`mesa-method ${method === item.id ? "active" : ""}`}
            style={{ "--mc": item.color }} onClick={() => setMethod(item.id)}>
            <span className="mesa-method-icon" aria-hidden="true">{item.icon}</span>
            <span className="mesa-method-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
  const confirmButton = (onClick, label) => (
    <button type="button" className="mesa-btn green mesa-hub-confirm" disabled={busy || !!duplicate} onClick={onClick}>
      {busy ? "Registrando…" : label}
    </button>
  );

  return <div className="mesa-hub" data-testid="mesa-payment-hub">

    {/* ── RESUMEN DEL TICKET — and, while Por productos is active, the picker
        itself. One list, read and tapped in the same place. ─────────────── */}
    <section className={`mesa-hub-ticket${picking ? " picking" : ""}`} data-testid="mesa-hub-ticket">
      <h3 className="mesa-hub-ticket-title">Resumen del ticket</h3>
      {picking && <div className="mesa-hub-pickhint" data-testid="mesa-hub-pick-hint">Toca los productos que vas a cobrar.</div>}
      {ticketRows.length === 0
        ? <div className="mesa-hub-empty" data-testid="mesa-hub-ticket-empty">
            {/* A session can carry a total with no itemised lines; saying
                "nothing in the account" above "Total 24,50 €" would be a lie. */}
            {Number(session?.total) > 0
              ? "El detalle por producto todavía no está disponible."
              : "Todavía no hay nada en la cuenta."}
          </div>
        : <div className="mesa-hub-lines">
            {ticketRows.map((row) => {
              const selectedUnits = selectedKeys.get(row.key) || 0;
              const selected = selectedUnits > 0;
              const maxUnits = selectableCount(row);
              // Pending units vs. the row's original quantity: only shown while
              // picking, and only when some (not all) units are already
              // settled -- "3 pendientes de 5" tells the operator the truth
              // about what is left to charge without pretending the other 2
              // are still up for grabs.
              const pendingOfOriginal = !row.paidInFull && maxUnits > 0 && maxUnits < row.quantity;
              const inner = <>
                <span className="mesa-hub-qty">{row.quantity}×</span>
                <span className="mesa-hub-desc">
                  <span className="mesa-hub-name">{row.label.primary}</span>
                  {row.label.secondary && <small className="mesa-hub-alias">{row.label.secondary}</small>}
                </span>
                {row.paidInFull && <span className="mesa-hub-paid-tag" data-testid="mesa-hub-paid-tag">Pagado</span>}
                {picking && pendingOfOriginal && (
                  <span className="mesa-hub-pending-tag" data-testid="mesa-hub-pending-tag">{maxUnits} pendientes de {row.quantity}</span>
                )}
                <strong className="mesa-hub-amount">{euro(row.amount)}</strong>
              </>;
              if (!picking) {
                return <div className={`mesa-hub-line${row.paidInFull ? " paid" : ""}`} key={row.key} data-testid="mesa-hub-line">{inner}</div>;
              }
              // MOBILE UX HARDENING -- the row itself IS the +1 control (fast
              // restaurant-picker feel: tap, tap, tap to select 3 units), so
              // there is no checkbox and no separate plus button competing
              // with it for the same tap. Tapping again once every unit is
              // already selected is a harmless no-op (stepRow clamps at
              // maxUnits). The one remaining manual action -- minus -- is a
              // SIBLING of the row button, never nested inside it: a button
              // inside a button is invalid HTML and the browser would swallow
              // one of the two taps. It also stops propagation explicitly so
              // a tap on it can never be read as a second, accidental tap on
              // the row underneath it.
              return <Fragment key={row.key}>
                <button type="button" data-testid="mesa-hub-line"
                  data-selected={selected ? "true" : "false"}
                  data-selected-units={String(selectedUnits)}
                  className={`mesa-hub-line selectable${selected ? " selected" : ""}${row.paidInFull ? " paid" : ""}`}
                  disabled={row.paidInFull} aria-pressed={selected}
                  aria-label={`${row.label.primary}. ${selectedUnits} de ${maxUnits} seleccionadas. Toca para sumar una unidad.`}
                  onClick={() => stepRow(row, 1)}>
                  {inner}
                </button>
                {selected && (
                  <div className="mesa-hub-qty-step" data-testid="mesa-hub-qty-stepper" data-row-key={row.key}>
                    <span className="mesa-hub-qty-count" data-testid="mesa-hub-qty-count">
                      {selectedUnits} / {maxUnits} seleccionado
                    </span>
                    <button type="button" className="mesa-hub-qty-btn" data-testid="mesa-hub-qty-minus"
                      aria-label={`Quitar una unidad de ${row.label.primary}`}
                      onClick={(event) => { event.stopPropagation(); stepRow(row, -1); }}>
                      <HubIcon d={ICON_MINUS} size={15} />
                    </button>
                  </div>
                )}
              </Fragment>;
            })}
          </div>}
      <div className="mesa-hub-totals">
        <div className="mesa-hub-total-row" data-testid="mesa-hub-total">
          <span>Total</span><strong>{euro(session?.total)}</strong>
        </div>
        <div className="mesa-hub-total-row" data-testid="mesa-hub-paid">
          <span>Ya cobrado</span><strong style={{ color: "#65d995" }}>{euro(session?.paid)}</strong>
        </div>
        <div className="mesa-hub-total-row outstanding" data-testid="mesa-hub-outstanding">
          <span>Resta por pagar</span><strong>{euro(outstanding)}</strong>
        </div>
      </div>
    </section>

    {isOpen && <>
      <div className="mesa-hub-actions" data-testid="mesa-hub-actions">
        <button type="button" className={`mesa-hub-action ${action === "cobrar_todo" ? "active" : ""}`}
          data-testid="mesa-hub-cobrar-todo" disabled={!canCharge} onClick={() => openAction("cobrar_todo")}>
          <HubIcon d={ICON_WALLET} />Cobrar todo
        </button>
        <button type="button" className={`mesa-hub-action ${action === "pago_parcial" ? "active" : ""}`}
          data-testid="mesa-hub-pago-parcial" disabled={!canCharge} onClick={() => openAction("pago_parcial")}>
          <HubIcon d={ICON_SPLIT} />Pago parcial
        </button>
        <button type="button" className={`mesa-hub-action ${action === "descuento" ? "active" : ""}`}
          data-testid="mesa-hub-descuento" onClick={() => openAction("descuento")}>
          <HubIcon d={ICON_TAG} />Descuento
        </button>
      </div>

      {action && <div className="mesa-hub-drawer" data-testid="mesa-hub-drawer">

        {action === "cobrar_todo" && <div data-testid="mesa-hub-drawer-cobrar-todo">
          <div className="mesa-hub-field">
            <div className="mesa-hub-field-label">Importe a cobrar</div>
            <div className="mesa-hub-bigamount" data-testid="mesa-hub-full-amount">{euro(outstanding)}</div>
          </div>
          {methodPicker}
          {confirmButton(submitFull, "Confirmar cobro")}
        </div>}

        {action === "pago_parcial" && <div data-testid="mesa-hub-drawer-pago-parcial">
          {/* Exactly three ways. No more. */}
          <div className="mesa-hub-modes" data-testid="mesa-hub-partial-modes">
            <button type="button" className={`mesa-hub-mode ${partialMode === "productos" ? "active" : ""}`}
              data-testid="mesa-hub-mode-productos" onClick={() => openPartial("productos")}>Por productos</button>
            <button type="button" className={`mesa-hub-mode ${partialMode === "personas" ? "active" : ""}`}
              data-testid="mesa-hub-mode-personas" disabled={shares.length === 0}
              onClick={() => openPartial("personas")}>Por personas</button>
            <button type="button" className={`mesa-hub-mode ${partialMode === "libre" ? "active" : ""}`}
              data-testid="mesa-hub-mode-libre" onClick={() => openPartial("libre")}>Importe libre</button>
          </div>

          {partialMode === "productos" && <div data-testid="mesa-hub-partial-productos">
            <div className="mesa-hub-selected" data-testid="mesa-hub-selected-total">
              <span>A cobrar</span><strong>{euro(selection.amount)}</strong>
            </div>
            {methodPicker}
            {confirmButton(submitProducts, "Confirmar cobro")}
          </div>}

          {partialMode === "personas" && <div data-testid="mesa-hub-partial-personas">
            <div className="mesa-hub-field">
              <div className="mesa-hub-field-label">¿Cuántas personas pagan?</div>
              <div className="mesa-hub-persons" data-testid="mesa-hub-person-options">
                {shares.map((_, index) => {
                  const n = index + 1;
                  return <button key={n} type="button" data-testid={`mesa-hub-person-${n}`}
                    className={`mesa-hub-person ${persons === n ? "active" : ""}`}
                    aria-pressed={persons === n} onClick={() => { setError(""); setPersons(n); }}>{n}</button>;
                })}
              </div>
            </div>
            {persons && <div className="mesa-hub-selected" data-testid="mesa-hub-persons-amount">
              <span>{persons} persona{persons === 1 ? "" : "s"}</span><strong>{euro(personsAmount)}</strong>
            </div>}
            {methodPicker}
            {confirmButton(submitPersons, "Confirmar cobro")}
          </div>}

          {partialMode === "libre" && <div data-testid="mesa-hub-partial-libre">
            <div className="mesa-hub-field">
              <div className="mesa-hub-field-label">Importe a cobrar</div>
              <input className="mesa-input" data-testid="mesa-hub-free-amount" inputMode="decimal"
                value={freeAmount} placeholder="0,00"
                onChange={(event) => { setError(""); setFreeAmount(event.target.value); }} />
            </div>
            {methodPicker}
            {confirmButton(submitFree, "Confirmar cobro")}
          </div>}
        </div>}

        {action === "descuento" && <div className="mesa-hub-soon" data-testid="mesa-hub-drawer-descuento">
          <strong>Próximamente</strong>
        </div>}

      </div>}
    </>}

    {/* DUP-01 — deliberately INLINE, not a second overlay. V1.1 collapsed the
        hub from two stacked modals to one, and the operator is already reading
        this exact spot for the outcome of the charge they just made. Amber, not
        red: nothing failed and nothing is suspicious — the system simply cannot
        tell a real second payment from a double-submit, and only the operator
        can. */}
    {duplicate && <div className="mesa-hub-dup" role="alertdialog" aria-labelledby="mesa-hub-dup-title"
      data-testid="mesa-hub-duplicate">
      <strong className="mesa-hub-dup-title" id="mesa-hub-dup-title">Posible pago duplicado</strong>
      {duplicate.amount > 0 && <div className="mesa-hub-dup-amount" data-testid="mesa-hub-duplicate-amount">
        {euro(duplicate.amount)}
      </div>}
      <p className="mesa-hub-dup-text">Ya se registró un pago idéntico hace poco. ¿Es realmente un segundo pago?</p>
      <div className="mesa-hub-dup-actions">
        <button type="button" className="mesa-btn mesa-hub-dup-btn" disabled={busy}
          data-testid="mesa-hub-duplicate-cancel" onClick={cancelDuplicate}>Cancelar</button>
        <button type="button" className="mesa-btn gold mesa-hub-dup-btn" disabled={busy}
          data-testid="mesa-hub-duplicate-confirm" onClick={confirmDuplicatePayment}>Registrar igualmente</button>
      </div>
    </div>}

    {error && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }} data-testid="mesa-hub-error">{error}</div>}

    {isOpen && outstanding > 0 && <button type="button" className="mesa-hub-print"
      data-testid="mesa-hub-imprimir" onClick={() => onPrint(billDocument())}>
      <HubIcon d={ICON_PRINTER} size={18} />Imprimir ticket
    </button>}
  </div>;
}

// Thin wrapper for the non-compact (tablet/desktop) path -- unchanged
// behavior, unchanged markup: VerCuentaBody's content inside the same
// shared Modal it always rendered.
// ACC-01 (2026-08-21 forensic audit) — ÚLTIMAS CUENTAS.
//
// A closed table used to disappear completely: `GET /floor` returns open
// sessions only, so buildFloor gave it back as `status:'free', session:null`
// and its account, comandas and payment history had nowhere left to render.
// The rows were always intact — the operator simply had no way to look.
//
// This is the smallest surface that fixes that: a list of the last closed
// tables, and the account of whichever one you pick. It is deliberately NOT the
// future Economía report — no date range, no service picker, no totals across
// tables. It answers exactly one question: "the table was just closed; what
// happened on it?"
//
// STRICTLY READ-ONLY. It calls two GETs and renders. There is no payment
// action, no reopen, no close, no print-to-collect — a settled table is
// finished, and this only lets you look back at it.
function UltimasCuentasModal({ onClose }) {
  const [sessions, setSessions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    mesaApi.recentClosedSessions({ limit: 15 })
      .then((res) => { if (live) setSessions(res.sessions || []); })
      .catch((err) => { if (live) setError(describeMesaError(err)); });
    return () => { live = false; };
  }, []);

  const openAccount = async (session) => {
    setSelected(session); setDetail(null); setError(""); setBusy(true);
    try {
      setDetail(await mesaApi.sessionAccount(session.tableSessionId));
    } catch (err) {
      setError(describeMesaError(err));
    } finally {
      setBusy(false);
    }
  };

  const title = selected
    ? `${selected.tableRef || "Mesa"} · cuenta cerrada`
    : "Últimas cuentas cerradas";

  return <Modal title={title} subtitle="Solo lectura" onClose={onClose} width={620}>
    {error && <div className="mesa-banner mesa-error" style={{ marginBottom: 12 }}>{error}</div>}

    {!selected && <>
      {sessions === null && !error && <div className="mesa-muted" style={{ padding: "14px 2px", fontSize: 13 }}>Cargando…</div>}
      {sessions !== null && sessions.length === 0 && (
        <div className="mesa-muted" style={{ padding: "14px 2px", fontSize: 13 }}>Todavía no hay ninguna mesa cerrada.</div>
      )}
      {(sessions || []).map((session) => (
        <button key={session.tableSessionId} className="mesa-row mesa-account-history-item"
          data-testid="ultimas-cuentas-item" onClick={() => openAccount(session)}>
          <span>
            <strong>{session.tableRef || "Mesa"}</strong>
            {session.coversTotal ? <span className="mesa-muted"> · {session.coversTotal} pers.</span> : null}
          </span>
          <span className="mesa-muted">{formatClockTime(session.closedAt)}</span>
        </button>
      ))}
    </>}

    {selected && <>
      <button className="mesa-btn" data-testid="ultimas-cuentas-back"
        onClick={() => { setSelected(null); setDetail(null); setError(""); }}>← Todas</button>
      {busy && <div className="mesa-muted" style={{ padding: "14px 2px", fontSize: 13 }}>Cargando…</div>}
      {detail && <div style={{ marginTop: 12 }}>
        <div className="mesa-summary">
          <div className="mesa-stat"><small>Total</small><strong>{euro(detail.account.total)}</strong></div>
          <div className="mesa-stat"><small>Cobrado</small><strong style={{ color: "#65d995" }}>{euro(detail.account.paid)}</strong></div>
          <div className="mesa-stat"><small>Pendiente</small><strong style={{ color: "#ffc65c" }}>{euro(detail.account.outstanding)}</strong></div>
          <div className="mesa-stat"><small>Personas</small><strong>{detail.account.coversTotal ?? "—"}</strong></div>
        </div>
        <div className="mesa-section">
          <h3>Cerrada</h3>
          <div className="mesa-row">
            <span>{formatClockTime(detail.account.openedAt)} → {formatClockTime(detail.closedAt)}</span>
            <span className="mesa-muted">{detail.closedBy || ""}</span>
          </div>
        </div>
        {detail.account.commands.length > 0 && <div className="mesa-section">
          <h3>Comandas</h3>
          {detail.account.commands.map((command) => (
            <div className="mesa-row" key={command.id}>
              <span>#{command.commandNumber} · {command.id}</span>
              <strong>{euro(command.total)}</strong>
            </div>
          ))}
        </div>}
        {detail.account.lines.length > 0 && <div className="mesa-section">
          <h3>Productos</h3>
          {detail.account.lines.map((line) => (
            <div className="mesa-row" key={line.id}>
              <span>{line.description}</span><strong>{euro(line.amount)}</strong>
            </div>
          ))}
        </div>}
        {detail.account.payments.length > 0 && <div className="mesa-section">
          <h3>Pagos</h3>
          {detail.account.payments.map((payment) => (
            <div className="mesa-row" key={payment.id}>
              <span>
                {formatClockTime(payment.createdAt)} ·{" "}
                {METHODS.find((item) => item.id === payment.method)?.label || payment.method}
                {payment.kind === "refund" ? " (devolución)" : ""}
              </span>
              <strong>{euro(payment.amount)}</strong>
            </div>
          ))}
        </div>}
      </div>}
    </>}
  </Modal>;
}

// MesaWorkspace -- the ONE operative surface for an occupied table (replaces
// the old TableContextPopup-occupied-branch + TableDetail split, which
// rendered the same comanda list in two different modals reachable from the
// same tap). Comandas, Nueva comanda and Cerrar mesa live here; anything
// financial (totals, payment, printable tickets) is one explicit "Ver
// cuenta" tap away, in VerCuentaModal, never inlined here.
// MESA WORKSPACE UI V2 -- the approved layout (2026-08-24): Comanda actual /
// Resumen de comandas / Reservas / Actions. Same single-component, same
// state, same handlers, same dual-shell contract as before (compactCard
// picks the wrapper only) -- what changed is the "detail" body, which used
// to be two near-duplicate JSX trees (one per branch) and is now ONE shared
// renderDetail() closure called from both, so there is exactly one place
// that ever renders a table's comandas/reservas/actions, matching this
// slice's own "one visual authority" mandate.
function MesaWorkspace({
  table, onClose, onNewCommand, onRefresh, onPrint,
  canManageReservations, onViewNight,
  draft, onClearDraft, onSendToCocina,
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
  // SMOKE FIX — expanded by default. An unsent draft is the thing the
  // operator is working on right now; collapsing it put the live work behind
  // a tap while an empty "Comanda actual" card held the gold highlight.
  // (Historic note below describes the previous, now-superseded default.)
  // inline in the workspace, not a second full-page view (see Fase 5 spec).
  const [draftExpanded, setDraftExpanded] = useState(true);
  // V2.1 Fase 5 -- which product row's read-only detail sheet is open, if any.
  const [selectedLine, setSelectedLine] = useState(null);
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

  // The shared "detail" body -- Comanda actual, the draft panel (only while
  // one exists, unchanged logic/markup), Resumen de comandas, Reservas, and
  // the three actions. Called once per branch below (compact card body /
  // Modal body); a closure, not a separate component, so it needs no prop
  // threading for the state and handlers already in scope above.
  // The unsent draft. Named "Pedido en curso": it is not a comanda yet, and
  // calling it one is exactly what made the screen read backwards.
  const renderDraftPanel = () => <div className="mesa-current-card mesa-draft-card" data-testid="mesa-draft-panel">
    <button type="button" data-testid="mesa-draft-toggle" onClick={() => setDraftExpanded((value) => !value)} style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
      border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left",
    }}>
      <span className="mesa-current-eyebrow">
        <i className="mesa-dot" style={{ width: 6, height: 6, background: "#d7a84b" }} />
        Pedido en curso
      </span>
      <span className="mesa-muted" style={{ marginLeft: "auto" }}>{draftItemCount} artículo{draftItemCount === 1 ? "" : "s"} · {euro(draftTotal)}</span>
      <span style={{ color: "#a99d89", transform: draftExpanded ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>⌄</span>
    </button>
    {draftExpanded && <div className="mesa-command-card" style={{ marginTop: 10 }}>
      <DraftItemsList items={draft.items} />
      {draft.nota && <div className="mesa-command-note">Nota general: {draft.nota}</div>}
      <div style={{ marginTop: 8, textAlign: "right", fontWeight: 900 }}>{euro(draftTotal)}</div>
    </div>}
    <div className="mesa-actions">
      <button className="mesa-btn" disabled={sendingDraft} onClick={() => onNewCommand(table)}>Modificar</button>
      <button className="mesa-btn green" disabled={sendingDraft} onClick={sendToCocina}>{sendingDraft ? "Enviando…" : "Enviar a cocina"}</button>
    </div>
  </div>;

  const renderDetail = () => <>
    {/* SMOKE FIX — order matters. While a draft exists it is the live work and
        goes first, with the gold treatment; Comanda actual drops to secondary
        (see ComandaActualCard). With no draft, nothing moves. */}
    {draft && renderDraftPanel()}
    <ComandaActualCard session={session} draft={draft} busy={busy} onMarkServed={markServed}
      onAddItems={() => onNewCommand(table)} onSelectLine={setSelectedLine} />
    {selectedLine && <LineDetailSheet payload={selectedLine} onClose={() => setSelectedLine(null)} />}

    {/* Comanda por confirmar -- the local draft MesaOrderBuilder handed back
        via "Confirmar comanda". Open by default (unlike sent comandas): this
        IS the last check with the client before it reaches Cocina. Only
        "Enviar a cocina" here calls the backend. Unrelated to Comanda
        actual above -- a draft is not yet a real comanda at all. */}

    <ResumenComandasSection session={session} />
    <ReservasSection todayReservations={todayReservations} nextReservation={nextReservation}
      canManageReservations={canManageReservations} onOpen={onViewNight} />

    {/* Nueva comanda (primary, full width) / Ver cuenta + Cerrar mesa (paired
        below) -- exactly the approved bottom actions. Same handlers, same
        P0-B.1 conditions (Nueva comanda/Cerrar mesa hidden while a draft is
        pending) as before this slice; only the layout and icons are new. */}
    <div className="mesa-current-actions">
      {!draft && <button type="button" className="mesa-btn primary mesa-current-cta-primary" onClick={() => onNewCommand(table)}>
        <HubIcon d={ICON_PLUS_CIRCLE} size={19} />Nueva comanda
      </button>}
      <div className="mesa-current-cta-row">
        {/* MESA_PHONE_VISUAL_PARITY_V2 -- gold only once there is a real
            account to review (hasOrders); otherwise the plain neutral look,
            so the button never reads as "something needs your attention"
            when the table has nothing billed yet. Still fully tappable
            either way -- VerCuentaBody itself handles the zero-total state. */}
        <button type="button" className={`mesa-btn${hasOrders ? " gold" : ""}`} onClick={() => setShowAccount(true)}>
          <HubIcon d={ICON_WALLET} size={17} />Ver cuenta
        </button>
        {!draft && <button type="button" className="mesa-btn" disabled={busy} onClick={openCloseConfirm}>
          <HubIcon d={ICON_CLOSE_CIRCLE} size={17} />Cerrar mesa
        </button>}
      </div>
    </div>
    {/* !confirmingClose: while CerrarMesaDialog's own overlay is up (non-
        compact only -- see below), it shows this same error itself; without
        the guard the message would render twice. */}
    {error && !confirmingClose && <div className="mesa-banner mesa-error" style={{ marginTop: 12 }}>{error}</div>}
  </>;

  // P1_D_TABLE_FIRST_01 -- centered focused table modal (phone shell only).
  // Reuses every handler/state above unchanged (Nueva comanda/Ver cuenta/
  // Cerrar mesa call the exact same functions the non-compact branch below
  // calls) -- only the presentation differs. Not a Modal (see the dedicated
  // mesa-table-card-* classes' own comment): a true centered card, sized to
  // its own compact content, dimming the map strongly behind it rather than
  // anchoring a bottom sheet that leaves most of the screen a meaningless
  // dark void.
  //
  // MESA_NAV_CONSOLIDATION_01 -- Ver cuenta and Cerrar mesa render in-place,
  // inside this one card, swapped in by workspaceView -- one workspace, one
  // modal layer, ever. The outer "×" always closes the whole workspace
  // (onClose, unchanged); the head's back control only returns to "detail".
  if (compactCard) {
    return <div className="mesa-table-card-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mesa-table-card">
        <div className="mesa-table-card-head">
          {workspaceView === "detail"
            ? <div style={{ fontWeight: 950, fontSize: 20 }}>{title}</div>
            : <button type="button" className="mesa-card-back" data-testid="mesa-card-back" onClick={backToDetail} aria-label={`Volver a ${title}`}>
                <span aria-hidden="true">←</span>
                <span className="mesa-card-back-text">
                  {/* Hierarchy item 1 on the phone. The covers line is
                      context, not the retired "Personas 0/2" stat. */}
                  <span>{workspaceView === "account" ? `Mesa ${table.number} · Ver cuenta` : title}</span>
                  {workspaceView === "account" && session.coversTotal != null
                    && <small className="mesa-muted">{session.coversTotal} persona{session.coversTotal === 1 ? "" : "s"}</small>}
                </span>
              </button>}
          <button className="mesa-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="mesa-table-card-body">
          {workspaceView === "detail" && renderDetail()}
          {workspaceView === "account" && <div data-testid="mesa-card-view-account"><VerCuentaBody table={table} onRefresh={onRefresh} onPrint={onPrint} /></div>}
          {workspaceView === "close-confirm" && <CerrarMesaConfirm tableNumber={table.number} empty={session.coversTotal == null} blocked={commandsBlockingClose(session).length} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
        </div>
      </div>
    </div>;
  }

  // V1.1 §3 -- ONE SURFACE, NO INTERMEDIATE PREVIEW. "Ver cuenta" replaces
  // this modal's body in place, with a back control -- exactly what the
  // compact/phone card has always done. Same hub, same markup, same
  // handlers; only the number of layers changed.
  const accountCovers = session.coversTotal;
  return <>
    <Modal
      title={showAccount ? `Mesa ${table.number} · Ver cuenta` : title}
      subtitle={showAccount && accountCovers != null
        ? `${accountCovers} persona${accountCovers === 1 ? "" : "s"}` : undefined}
      onClose={onClose}
      size={showAccount || hasOrders || draft ? "tall" : undefined}>
      {showAccount ? <>
        <button type="button" className="mesa-btn small mesa-hub-back" data-testid="mesa-account-back"
          onClick={() => setShowAccount(false)}>← Volver a la mesa</button>
        <VerCuentaBody table={table} onRefresh={onRefresh} onPrint={onPrint} />
      </> : renderDetail()}
    </Modal>
    {confirmingClose && <CerrarMesaDialog tableNumber={table.number} empty={session.coversTotal == null} blocked={commandsBlockingClose(session).length} busy={busy} error={error} onCancel={cancelCloseConfirm} onConfirm={confirmClose} />}
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

// ── Shared room-configuration primitives ───────────────────────────────────
// "Añadir mesa" and "Editar mesa" configure the SAME two domain fields, so
// they render the same controls and validate against the same rule. Before
// this they each hand-rolled a bare <input type="number">, which is both a
// duplicated business rule and, on a phone, a keyboard summoned to type "6".
//
// Capacity is the table's PHYSICAL configuration ("Capacidad máxima" /
// `máx N`), never the current session's covers. Nothing here reads or writes
// coversTotal, and the payloads below carry no covers field at all.
const CAPACITY_QUICK = [2, 3, 4, 6, 8];
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 99;

export function isValidCapacity(value) {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity >= CAPACITY_MIN && capacity <= CAPACITY_MAX;
}

// One chip per common table size plus a free field for everything else, so the
// usual case is a single tap and the unusual one is still reachable. The
// current value is always shown as selected even when it is not a quick option.
function CapacityPicker({ value, onChange }) {
  const current = Number(value);
  return <div>
    <div className="mesa-capacity-grid">
      {CAPACITY_QUICK.map((option) => <button key={option} type="button"
        data-testid={`capacity-quick-${option}`}
        className={`mesa-capacity-btn ${current === option ? "active" : ""}`}
        aria-pressed={current === option}
        onClick={() => onChange(option)}>{option}</button>)}
    </div>
    <div className="mesa-capacity-custom">
      <label className="mesa-label" htmlFor="mesa-capacity-custom-input">Otra</label>
      <input id="mesa-capacity-custom-input" data-testid="capacity-custom-input"
        className="mesa-input" type="number" inputMode="numeric"
        min={CAPACITY_MIN} max={CAPACITY_MAX} value={value}
        onChange={(event) => onChange(event.target.value)} />
    </div>
  </div>;
}

// Capacity + shape, the whole physical configuration of a table, in the one
// place both flows read it from.
function TableConfigFields({ form, setForm }) {
  return <>
    <label className="mesa-label">Capacidad máxima</label>
    <CapacityPicker value={form.capacity} onChange={(capacity) => setForm((current) => ({ ...current, capacity }))} />
    <div style={{ marginTop: 14 }}>
      <label className="mesa-label">Forma</label>
      <ShapePicker shape={form.shape} shapePreset={form.shapePreset}
        onShape={(shape, shapePreset) => setForm((current) => ({ ...current, shape, shapePreset }))}
        onCapacityPreset={(capacity) => setForm((current) => ({ ...current, capacity }))} />
    </div>
  </>;
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
    if (!isValidCapacity(capacity)) { setError("Indica una capacidad máxima válida."); return; }
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
    <div><label className="mesa-label">Número de mesa</label><input className="mesa-input" type="number" inputMode="numeric" min="1" max="999" value={form.tableNumber} onChange={(event) => setForm({ ...form, tableNumber: event.target.value, displayName: `Mesa ${event.target.value}` })} /></div>
    <div style={{ marginTop: 14 }}><TableConfigFields form={form} setForm={setForm} /></div>
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
    if (!isValidCapacity(capacity)) throw new Error("capacity");
    // Saved against this table's OWN id (see save() below), so changing the
    // physical configuration updates Mesa 5 rather than retiring it and
    // minting a replacement. Position is carried through untouched -- editing
    // capacity or shape must not teleport a table the operator has placed.
    // No covers/coversTotal field appears here by design: the live session's
    // comensales is a different concept and is owned by the session, not by
    // the room's physical configuration.
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
  // Live covers, shown only so the operator can SEE that the two numbers are
  // different things. Read-only here on purpose: this panel configures the
  // physical table, and a session's comensales is not part of that.
  const liveCovers = table.status === "open" ? (table.session?.coversTotal ?? null) : null;

  return <Modal title={`Editar Mesa ${table.number}`} subtitle="Configuración física de la mesa" onClose={busy ? undefined : onClose} width={520}>
    <div data-testid="table-editor">
      {liveCovers != null && <div className="mesa-banner" data-testid="table-editor-covers-note" style={{ marginBottom: 14 }}>
        Ahora mismo sentados: <strong>{liveCovers} comensal{liveCovers !== 1 ? "es" : ""}</strong>. La capacidad máxima
        describe la mesa, no esta sesión — cambiarla no toca los comensales actuales.
      </div>}
      <TableConfigFields form={form} setForm={setForm} />
      <details style={{ marginTop: 16 }}>
        <summary className="mesa-label" style={{ cursor: "pointer" }}>Número de mesa</summary>
        <input className="mesa-input" style={{ marginTop: 8 }} type="number" inputMode="numeric" min="1" max="999"
          data-testid="table-editor-number"
          value={form.tableNumber} onChange={(event) => setForm({ ...form, tableNumber: event.target.value })} />
      </details>
      <div className="mesa-actions" style={{ justifyContent: "space-between", marginTop: 20 }}>
        <button className="mesa-btn red" disabled={busy} onClick={remove}>Eliminar mesa</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mesa-btn" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="mesa-btn gold" data-testid="table-editor-save" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar mesa"}</button>
        </div>
      </div>
      {error && <div className="mesa-banner mesa-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
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
  // ACC-01 — read-only history of already-closed table accounts.
  const [showUltimasCuentas, setShowUltimasCuentas] = useState(false);
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
  // MESA_HYBRID_3D -- the room is a FIXED frame (hybridScene's ROOM_FRAME), so
  // this depends on the board box and nothing else. It deliberately does NOT
  // depend on `tables`: a geometry that changed when a table moved is precisely
  // the P0 that made untouched Mesas slide across the screen during a drag.
  //
  // The freeze-during-drag machinery this replaced (a ref plus an epoch
  // counter, to stop the camera chasing the finger) is gone with it. There is
  // nothing left to freeze.
  const hybridGeom = useMemo(
    () => ((MESA_HYBRID_3D && boardBox && boardBox.width > 0)
      ? sceneGeometry(boardBox.width, boardBox.height)
      : null),
    [boardBox]
  );
  const pointerDown = (event, table) => {
    if (!editing) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
    // The same band the room frames -- imported, never repeated, so a finger
    // can never reach a coordinate the camera does not show.
    const y = Math.max(ROOM_Y_MIN, Math.min(ROOM_Y_MAX, rawY));
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
          // In Personalizar sala the dock already promises "Arrastra para
          // mover · Toca para editar", so a tap goes STRAIGHT to the room
          // editor. It used to open the generic quick-menu, from which
          // "Ajustes de mesa" was a second tap -- and on a phone that popup is
          // mostly operational actions that do not apply while customizing.
          if (editing && canEdit) { setSettingsId(table.id); return; }
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
      {canEdit && editing && <button className="mesa-btn gold" data-testid="mesa-add-table" onClick={() => setShowAdd(true)}>＋ Añadir mesa</button>}
      {/* "✓ Listo", NOT "Guardar sala". Every room change in this mode is
          already persisted the moment it happens: a drag saves on pointerUp
          (savePosition -> mesaApi.saveTable) and the table editor saves on its
          own "Guardar mesa". There is no staged state and no second
          transaction to perform, so a Save button here would be a button that
          does nothing while claiming to be the thing that made the work
          durable -- the worst possible lie for an operator deciding whether it
          is safe to close the app. "Listo" is the truth: the work is saved,
          this exits the mode. See the report's §11. */}
      {canEdit && <button className={`mesa-btn ${editing ? "primary" : ""}`} data-testid="mesa-customize-toggle"
        title={editing ? "Los cambios ya se guardan solos; esto sale del modo" : undefined}
        onClick={() => setEditing((value) => { const next = !value; if (!next) { setSettingsId(null); setShowAdd(false); setMenuId(null); } return next; })}>{editing ? "✓ Listo" : "🛠 Personalizar sala"}</button>}
      {/* ACC-01 — the way back to a table that has already been closed. It
          lives in the dock beside the other floor-level actions rather than on
          a table tile, because a closed table renders as FREE and overloading a
          free table's tap would make opening a new one ambiguous. Read-only. */}
      {!editing && <button className="mesa-btn" data-testid="mesa-ultimas-cuentas"
        title="Ver la cuenta de una mesa ya cerrada" onClick={() => setShowUltimasCuentas(true)}>
        🧾 Últimas cuentas
      </button>}
      {/* Re-fetches the floor from the backend (load()). NOT an undo: it
          discards nothing, it pulls in whatever another device saved. Kept
          as-is; its meaning was verified, not guessed. */}
      <button className="mesa-btn icon" title="Actualizar el plano" aria-label="Actualizar el plano" onClick={() => load()}>↻</button>
    </div>}
    {showUltimasCuentas && <UltimasCuentasModal onClose={() => setShowUltimasCuentas(false)} />}
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
        confirmingClose, draftExpanded, ...) leaks from the old table into
        the new one -- table.id is the same stable, backend-issued
        identifier already used as the key for every table button on the
        floor above, never an array index. */}
    {/* MESA WORKSPACE UI V2 -- onEditReservation/onChanged/onOpened/notify
        dropped: MesaWorkspace no longer renders an inline ReservationItem
        (Reservas now opens the same onViewNight agenda the compact card
        already used), so it never called them for any other reason. openEditor/
        opened/notify themselves are untouched -- they still serve their other,
        real callers elsewhere on this page. */}
    {selected?.status === "open" && <MesaWorkspace key={selected.id} table={selected} onClose={() => setSelectedId(null)} onNewCommand={startNewCommand} onRefresh={() => load({ quiet: true })} onPrint={setPrintDocument}
      canManageReservations={canManageReservations}
      onViewNight={() => { setSelectedId(null); setReservationsFilterTableId(selected.id); setShowReservations(true); }}
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

export { equalShares, hasReadyOrder, css as mesaCss, resolveTablePositions, isRelevantReservation, responsiveTableSize, previewResponsiveTablePx, BOARD_WIDTH_REFERENCE, TABLE_MIN_SCALE, STATUS, tableState, bookedForToday, canEditMesaRoom, canManageMesaReservations, UltimasCuentasModal };
