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
  Y_FRONT: 0.96,      // where the near edge of the floor sits
  DEPTH: 0.755,       // how much of the board height the floor spans

  // table sizing
  TABLE_R: 0.133,     // base top-face half-width, as a fraction of board width
  TABLE_R_MIN: 30,    // floor, in px, so a narrow board never miniaturises tables
  TABLE_R_MAX: 62,    // ceiling, so a tablet-width board doesn't grow absurd tables
  LIFT: 0.30,         // how far the top floats above its floor point (× R)
  THICKNESS: 0.135,   // tabletop thickness (× R). Thin on purpose: the free-3D
                      // concept's 0.42 is literally hockey-puck proportions.
  RECT_ASPECT: 1.86,  // square/rect top width as a multiple of R (round is 2.00)

  // chairs
  CHAIR: 0.46,        // chair size (× R)
  CHAIR_ORBIT_ROUND: 1.42,  // chair ring radius for round tables (× R)
  CHAIR_ORBIT_RECT: 1.22,   // chair distance from centre for rect-ish tables (× R)

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
  CHAIR_ALPHA: 1,     // chair prominence multiplier
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
  const halfW = g.halfW * t.FOOT_W + g.R * 0.1;
  const halfH = g.halfH * t.FOOT_W + g.lift * 0.6 + g.R * 0.1;
  // centred between the floor point and the top face, so the box hugs the
  // whole visible object rather than hanging off one end of it
  const cy = g.topY + g.lift * 0.35;
  return {
    left: g.topX - halfW,
    top: cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
    centerX: g.topX,
    centerY: cy,
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

// ── Chairs ─────────────────────────────────────────────────────────────────
// Chair COUNT is the authoritative table capacity, never a decorative
// constant and never inferred from the table's visual size. Placement follows
// the real shape: a round table seats around a circle, a rectangular one
// along its edges. Deterministic for a given (shape, capacity) pair.
//
// Returns unit offsets {dx, dy} in floor space; the renderer scales them by
// the chair orbit. Chairs are drawn as scenery only — they never become
// interactive entities of their own (see tableFootprint: one target covers
// the table and all its chairs).
export function chairSlots(shape, capacity) {
  const n = Number(capacity);
  if (!Number.isFinite(n) || n <= 0) return [];
  const count = Math.max(0, Math.min(12, Math.round(n)));
  if (count === 0) return [];

  if (shape === "round") {
    // evenly spaced, first chair at the far side — so capacity 2 gives two
    // balanced opposing chairs, capacity 4 gives four balanced ones
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      out.push({ dx: Math.cos(a), dy: Math.sin(a), angle: a });
    }
    return out;
  }

  // rectangular family (square / rectangle / rectangle-long)
  const TOP = { dx: 0, dy: -1 };
  const BOTTOM = { dx: 0, dy: 1 };
  const LEFT = { dx: -1, dy: 0 };
  const RIGHT = { dx: 1, dy: 0 };
  if (count === 1) return [TOP];
  if (count === 2) return [TOP, BOTTOM]; // opposing, never adjacent
  if (count === 3) return [TOP, BOTTOM, RIGHT];
  if (count === 4) return [TOP, RIGHT, BOTTOM, LEFT]; // one per logical side

  // 5+: keep one chair on each short side, distribute the rest evenly along
  // the two long sides
  const remaining = count - 2;
  const topCount = Math.ceil(remaining / 2);
  const bottomCount = remaining - topCount;
  const spread = (k, total) =>
    total === 1 ? [0] : Array.from({ length: total }, (_, i) => -0.52 + (i / (total - 1)) * 1.04);
  const out = [LEFT, RIGHT];
  spread(0, topCount).forEach((dx) => out.push({ dx, dy: -1 }));
  spread(0, bottomCount).forEach((dx) => out.push({ dx, dy: 1 }));
  return out;
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
