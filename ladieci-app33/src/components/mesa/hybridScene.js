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
//
// THE SECOND IDEA — THE CAMERA FRAMES THE TABLES, NOT THE COORDINATE SPACE
// -----------------------------------------------------------------------
// The logical floor is 0..100 in both axes, but no real room ever uses all of
// it: the live staging floor occupies y 13..70, so a camera that dutifully
// showed 0..100 spent ~30% of the phone's height rendering floor nobody ever
// put a table on, split into two dead bands the eye reads as wasted screen.
// `cameraFrame` therefore measures where the tables ACTUALLY are and maps that
// band onto a fixed, art-directed window of the room (FRAME_LO..FRAME_HI), so
// the composition lands identically whether the tables span 13..70 or 15..86.
// This is a camera, never a data migration: x/y stay exactly the logical
// coordinates the backend persists, `unprojectScreenPoint` inverts the framing
// exactly, and a drag therefore still saves the same number it always did.
// The frame is FROZEN for the duration of a drag (see TabMesa) so the camera
// cannot chase the table under the operator's finger.
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
  Y_FRONT: 0.985,     // where the near edge of the floor sits
  DEPTH: 0.885,       // how much of the board height the floor spans, i.e.
                      // wall = Y_FRONT - DEPTH = 10% of the board.
                      // ART DIRECTION RECOVERY — was 0.80 against Y_FRONT
                      // 0.965, i.e. a 16.5% wall. On a phone that band sits
                      // directly under an already-dark service header, so the
                      // two merged into one ~175px block of black across the
                      // top fifth of the screen — the single loudest piece of
                      // the "vertically stretched, too much dead space" read.
                      // 10% is enough for the wall to read as a wall, and the
                      // framed camera below now parks the farthest tables
                      // against it, which is what a real room looks like:
                      // furniture in front of a wall, not furniture below a
                      // void. Purely framing — PK_ROOM/PK_OBJ are untouched.

  // camera framing — see cameraFrame() and the header note
  FRAME_LO: 0.06,     // where the NEAREST table's depth lands in the room
  FRAME_HI: 0.93,     // where the FARTHEST table's depth lands
                      // Both are chosen so the tables' full drawn extent
                      // (cast shadow below the near row, backrests above the
                      // far row) lands inside the board with a hair to spare
                      // at phone size — the room keeps a little floor in
                      // front and a little behind, and nothing clips.
                      // The residual margins are deliberately NOT equal: the
                      // near floor is foreground and wants a little more room
                      // than the back wall, which is a backdrop. Measured at
                      // 390×844 this leaves ~26px above the far row and ~38px
                      // below the near one, against the 76/41 the unframed
                      // camera left — and against a wall band that was
                      // formerly 109px of pure black.
  FRAME_MIN_SPAN: 0.34, // floor on how narrow a band the camera will zoom
                      // into, in v units. Without it, a room whose tables all
                      // sit on one line would zoom until two tables filled
                      // the phone; with it, a tight layout simply keeps some
                      // honest empty floor around itself.

  // table sizing
  TABLE_R: 0.133,     // base top-face half-width, as a fraction of board width
  TABLE_R_MIN: 30,    // floor, in px, so a narrow board never miniaturises tables
  TABLE_R_MAX: 62,    // ceiling, so a tablet-width board doesn't grow absurd tables
  LIFT: 0.30,         // how far the top floats above its floor point (× R)
  THICKNESS: 0.135,   // tabletop thickness (× R). Thin on purpose: the free-3D
                      // concept's 0.42 is literally hockey-puck proportions.
  RECT_ASPECT: 1.86,  // square/rect top width as a multiple of R (round is 2.00)

  // chairs — see chairSlots (the templates) and chairPlacements (the geometry)
  SEATS_EXACT_MAX: 8, // the largest capacity drawn as an EXACT seat count.
                      // Above it the chairs become a representative physical
                      // cue and `máx N` alone carries the number — see
                      // chairSlots for why 8 and not some larger figure.
  CHAIR: 0.48,        // seat width (× R). ART DIRECTION RECOVERY — was 0.40,
                      // which at phone size is a 20px mark: too small to
                      // carry any silhouette, so eight of them read as dark
                      // blobs on the floor rather than as seats. 0.48 gives
                      // ~24px, enough for a seat, a back and a lit top rail
                      // to be separately legible, while still leaving the
                      // chair under a quarter of the tabletop's width so the
                      // hierarchy (table first) is unchanged. 0.54 was tried
                      // first and overshot: the chairs started competing with
                      // the tabletop for the eye, which is the failure mode
                      // in the opposite direction.
  CHAIR_TUCK: 0.05,   // distance from the table's own EDGE to the chair
                      // centre (× R) — NOT a ring radius from the centre.
                      // Measuring from the edge is what makes a chair sit the
                      // same distance from a round table and from the long
                      // side of a rectangle, so one number art-directs both.
                      // ART DIRECTION RECOVERY — was 0.17, which parked the
                      // seat just outside the table. At 0.05 the seat is
                      // genuinely UNDER the tabletop's edge and the table
                      // overlaps it, which is the cue that says "these chairs
                      // belong to this table" without any other mark. It also
                      // costs nothing: pulling the seats in by 0.12·R while
                      // growing them by 0.14·R leaves the chair ring very
                      // slightly TIGHTER than before, so neighbouring hit
                      // targets did not grow.
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
  DEPTH_VEIL: 0.17,   // how much darker the farthest table sits vs the nearest.
                      // Was 0.28 — combined with the framed camera pushing the
                      // far row right up against the wall, that much veil
                      // crushed the back tables into the wall tone and cost
                      // the room its depth instead of creating it.
  POOL_R: 2.35,       // floor light pool radius (× R)
  POOL_PEAK: 0.44,    // pool alpha at its centre. Lowered with POOL_R because
                      // AMBIENT below now carries the room's base light, so
                      // the per-table pools no longer have to be the ONLY lit
                      // thing on an otherwise black floor.
  AMBIENT: 0.085,     // room-wide warm floor wash. The recovered "room
                      // presence": without it the only lit floor is directly
                      // under a table, so tables read as objects floating in
                      // a void rather than as furniture standing in a room.
                      // Kept LOW on purpose — 0.13 was tried and flattened
                      // the room into an even beige haze, which loses the
                      // "dark room, pendants over the tables" reading the
                      // whole concept rests on. It is a floor, not a fill
                      // light: enough that the floor between tables is
                      // legibly a floor, not enough to compete with a pool.
  RIM: 0.86,          // state reveal intensity
  FACE_TINT: 0.42,    // state tint over the tabletop material. Deliberately
                      // modest: the brighter tabletop material makes the tint
                      // read much more strongly than it used to, and warm
                      // stone under a green tint at any real strength is
                      // exactly the "khaki tables" the redesign set out to
                      // kill. The state is carried by the RIM, which is a
                      // pure hue on a neutral face and reads instantly.
  GRID: 0.055,        // floor grid line opacity
  CHAIR_ALPHA: 0.9,   // chair prominence multiplier. Was 0.82, on top of an
                      // almost-black chair material — the two together are
                      // what made the seats vanish. The hierarchy (table >
                      // number > state > capacity > chairs) is now held by
                      // SIZE and by the chair material sitting a clear step
                      // below the tabletop's own value, which is how a real
                      // room does it, rather than by fading the furniture
                      // out.
};

