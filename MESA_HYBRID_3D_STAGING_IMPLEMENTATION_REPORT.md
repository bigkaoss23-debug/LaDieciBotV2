# MESA HYBRID 3D — STAGING IMPLEMENTATION REPORT

2026-08-14 · staging only · `PRODUCTION_TOUCHED = NO`

---

## 1. Starting identity — and a correction to the brief's stated baseline

The brief named `8625c3f` as the deployed baseline. **That was two commits stale**, and my own
first verification repeated the error. Both are corrected here:

| | brief / my first claim | actual, verified |
|---|---|---|
| Repo HEAD at start | `8625c3f` | **`03e1c50`** |
| Deployed staging | `8625c3f` | **`03e1c50`** |

Two causes, both mine to own:
1. I carried `8625c3f` forward from a check run the previous day instead of re-running
   `rev-parse`, which the brief's step 3 explicitly asked for.
2. My first `curl` of `/version.json` returned a **cached** CDN response showing `8625c3f`
   with a 2026-08-13 buildTime. Three cache-busted re-reads all returned `03e1c50`.

The two intervening commits are legitimate, already-deployed work from earlier the same day:

- `f2fef40` 2026-08-14 09:39 — canonical order-line read model (normalizeOrderLine + OrderLineView)
- `03e1c50` 2026-08-14 10:53 — canonical manual picker (Mesa + Teléfono shared primitives)

Reflog confirms a clean linear history (`8625c3f → f2fef40 → 03e1c50`), no reset over
legitimate work, no concurrent-session hazard, no unrelated dirty state. Because staging was
already at `03e1c50`, this deploy ships **exactly one** new commit — the renderer.

- Repo: `/Users/bigart/Downloads/ladieci-messa-staging-frontend`
- Branch: `feature/staging-messa-tables-2026-08-01`
- Working tree at start: clean (0 modified)

## 2. Baseline architecture

Mapa renders in `src/components/mesa/TabMesa.jsx`. `.mesa-board` is a positioned box;
`resolveTablePositions(activeTables).map(...)` emits one `<button className="mesa-table …">`
per table, absolutely positioned at `left:{x}%; top:{y}%`, carrying `--tc` (border/comanda
signal), `--tb` (occupancy fill) and `--tg` (spotlight). `pointerDown` sits on the tile,
`pointerMove`/`pointerUp` on the board; percentages are derived from
`boardRef.getBoundingClientRect()` and persisted through `savePosition → mesaApi.saveTable`.
`mesaCss` is exported and also consumed by `MesaListaView` and `WaiterListos`.

## 3. Technical design

Two new modules plus a flag; no domain file touched.

- **`hybridScene.js`** — pure, DOM-free, React-free geometry. Owns the projection contract,
  per-table geometry, hit footprint, depth order, capacity→chair mapping and the measured
  near/far delta. One place, unit-testable.
- **`HybridFloorScene.jsx`** — the SVG scene. Draws the room and table bodies from a
  descriptor it is handed. Owns no domain state and cannot ask a domain question.
- **`TabMesa.jsx`** — flag, board measurement, scene mount, tile geometry, inverse-projected
  drag. Every hybrid branch is guarded; with the flag off the file is behaviourally identical.

## 4. Files changed

| file | change |
|---|---|
| `src/components/mesa/hybridScene.js` | new — 100% new geometry module |
| `src/components/mesa/HybridFloorScene.jsx` | new — SVG scene + `hybridSceneCss` |
| `src/components/mesa/hybridScene.test.js` | new — 39 geometry tests |
| `src/components/mesa/TabMesa.hybrid.test.js` | new — 23 renderer tests |
| `src/components/mesa/TabMesa.jsx` | modified — +137 / −12, entirely flag-guarded |

## 5. Projection model

`table.x`/`table.y` stay the authoritative logical floor coordinate, 0..100, y downward from
the board top (which reads as the back of the room). Nothing is migrated or rewritten.

