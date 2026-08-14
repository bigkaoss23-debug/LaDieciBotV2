// ===============================================================
// MESA HYBRID 3D — scene geometry.
//
// Pure, DOM-free, React-free geometry for the Hybrid Mapa renderer. Every
// perspective calculation in the renderer comes from here, so the arithmetic
// is unit-testable and lives in exactly one place instead of being smeared
// through JSX.
//
// THE COORDINATE CONTRACT
// -----------------------
// `table.x` / `table.y` remain EXACTLY what they already are: the
// authoritative logical floor position, 0..100, y measured downward from the
// top of the board (which reads as the BACK of the room). Nothing here
// migrates, rewrites or reinterprets a stored coordinate — the renderer is a
// projection OF that value, never an owner of it. Drag therefore has to run
// the inverse projection before it saves; see unprojectScreenPoint below and
// its use in TabMesa's pointerMove.
//
// THE ONE IDEA WORTH KNOWING
// --------------------------
// Room perspective and object scale are DELIBERATELY DECOUPLED (PK_ROOM vs
// PK_OBJ). Strict perspective ties both to one factor, which is what forced
// the earlier free-3D concept to shrink its farthest table by ~22% to buy its
// sense of depth. Here the FLOOR keeps a strong projection — its grid
// converges, its bands compress — while table size falls off on a much
// gentler curve, so the room stays deep and every table stays comfortably
// tappable. The depth the size no longer carries is paid for in TONE instead
// (see DEPTH_VEIL): distant tables sit deeper in shadow, which is simply what
// happens in a room lit only by its own pendants.
// ===============================================================

// ── Centralized visual tokens ──────────────────────────────────────────────
// Every tunable the human visual sign-off covers lives here and nowhere else.
// Keep this list short on purpose: a renderer with fifty knobs is a renderer
// nobody can calibrate.
export const HYBRID_TOKENS = {
  // camera
  K: 0.82,            // floor foreshortening: a circle on the floor becomes an
                      // ellipse with ry/rx = K. 0.82 keeps round tables ROUND;
                      // the free-3D concept's 0.62 is what made them read as pucks.
  PK_ROOM: 0.42,      // room perspective strength (grid convergence, band compression)
  PK_OBJ: 0.18,       // table size falloff — much gentler, see the note above

  // room proportions, all relative to the board box
  HALF_W: 0.64,       // half-width of the floor plane at the near edge
  Y_FRONT: 0.965,     // where the near edge of the floor sits
  DEPTH: 0.80,        // how much of the board height the floor spans.
                      // MESA_HYBRID_VIEWPORT_01 — was 0.755, which left the
                      // top ~20% of the board as back wall. That was already
                      // the emptiest region of the screen, and constraining
                      // the board to the real phone viewport (see the shell
                      // fix) makes every remaining pixel worth more, so the
                      // floor takes back most of it: wall drops to ~16.5%,
                      // still enough to read as "a room with a wall behind
                      // it" rather than a floating plane. Purely a framing
                      // number — PK_ROOM/PK_OBJ are untouched, so the
                      // perspective itself, the near/far scale delta and the
                      // inverse projection drag all behave exactly as before.

  // table sizing
  TABLE_R: 0.133,     // base top-face half-width, as a fraction of board width
  TABLE_R_MIN: 30,    // floor, in px, so a narrow board never miniaturises tables
  TABLE_R_MAX: 62,    // ceiling, so a tablet-width board doesn't grow absurd tables
  LIFT: 0.30,         // how far the top floats above its floor point (× R)
  THICKNESS: 0.135,   // tabletop thickness (× R). Thin on purpose: the free-3D
                      // concept's 0.42 is literally hockey-puck proportions.
  RECT_ASPECT: 1.86,  // square/rect top width as a multiple of R (round is 2.00)

  // chairs — see chairSlots (the templates) and chairPlacements (the geometry)
  CHAIR: 0.40,        // seat width (× R). Smaller than the table by a wide
                      // margin on purpose: chairs report capacity, they do
                      // not compete with the table for attention.
  CHAIR_TUCK: 0.17,   // distance from the table's own EDGE to the chair
                      // centre (× R) — NOT a ring radius from the centre.
                      // Measuring from the edge is what makes a chair sit the
                      // same distance from a round table and from the long
                      // side of a rectangle, so one number art-directs both.
                      // Small enough that the seat overlaps the edge slightly
                      // and reads as tucked IN rather than parked nearby.
  CHAIR_DEPTH_TILT: 0.10, // near/far size spread WITHIN one table's own seats,
                      // so a ring of chairs reads as a ring in perspective
                      // instead of as equal dots scattered on the floor.
  CHAIR_LIFT: 0.28,   // how far the SEAT floats above its floor point (× R),
                      // against the tabletop's own LIFT of 0.30. This is the
                      // single biggest reason the first chairs read as
                      // detached: the tabletop is drawn lifted off the floor
                      // while the chairs were drawn ON it, so every near-side
                      // seat landed a full LIFT (~15px at phone size) below
                      // the table's visible near edge — a gap the eye reads as
                      // "that chair belongs to nothing". Lifting the seat to
                      // just under the tabletop closes it. The chair's ground
                      // shadow deliberately stays at the true floor point, so
                      // the seat still reads as resting on the floor.

  // interaction
  FOOT_W: 1.34,       // hit-target half-width (× R). Covers the table and its
                      // chairs, NOT the light pool — the pool is atmosphere,
                      // not a control.

  // light + material (see HybridFloorScene for where each is consumed)
  DEPTH_VEIL: 0.28,   // how much darker the farthest table sits vs the nearest
  POOL_R: 2.7,        // floor light pool radius (× R)
  POOL_PEAK: 0.52,    // pool alpha at its centre
  RIM: 0.86,          // state reveal intensity
  FACE_TINT: 0.5,     // state tint over the tabletop material
  GRID: 0.048,        // floor grid line opacity
  CHAIR_ALPHA: 0.82,  // chair prominence multiplier. Deliberately below 1:
                      // the hierarchy is table > number > state > capacity >
                      // chairs, and a chair at full strength on a lit floor
                      // pool out-shouts the state rim it is supposed to sit
                      // beneath.
};