// ── The camera frame ───────────────────────────────────────────────────────
// Which band of the logical floor the room is actually pointed at, expressed
// in v (0 = the front of the logical floor, 1 = the back). FULL_FRAME is the
// whole coordinate space and is the default everywhere, so any call site that
// does not care about framing — every existing test, every non-Hybrid path —
// behaves as if this feature did not exist.
export const FULL_FRAME = { vMin: 0, vMax: 1 };

// Measures where the tables ACTUALLY are. Returns a v band, deliberately
// unclamped: it names the content to frame, not a region of the floor, and
// clamping it would reintroduce exactly the dead margin it exists to remove.
export function cameraFrame(tables, tokens = HYBRID_TOKENS) {
  const ys = (tables || []).map((t) => Number(t && t.y)).filter((y) => Number.isFinite(y));
  if (ys.length === 0) return FULL_FRAME;
  let vMin = 1 - Math.max(...ys) / 100; // the NEAREST table (largest y)
  let vMax = 1 - Math.min(...ys) / 100; // the FARTHEST table (smallest y)
  const span = vMax - vMin;
  if (span < tokens.FRAME_MIN_SPAN) {
    // Widen about the content's own centre rather than about the room's, so a
    // cluster of tables at the back of the floor stays at the back.
    const mid = (vMin + vMax) / 2;
    vMin = mid - tokens.FRAME_MIN_SPAN / 2;
    vMax = mid + tokens.FRAME_MIN_SPAN / 2;
  }
  return { vMin, vMax };
}