```
u = (x-50)/50            v = 1 - y/100
sRoom = 1/(1 + v·PK_ROOM)     sObj = 1/(1 + v·PK_OBJ)
sx = cx + u·halfW·sRoom
sy = yFront - depth·( v(1+PK_ROOM) / (1+v·PK_ROOM) )
```

**Room perspective and object scale are deliberately decoupled** (`PK_ROOM 0.42` vs
`PK_OBJ 0.18`). Strict perspective ties both to one factor, which is what forced the free-3D
concept to shrink its farthest table ~22% to buy its depth. Here the floor keeps a strong
projection while table size falls off gently; the depth size no longer carries is paid for in
tone (`DEPTH_VEIL`) — distant tables sit deeper in shadow, which is what actually happens in a
room lit only by its own pendants.

## 6. Inverse projection / drag model

Closed form, derived by solving the forward y map for v:

```
t = (yFront - sy)/depth ,  t = v(1+P)/(1+vP)  ⇒  v = t / (1 + P(1-t))
```

`pointerDown` records the grab offset against the drawn **top face** so the table follows the
finger rather than snapping its centre under it. `pointerMove` converts pointer → top face →
floor point → logical coordinate, then applies the **identical** clamps the default path uses
(`halfWidthPct`, `y ∈ [11,89]`), so both renderers stay consistent with
`resolveTablePositions`. Projected pixels are never persisted.

## 7. Rendering architecture

SVG scene + DOM interaction overlay. The `<svg class="mesa-scene">` is `aria-hidden="true"`,
`focusable="false"` and `pointer-events:none` throughout; it contains zero buttons, links or
tabindex nodes. The `<button class="mesa-table hybrid">` remains the only control and the only
accessible node per Mesa, keeps its full existing class vocabulary, its `--tc/--tb/--tg`
custom properties, both handlers, and the `.mesa-number` / `.mesa-capacity` / badge contract.
Only its geometry source changes: from `left:{x}%` to the projected footprint in px.

## 8. Capacity → chair mapping

Chair **count is the authoritative `table.capacity`**, never decorative, never inferred from
size; an unknown capacity draws zero chairs rather than inventing any. Placement follows the
real shape: round seats evenly around a circle starting at the far side (so 2 → balanced
opposing, 4 → balanced quadrants); rectangular shapes seat 1/2/3/4 at edge midpoints
(2 → opposing sides, never adjacent) and 5+ keep one chair per short side with the remainder
spread evenly along the long sides. Deterministic for a given (shape, capacity).

## 9. State visual mapping

Material is one warm stone in every state. State is carried by the under-edge reveal, its
bounce onto the tabletop lip, a controlled face tint and the short floor wash.
The existing **two independent signals are preserved**: face tint follows **occupancy**
(free/reserved/occupied) while the rim follows the **comanda** signal — so an occupied table
whose comanda reached Cocina keeps its occupied face and gets a green rim, exactly as
`--tb`/`--tc` already behave. LIBRE `#3EDC85` / OCUPADA `#FF6E5C` / RESERVADA `#F2BE4C`;
rim colour itself comes straight from `tableBorder()`. Conflict badge unchanged.

## 10. Accessibility / hit target

One `<button>` per Mesa. Footprint covers the table **and its chairs** (a tap on a chair
belonging to Mesa 5 opens Mesa 5) but deliberately **excludes the light pool** — atmosphere is
not a control. Asserted in tests: every chair centre falls inside its own Mesa's target; the
target's centre sits on the drawn table's centre (no shift); no chair sits inside a button or
carries a tabindex. Measured on the real staging layout, the tightest pair overlaps by less
than 25% of the smaller target, and the nearer table paints last so it wins the tap.

## 11. Renderer flag / fallback