// ── Room geometry for a given board box ────────────────────────────────────
// Everything downstream derives from this, so a board of any size produces a
// coherent room without per-call-site arithmetic.
export function sceneGeometry(width, height, tokens = HYBRID_TOKENS) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const R = Math.min(
    tokens.TABLE_R_MAX,
    Math.max(tokens.TABLE_R_MIN, w * tokens.TABLE_R)
  );
  return {
    width: w,
    height: h,
    cx: w / 2,
    halfW: w * tokens.HALF_W,
    yFront: h * tokens.Y_FRONT,
    depth: h * tokens.DEPTH,
    horizon: h * tokens.Y_FRONT - h * tokens.DEPTH,
    R,
    tokens,
  };
}

// ── logical floor coordinate → normalized room coordinate ──────────────────
// u ∈ [-1,1] left→right, v ∈ [0,1] near→far. y=0 is the top of the board,
// which is the BACK of the room, hence the inversion.
export function toRoomCoord(x, y) {
  return { u: (x - 50) / 50, v: 1 - y / 100 };
}
export function fromRoomCoord(u, v) {
  return { x: u * 50 + 50, y: (1 - v) * 100 };
}

// ── FORWARD PROJECTION ─────────────────────────────────────────────────────
// logical (x, y) → screen (sx, sy) plus the two independent scale factors.
// `sy` is the table's FLOOR point — where it touches the ground, not where
// its top face is drawn.
export function projectFloorPoint(x, y, geom) {
  const { u, v } = toRoomCoord(x, y);
  const { PK_ROOM, PK_OBJ } = geom.tokens;
  const sRoom = 1 / (1 + v * PK_ROOM);
  const sObj = 1 / (1 + v * PK_OBJ);
  return {
    sx: geom.cx + u * geom.halfW * sRoom,
    sy: geom.yFront - geom.depth * ((v * (1 + PK_ROOM)) / (1 + v * PK_ROOM)),
    sRoom,
    sObj,
    v,
    u,
  };
}

// ── INVERSE PROJECTION ─────────────────────────────────────────────────────
// screen (sx, sy) → logical (x, y). Closed form, derived by solving the
// forward y map for v:
//   t = (yFront - sy) / depth  and  t = v(1+P)/(1+vP)
//   ⇒ v = t / (1 + P(1 - t))
// This is what keeps drag honest: the pointer moves in screen space, but what
// gets persisted is always the logical floor coordinate.
export function unprojectScreenPoint(sx, sy, geom) {
  const { PK_ROOM } = geom.tokens;
  const t = (geom.yFront - sy) / geom.depth;
  const denom = 1 + PK_ROOM * (1 - t);
  const v = denom === 0 ? 0 : t / denom;
  const sRoom = 1 / (1 + v * PK_ROOM);
  const u = (sx - geom.cx) / (geom.halfW * sRoom);
  return fromRoomCoord(u, v);
}

