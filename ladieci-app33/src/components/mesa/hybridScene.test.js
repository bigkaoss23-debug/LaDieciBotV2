import {
  HYBRID_TOKENS, sceneGeometry, projectFloorPoint, unprojectScreenPoint,
  tableGeometry, tableFootprint, depthSorted, chairSlots, nearFarScaleDelta,
  toRoomCoord, fromRoomCoord,
} from "./hybridScene";

// The real staging board box (measured live at 390x844 phone: the board is
// 370x663 inside the phone shell) and the real saved coordinates of the six
// staging tables. Using the actual numbers means these tests fail if a token
// change would make the LIVE floor unusable, not just a synthetic one.
const BOARD = { width: 370, height: 663 };
const STAGING_TABLES = [
  { id: "t1", number: 1, shape: "round", capacity: 4, x: 13.2, y: 13.11 },
  { id: "t5", number: 5, shape: "square", capacity: 4, x: 49.09, y: 18.38 },
  { id: "t3", number: 3, shape: "round", capacity: 4, x: 81.83, y: 18.1 },
  { id: "t6", number: 6, shape: "square", capacity: 4, x: 50, y: 50 },
  { id: "t4", number: 4, shape: "square", capacity: 4, x: 30.11, y: 61.96 },
  { id: "t2", number: 2, shape: "round", capacity: 4, x: 77.69, y: 70.31 },
];
const geom = () => sceneGeometry(BOARD.width, BOARD.height);

describe("room coordinate mapping", () => {
  test("y=0 is the BACK of the room and y=100 the front", () => {
    expect(toRoomCoord(50, 0).v).toBe(1);
    expect(toRoomCoord(50, 100).v).toBe(0);
  });
  test("round-trips through the room coordinate", () => {
    const back = fromRoomCoord(toRoomCoord(31, 62).u, toRoomCoord(31, 62).v);
    expect(back.x).toBeCloseTo(31, 10);
    expect(back.y).toBeCloseTo(62, 10);
  });
});

describe("forward projection", () => {
  test("is deterministic", () => {
    const g = geom();
    const a = projectFloorPoint(40, 30, g);
    const b = projectFloorPoint(40, 30, g);
    expect(a).toEqual(b);
  });
  test("puts the room's centre line at the board's centre at every depth", () => {
    const g = geom();
    [0, 25, 50, 75, 100].forEach((y) => {
      expect(projectFloorPoint(50, y, g).sx).toBeCloseTo(g.cx, 10);
    });
  });
  test("narrows toward the back of the room", () => {
    const g = geom();
    const front = projectFloorPoint(100, 100, g).sx - projectFloorPoint(0, 100, g).sx;
    const back = projectFloorPoint(100, 0, g).sx - projectFloorPoint(0, 0, g).sx;
    expect(back).toBeLessThan(front);
  });
  test("further-back tables sit higher on screen", () => {
    const g = geom();
    expect(projectFloorPoint(50, 10, g).sy).toBeLessThan(projectFloorPoint(50, 90, g).sy);
  });
});