// ── Room geometry for a given board box ────────────────────────────────────
// Everything downstream derives from this, so a board of any size produces a
// coherent room without per-call-site arithmetic.
export function sceneGeometry(width, height, tokens = HYBRID_TOKENS, frame = FULL_FRAME) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const R = Math.min(
    tokens.TABLE_R_MAX,
    Math.max(tokens.TABLE_R_MIN, w * tokens.TABLE_R)
  );
  const vMin = Number.isFinite(frame && frame.vMin) ? frame.vMin : 0;
  const vMax = Number.isFinite(frame && frame.vMax) ? frame.vMax : 1;
  // Guarded so a degenerate frame can never produce an infinite k and, through
  // it, a NaN screen coordinate or a non-invertible drag.
  const span = Math.max(1e-6, vMax - vMin);
  return {
    width: w,
    height: h,
    cx: w / 2,
    halfW: w * tokens.HALF_W,
    yFront: h * tokens.Y_FRONT,
    depth: h * tokens.DEPTH,
    horizon: h * tokens.Y_FRONT - h * tokens.DEPTH,
    R,
    frame: { vMin, vMax, lo: tokens.FRAME_LO, hi: tokens.FRAME_HI,
      k: (tokens.FRAME_HI - tokens.FRAME_LO) / span },
    tokens,
  };
}

