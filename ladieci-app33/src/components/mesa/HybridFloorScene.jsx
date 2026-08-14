import { memo } from "react";
import {
  HYBRID_TOKENS, projectFloorPoint, tableGeometry, depthSorted, chairPlacements,
} from "./hybridScene";

// ===============================================================
// MESA HYBRID 3D — the visual scene.
//
// Draws the room and the table bodies. It owns NO Mesa domain state: every
// table it renders arrives as a already-derived "visual" descriptor built by
// TabMesa from the same STATUS/tableState/tableBorder functions the existing
// renderer uses. This component cannot make a table look occupied that the
// domain does not consider occupied, because it never asks the question — it
// is a projection of an answer.
//
// It is also entirely non-interactive: the whole <svg> is pointer-events:none
// and the real controls are the DOM buttons TabMesa lays over it. That is
// what keeps chairs from becoming their own click targets and keeps the
// accessible surface exactly one <button> per Mesa, as it is today.
//
// PERFORMANCE
// -----------
// The isolated design prototype leaned on per-element feGaussianBlur for every
// shadow — roughly twenty filter passes per frame, which is far too expensive
// to have running behind a drag on a phone. Every one of those is a radial
// gradient here instead: visually equivalent at these sizes, and zero filter
// work. The single remaining filter is one feTurbulence rasterised into a
// 128px tile and repeated as a pattern, so the floor grain costs one small
// raster once rather than a full-board turbulence per paint. Gradients are
// declared in objectBoundingBox units so a fixed number of defs serves any
// number of tables.
// ===============================================================

const T = HYBRID_TOKENS;

// state key -> the colours the face tint and the floor bounce use. The rim
// colour is passed in separately because it carries a DIFFERENT signal (an
// occupied table whose comanda has reached Cocina keeps its occupied face but
// gets a green rim) — that dual-signal semantic already exists and must not
// be collapsed here.
const STATE_INK = {
  free: { tint: "#1d3a2a", glow: "#3EDC85" },
  reserved: { tint: "#3a2f18", glow: "#F2BE4C" },
  occupied: { tint: "#3d211c", glow: "#FF6E5C" },
};

export const hybridSceneCss = `
.mesa-scene{position:absolute;inset:0;pointer-events:none;z-index:0}
.mesa-board.hybrid{background:#0a0807}
.mesa-board.hybrid:before{display:none}
/* The tile stops being the drawing and becomes purely the control: the scene
   behind it draws the object, this stays an invisible, correctly-placed
   target that still carries the number, the capacity and the badge. */
.mesa-table.hybrid{background:none!important;border:none!important;box-shadow:none!important;
  padding:0;transform:none;z-index:1;overflow:visible;display:block}
.mesa-table.hybrid:hover{filter:none;box-shadow:none!important}
.mesa-table.hybrid:active{transform:none}
.mesa-table.hybrid::before,.mesa-table.hybrid::after{display:none}
.mesa-table.hybrid.opening{opacity:.5}
.mesa-table.hybrid .mesa-hybrid-label{position:absolute;left:0;right:0;display:flex;
  flex-direction:column;align-items:center;justify-content:center;gap:1px;transform:translateY(-50%);
  pointer-events:none}
.mesa-table.hybrid .mesa-number{text-shadow:0 2px 5px rgba(0,0,0,.75)}
.mesa-table.hybrid .mesa-capacity{color:#ddd0b8;opacity:.8;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.mesa-table.hybrid .mesa-badge{z-index:3}
@keyframes mesa-hybrid-ready{0%,100%{opacity:.25}50%{opacity:.9}}
.mesa-scene .ready-halo{animation:mesa-hybrid-ready 1.35s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.mesa-scene .ready-halo{animation:none;opacity:.7}}
`;