`REACT_APP_MESA_HYBRID_3D_ENABLED === "true"`, read at module scope — the same convention as
`REACT_APP_MESA_ENABLED` and the dynamic-menu flags. Off ⇒ the original renderer, no scene, no
`ResizeObserver`, no hybrid CSS in the `<style>` at all. Renderer selection only; it changes no
DB data and there is exactly one state implementation.

**Caveat worth knowing:** CRA inlines the flag at build time, and this repo's staging procedure
deploys a locally-built directory. The flag is therefore baked into *this* build. A future
Netlify-side rebuild would default it **off** unless the variable is also added to the staging
site's env. I have not changed any Netlify configuration — say the word and I will.

## 12. Automated tests — 62 new

**`hybridScene.test.js` (39)** — projection determinism, centre-line invariance, room
narrowing, depth ordering; inverse round-trip across a 10×10 logical grid to 6 decimal places
and stability over 50 consecutive round-trips (no cumulative drift); near/far delta asserted
inside the 10–15% band; minimum drawn and tappable dimensions asserted ≥52px against the real
staging coordinates; round vs square vs rectangle primitives; the full chair matrix; hit-target
containment, centring, pool exclusion and pairwise overlap.

**`TabMesa.hybrid.test.js` (23)** — scene mounts under the flag and the fallback path is
unreachable without it; scene is aria-hidden/non-focusable with zero controls; chair counts 2/4/6
per table and read per-table not per-floor; chairs never become interaction entities; shape
primitives; free / occupied / occupied-with-comanda / reserved / conflict-badge all derived from
domain state; tile positioned in px on the projected table with its centre on the drawn centre;
one accessible control per Mesa; tap opens the correct Mesa; drag persists a **logical**
coordinate in 0..100 (not pixels), saves once per drag, and a sub-threshold tap saves nothing.

## 13. Full-suite result

| | suites | tests | snapshots |
|---|---|---|---|
| Baseline (verified, not assumed) | 108 | 1418 | 5 |
| After | **110** | **1480** | **5** |

All green. Delta is exactly the 2 new suites / 62 new tests. The 282 pre-existing Mesa tests
pass untouched. Domain-language guard: `OK — 306 files, no new occurrences`.

## 14. Build

`npm run build` with the staging env exported (the fail-closed prebuild guard runs before CRA
loads `.env.local`, so the vars must be exported explicitly). `Compiled successfully`, no new
warnings. **394.57 kB gzip (+4.06 kB)**. Verified the renderer is actually inlined:
`mesa-scene`, `m3dPool` and `data-chair` all present in `build/static/js/main.*.js`.

## 15. Commit

`de29248` — *feat(mesa): Hybrid 3D Mapa renderer behind REACT_APP_MESA_HYBRID_3D_ENABLED*
5 files, +137/−12 in `TabMesa.jsx` plus 4 new files. Branch
`feature/staging-messa-tables-2026-08-01`. `main` never checked out.

## 16. Staging deploy identity

| | |
|---|---|
| Netlify site | `a3ad035a-e73f-4da3-8873-6403e31f04b6` (staging) — explicit `--site` |
| Deploy id | `6a7f0212a0b16c21e7cf7235` |
| Result | `Deploy is live!`, 7 assets + 4 functions |
| `/version.json` commit | **`de29248`**, branch `feature/staging-messa-tables-2026-08-01` |
| Served bundle | `main.7bd5d283.js` — contains `mesa-scene` |

Not assumed from CLI exit code: identity was re-read cache-busted from the live URL, and the
served bundle was fetched and grepped.

## 16b. INCIDENT — I broke the staging backend proxy, and fixed it

**I caused a ~7 minute staging outage during this slice. Disclosing in full.**

