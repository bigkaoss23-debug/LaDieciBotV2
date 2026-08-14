import { memo } from "react";
import {
  HYBRID_TOKENS, sceneGeometry, projectFloorPoint, tableGeometry, depthSorted, chairPlacements,
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
      <stop offset="0%" stopColor="#100d0a" /><stop offset="30%" stopColor="#17120d" />
      <stop offset="70%" stopColor="#141009" /><stop offset="100%" stopColor="#0a0807" />
    </linearGradient>
    <linearGradient id="m3dWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#050404" /><stop offset="58%" stopColor="#0a0807" />
      <stop offset="100%" stopColor="#100d0a" />
    </linearGradient>
    <radialGradient id="m3dVig" cx="50%" cy="48%" r="76%">
      <stop offset="0%" stopColor="rgba(0,0,0,0)" /><stop offset="66%" stopColor="rgba(0,0,0,0)" />
      <stop offset="100%" stopColor="rgba(0,0,0,.58)" />
    </radialGradient>
    <linearGradient id="m3dHorizon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="rgba(240,192,133,0)" />
      <stop offset="50%" stopColor="rgba(240,192,133,.26)" />
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
    <radialGradient id="m3dTop" cx="46%" cy="32%" r="72%">
      <stop offset="0%" stopColor="#8d7351" /><stop offset="30%" stopColor="#66513a" />
      <stop offset="62%" stopColor="#3e3023" /><stop offset="86%" stopColor="#2a2018" />
      <stop offset="100%" stopColor="#1e1611" />
    </radialGradient>
    <linearGradient id="m3dSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#31261b" /><stop offset="48%" stopColor="#1a120d" />
      <stop offset="82%" stopColor="#150e0a" /><stop offset="100%" stopColor="#4a331f" />
    </linearGradient>
    <radialGradient id="m3dSpec" cx="42%" cy="24%" r="54%">
      <stop offset="0%" stopColor="rgba(255,238,212,.17)" />
      <stop offset="100%" stopColor="rgba(255,238,212,0)" />
    </radialGradient>

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
const HybridRoom = memo(function HybridRoom({ geom }) {
  const { width: w, height: h, horizon } = geom;
  const lines = [];
  for (let i = -3; i <= 3; i += 1) {
    const u = i / 2.1;
    const a = projectFloorPoint(u * 50 + 50, 100, geom);
    const b = projectFloorPoint(u * 50 + 50, 0, geom);
    lines.push(<line key={`v${i}`} x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} opacity={T.GRID} />);
  }
  for (let v = 0.06, k = 0; v < 1.02; v += 0.132, k += 1) {
    const a = projectFloorPoint(50, (1 - v) * 100, geom);
    lines.push(<line key={`h${k}`} x1={0} y1={a.sy} x2={w} y2={a.sy} opacity={T.GRID * (1 - v * 0.45)} />);
  }
  return <g>
    <rect x="0" y="0" width={w} height={Math.max(0, horizon + 46)} fill="url(#m3dWall)" />
    <rect x="0" y={horizon - 8} width={w} height="18" fill="url(#m3dHorizon)" />
    <rect x="0" y={horizon + 3} width={w} height={Math.max(0, h - horizon - 3)} fill="url(#m3dFloor)" />
    <g stroke="#ffeacb" strokeWidth=".7" fill="none">{lines}</g>
    <rect x="0" y={horizon + 3} width={w} height={Math.max(0, h - horizon - 3)}
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
// Three marks: a ground wash, a seat, a backrest. The previous chair used
// five, including a hard per-chair contact shadow at .55 — on an eight-top
// that is forty marks and eight dark blobs sitting inside the table's own warm
// light pool, which is what the floor read as noise.
//
// The backrest goes on the OUTWARD side (p.nx/p.ny from chairPlacements) and
// is painted before the seat for a far chair and after it for a near one, so
// a chair at the front of a table is seen from behind and one at the back is
// seen from the front. The old geometry lifted every backrest up-screen
// regardless of side, which drew every near-side chair facing backwards — the
// single largest contributor to the "thrown there randomly" read.
function Chair({ p }) {
  const { x, y, w, h, ny, groundY, backX, backW, backH, backBottom } = p;
  const back = <g>
    <rect x={backX - backW / 2} y={backBottom - backH} width={backW} height={backH}
      rx={backW * 0.42} ry={backW * 0.42} fill="#150f09" />
    {/* the top edge catches the pendant light — the one mark that keeps a
        near-side chair, whose back necessarily covers its own seat, reading as
        a chair seen from behind rather than a dark rounded blob */}
    <rect x={backX - backW / 2} y={backBottom - backH} width={backW} height={Math.max(1, backH * 0.22)}
      rx={backW * 0.42} ry={backW * 0.42} fill="#3d2d1d" opacity=".55" />
  </g>;
  const seat = <ellipse cx={x} cy={y} rx={w * 0.5} ry={h * 0.5} fill="#241a10" />;
  return <g opacity={T.CHAIR_ALPHA * (0.93 + ny * 0.07)} data-chair="1">
    {/* the shadow stays on the FLOOR while the seat is drawn at seat height,
        which is what grounds a lifted chair instead of floating it */}
    <ellipse cx={x} cy={groundY} rx={w * 0.5} ry={h * 0.4}
      fill="url(#m3dContact)" opacity=".34" />
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
    <Silhouette g={g} cy={g.topY} fill="none" stroke="#f2dfc0" strokeWidth={Math.max(0.7, g.R * 0.02)} opacity=".14" />
    {/* state reveal: two strokes rather than a blurred duplicate */}
    <Silhouette g={g} cy={g.topY + g.thickness * 0.35} scale={0.99} fill="none"
      stroke={visual.rimColor} strokeWidth={rimW * 2.4} opacity={0.2 * T.RIM} />
    <Silhouette g={g} cy={g.topY + g.thickness * 0.35} scale={0.99} fill="none"
      stroke={visual.rimColor} strokeWidth={rimW} opacity={T.RIM} />
    <Silhouette g={g} cy={g.topY} scale={0.93} fill="url(#m3dSpec)" />

    {front.map((c) => <Chair key={`f${c.key}`} p={c} />)}

    {visual.selected && <Silhouette g={g} cy={g.topY} scale={1.1} fill="none"
      stroke="#f7f0df" strokeWidth={Math.max(2, g.R * 0.05)} opacity=".8" />}
    {/* depth by tone rather than by size — see hybridScene's header note */}
    {g.depth > 0.02 && <Silhouette g={g} cy={g.topY} scale={1.02} fill="#050403"
      opacity={g.depth * T.DEPTH_VEIL} />}
  </g>;
}

export default function HybridFloorScene({ width, height, visuals }) {
  if (!width || !height) return null;
  const geom = sceneGeometry(width, height);
  const ordered = depthSorted(visuals);
  return <svg className="mesa-scene" width={width} height={height}
    viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
    <SceneDefs />
    <HybridRoom geom={geom} />
    {ordered.map((visual) => <HybridTable key={visual.id} visual={visual} geom={geom} />)}
    <rect x="0" y="0" width={width} height={height} fill="url(#m3dVig)" />
  </svg>;
}