// ── shared defs — a fixed number regardless of how many tables exist ────────
function SceneDefs() {
  return <defs>
    <filter id="m3dNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="11" result="n" />
      <feColorMatrix in="n" type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="linear" slope=".5" intercept=".25" />
        <feFuncG type="linear" slope=".5" intercept=".25" />
        <feFuncB type="linear" slope=".5" intercept=".25" />
        <feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>
    </filter>
    {/* one small tile, rasterised once, repeated — instead of turbulence over the whole floor */}
    <pattern id="m3dGrain" width="128" height="128" patternUnits="userSpaceOnUse">
      <rect width="128" height="128" filter="url(#m3dNoise)" />
    </pattern>

    <linearGradient id="m3dFloor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#130f0a" /><stop offset="26%" stopColor="#16110c" />
      <stop offset="68%" stopColor="#120e07" /><stop offset="100%" stopColor="#0a0806" />
    </linearGradient>
    <linearGradient id="m3dWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#070605" /><stop offset="52%" stopColor="#0e0b09" />
      <stop offset="100%" stopColor="#1a140f" />
    </linearGradient>
    {/* the pendant light reaching the back wall — what turns the wall band
        from a black bar under the header into the back of a lit room */}
    <radialGradient id="m3dWallGlow" cx="50%" cy="100%" r="72%">
      <stop offset="0%" stopColor="rgba(255,206,150,.20)" />
      <stop offset="52%" stopColor="rgba(255,206,150,.07)" />
      <stop offset="100%" stopColor="rgba(255,206,150,0)" />
    </radialGradient>
    {/* a single wall sconce's bloom — see HybridRoom */}
    <radialGradient id="m3dSconce" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="rgba(255,199,133,.42)" />
      <stop offset="34%" stopColor="rgba(255,193,128,.17)" />
      <stop offset="70%" stopColor="rgba(255,188,124,.05)" />
      <stop offset="100%" stopColor="rgba(255,188,124,0)" />
    </radialGradient>
    {/* AMBIENT: the room's own base light on the floor. Without this the only
        lit floor is directly under a table and the tables read as objects
        floating in a void — the single biggest loss of "room presence". */}
    <radialGradient id="m3dAmbient" cx="50%" cy="30%" r="64%">
      <stop offset="0%" stopColor="rgba(255,198,138,1)" />
      <stop offset="40%" stopColor="rgba(255,190,132,.5)" />
      <stop offset="74%" stopColor="rgba(255,182,126,.13)" />
      <stop offset="100%" stopColor="rgba(255,182,126,0)" />
    </radialGradient>
    <radialGradient id="m3dVig" cx="50%" cy="44%" r="78%">
      <stop offset="0%" stopColor="rgba(0,0,0,0)" /><stop offset="58%" stopColor="rgba(0,0,0,0)" />
      <stop offset="100%" stopColor="rgba(0,0,0,.6)" />
    </radialGradient>
    <linearGradient id="m3dHorizon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="rgba(240,192,133,0)" />
      <stop offset="50%" stopColor="rgba(240,192,133,.34)" />
      <stop offset="100%" stopColor="rgba(240,192,133,0)" />
    </linearGradient>

    {/* warm pendant pool on the floor — a gradient, never a blur */}
    <radialGradient id="m3dPool" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="rgb(255,205,148)" stopOpacity={T.POOL_PEAK} />
      <stop offset="24%" stopColor="rgb(255,205,148)" stopOpacity={T.POOL_PEAK * 0.6} />
      <stop offset="48%" stopColor="rgb(255,205,148)" stopOpacity={T.POOL_PEAK * 0.24} />
      <stop offset="74%" stopColor="rgb(255,205,148)" stopOpacity={T.POOL_PEAK * 0.07} />
      <stop offset="100%" stopColor="rgb(255,205,148)" stopOpacity="0" />
    </radialGradient>
    {/* cast + contact shadow, also gradients */}
    <radialGradient id="m3dCast" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="#000" stopOpacity=".78" />
      <stop offset="52%" stopColor="#000" stopOpacity=".46" />
      <stop offset="100%" stopColor="#000" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="m3dContact" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor="#000" stopOpacity=".92" />
      <stop offset="58%" stopColor="#000" stopOpacity=".6" />
      <stop offset="100%" stopColor="#000" stopOpacity="0" />
    </radialGradient>

    {/* tabletop material — one warm stone for every state */}
    <radialGradient id="m3dTop" cx="44%" cy="28%" r="76%">
      <stop offset="0%" stopColor="#b89670" /><stop offset="28%" stopColor="#836a4a" />
      <stop offset="60%" stopColor="#4a392a" /><stop offset="86%" stopColor="#2c2118" />
      <stop offset="100%" stopColor="#1d1610" />
    </radialGradient>
    <linearGradient id="m3dSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#3b2e21" /><stop offset="48%" stopColor="#1e1510" />
      <stop offset="82%" stopColor="#170f0b" /><stop offset="100%" stopColor="#553a23" />
    </linearGradient>
    <radialGradient id="m3dSpec" cx="42%" cy="24%" r="54%">
      <stop offset="0%" stopColor="rgba(255,238,212,.2)" />
      <stop offset="100%" stopColor="rgba(255,238,212,0)" />
    </radialGradient>

    {/* CHAIR MATERIAL. The previous chairs were near-black (#241a10 seat on a
        #150f09 back) and then multiplied by CHAIR_ALPHA .82, on a floor that
        is itself lit warm — so every seat was a hole punched in the light
        rather than a piece of furniture standing in it. These are lit by the
        same pendants as the tabletop, one clear value step below it, which is
        what lets a chair read at 27px while still sitting under the table in
        the hierarchy. */}
    <linearGradient id="m3dSeat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#54422e" /><stop offset="46%" stopColor="#382b1e" />
      <stop offset="100%" stopColor="#1f1710" />
    </linearGradient>
    <linearGradient id="m3dChairBack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#463726" /><stop offset="38%" stopColor="#2a2016" />
      <stop offset="100%" stopColor="#17110b" />
    </linearGradient>

    {Object.entries(STATE_INK).map(([key, ink]) => <g key={key}>
      {/* under-edge reveal washing the stone */}
      <radialGradient id={`m3dUnder-${key}`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={ink.glow} stopOpacity=".24" />
        <stop offset="55%" stopColor={ink.glow} stopOpacity=".11" />
        <stop offset="100%" stopColor={ink.glow} stopOpacity="0" />
      </radialGradient>
    </g>)}
  </defs>;
}

// ── the room: wall, floor, converging grid, vignette ───────────────────────
// Memoized on size only, so a drag re-renders the six tables and not the room.
// The grid is drawn in the FRAMED room, i.e. its vanishing lines converge on
// the same horizon the tables stand on. It is what carries the room's
// perspective in the regions no table happens to occupy.
const HybridRoom = memo(function HybridRoom({ geom }) {
  const { width: w, height: h, horizon } = geom;
  const floorTop = horizon + 3;
  const floorH = Math.max(0, h - floorTop);

  // THE FLOOR IS TILED, not gridded. The reference concept's single biggest
  // "this is a physical room" cue is a real tiled floor receding to the
  // horizon — seven faint lines read as a technical grid, a proper tile field
  // reads as a floor. Denser across, denser in depth, and each run fades with
  // distance so the far end dissolves instead of stopping at a hard edge.
  const lines = [];
  for (let i = -5; i <= 5; i += 1) {
    const u = i / 3.4;
    const a = projectFloorPoint(u * 50 + 50, 100, geom);
    const b = projectFloorPoint(u * 50 + 50, 0, geom);
    // outer runs sit further into the room's shadow than the central ones
    const fade = 1 - Math.abs(i) / 8.5;
    lines.push(<line key={`v${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} opacity={T.GRID * fade} />);
  }
  for (let v = 0.03, k = 0; v < 1.02; v += 0.088, k += 1) {
    const a = projectFloorPoint(50, (1 - v) * 100, geom);
    lines.push(<line key={`h${k}`} x1={0} y1={a.sy} x2={w} y2={a.sy} opacity={T.GRID * (1 - v * 0.62)} />);
  }

  // Wall sconces. Also straight from the reference, and the cheapest possible
  // way to make the back wall read as a WALL rather than as the top edge of
  // the picture: a few warm sources at a believable height, each with its own
  // bloom. They live entirely above the horizon, so they can never collide
  // with a table wherever the operator drags one.
  const sconces = [0.18, 0.5, 0.82].map((fx, i) => {
    const x = w * fx;
    const y = horizon * 0.42;
    return <g key={`sc${i}`}>
      <ellipse cx={x} cy={y} rx={horizon * 0.72} ry={horizon * 0.52} fill="url(#m3dSconce)" />
      <rect x={x - w * 0.016} y={y - horizon * 0.1} width={w * 0.032} height={horizon * 0.2}
        rx={horizon * 0.05} fill="#e8c390" opacity=".5" />
    </g>;
  });

  return <g>
    <rect x="0" y="0" width={w} height={Math.max(0, horizon + 46)} fill="url(#m3dWall)" />
    {sconces}
    {/* light landing on the back wall, brightest where it meets the floor */}
    <rect x="0" y="0" width={w} height={Math.max(0, horizon + 6)} fill="url(#m3dWallGlow)" />
    <rect x="0" y={horizon - 8} width={w} height="18" fill="url(#m3dHorizon)" />
    <rect x="0" y={floorTop} width={w} height={floorH} fill="url(#m3dFloor)" />
    {/* the room's base light — see m3dAmbient */}
    <rect x="0" y={floorTop} width={w} height={floorH} fill="url(#m3dAmbient)" opacity={T.AMBIENT} />
    <g stroke="#ffeacb" strokeWidth=".7" fill="none">{lines}</g>
    <rect x="0" y={floorTop} width={w} height={floorH}
      fill="url(#m3dGrain)" opacity=".14" style={{ mixBlendMode: "overlay" }} />
  </g>;
});

// ── silhouettes: round and square stay genuinely different primitives ──────
function Silhouette({ g, cy, scale = 1, ...rest }) {
  const rx = g.halfW * scale;
  const ry = g.halfH * scale;
  if (g.isRound) return <ellipse cx={g.topX} cy={cy} rx={rx} ry={ry} {...rest} />;
  return <rect x={g.topX - rx} y={cy - ry} width={rx * 2} height={ry * 2}
    rx={g.R * 0.28 * scale} ry={g.R * 0.28 * T.K * scale} {...rest} />;
}

// ── one chair ──────────────────────────────────────────────────────────────
// Four marks: a ground wash, a seat, a backrest, and the backrest's lit top
// rail. The rail is the mark that does the work: at 27px a chair has no room
// for detail, and a single warm line where the pendant catches the top of the
// back is what makes the shape read as furniture instead of as a smudge. The
// previous version had it too, but at .55 over a near-black back inside a
// bright floor pool it never separated from the seat.
//
// The seat is a rounded rect, not an ellipse, and its corner radius comes from
// the table's own shape (p.radius, set in chairPlacements): almost circular at
// a round table, distinctly squarer at a rectangle. A ring of ellipses reads
// as dots; a ring of soft-cornered seats reads as chairs, and the difference
// between the two families is then visible from across the room.
//
// The backrest goes on the OUTWARD side (p.nx/p.ny from chairPlacements) and
// is painted before the seat for a far chair and after it for a near one, so
// a chair at the front of a table is seen from behind and one at the back is
// seen from the front. The old geometry lifted every backrest up-screen
// regardless of side, which drew every near-side chair facing backwards — the
// single largest contributor to the "thrown there randomly" read.
function Chair({ p }) {
  const { x, y, w, h, ny, groundY, backX, backW, backH, backBottom, radius } = p;
  const railH = Math.max(1.1, backH * 0.26);
  // One warm hairline around every part of the chair. Both the seat and the
  // back are brown, standing on a warm brown floor, inside a warm light pool —
  // at 24px that is not enough separation on its own, and the previous pass's
  // answer (paint the chair almost black) is what turned them into holes. An
  // edge light is how the eye actually finds a dark object in a lit room, and
  // it costs one stroke rather than a value the hierarchy cannot afford.
  const edge = { stroke: "#9c7f5b", strokeWidth: Math.max(0.45, w * 0.035), strokeOpacity: 0.26 };
  const back = <g>
    <rect x={backX - backW / 2} y={backBottom - backH} width={backW} height={backH}
      rx={backW * 0.26} ry={backW * 0.26} fill="url(#m3dChairBack)" {...edge} />
    {/* the top edge catches the pendant light — the one mark that keeps a
        near-side chair, whose back necessarily covers its own seat, reading as
        a chair seen from behind rather than a dark rounded blob */}
    <rect x={backX - backW / 2} y={backBottom - backH} width={backW} height={railH}
      rx={railH * 0.5} ry={railH * 0.5} fill="#b08f66" opacity=".46" />
  </g>;
  // The seat is ONE mark. An earlier attempt added a separate dark "front lip"
  // rect to sell its thickness; at this size it just split the seat into a
  // second block, so a far-side chair read as two stacked lozenges instead of
  // as one piece of furniture. The slab now reads from its own gradient.
  const seat = <rect x={x - w / 2} y={y - h / 2} width={w} height={h}
    rx={radius} ry={radius * T.K} fill="url(#m3dSeat)" {...edge} />;
  return <g opacity={T.CHAIR_ALPHA * (0.93 + ny * 0.07)} data-chair="1">
    {/* the shadow stays on the FLOOR while the seat is drawn at seat height,
        which is what grounds a lifted chair instead of floating it */}
    <ellipse cx={x} cy={groundY} rx={w * 0.52} ry={h * 0.42}
      fill="url(#m3dContact)" opacity=".3" />
    {/* far chair: back behind the seat. near chair: back between seat and
        viewer. Painting order is the whole difference between "facing the
        table" and "facing away from it". */}
    {ny < 0 ? <>{back}{seat}</> : <>{seat}{back}</>}
  </g>;
}

function HybridTable({ visual, geom }) {
  const g = tableGeometry(visual, geom);
  const ink = STATE_INK[visual.stateKey] || STATE_INK.free;
  // All chair arithmetic lives in hybridScene.chairPlacements — the renderer
  // no longer carries its own copy of it, which is what guarantees the chairs
  // the tests measure are the chairs the operator taps.
  const chairs = chairPlacements(visual, geom);
  const behind = chairs.filter((c) => c.behind);
  const front = chairs.filter((c) => !c.behind);
  const rimW = Math.max(1.1, g.R * 0.036);

  return <g opacity={visual.opening ? 0.5 : 1}
    data-table-id={visual.id} data-shape={visual.shape}
    data-state={visual.stateKey} data-rim={visual.rimColor}>
    {/* pendant pool, in the floor plane */}
    <ellipse cx={g.floorX} cy={g.floorY + g.R * 0.06}
      rx={g.R * T.POOL_R} ry={g.R * T.POOL_R * T.K} fill="url(#m3dPool)" />
    {/* state wash from the under-edge reveal */}
    <ellipse cx={g.floorX} cy={g.floorY} rx={g.R * 1.45} ry={g.R * 1.45 * T.K}
      fill={`url(#m3dUnder-${visual.stateKey})`} />
    {visual.ready && <ellipse className="ready-halo" cx={g.floorX} cy={g.floorY}
      rx={g.R * 1.7} ry={g.R * 1.7 * T.K} fill={`url(#m3dUnder-free)`} />}

    {behind.map((c) => <Chair key={`b${c.key}`} p={c} />)}

    {/* offset cast shadow — the cue that the top is raised off the floor */}
    <Silhouette g={g} cy={g.floorY + g.R * 0.24} scale={1.34} fill="url(#m3dCast)" />
    <Silhouette g={g} cy={g.floorY + g.R * 0.14} scale={1.06} fill="url(#m3dContact)" />

    {/* tabletop: thin side band, then the face */}
    <Silhouette g={g} cy={g.topY + g.thickness} fill="url(#m3dSide)" />
    <Silhouette g={g} cy={g.topY} fill="url(#m3dTop)" />
    <Silhouette g={g} cy={g.topY} fill="url(#m3dGrain)" opacity=".2" style={{ mixBlendMode: "overlay" }} />
    <Silhouette g={g} cy={g.topY} fill={ink.tint} opacity={T.FACE_TINT} style={{ mixBlendMode: "soft-light" }} />
    {/* the reveal bouncing back onto the lip */}
    <Silhouette g={g} cy={g.topY} scale={0.88} fill="none" stroke={visual.rimColor}
      strokeWidth={g.R * 0.15} opacity=".13" />
    {/* bevel */}
    <Silhouette g={g} cy={g.topY} fill="none" stroke="#f2dfc0" strokeWidth={Math.max(0.7, g.R * 0.02)} opacity=".16" />
    {/* State reveal: three strokes rather than a blurred duplicate. The widest
        is the bloom the reference concept reads as a lit edge — the previous
        two-stroke version drew a correct but thin outline, which is legible
        but not what gives a table its presence on a dark floor. */}
    <Silhouette g={g} cy={g.topY + g.thickness * 0.35} scale={0.99} fill="none"
      stroke={visual.rimColor} strokeWidth={rimW * 5} opacity={0.1 * T.RIM} />
    <Silhouette g={g} cy={g.topY + g.thickness * 0.35} scale={0.99} fill="none"
      stroke={visual.rimColor} strokeWidth={rimW * 2.4} opacity={0.26 * T.RIM} />
    <Silhouette g={g} cy={g.topY + g.thickness * 0.35} scale={0.99} fill="none"
      stroke={visual.rimColor} strokeWidth={rimW * 1.25} opacity={T.RIM} />
    <Silhouette g={g} cy={g.topY} scale={0.93} fill="url(#m3dSpec)" />

    {front.map((c) => <Chair key={`f${c.key}`} p={c} />)}

    {visual.selected && <Silhouette g={g} cy={g.topY} scale={1.1} fill="none"
      stroke="#f7f0df" strokeWidth={Math.max(2, g.R * 0.05)} opacity=".8" />}
    {/* depth by tone rather than by size — see hybridScene's header note */}
    {g.depth > 0.02 && <Silhouette g={g} cy={g.topY} scale={1.02} fill="#050403"
      opacity={g.depth * T.DEPTH_VEIL} />}
  </g>;
}

// `geom` is supplied by TabMesa and is the ONE geometry per render — the same
// object the hit targets and the drag inverse projection read. Width/height
// come from it rather than from separate props precisely so the two can never
// be handed different rooms.
export default function HybridFloorScene({ geom, visuals }) {
  if (!geom || !geom.width || !geom.height) return null;
  const { width, height } = geom;
  const ordered = depthSorted(visuals);
  return <svg className="mesa-scene" width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    <SceneDefs />
    <HybridRoom geom={geom} />
    {ordered.map((visual) => <HybridTable key={visual.id} visual={visual} geom={geom} />)}
    <rect x="0" y="0" width={width} height={height} fill="url(#m3dVig)" />
  </svg>;
}
