import {
  HYBRID_TOKENS, ROOM_FRAME, ROOM_Y_MIN, ROOM_Y_MAX, sceneGeometry, projectFloorPoint, unprojectScreenPoint,
  tableGeometry, tableFootprint, depthSorted, chairSlots, chairPlacements,
  nearFarScaleDelta, toRoomCoord, fromRoomCoord,
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
  // Exact below the cap, capped above it. The capped rows are the point of the
  // rule: a 6- and an 8-top are DECORATED, not counted.
  test.each([
    ["round", 1, 1], ["round", 2, 2], ["round", 3, 3], ["round", 4, 4],
    ["round", 6, 4], ["round", 8, 4], ["round", 20, 4],
    ["square", 2, 2], ["square", 4, 4], ["square", 6, 4],
    ["rectangle", 6, 4], ["rectangle", 8, 4], ["rectangle-long", 12, 4],
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

  // ── THE PRODUCT RULE ────────────────────────────────────────────────────
  // Exact up to SEATS_MAX (4), capped above it. These assert both halves and,
  // most importantly, the invariant that survives the change: the drawing must
  // never contradict a SMALL capacity, the only range a human ever counts.
  const SHAPES = ["round", "square", "rectangle", "rectangle-long"];

  test("every capacity a human would count is drawn EXACTLY", () => {
    SHAPES.forEach((shape) => {
      for (let capacity = 1; capacity <= HYBRID_TOKENS.SEATS_MAX; capacity += 1) {
        expect(chairSlots(shape, capacity)).toHaveLength(capacity);
      }
    });
  });

  // The specific failure the brief names: a small table must never LOOK like a
  // bigger one. Stated directly rather than left implied by the count test.
  test("a small table never draws more chairs than it seats", () => {
    SHAPES.forEach((shape) => {
      [1, 2, 3, 4, 5, 6].forEach((capacity) => {
        expect(chairSlots(shape, capacity).length).toBeLessThanOrEqual(capacity);
      });
    });
    expect(chairSlots("round", 2)).toHaveLength(2);
    expect(chairSlots("round", 3)).toHaveLength(3);
    expect(chairSlots("square", 2)).toHaveLength(2);
  });

  test("a large capacity becomes representative rather than a fringe of marks", () => {
    SHAPES.forEach((shape) => {
      for (let capacity = HYBRID_TOKENS.SEATS_MAX + 1; capacity <= 99; capacity += 1) {
        expect(chairSlots(shape, capacity)).toHaveLength(HYBRID_TOKENS.SEATS_MAX);
      }
    });
  });

  // A capped table must still read as FULLY seated: the cue it carries is
  // "this is a table", so it may never degrade into a sparse ring that reads
  // as a smaller one.
  test("a capped table is drawn fully seated, never sparsely", () => {
    SHAPES.forEach((shape) => {
      expect(chairSlots(shape, 20)).toEqual(chairSlots(shape, HYBRID_TOKENS.SEATS_MAX));
      expect(chairSlots(shape, 99)).toEqual(chairSlots(shape, HYBRID_TOKENS.SEATS_MAX));
    });
  });

  // The cap is a design decision, so it is asserted as one. This is the
  // property it buys and the reason it is 4: at the real phone size, four
  // seats never come near each other on ANY shape, so density can never
  // degrade into the overlap the previous rule allowed at 8.
  test("no two chairs ever overlap, on any shape, at any capacity", () => {
    const g = geom();
    ["round", "square", "rectangle", "rectangle-long"].forEach((shape) => {
      [4, 8, 20, 99].forEach((capacity) => {
        const seats = chairPlacements({ shape, capacity, x: 50, y: 50 }, g);
        seats.forEach((a) => {
          seats.forEach((b) => {
            if (a === b) return;
            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            expect(overlapX <= 0 || overlapY <= 0).toBe(true);
          });
        });
      });
    });
  });
});

// ── the art-directed patterns themselves ───────────────────────────────────
// These assert the GEOMETRIC INTENT of each supported count, not merely that
// some arrangement was produced. A generic radial spread passes a count test
// and still looks like scattered chairs; what makes a table read as "seats
// three" is that the three seats form a recognisable triangle.
describe("round tables use explicit geometric seat patterns", () => {
  const angles = (capacity) => chairSlots("round", capacity)
    .map((s) => ((Math.atan2(s.dy, s.dx) * 180) / Math.PI + 360) % 360)
    .sort((a, b) => a - b);

  const gapsBetweenSeats = (capacity) => {
    const list = angles(capacity);
    return list.map((a, i) => {
      const next = i === list.length - 1 ? list[0] + 360 : list[i + 1];
      return next - a;
    });
  };

  test("2 seats sit exactly opposite each other, 180 apart", () => {
    gapsBetweenSeats(2).forEach((gap) => expect(gap).toBeCloseTo(180, 6));
  });

  test("3 seats form an equilateral triangle, 120 apart", () => {
    gapsBetweenSeats(3).forEach((gap) => expect(gap).toBeCloseTo(120, 6));
  });

  test("4 seats sit on the four cardinal positions", () => {
    expect(angles(4)).toEqual([0, 90, 180, 270]);
  });

  // Above the cap the ring is still the 4-up cross, not a denser polygon —
  // this is what stops a "just raise SEATS_MAX a little" change from silently
  // reintroducing the crowded floor the cap exists to prevent.
  test("a large capacity keeps the four-cardinal ring, never a denser polygon", () => {
    [5, 6, 8, 12, 40].forEach((capacity) => {
      expect(angles(capacity)).toEqual([0, 90, 180, 270]);
    });
  });

  test("every pattern is anchored with a seat at the far side of the table", () => {
    for (let capacity = 1; capacity <= 8; capacity += 1) {
      const slots = chairSlots("round", capacity);
      const far = slots.find((s) => Math.abs(s.dx) < 1e-9 && s.dy < 0);
      expect(far).toBeDefined();
    }
  });

  test("every seat sits on the ring, never inside or outside it", () => {
    for (let capacity = 1; capacity <= 8; capacity += 1) {
      chairSlots("round", capacity).forEach((s) => {
        expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(1, 9);
      });
    }
  });
});

describe("rectangular tables use shape-aware seat patterns, not a ring", () => {
  const SHAPES = ["square", "rectangle", "rectangle-long"];

  // The invariant chairPlacements' outward-normal rule depends on: exactly
  // one component is a full unit, and it names the side the chair is on. A
  // chair halfway along the long side must still face straight out, not
  // diagonally.
  test("every seat names exactly one side via a unit component", () => {
    SHAPES.forEach((shape) => {
      for (let capacity = 1; capacity <= 12; capacity += 1) {
        chairSlots(shape, capacity).forEach((s) => {
          const units = [s.dx, s.dy].filter((v) => Math.abs(Math.abs(v) - 1) < 1e-9);
          expect(units).toHaveLength(1);
        });
      }
    });
  });

  test("4 seats put exactly one chair on each of the four sides", () => {
    SHAPES.forEach((shape) => {
      const slots = chairSlots(shape, 4);
      expect(slots).toEqual([
        { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
      ]);
    });
  });

  test("3 seats occupy three distinct sides", () => {
    const sides = new Set(chairSlots("square", 3).map((s) => `${s.dx},${s.dy}`));
    expect(sides.size).toBe(3);
  });

  // THE STRUCTURAL GUARANTEE the cap buys: at most one chair per side, at any
  // capacity. Two seats can never share an edge, so a rectangle can never
  // crowd however large its capacity grows.
  test("never puts two chairs on the same side, at any capacity", () => {
    ["square", "rectangle", "rectangle-long"].forEach((shape) => {
      [1, 2, 3, 4, 6, 8, 12, 99].forEach((capacity) => {
        const sides = chairSlots(shape, capacity).map((s) => `${s.dx},${s.dy}`);
        expect(new Set(sides).size).toBe(sides.length);
      });
    });
  });

  test("both short sides keep a seat once the table is drawn fully seated", () => {
    [4, 6, 8, 12].forEach((capacity) => {
      const slots = chairSlots("square", capacity);
      expect(slots.filter((s) => s.dx === -1)).toHaveLength(1);
      expect(slots.filter((s) => s.dx === 1)).toHaveLength(1);
    });
  });

  test("a rectangular table never reuses the round ring", () => {
    const round = chairSlots("round", 3).map((s) => `${s.dx.toFixed(4)},${s.dy.toFixed(4)}`);
    const rect = chairSlots("rectangle", 3).map((s) => `${s.dx.toFixed(4)},${s.dy.toFixed(4)}`);
    expect(rect).not.toEqual(round);
  });
});

describe("drawn chair placement binds each chair to its own table", () => {
  const g = () => geom();

  test("is deterministic — same table, same geometry, same chairs", () => {
    const table = { id: "t", number: 1, shape: "round", capacity: 6, x: 40, y: 55 };
    expect(chairPlacements(table, g())).toEqual(chairPlacements(table, g()));
  });

  test("every chair is positioned relative to its own table's floor point", () => {
    // Moving the table moves every chair by exactly the same delta: chairs
    // cannot be left behind on the floor when a Mesa is dragged.
    const at = (x, y) => chairPlacements({ shape: "round", capacity: 5, x, y }, g());
    const a = at(50, 50);
    const b = at(50.0001, 50);
    const deltas = a.map((chair, i) => (b[i].x - chair.x).toFixed(9));
    expect(new Set(deltas).size).toBe(1);
    expect(Number(deltas[0])).toBeGreaterThan(0);
  });

  test("backrests always face away from the table, never into it", () => {
    [["round", 6], ["square", 4], ["rectangle", 6], ["round", 3]].forEach(([shape, capacity]) => {
      const table = { shape, capacity, x: 50, y: 50 };
      const t = tableGeometry(table, g());
      chairPlacements(table, g()).forEach((chair) => {
        const outX = chair.x - t.floorX;
        const outY = chair.y - t.floorY;
        // the normal must point along the same side as the chair's own offset
        if (chair.nx !== 0) expect(Math.sign(chair.nx)).toBe(Math.sign(outX));
        if (chair.ny !== 0) expect(Math.sign(chair.ny)).toBe(Math.sign(outY));
        expect(Math.hypot(chair.nx, chair.ny)).toBeGreaterThan(0);
      });
    });
  });

  test("chairs are tucked against the table edge, not parked away from it", () => {
    const table = { shape: "round", capacity: 4, x: 50, y: 50 };
    const t = tableGeometry(table, g());
    const side = chairPlacements(table, g()).find((c) => Math.abs(c.ny) < 1e-9);
    // the seat's inner edge overlaps the tabletop's own edge
    expect(Math.abs(side.x - t.floorX) - side.w / 2).toBeLessThan(t.halfW);
  });

  test("seats at the back of a table are smaller than seats at the front", () => {
    const table = { shape: "round", capacity: 4, x: 50, y: 50 };
    const chairs = chairPlacements(table, g());
    const far = chairs.find((c) => c.ny < -0.9);
    const near = chairs.find((c) => c.ny > 0.9);
    expect(far.w).toBeLessThan(near.w);
    // controlled, not a second perspective system fighting the room's own
    expect(near.w / far.w).toBeLessThan(1.3);
  });

  test("chairs behind the table are separated so the table can occlude them", () => {
    const chairs = chairPlacements({ shape: "round", capacity: 4, x: 50, y: 50 }, g());
    expect(chairs.filter((c) => c.behind).length).toBeGreaterThan(0);
    expect(chairs.filter((c) => !c.behind).length).toBeGreaterThan(0);
  });

  test("an unknown capacity places no chairs rather than inventing them", () => {
    expect(chairPlacements({ shape: "round", capacity: null, x: 50, y: 50 }, g())).toEqual([]);
  });
});

describe("hit target", () => {
  // A chair belongs to its Mesa: tapping one must open that Mesa, so every
  // chair's centre has to fall inside the table's single hit box. Chairs are
  // scenery — they never get their own target (see HybridFloorScene: the
  // whole svg is pointer-events:none).
  // Measured through chairPlacements — the SAME function the renderer draws
  // from — rather than by re-deriving the placement arithmetic here. A test
  // that reimplements the geometry it is checking can only prove the two
  // copies agree today, which is exactly how chairs drift away from the Mesa
  // that owns them.
  test("every chair the renderer draws lies inside its own Mesa's hit target", () => {
    const g = geom();
    STAGING_TABLES.forEach((table) => {
      const box = tableFootprint(table, g);
      const chairs = chairPlacements(table, g);
      expect(chairs).toHaveLength(table.capacity);
      chairs.forEach((chair) => {
        expect(chair.x).toBeGreaterThanOrEqual(box.left);
        expect(chair.x).toBeLessThanOrEqual(box.left + box.width);
        expect(chair.y).toBeGreaterThanOrEqual(box.top);
        expect(chair.y).toBeLessThanOrEqual(box.top + box.height);
      });
    });
  });

  // Stronger than the centres test: the whole drawn chair — seat, backrest and
  // ground shadow — has to stay inside the one target, or the visible chair
  // footprint and the tappable footprint stop being the same thing. Swept
  // across every shape and every realistic capacity, and both near and far
  // positions in the room, because the backrest extent varies with all of
  // them.
  test("the full drawn extent of every chair stays inside the hit target", () => {
    const g = geom();
    const shapes = ["round", "square", "rectangle", "rectangle-long"];
    shapes.forEach((shape) => {
      for (let capacity = 1; capacity <= 10; capacity += 1) {
        [8, 30, 50, 72, 94].forEach((y) => {
          const table = { id: `x${capacity}`, number: capacity, shape, capacity, x: 50, y };
          const box = tableFootprint(table, g);
          chairPlacements(table, g).forEach((chair) => {
            expect(chair.left).toBeGreaterThanOrEqual(box.left);
            expect(chair.right).toBeLessThanOrEqual(box.left + box.width);
            expect(chair.top).toBeGreaterThanOrEqual(box.top);
            expect(chair.bottom).toBeLessThanOrEqual(box.top + box.height);
          });
        });
      }
    });
  });

  // The footprint grows to fit its chairs, but never off-centre: a seat
  // template with nothing on one side (a 3-seat rectangle) must not drag the
  // control away from the table it draws.
  test("an asymmetric seat template never shifts the target off the table", () => {
    const g = geom();
    ["square", "rectangle"].forEach((shape) => {
      [3, 5, 7].forEach((capacity) => {
        const table = { shape, capacity, x: 50, y: 50 };
        const drawn = tableGeometry(table, g);
        const box = tableFootprint(table, g);
        expect(box.centerX).toBeCloseTo(drawn.topX, 6);
      });
    });
  });

  test("a table with no chairs still keeps a comfortable target", () => {
    const g = geom();
    const box = tableFootprint({ shape: "round", capacity: null, x: 50, y: 50 }, g);
    expect(box.width).toBeGreaterThanOrEqual(52);
    expect(box.height).toBeGreaterThanOrEqual(52);
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

// ═══════════════════════════════════════════════════════════════════════════
// THE ROOM IS A FIXED FRAME
//
// This block exists because of a specific P0 found in human phone UAT, and it
// is written to fail loudly if that defect ever returns. A previous version
// derived the projection basis from the current table set's own min/max y, to
// avoid rendering floor no table stood on. Consequence: every table's depth was
// normalized against the extrema, so moving the table that DEFINED an extremum
// renormalized the whole room and tables the operator never touched slid across
// the screen underneath their finger.
//
// The invariant: the room is the coordinate frame. Tables move inside it. No
// table may move because another table changed.
// ═══════════════════════════════════════════════════════════════════════════
describe("dragging uppermost table does not reframe untouched tables", () => {
  // The exact composition the operator reported it with: a five-dot/dice
  // arrangement, Mesa 5 alone at the top.
  const DICE_ROOM = [
    { id: "t1", number: 1, shape: "round", capacity: 4, x: 22, y: 62 },
    { id: "t2", number: 2, shape: "round", capacity: 4, x: 78, y: 62 },
    { id: "t3", number: 3, shape: "square", capacity: 4, x: 22, y: 38 },
    { id: "t4", number: 4, shape: "square", capacity: 4, x: 78, y: 38 },
    { id: "t5", number: 5, shape: "square", capacity: 4, x: 50, y: 16 }, // uppermost
    { id: "t6", number: 6, shape: "round", capacity: 4, x: 50, y: 80 },
  ];
  const project = (tables) => {
    const g = sceneGeometry(BOARD.width, BOARD.height);
    return Object.fromEntries(tables.map((t) => [t.id, {
      table: tableGeometry(t, g),
      chairs: chairPlacements(t, g).map((c) => ({ x: c.x, y: c.y })),
      box: tableFootprint(t, g),
    }]));
  };
  const dragMesa5To = (y) => DICE_ROOM.map((t) => (t.id === "t5" ? { ...t, y } : t));
  // Subpixel: these are pure arithmetic, so "unchanged" means bit-identical,
  // not "close enough to look alright".
  const EXACT = 10;

  test("moving Mesa 5 down leaves Mesas 1,2,3,4,6 in exactly the same place", () => {
    const before = project(DICE_ROOM);
    const after = project(dragMesa5To(45));
    ["t1", "t2", "t3", "t4", "t6"].forEach((id) => {
      expect(after[id].table.topX).toBeCloseTo(before[id].table.topX, EXACT);
      expect(after[id].table.topY).toBeCloseTo(before[id].table.topY, EXACT);
      expect(after[id].table.R).toBeCloseTo(before[id].table.R, EXACT);
    });
  });

  test("Mesa 5 itself does move, and downward on screen", () => {
    const before = project(DICE_ROOM);
    const after = project(dragMesa5To(45));
    expect(after.t5.table.topY).toBeGreaterThan(before.t5.table.topY);
    expect(after.t5.table.topX).toBeCloseTo(before.t5.table.topX, EXACT); // x untouched
  });

  test("the dragged Mesa's chair group travels with it, rigidly attached", () => {
    const before = project(DICE_ROOM);
    const after = project(dragMesa5To(45));
    expect(after.t5.chairs).toHaveLength(before.t5.chairs.length);
    // Rigid attachment is measured RELATIVE TO THE TABLE, in units of the
    // table's own radius: a table dragged nearer is legitimately drawn a little
    // larger (PK_OBJ) and its seats scale with it. Asserting a raw pixel shift
    // instead would be asserting that perspective is broken.
    const offsets = (state) => state.chairs.map((c) => ({
      dx: (c.x - state.table.floorX) / state.table.R,
      dy: (c.y - state.table.floorY) / state.table.R,
    }));
    const beforeOffsets = offsets(before.t5);
    offsets(after.t5).forEach((offset, i) => {
      expect(offset.dx).toBeCloseTo(beforeOffsets[i].dx, 9);
      expect(offset.dy).toBeCloseTo(beforeOffsets[i].dy, 9);
    });
    // ...and the whole group genuinely travelled down-screen with the table
    expect(after.t5.table.topY).toBeGreaterThan(before.t5.table.topY);
    after.t5.chairs.forEach((chair, i) => {
      expect(chair.y).toBeGreaterThan(before.t5.chairs[i].y);
    });
  });

  test("no untouched Mesa's chairs move, not by a subpixel", () => {
    const before = project(DICE_ROOM);
    const after = project(dragMesa5To(45));
    ["t1", "t2", "t3", "t4", "t6"].forEach((id) => {
      after[id].chairs.forEach((chair, i) => {
        expect(chair.x).toBeCloseTo(before[id].chairs[i].x, EXACT);
        expect(chair.y).toBeCloseTo(before[id].chairs[i].y, EXACT);
      });
    });
  });

  test("no untouched Mesa's hit target moves either", () => {
    const before = project(DICE_ROOM);
    const after = project(dragMesa5To(45));
    ["t1", "t2", "t3", "t4", "t6"].forEach((id) => {
      expect(after[id].box.left).toBeCloseTo(before[id].box.left, EXACT);
      expect(after[id].box.top).toBeCloseTo(before[id].box.top, EXACT);
      expect(after[id].box.width).toBeCloseTo(before[id].box.width, EXACT);
      expect(after[id].box.height).toBeCloseTo(before[id].box.height, EXACT);
    });
  });

  // The original defect moved untouched tables by up to 140px, so a coarse
  // assertion would have caught it -- but it is the *continuity* that matters:
  // an operator drags through many intermediate positions, and the room must
  // be rock-still at every one of them, including the extremes of the band.
  test("holds across the whole drag path, including the band's own edges", () => {
    const before = project(DICE_ROOM);
    [16, 20, 30, 45, 60, 75, ROOM_Y_MAX, ROOM_Y_MIN].forEach((y) => {
      const after = project(dragMesa5To(y));
      ["t1", "t2", "t3", "t4", "t6"].forEach((id) => {
        expect(after[id].table.topY).toBeCloseTo(before[id].table.topY, EXACT);
      });
    });
  });

  // Same invariant from the other direction: adding or removing a table is
  // also a change to the table set, and must not reframe the survivors.
  test("adding or removing a Mesa does not move the others", () => {
    const before = project(DICE_ROOM);
    const added = project([...DICE_ROOM, { id: "t7", number: 7, shape: "round", capacity: 2, x: 12, y: 12 }]);
    const removed = project(DICE_ROOM.filter((t) => t.id !== "t5"));
    ["t1", "t2", "t3", "t4", "t6"].forEach((id) => {
      expect(added[id].table.topY).toBeCloseTo(before[id].table.topY, EXACT);
      expect(removed[id].table.topY).toBeCloseTo(before[id].table.topY, EXACT);
    });
  });
});

describe("the projection basis is the room, not its contents", () => {
  test("sceneGeometry takes a board box and nothing else", () => {
    // Structural: the P0 entered through a `frame` parameter, so the absence of
    // one is the actual fix and is asserted as such.
    expect(sceneGeometry.length).toBe(2);
  });

  test("the frame is a constant, identical for every geometry", () => {
    const a = sceneGeometry(370, 662);
    const b = sceneGeometry(370, 662);
    expect(a.frame).toEqual(b.frame);
    expect(a.frame.vMin).toBe(ROOM_FRAME.vMin);
    expect(a.frame.vMax).toBe(ROOM_FRAME.vMax);
  });

  test("the framed band is the room's own reachable band, not any table's", () => {
    expect(ROOM_FRAME.vMin).toBeCloseTo(1 - ROOM_Y_MAX / 100, 12);
    expect(ROOM_FRAME.vMax).toBeCloseTo(1 - ROOM_Y_MIN / 100, 12);
  });

  test("the frame cannot be mutated at runtime", () => {
    expect(Object.isFrozen(ROOM_FRAME)).toBe(true);
  });

  // A table outside the reachable band (legacy data, a hand-edited row) must
  // still render inside the room. The frame is a MAPPING, never a clamp.
  test("a table outside the reachable band still projects into the room", () => {
    const g = sceneGeometry(370, 662);
    [0, 5, 95, 100].forEach((y) => {
      const p = projectFloorPoint(50, y, g);
      expect(Number.isFinite(p.sy)).toBe(true);
      expect(p.sy).toBeGreaterThan(g.horizon - g.height);
      expect(p.sy).toBeLessThan(g.height * 2);
      // and still round-trips, so a drag from there stays honest
      expect(unprojectScreenPoint(p.sx, p.sy, g).y).toBeCloseTo(y, 8);
    });
  });

  test("depth order is preserved across the whole logical domain", () => {
    const g = sceneGeometry(370, 662);
    for (let y = 0; y < 100; y += 5) {
      expect(projectFloorPoint(50, y, g).sy).toBeLessThan(projectFloorPoint(50, y + 5, g).sy);
    }
  });
});