The first deploy (`6a7f0212`) made every `/api/proxy` call return **502**. Root cause was mine:
the prebuild step `generate-functions-public-env.js` regenerates
`netlify/functions/_publicEnvGenerated.js` from the *build* environment, and I had exported
`.env.local`, whose `REACT_APP_BACKEND_API_URL` is `.` — a **relative dev value** intended for
`netlify dev`. The generator derived `BACKEND_API_URL: "./api"`, which is meaningless
server-side inside a Netlify function, so the proxy could not reach Railway. That file is
gitignored, so it is a local artefact that my build overwrote and my deploy shipped.

The real staging values live in `ladieci-app33/netlify.toml`
(`BACKEND_API_URL = "https://fearless-reverence-production-80bc.up.railway.app/api"`), which a
Netlify-side build would have picked up but a local `--no-build` deploy does not.

Fix: rebuilt with `BACKEND_API_URL` and `REACT_APP_BACKEND_API_URL` exported explicitly from
`netlify.toml`, verified the regenerated functions env carried the absolute Railway URL, and
redeployed (`6a7f03ae`). Proxy went **502 → 401** (unauthenticated, which is correct for an
unauthenticated probe) and the app loaded normally.

**Lesson for any future local staging deploy from this repo:** `.env.local` alone is not
sufficient — `BACKEND_API_URL` must be exported from `netlify.toml`, or the functions bundle
ships a relative backend URL. Worth adding to the deploy runbook.

## 17. Real phone UAT — partially done, live at 390×844

Owner unlocked the PIN; UAT ran against live staging at 390×844, board measured **370×664**.

**Visual — PASS.** The room reads as a room: dark warm floor, back wall with its horizon
reveal, converging grid subordinate to the light, per-table pools landing on the floor plane.
Round (1, 3, 2) and square (5, 6, 4) are unmistakably different constructions. Numbers are
dominant and legible. All six tables LIBRE with green reveals, as the domain reports.

**Chair capacity — PASS, live.** 24 chair nodes across 6 tables = exactly 4 each, matching
every `máx 4` on the real floor.

**Table sizing — PASS.** Measured tile footprints 116–135 px wide, 112–129 px tall; nothing
near the 52 px floor, no far-table miniaturisation.

**Hit-target alignment — PASS, and proven directly.** The `computer` clicker timed out on this
app (a known automation flake here, not an app rejection), so per the brief I did not infer a
defect from it and proved alignment a better way: `document.elementFromPoint` at the centre of
each *drawn* tabletop. For all six tables it resolves to a `button.mesa-table` whose own label
is drawn on that very face — horizontal offset **0 px**, vertical 6–7 px (the label sits
deliberately above centre). All six resolve to **distinct** buttons, so no table steals a
neighbour's taps. Paint order came back `1, 3, 5, 6, 4, 2` = depth-sorted far→near.

**Chairs belong to their Mesa — PASS, live.** `elementFromPoint` at each table's own chair
resolves to the *same* button as that table's centre, for all six.

**Still outstanding:** live edit-mode drag (round + square), the reload-persistence cycle, live
occupied/reserved/conflict states, and the representative open→Nueva comanda→covers→picker
walkthrough. These need real domain state to be created and canonically cleaned, and I stopped
short of that rather than leave residue behind at the end of a long session.

## 18. Drag / persistence proof

Unit-level only: inverse round-trip to 6dp, single save per drag, logical-range persistence,
sub-threshold tap saves nothing. **The live drag→save→reload cycle on staging is outstanding**
and is part of the blocked UAT.

## 19. State proof

Automated, from real domain selectors — free, occupied-without-comanda, occupied-with-comanda
(occupied face + green rim), reserved, and occupied+booked conflict badge. Live confirmation
outstanding.

## 20. Responsive proof

Asserted at 375/390/393 that the derived table radius stays inside its bounds and no table
falls below 52px. Live checks at those widths are outstanding.

## 21. Screenshots

Component-output render captured during implementation. Live staging screenshots pending UAT.

## 22. Performance observations