// ── Per-table derived geometry ─────────────────────────────────────────────
// One call gives the renderer and the interaction overlay the SAME numbers,
// which is what guarantees the hit target sits exactly on the visible table.
export function tableGeometry(table, geom) {
  const t = geom.tokens;
  const p = projectFloorPoint(table.x, table.y, geom);
  const R = geom.R * p.sObj;
  const lift = R * t.LIFT;
  const isRound = table.shape === "round";
  const halfW = isRound ? R : (R * t.RECT_ASPECT) / 2;
  const halfH = halfW * t.K;
  return {
    ...p,
    R,
    lift,
    thickness: R * t.THICKNESS,
    isRound,
    // the floor point the table stands on
    floorX: p.sx,
    floorY: p.sy,
    // centre of the drawn top face
    topX: p.sx,
    topY: p.sy - lift,
    halfW,
    halfH,
    // how far back in the room this table is, 0 (near) .. 1 (far) — drives
    // both the depth veil and the paint order
    depth: p.v,
  };
}

// ── Hit target ─────────────────────────────────────────────────────────────
// Deliberately covers the table AND its chairs — a tap on a chair belonging
// to Mesa 5 must open Mesa 5 — but deliberately NOT the light pool, which is
// atmosphere rather than a control. Returned in board-relative px.
export function tableFootprint(table, geom) {
  const g = tableGeometry(table, geom);
  const t = geom.tokens;
  // centred between the floor point and the top face, so the box hugs the
  // whole visible object rather than hanging off one end of it
  const cy = g.topY + g.lift * 0.35;
  let halfW = g.halfW * t.FOOT_W + g.R * 0.1;
  const baseHalfH = g.halfH * t.FOOT_W + g.lift * 0.6 + g.R * 0.1;
  let top = cy - baseHalfH;
  let bottom = cy + baseHalfH;
  // ...then grown, never shrunk, until it contains every chair the renderer
  // actually draws. Deriving the target from the drawn content rather than
  // from a hand-tuned constant is what makes "a tap on a chair opens its own
  // Mesa" true BY CONSTRUCTION: change the seat templates, the tuck, the
  // backrest, and the target follows on its own instead of silently falling
  // behind the art.
  //
  // HORIZONTAL growth is symmetric about the table's own centre even when the
  // seat template is not (a 3-seat rectangle has no chair on one side): an
  // off-centre box would move the control sideways off the table it draws,
  // which is exactly the target shift the pointer contract forbids, so the
  // wider side wins and centerX stays on topX.
  // VERTICAL growth is per-edge. A far chair's backrest rises above the table
  // and nothing at all sits below the near chairs, so mirroring the top
  // extension downward would only pad empty floor — and that padding is what
  // pushes a target into the table in FRONT of it, making two Mesas ambiguous.
  // The box hugs the drawn content instead.
  chairPlacements(table, geom).forEach((chair) => {
    halfW = Math.max(halfW, Math.abs(chair.left - g.topX), Math.abs(chair.right - g.topX));
    top = Math.min(top, chair.top);
    bottom = Math.max(bottom, chair.bottom);
  });
  return {
    left: g.topX - halfW,
    top,
    width: halfW * 2,
    height: bottom - top,
    centerX: g.topX,
    centerY: (top + bottom) / 2,
  };
}

// ── Paint order ────────────────────────────────────────────────────────────
// Far tables first so near ones occlude them. Ties break on table number so
// the order is deterministic across renders and across API response order.
export function depthSorted(tables) {
  return tables
    .map((table, index) => ({ table, index }))
    .sort((a, b) => {
      const dv = a.table.y - b.table.y; // smaller y = further back = painted first
      if (dv !== 0) return dv;
      return Number(a.table.number) - Number(b.table.number);
    })
    .map((entry) => entry.table);
}