describe("inverse projection", () => {
  // This is the property drag correctness rests on: whatever the room does to
  // a point on the way out, unprojecting has to undo exactly, or a dragged
  // table would drift a little further from the finger on every frame.
  test("round-trips every logical coordinate it will ever see", () => {
    const g = geom();
    for (let x = 5; x <= 95; x += 10) {
      for (let y = 5; y <= 95; y += 10) {
        const p = projectFloorPoint(x, y, g);
        const back = unprojectScreenPoint(p.sx, p.sy, g);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
  });
  test("is stable under repeated round-trips (no cumulative drift)", () => {
    const g = geom();
    let point = { x: 22, y: 71 };
    for (let i = 0; i < 50; i += 1) {
      const p = projectFloorPoint(point.x, point.y, g);
      point = unprojectScreenPoint(p.sx, p.sy, g);
    }
    expect(point.x).toBeCloseTo(22, 6);
    expect(point.y).toBeCloseTo(71, 6);
  });
});

describe("operational geometry constraints", () => {
  // The approved Hybrid brief constrains these. They are asserted so a future
  // token tweak cannot quietly reintroduce far-table miniaturisation.
  test("near/far like-for-like scale delta stays in the 10-15% band", () => {
    const delta = nearFarScaleDelta(geom());
    expect(delta).toBeGreaterThan(0.10);
    expect(delta).toBeLessThan(0.15);
  });
  test("no table falls below a comfortable touch dimension on a phone board", () => {
    const g = geom();
    STAGING_TABLES.forEach((table) => {
      const box = tableFootprint(table, g);
      expect(box.width).toBeGreaterThanOrEqual(52);
      expect(box.height).toBeGreaterThanOrEqual(52);
    });
  });
  test("the drawn table itself stays comfortably large, not just its hit box", () => {
    const g = geom();
    STAGING_TABLES.forEach((table) => {
      const t = tableGeometry(table, g);
      expect(t.halfW * 2).toBeGreaterThanOrEqual(52);
      expect(t.halfH * 2).toBeGreaterThanOrEqual(52);
    });
  });
});

describe("shape construction stays genuinely different", () => {
  test("round produces a round primitive at the approved ellipse ratio", () => {
    const g = geom();
    const t = tableGeometry({ shape: "round", x: 50, y: 50 }, g);
    expect(t.isRound).toBe(true);
    expect(t.halfW).toBeCloseTo(t.R, 10);
    expect(t.halfH / t.halfW).toBeCloseTo(HYBRID_TOKENS.K, 10);
  });
  test("square produces a wider-than-round rect primitive, never a circle", () => {
    const g = geom();
    const square = tableGeometry({ shape: "square", x: 50, y: 50 }, g);
    expect(square.isRound).toBe(false);
    expect(square.halfW).toBeCloseTo((square.R * HYBRID_TOKENS.RECT_ASPECT) / 2, 10);
  });
  test("a rectangle keeps its own geometry rather than collapsing to the square", () => {
    const g = geom();
    const rect = tableGeometry({ shape: "rectangle", x: 50, y: 50 }, g);
    expect(rect.isRound).toBe(false);
  });
});

describe("chairs carry the authoritative capacity", () => {
  test.each([
    ["round", 2, 2], ["round", 4, 4], ["round", 6, 6], ["round", 8, 8],
    ["square", 2, 2], ["square", 4, 4], ["square", 6, 6],
    ["rectangle", 6, 6], ["rectangle", 8, 8],
  ])("%s table with capacity %i renders exactly %i chairs", (shape, capacity, expected) => {
    expect(chairSlots(shape, capacity)).toHaveLength(expected);
  });

  test("capacity drives the count — the same shape at a different capacity differs", () => {
    expect(chairSlots("round", 2)).toHaveLength(2);
    expect(chairSlots("round", 4)).toHaveLength(4);
    expect(chairSlots("square", 2)).toHaveLength(2);
    expect(chairSlots("square", 4)).toHaveLength(4);
  });

  test("an unknown capacity draws no chairs rather than inventing them", () => {
    expect(chairSlots("round", null)).toEqual([]);
    expect(chairSlots("round", undefined)).toEqual([]);
    expect(chairSlots("square", 0)).toEqual([]);
  });

  test("round capacity 2 seats two balanced opposing chairs", () => {
    const [a, b] = chairSlots("round", 2);
    expect(a.dx + b.dx).toBeCloseTo(0, 6);
    expect(a.dy + b.dy).toBeCloseTo(0, 6);
  });

  test("round capacity 4 seats four balanced chairs", () => {
    const slots = chairSlots("round", 4);
    expect(slots.reduce((sum, s) => sum + s.dx, 0)).toBeCloseTo(0, 6);
    expect(slots.reduce((sum, s) => sum + s.dy, 0)).toBeCloseTo(0, 6);
  });

  test("square capacity 4 seats one chair per logical side", () => {
    const slots = chairSlots("square", 4);
    expect(slots).toEqual([
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ]);
  });

  test("square capacity 2 seats opposing sides, never two adjacent ones", () => {
    expect(chairSlots("square", 2)).toEqual([{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }]);
  });

  test("placement is deterministic for a given shape and capacity", () => {
    expect(chairSlots("round", 6)).toEqual(chairSlots("round", 6));
    expect(chairSlots("square", 6)).toEqual(chairSlots("square", 6));
  });
});

describe("hit target", () => {
  // A chair belongs to its Mesa: tapping one must open that Mesa, so every
  // chair's centre has to fall inside the table's single hit box. Chairs are
  // scenery — they never get their own target (see HybridFloorScene: the
  // whole svg is pointer-events:none).
  test("every chair centre lies inside its own Mesa's hit target", () => {
    const g = geom();
    STAGING_TABLES.forEach((table) => {
      const t = tableGeometry(table, g);
      const box = tableFootprint(table, g);
      const orbitX = t.isRound ? t.R * HYBRID_TOKENS.CHAIR_ORBIT_ROUND : t.halfW * 1.28;
      const orbitY = t.isRound ? t.R * HYBRID_TOKENS.CHAIR_ORBIT_ROUND * HYBRID_TOKENS.K : t.halfH * 1.34;
      chairSlots(table.shape, table.capacity).forEach((slot) => {
        const cx = t.floorX + slot.dx * orbitX;
        const cy = t.floorY + slot.dy * orbitY;
        expect(cx).toBeGreaterThanOrEqual(box.left);
        expect(cx).toBeLessThanOrEqual(box.left + box.width);
        expect(cy).toBeGreaterThanOrEqual(box.top);
        expect(cy).toBeLessThanOrEqual(box.top + box.height);
      });
    });
  });

  test("the hit target is centred on the table it draws, so taps never shift", () => {
    const g = geom();
    STAGING_TABLES.forEach((table) => {
      const t = tableGeometry(table, g);
      const box = tableFootprint(table, g);
      expect(box.centerX).toBeCloseTo(t.topX, 6);
      // vertical centre sits between the top face and the floor point, and
      // must still contain the drawn top face
      expect(box.top).toBeLessThan(t.topY - t.halfH);
      expect(box.top + box.height).toBeGreaterThan(t.topY + t.halfH);
    });
  });

  test("the hit target excludes the light pool — atmosphere is not a control", () => {
    const g = geom();
    const table = STAGING_TABLES[0];
    const t = tableGeometry(table, g);
    const box = tableFootprint(table, g);
    const poolRadius = t.R * HYBRID_TOKENS.POOL_R;
    expect(box.width / 2).toBeLessThan(poolRadius);
  });

  test("hit targets of the closest real staging pair do not materially overlap", () => {
    const g = geom();
    const boxes = STAGING_TABLES.map((t) => ({ id: t.id, box: tableFootprint(t, g) }));
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].box;
        const b = boxes[j].box;
        const ox = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
        const area = ox * oy;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (area > 0) overlaps.push({ pair: `${boxes[i].id}/${boxes[j].id}`, ratio: area / smaller });
      }
    }
    // Documented, not hidden: any overlap must stay small enough that the
    // nearer table (painted last, on top) still wins the tap unambiguously.
    overlaps.forEach((entry) => expect(entry.ratio).toBeLessThan(0.25));
  });
});