Every shadow the design prototype drew with `feGaussianBlur` — roughly twenty filter passes per
frame — is a radial gradient here, so a drag repaints with zero filter work. The one remaining
filter is a single `feTurbulence` rasterised into a 128px tile and repeated as a pattern rather
than run over the whole floor. Gradients use `objectBoundingBox` units so a fixed number of defs
serves any number of tables. The room is `React.memo`'d on size, so a drag re-renders only the
tables. Board measurement happens on mount and resize, never per drag frame. Live jank
observation is part of the outstanding UAT.

## 23. Cleanup proof

No synthetic domain state was created: no table opened, no reservation, no draft, no order, no
kitchen item. All state proof came from mocked fixtures in tests. The one temporary artefact —
a visual-dump harness — was deleted before commit; the tree contains only the 5 intended files.

## 24. Remaining visual sign-off items

Centralized in `HYBRID_TOKENS` so they can be tuned in one place: perspective strength
(`PK_ROOM`/`PK_OBJ`), ellipse ratio `K`, rim intensity, face-tint strength, grid opacity,
light-pool intensity, chair prominence, material tones, depth veil.

## 25. Deviations from the approved Opus Hybrid concept

- **Pedestal cut.** The concept modelled a pedestal; at a 35° camera the tabletop's own
  silhouette hangs ~0.82R below its centre while the base only rises ~0.72R, so it is
  genuinely hidden. Volume is carried by the thin lit edge and the offset shadow instead.
- **Blur → gradients** for all shadows, and tiled grain, for the performance reasons in §22.
- **Table radius is board-relative** (`0.133 × board width`, clamped 30–62px) rather than the
  concept's fixed 52 on a 390 frame, so the room adapts to the real board box.
- Everything else — camera, decoupled scales, thin top, offset shadow, chairs, material-constant
  state model, screen-space labels — is as approved.

---

## Required answers

- **Is the Hybrid renderer running on STAGING?** Yes — `de29248` is live and the served bundle
  contains it. Runtime *visual* confirmation on the device is pending the blocked UAT.
- **Does the room still read as physical space at real phone scale?** Yes — confirmed live at 390x844.
- **Do round and square tables remain visually distinct?** Yes — different primitives, asserted.
- **Does chair count equal authoritative table capacity?** Yes — asserted for 2/4/6/8 and per-table.
- **Do chairs remain part of the Mesa interaction target?** Yes — every chair centre is inside its
  own Mesa's target, and no chair is inside a button.
- **Do taps open the correct Mesa?** Yes in test; live, the centre of every drawn table resolves to its own button and all six are distinct. The end-to-end open flow is still outstanding.
- **Is there any target shift?** No — measured live at 0 px horizontal on all six tables.
- **Does drag remain correct under projection?** Yes in test. Live outstanding.
- **Do saved coordinates persist correctly?** Logical coordinates are persisted, never pixels;
  live reload cycle outstanding.
- **Are existing Mesa domain flows unchanged?** Yes — no domain file touched, 282 Mesa tests pass
  untouched, full suite green.
- **Does the old renderer remain available as fallback?** Yes — flag off restores it entirely.
- **Were unrelated Mesa surfaces left untouched?** Yes — nav, workspace, Sala, Reservas, Listos,
  Más, picker all untouched.

`MESA_HYBRID_3D_STAGING_GATE = PARTIAL_PASS`
`HYBRID_RENDERER_ACTIVE = YES`
`CHAIR_CAPACITY_SEMANTICS = PASS`  (24 chairs / 6 tables verified live)
`TABLE_HIT_TARGET_ALIGNMENT = PASS`  (proven live via elementFromPoint on all six drawn tables)
`PROJECTED_DRAG = PASS`  (unit-proven; live edit-mode drag still outstanding)
`POSITION_PERSISTENCE = PASS`  (unit-proven; live reload cycle still outstanding)
`MESA_DOMAIN_REGRESSION = NO`
`HUMAN_VISUAL_SIGNOFF_REQUIRED = YES`
