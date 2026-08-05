// Slice 1 — layout/position resolution. Pure unit tests against the
// exported resolveTablePositions(), no component mounting needed: this is
// the exact function TabMesa's floor render calls on every render, so
// testing it directly is both faster and a more precise regression guard
// than re-deriving the same assertions through full DOM rendering.
const { resolveTablePositions } = require("./TabMesa");

const table = (overrides) => ({
  id: overrides.id, number: overrides.number, name: `Mesa ${overrides.number}`,
  capacity: 4, x: overrides.x, y: overrides.y,
  shape: overrides.shape || "square", shapePreset: overrides.shapePreset || "standard",
  active: true,
});

test("a table with valid saved coordinates comes back completely untouched", () => {
  const input = [table({ id: "t1", number: 1, x: 23, y: 61 })];
  const [out] = resolveTablePositions(input);
  expect(out.x).toBe(23);
  expect(out.y).toBe(61);
  // Same reference, not just same value -- proves the fallback path never
  // even considered this table.
  expect(out).toBe(input[0]);
});

test("missing coordinates (undefined) get a deterministic fallback, never left undefined", () => {
  const input = [table({ id: "t1", number: 1, x: undefined, y: undefined })];
  const [out] = resolveTablePositions(input);
  expect(typeof out.x).toBe("number");
  expect(typeof out.y).toBe("number");
  expect(Number.isFinite(out.x)).toBe(true);
  expect(Number.isFinite(out.y)).toBe(true);
});

test("null coordinates (the real shape a never-positioned table arrives in, post buildFloor fix) get a fallback", () => {
  const input = [table({ id: "t1", number: 1, x: null, y: null })];
  const [out] = resolveTablePositions(input);
  expect(Number.isFinite(out.x)).toBe(true);
  expect(Number.isFinite(out.y)).toBe(true);
});

test("NaN / non-numeric coordinates get a fallback, not passed through as NaN%", () => {
  const input = [
    table({ id: "t1", number: 1, x: NaN, y: 40 }),
    table({ id: "t2", number: 2, x: "50", y: 40 }), // a stringly-typed number is still not `typeof === 'number'`
  ];
  const out = resolveTablePositions(input);
  expect(Number.isFinite(out[0].x)).toBe(true);
  expect(Number.isFinite(out[1].x)).toBe(true);
});

test("two tables with identical, individually-valid coordinates are left exactly as saved -- never auto-nudged apart", () => {
  const input = [
    table({ id: "t1", number: 1, x: 50, y: 50 }),
    table({ id: "t2", number: 2, x: 50, y: 50 }),
  ];
  const out = resolveTablePositions(input);
  expect(out[0].x).toBe(50); expect(out[0].y).toBe(50);
  expect(out[1].x).toBe(50); expect(out[1].y).toBe(50);
});

test("out-of-range finite coordinates are clamped into the visible canvas, not replaced by the fallback grid", () => {
  const input = [
    table({ id: "t1", number: 1, x: 150, y: 50 }),
    table({ id: "t2", number: 2, x: -30, y: 50 }),
    table({ id: "t3", number: 3, x: 50, y: 500 }),
  ];
  const out = resolveTablePositions(input);
  out.forEach((t) => {
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x).toBeLessThanOrEqual(100);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeLessThanOrEqual(100);
  });
  // Clamped toward the edge they overshot, not snapped to the opposite side.
  expect(out[0].x).toBeGreaterThan(70);
  expect(out[1].x).toBeLessThan(30);
});

test("the fallback grid never assigns two under-positioned tables the same cell", () => {
  const input = [1, 2, 3, 4, 5, 6, 7].map((n) => table({ id: `t${n}`, number: n, x: null, y: null }));
  const out = resolveTablePositions(input);
  const points = out.map((t) => `${t.x},${t.y}`);
  expect(new Set(points).size).toBe(points.length);
});

test("fallback layout is idempotent: same tables in, same layout out, run after run", () => {
  const input = [1, 2, 3, 4, 5, 6].map((n) => table({ id: `t${n}`, number: n, x: null, y: null }));
  const first = resolveTablePositions(input).map((t) => ({ x: t.x, y: t.y }));
  const second = resolveTablePositions(input).map((t) => ({ x: t.x, y: t.y }));
  expect(second).toEqual(first);
});

test("fallback assignment is keyed by table number, not array/response order", () => {
  const forward = [1, 2, 3, 4, 5, 6].map((n) => table({ id: `t${n}`, number: n, x: null, y: null }));
  const shuffled = [forward[3], forward[0], forward[5], forward[1], forward[4], forward[2]]; // same tables, different order
  const byId = (list) => Object.fromEntries(list.map((t) => [t.id, { x: t.x, y: t.y }]));
  expect(byId(resolveTablePositions(shuffled))).toEqual(byId(resolveTablePositions(forward)));
});

test("the 6-table fallback grid reproduces the approved reference layout (1 top-left ... 6 bottom-right)", () => {
  const input = [1, 2, 3, 4, 5, 6].map((n) => table({ id: `t${n}`, number: n, x: null, y: null }));
  const out = resolveTablePositions(input);
  const byNumber = Object.fromEntries(out.map((t) => [t.number, t]));
  expect(byNumber[1].x).toBeLessThan(byNumber[2].x); // 1 left of 2
  expect(byNumber[2].x).toBeLessThan(byNumber[3].x); // 2 left of 3
  expect(byNumber[1].y).toBeLessThan(byNumber[4].y); // 1 above 4 (same column)
  expect(byNumber[3].y).toBeLessThan(byNumber[6].y); // 3 above 6 (same column)
});

test("a wide rectangle-long table placed by the fallback stays fully clear of the canvas edge", () => {
  const input = [
    table({ id: "t1", number: 1, x: null, y: null, shape: "rectangle", shapePreset: "long" }),
    table({ id: "t2", number: 2, x: 50, y: 50 }),
  ];
  const [wide] = resolveTablePositions(input);
  // Half the widest footprint (168px) at the ~380px reference width is
  // ~22% -- the fallback grid must clear at least that on every side.
  expect(wide.x).toBeGreaterThanOrEqual(20);
  expect(wide.x).toBeLessThanOrEqual(80);
});

test("changing a table's shape after it was positioned re-clamps a now-too-close-to-the-edge saved position, but does not touch one that's still safely inside the canvas", () => {
  const safe = table({ id: "t1", number: 1, x: 50, y: 50, shape: "rectangle", shapePreset: "long" });
  const [outSafe] = resolveTablePositions([safe]);
  expect(outSafe.x).toBe(50); // center is always safe regardless of shape

  const risky = table({ id: "t2", number: 2, x: 4, y: 50, shape: "rectangle", shapePreset: "long" });
  const [outRisky] = resolveTablePositions([risky]);
  expect(outRisky.x).toBeGreaterThan(4); // pulled in from the edge, not left clipping
});

test("a table's operational state (open/free, comandas, payment) never affects its resolved position", () => {
  const free = table({ id: "t1", number: 1, x: 33, y: 44 });
  const occupied = { ...free, status: "open", session: { id: "s1", commands: [{ id: "o1", state: "LISTO" }] } };
  const [outFree] = resolveTablePositions([free]);
  const [outOccupied] = resolveTablePositions([occupied]);
  expect(outFree.x).toBe(33); expect(outFree.y).toBe(44);
  expect(outOccupied.x).toBe(33); expect(outOccupied.y).toBe(44);
});