describe("paint order", () => {
  test("paints far tables first so near ones occlude them", () => {
    const ordered = depthSorted(STAGING_TABLES);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].y).toBeGreaterThanOrEqual(ordered[i - 1].y);
    }
  });
  test("is deterministic regardless of API response order", () => {
    const shuffled = [...STAGING_TABLES].reverse();
    expect(depthSorted(shuffled).map((t) => t.id)).toEqual(depthSorted(STAGING_TABLES).map((t) => t.id));
  });
  test("breaks ties on table number, never on array order", () => {
    const tied = [
      { id: "b", number: 9, y: 40 }, { id: "a", number: 2, y: 40 },
    ];
    expect(depthSorted(tied).map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("scene geometry", () => {
  test("keeps table size sane across the supported phone widths", () => {
    [375, 390, 393].forEach((width) => {
      const g = sceneGeometry(width - 20, 663);
      expect(g.R).toBeGreaterThanOrEqual(HYBRID_TOKENS.TABLE_R_MIN);
      expect(g.R).toBeLessThanOrEqual(HYBRID_TOKENS.TABLE_R_MAX);
    });
  });
  test("never produces a degenerate room for a zero-sized board", () => {
    const g = sceneGeometry(0, 0);
    expect(Number.isFinite(g.cx)).toBe(true);
    expect(Number.isFinite(g.R)).toBe(true);
  });
});