// ── Chairs: the seat TEMPLATES ─────────────────────────────────────────────
// Chair COUNT is the authoritative table capacity — `tables.capacity`, the
// "Capacidad máxima" the room editor writes and validates as an integer
// 1..99. It is deliberately NOT the session's `coversTotal` (how many people
// are seated right now): those are two different concepts and the floor must
// keep showing what a table SEATS even while it is empty. That is why the
// upper bound here is the domain's own 99 and not some smaller renderer
// convenience number — chair count equals capacity, with no clamp of our own
// invention silently breaking the promise on a large table. Realistic tables
// are 1..8 and those are the cases the patterns below are art-directed for;
// above that the same deterministic rules simply keep going.
//
// THESE ARE TEMPLATES, NOT A DISTRIBUTION FUNCTION.
// The point of the correction this file is part of: running N chairs through
// a generic radial spread produces a mathematically even but visually
// arbitrary result — chairs land wherever the arithmetic puts them, at angles
// that mean nothing, and the eye reads scatter rather than "this table seats
// four". Each supported count instead gets a stated geometric intent:
//
//   ROUND     2 → two opposing chairs, 180° apart
//             3 → an equilateral triangle, 120° apart
//             4 → the four cardinal positions (a square cross)
//             5 → a regular pentagon
//             6 → a regular hexagon
//             n → the regular n-gon, always with a seat at the FAR side
//                 first, so the pattern is anchored rather than free-floating
//
//   RECT      1 → one long side
//   (square/  2 → the two OPPOSING long sides, never two adjacent ones
//   rectangle 3 → three sides occupied (both long sides + one short)
//   /-long)   4 → exactly one chair per side — a square table with four seats
//             5+ → one chair on each SHORT side, the remainder spread evenly
//                 along the two long sides (so 6 = 2+2 long, 1+1 short)
//
// Returns unit offsets {dx, dy} in floor space, plus `angle` for the round
// family. INVARIANT for the rectangular family: exactly one of dx/dy has
// magnitude 1, and that component names the side the chair sits on — which is
// what lets chairPlacements orient the backrest outward without needing a
// separate side field (a chair halfway along the top edge still faces up, not
// diagonally). Asserted in hybridScene.test.js.
//
// Chairs are scenery only — they never become interactive entities of their
// own (see tableFootprint: one target covers the table and all its chairs).
export function chairSlots(shape, capacity) {
  const n = Number(capacity);
  if (!Number.isFinite(n) || n <= 0) return [];
  // Clamp at the DOMAIN's own maximum, not at an arbitrary visual limit, so
  // "chair count == capacity" holds for every value the editor can store.
  const count = Math.min(99, Math.round(n));
  if (count <= 0) return [];

  if (shape === "round") {
    // The regular n-gon, phase-anchored with the first seat at the far side.
    // Anchoring is what makes the pattern legible: 2 reads as an axis, 4 as a
    // cross, 6 as a hexagon — the same n chairs at a rolling offset would
    // read as n dots.
    // Math.cos(-PI/2) is 6.1e-17, not 0. Left alone that noise makes a
    // "cardinal" seat very slightly off-axis, and worse, it vanishes entirely
    // when added to a board-sized floor coordinate (float absorption) — so a
    // seat can end up with a non-zero facing normal and a zero offset, i.e. a
    // chair whose back points somewhere its body does not. Snapping is what
    // makes 4-up genuinely cardinal rather than cardinal-to-16-decimals.
    const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      out.push({ dx: snap(Math.cos(a)), dy: snap(Math.sin(a)), angle: a });
    }
    return out;
  }

  // rectangular family (square / rectangle / rectangle-long). TOP/BOTTOM are
  // the long sides (RECT_ASPECT makes the top face wider than it is deep),
  // LEFT/RIGHT the short ones.
  const TOP = { dx: 0, dy: -1 };
  const BOTTOM = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };
  if (count === 1) return [TOP];
  if (count === 2) return [TOP, BOTTOM];
  if (count === 3) return [TOP, BOTTOM, RIGHT];
  if (count === 4) return [TOP, RIGHT, BOTTOM, LEFT];

  // 5+: both short sides always keep exactly one chair, so the table never
  // reads as "seats only along the front and back"; everything else is spread
  // evenly along the two long sides, longer side first when the count is odd.
  const remaining = count - 2;
  const topCount = Math.ceil(remaining / 2);
  const bottomCount = remaining - topCount;
  const spread = (total) =>
    total === 1 ? [0] : Array.from({ length: total }, (_, i) => -0.62 + (i / (total - 1)) * 1.24);
  const out = [LEFT, RIGHT];
  spread(topCount).forEach((dx) => out.push({ dx, dy: -1 }));
  spread(bottomCount).forEach((dx) => out.push({ dx, dy: 1 }));
  return out;
}