// ── The framing map, and its exact inverse ─────────────────────────────────
// An affine map on v, so it is monotonic (the near/far ORDER of two tables can
// never be swapped by framing) and trivially invertible (a drag round-trips to
// the byte). Everything downstream — perspective, table scale, the grid —
// consumes the FRAMED v, so the room is internally consistent rather than
// being a correct room with the tables slid around inside it.
export function frameDepth(v, geom) {
  const f = geom.frame || { lo: 0, k: 1, vMin: 0 };
  return f.lo + (v - f.vMin) * f.k;
}
export function unframeDepth(vf, geom) {
  const f = geom.frame || { lo: 0, k: 1, vMin: 0 };
  return f.vMin + (vf - f.lo) / f.k;
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
  const { u, v: raw } = toRoomCoord(x, y);
  const { PK_ROOM, PK_OBJ } = geom.tokens;
  // The camera's framing is applied FIRST and everything else reads the framed
  // depth, so a framed room is a real room seen from a real place rather than
  // a room with its contents displaced inside it.
  const v = frameDepth(raw, geom);
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
  // v here is the FRAMED depth — the room's own. Undo the camera framing last,
  // in the exact reverse of projectFloorPoint, so what a drag persists is the
  // logical coordinate and never the coordinate the camera happened to show.
  return fromRoomCoord(u, unframeDepth(v, geom));
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
// Chair count derives from the authoritative table capacity — `tables.capacity`,
// the "Capacidad máxima" the room editor writes and validates as an integer
// 1..99. It is deliberately NOT the session's `coversTotal` (how many people
// are seated right now): those are two different concepts and the floor must
// keep showing what a table SEATS even while it is empty.
//
// THE PRODUCT RULE (revised — this replaces "chair count == capacity always")
// --------------------------------------------------------------------------
//   capacity 1..SEATS_EXACT_MAX (8)  → EXACT. N chairs, in the art-directed
//                                      pattern for N.
//   capacity 9..99                   → REPRESENTATIVE. The table is drawn
//                                      fully seated at SEATS_EXACT_MAX and
//                                      `máx N` alone carries the number.
//
// Why a threshold at all: the old invariant was rigid past the point of being
// useful. A 20-cover table drawn with twenty seats at phone size is a fringe
// of overlapping marks — the chairs stop being furniture and become texture,
// and the table they surround gets harder to read, not easier. Chairs are part
// of the room's visual language; `máx N` is the capacity readout, and it is
// right there on the tabletop.
//
// Why 8 specifically, and not 6 or 12 — it is the largest count that still
// fits BOTH families cleanly at the real phone size (R≈49px):
//   • round: 8 seats on the ring have ~45px of arc each for a ~27px seat.
//   • rectangle: the 5+ template puts one seat on each short side and splits
//     the rest along the two long sides. The long side is ~91px, so it holds
//     three ~27px seats (81px) and no more — 3+3+1+1 = 8 is exactly where a
//     rectangle runs out of edge. At 10 the long sides would need four each
//     and the seats would visibly overlap.
// So 8 is not a taste call, it is where the geometry stops working.
//
// THE INVARIANT THIS PRESERVES: the visual must never obviously contradict an
// obvious capacity. Every capacity a human reads at a glance — a 2-top, a
// 3-top, a 4-top, a 6-top — is still drawn exactly, so a 2-cover table can
// never look like a 4-cover one. Only capacities past the point where nobody
// counts chairs anyway become representative. Asserted in hybridScene.test.js.
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
export function chairSlots(shape, capacity, tokens = HYBRID_TOKENS) {
  const n = Number(capacity);
  if (!Number.isFinite(n) || n <= 0) return [];
  // Exact up to the threshold, representative above it — see the rule above.
  const count = Math.min(tokens.SEATS_EXACT_MAX, Math.round(n));
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
// Backrest proportions. ART DIRECTION RECOVERY — the previous pass answered
// "chairs look scattered" by shrinking the back to a narrow 0.66 post, and
// overshot: a 13px dark post on a 20px dark seat is not a chair silhouette,
// it is a smudge, which is the "tiny dark blobs / physical-table effect
// weakened" the human inspection then reported.
// A real chair's back spans most of its seat. 0.80 keeps a visible margin of
// seat showing past both edges — the cue that a near-side chair is being seen
// from BEHIND — while giving the back enough width to carry the lit top rail
// that does the actual work of saying "chair" at this size. The height comes
// down with it (1.35 → 1.05) because the tall version read as a bollard; a
// back a little taller than the seat is deep, and the rail sells the rest.
const CHAIR_BACK_W = 0.80;
const CHAIR_BACK_H = 1.05;

// How square the seat is drawn. The brief asks the chairs to reinforce the
// table's own character, and this is the cheapest honest way to do it: the
// bentwood-ish seats around a round table are nearly circular, the ones at a
// rectangle are squarer. Same primitive, same code path, two silhouettes.
const CHAIR_RADIUS_ROUND = 0.46;
const CHAIR_RADIUS_RECT = 0.22;

export function chairPlacements(table, geom) {
  const t = geom.tokens;
  const g = tableGeometry(table, geom);
  const slots = chairSlots(table.shape, table.capacity, t);
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
      // Corner radius of the seat, in px, so the renderer draws the shape the
      // geometry decided rather than deciding it a second time itself.
      radius: w * (g.isRound ? CHAIR_RADIUS_ROUND : CHAIR_RADIUS_RECT),
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
// Same-shape near/far scale delta across the depth band the camera actually
// FRAMES — the front row against the back row, which is the only near/far
// comparison an operator ever makes. This is the number the design brief
// constrains to roughly 10–15%; asserting it in a test stops a future token
// tweak from quietly reintroducing far-table miniaturisation.
//
// It reads the frame's own endpoints rather than two hardcoded logical y
// values, and is therefore layout-independent by construction: a room whose
// tables sit in y 13..70 and one whose tables sit in y 15..86 are framed the
// same way and so must report the same near/far spread. Measuring at fixed
// logical y instead would report a different — and meaningless — number for
// every restaurant floor plan.
export function nearFarScaleDelta(geom) {
  const { PK_OBJ } = geom.tokens;
  const f = geom.frame || { lo: 0, hi: 1 };
  const near = 1 / (1 + f.lo * PK_OBJ);
  const far = 1 / (1 + f.hi * PK_OBJ);
  return 1 - far / near;
}