// ── Chairs: the drawn GEOMETRY ─────────────────────────────────────────────
// One function turns a table's seat template into everything the renderer
// needs, so the chair math exists exactly once. Before this, the renderer
// carried its own inline `chairAt` and the hit-target test re-derived the same
// arithmetic independently — two copies that could drift apart, which is
// precisely how chairs end up looking detached from the Mesa they belong to.
//
// Each placement is expressed relative to the table's FLOOR point, so a chair
// is bound to its table by construction: whatever moves the table (a drag, a
// re-projection, a board resize) moves its chairs on the same frame, with no
// separate state to keep in step.
//
// `nx`/`ny` is the OUTWARD normal — the direction "away from the tabletop".
// The renderer puts the backrest on that side, which is the single biggest
// reason the previous chairs read as random: their backs were lifted up-screen
// regardless of which side of the table they sat on, so every near-side chair
// was drawn facing backwards.
// Backrest proportions: clearly NARROWER and TALLER than the seat.
// Matching the seat's own width — the first attempt at this — makes seat and
// back the same rounded box at phone size, so a chair renders as a featureless
// square with no cue as to which way it faces, and eight of them around a
// table are back to reading as scattered blocks. A narrow post rising from a
// wider seat is the silhouette that says "chair" at 20px: the seat shows past
// both edges of the back on a near-side chair (seen from behind) and the back
// stands clear above it on a far-side one (seen from the front). It also
// carries LESS visual mass than the wide version, which is the direction the
// hierarchy needs.
const CHAIR_BACK_W = 0.66;
const CHAIR_BACK_H = 1.35;

export function chairPlacements(table, geom) {
  const t = geom.tokens;
  const g = tableGeometry(table, geom);
  const slots = chairSlots(table.shape, table.capacity);
  const tuck = g.R * t.CHAIR_TUCK;
  const seat = g.R * t.CHAIR;

  return slots.map((slot, index) => {
    // Distance is measured from the table's own EDGE outward, which is what
    // keeps the visual gap identical on a round table and on the long side of
    // a rectangle instead of varying with the aspect ratio. The vertical
    // offset carries the floor's own foreshortening (× K) because the gap is
    // a distance ON THE FLOOR, not on the screen: without it the seat ring
    // stops being a circle in the room and the near/far chairs drift out.
    const x = g.floorX + slot.dx * (g.halfW + tuck);
    const groundY = g.floorY + slot.dy * (g.halfH + tuck * t.K);
    // The seat itself is drawn at seat height, not on the floor — see
    // CHAIR_LIFT. groundY stays available for the chair's own shadow.
    const y = groundY - g.R * t.CHAIR_LIFT;
    // Outward normal. Round: the seat angle itself. Rect: the unit component
    // names the side (see chairSlots' invariant).
    const nx = g.isRound ? slot.dx : (Math.abs(slot.dx) === 1 ? slot.dx : 0);
    const ny = g.isRound ? slot.dy : (Math.abs(slot.dy) === 1 ? slot.dy : 0);
    // Seats at the back of the table are marginally further from the camera
    // than seats at the front of the SAME table. Small and controlled — it is
    // what makes a ring read as a ring, and too much of it would fight the
    // deliberately gentle PK_OBJ falloff the room is built on.
    const scale = 1 + ny * t.CHAIR_DEPTH_TILT;
    const w = seat * scale;
    const h = w * t.K;
    // The backrest: a panel standing at the seat's OUTWARD edge and rising up
    // the screen. Its box is published here rather than left to the renderer
    // because the hit target is derived from it (see tableFootprint) — the
    // tappable area has to cover what is actually drawn, backrests included.
    const backW = w * CHAIR_BACK_W;
    const backH = h * CHAIR_BACK_H;
    const backX = x + nx * w * 0.5;
    const backBottom = y + ny * h * 0.5;
    return {
      key: `${index}`,
      x,
      y,
      w,
      h,
      nx,
      ny,
      groundY,
      backX,
      backW,
      backH,
      backBottom,
      // The full drawn extent of this chair, seat and backrest together.
      left: Math.min(x - w / 2, backX - backW / 2),
      right: Math.max(x + w / 2, backX + backW / 2),
      top: Math.min(y - h / 2, backBottom - backH),
      bottom: Math.max(groundY + h * 0.4, backBottom),
      // A chair whose seat sits at or above the table's floor point is behind
      // the tabletop and must be painted before it, so the table occludes it.
      behind: slot.dy < 0.12,
      scale,
    };
  });
}

// ── Measured characteristics, for tests and for the report ─────────────────
// Same-shape near/far scale delta across a given span of logical y. This is
// the number the design brief constrains to roughly 10–15%; asserting it in a
// test stops a future token tweak from quietly reintroducing far-table
// miniaturisation.
export function nearFarScaleDelta(geom, yNear = 87, yFar = 13) {
  const near = projectFloorPoint(50, yNear, geom).sObj;
  const far = projectFloorPoint(50, yFar, geom).sObj;
  return 1 - far / near;
}
