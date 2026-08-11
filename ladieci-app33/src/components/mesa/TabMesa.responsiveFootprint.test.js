// MESA_P1_MOBILE_TABLE_OVERLAP -- responsive table footprint. Pure unit
// tests against the exported responsiveTableSize()/previewResponsiveTablePx()
// (same pattern as TabMesa.layout.test.js): JSDOM never runs real layout, so
// there is no way to assert on actual rendered pixels here the way this fix
// was verified live in the browser against real staging data (see
// MESA_P1_MOBILE_TABLE_OVERLAP_REPORT.md). previewResponsiveTablePx is the
// numeric mirror of the shipped CSS clamp() formula, kept in lockstep by
// construction (both read the same BOARD_WIDTH_REFERENCE/TABLE_MIN_SCALE),
// so testing it is testing what actually ships.
const {
  responsiveTableSize, previewResponsiveTablePx, resolveTablePositions,
  BOARD_WIDTH_REFERENCE, TABLE_MIN_SCALE,
} = require("./TabMesa");

// Real Mesa 4/5/6/2 coordinates as saved on staging (tdikhfeinufaahagmpjz,
// restaurant_tables) at the time this fix was verified -- see the report's
// live-reproduction section. Round-tripped through resolveTablePositions()
// first, exactly like the real render path, rather than hand-typed again.
const table = (overrides) => ({
  id: overrides.id, number: overrides.number, x: overrides.x, y: overrides.y,
  shape: overrides.shape || "square", shapePreset: "standard", active: true,
});
const REAL_TABLES = resolveTablePositions([
  table({ id: "t2", number: 2, x: 78.031, y: 61.065, shape: "round" }),
  table({ id: "t4", number: 4, x: 30.000, y: 62.000 }),
  table({ id: "t5", number: 5, x: 49.085, y: 18.284 }),
  table({ id: "t6", number: 6, x: 50.000, y: 50.000 }),
]);
const byNumber = (n) => REAL_TABLES.find((t) => t.number === n);

// AABB overlap for two board-relative percentage points rendered at pxSize
// (both same shape/size here, as in the real reproduction) on a board of
// boardWidth x boardHeight.
function overlaps(a, b, pxSize, boardWidth, boardHeight) {
  const dx = Math.abs(a.x - b.x) / 100 * boardWidth;
  const dy = Math.abs(a.y - b.y) / 100 * boardHeight;
  return dx < pxSize && dy < pxSize;
}

// Real .mesa-board content width measured live (getBoundingClientRect) on
// deployed staging inside ServicioPage's Mesa tab, per required viewport.
const REAL_BOARD = {
  phonePortraitSmall: { viewport: [375, 812], width: 347, height: 440 },
  phonePortraitLarge: { viewport: [390, 844], width: 362, height: 440 },
  tabletPortrait: { viewport: [768, 1024], width: 740, height: 420 },
  tabletLandscape: { viewport: [1024, 768], width: 996, height: 420 },
};

describe("responsiveTableSize() CSS formula", () => {
  test("pins the exact clamp() emitted for each real shape base size", () => {
    expect(responsiveTableSize(100)).toBe("clamp(64px,16.129cqw,100px)");
    expect(responsiveTableSize(132)).toBe("clamp(84px,21.29cqw,132px)");
    expect(responsiveTableSize(168)).toBe("clamp(108px,27.097cqw,168px)");
  });

  test("every clamp() carries the shape's own current fixed size as both its own ceiling and the fallback value a non-supporting browser keeps", () => {
    [100, 132, 168].forEach((base) => {
      expect(responsiveTableSize(base).endsWith(`,${base}px)`)).toBe(true);
    });
  });
});

describe("previewResponsiveTablePx() -- numeric mirror of the shipped clamp()", () => {
  test("at and above the 620px reference width, every shape renders at its full legacy size (tablet/desktop unchanged)", () => {
    [620, 700, REAL_BOARD.tabletPortrait.width, REAL_BOARD.tabletLandscape.width, 1200].forEach((w) => {
      expect(previewResponsiveTablePx(100, w)).toBe(100);
      expect(previewResponsiveTablePx(132, w)).toBe(132);
      expect(previewResponsiveTablePx(168, w)).toBe(168);
    });
  });

  test("phone-portrait board widths (both required viewports) land on the minimum-scale floor for round/square", () => {
    expect(previewResponsiveTablePx(100, REAL_BOARD.phonePortraitSmall.width)).toBe(64);
    expect(previewResponsiveTablePx(100, REAL_BOARD.phonePortraitLarge.width)).toBe(64);
  });

  test("never shrinks any shape below its own TABLE_MIN_SCALE floor, at any width down to a degenerate 0", () => {
    [0, 50, 150, 250, 300, 320, 347, 362, 500].forEach((w) => {
      expect(previewResponsiveTablePx(100, w)).toBeGreaterThanOrEqual(Math.round(100 * TABLE_MIN_SCALE));
      expect(previewResponsiveTablePx(132, w)).toBeGreaterThanOrEqual(Math.round(132 * TABLE_MIN_SCALE));
      expect(previewResponsiveTablePx(168, w)).toBeGreaterThanOrEqual(Math.round(168 * TABLE_MIN_SCALE));
    });
  });

  test("round/square's floor (64px) stays comfortably above the ~44-48px minimum mobile tap-target guideline", () => {
    expect(previewResponsiveTablePx(100, 0)).toBeGreaterThanOrEqual(60);
  });

  test("is monotonically non-decreasing as board width grows -- no inversion where a wider board yields a smaller table", () => {
    const widths = [0, 100, 200, 300, 347, 362, 400, 500, 620, 800, 1200];
    for (let i = 1; i < widths.length; i++) {
      expect(previewResponsiveTablePx(100, widths[i])).toBeGreaterThanOrEqual(previewResponsiveTablePx(100, widths[i - 1]));
    }
  });

  test("shape size ordering (round/square <= rectangle <= rectangle-long) holds at every board width, not just at the reference", () => {
    [0, 100, 250, 347, 362, 500, 620, 900].forEach((w) => {
      const square = previewResponsiveTablePx(100, w);
      const rectangle = previewResponsiveTablePx(132, w);
      const rectangleLong = previewResponsiveTablePx(168, w);
      expect(rectangle).toBeGreaterThanOrEqual(square);
      expect(rectangleLong).toBeGreaterThanOrEqual(rectangle);
    });
  });

  test("recomputes independently per call -- a pure function of its own arguments, so resize/orientation (which only ever changes the width argument) always yields a fresh, correct value with no stale caching possible", () => {
    const portrait = previewResponsiveTablePx(100, REAL_BOARD.phonePortraitSmall.width);
    const landscapeSameTab = previewResponsiveTablePx(100, REAL_BOARD.tabletLandscape.width);
    expect(portrait).not.toBe(landscapeSameTab);
    expect(previewResponsiveTablePx(100, REAL_BOARD.phonePortraitSmall.width)).toBe(portrait); // re-querying the same width is still exactly reproducible
  });
});

describe("real Mesa 4/6 overlap (the reproduced defect) is resolved by the fix, at both required phone-portrait viewports", () => {
  test("BEFORE this fix (fixed 100px footprint), the real saved coordinates provably collide -- proves this test suite would have caught the original bug", () => {
    const t4 = byNumber(4); const t6 = byNumber(6);
    expect(overlaps(t4, t6, 100, REAL_BOARD.phonePortraitSmall.width, REAL_BOARD.phonePortraitSmall.height)).toBe(true);
    expect(overlaps(t4, t6, 100, REAL_BOARD.phonePortraitLarge.width, REAL_BOARD.phonePortraitLarge.height)).toBe(true);
  });

  test("AFTER this fix, Mesa 4 and Mesa 6 no longer collide at 375x812", () => {
    const t4 = byNumber(4); const t6 = byNumber(6);
    const px = previewResponsiveTablePx(100, REAL_BOARD.phonePortraitSmall.width);
    expect(overlaps(t4, t6, px, REAL_BOARD.phonePortraitSmall.width, REAL_BOARD.phonePortraitSmall.height)).toBe(false);
  });

  test("AFTER this fix, Mesa 4 and Mesa 6 no longer collide at 390x844", () => {
    const t4 = byNumber(4); const t6 = byNumber(6);
    const px = previewResponsiveTablePx(100, REAL_BOARD.phonePortraitLarge.width);
    expect(overlaps(t4, t6, px, REAL_BOARD.phonePortraitLarge.width, REAL_BOARD.phonePortraitLarge.height)).toBe(false);
  });

  test("the marginal Mesa 2/Mesa 6 sliver (only present at the narrowest required viewport) is also resolved", () => {
    const t2 = byNumber(2); const t6 = byNumber(6);
    const px = previewResponsiveTablePx(100, REAL_BOARD.phonePortraitSmall.width);
    expect(overlaps(t2, t6, px, REAL_BOARD.phonePortraitSmall.width, REAL_BOARD.phonePortraitSmall.height)).toBe(false);
  });

  test("tablet portrait and tablet landscape were never overlapping and stay that way (legacy full size, unchanged)", () => {
    const t4 = byNumber(4); const t6 = byNumber(6);
    const pxPortrait = previewResponsiveTablePx(100, REAL_BOARD.tabletPortrait.width);
    const pxLandscape = previewResponsiveTablePx(100, REAL_BOARD.tabletLandscape.width);
    expect(pxPortrait).toBe(100);
    expect(pxLandscape).toBe(100);
    expect(overlaps(t4, t6, pxPortrait, REAL_BOARD.tabletPortrait.width, REAL_BOARD.tabletPortrait.height)).toBe(false);
    expect(overlaps(t4, t6, pxLandscape, REAL_BOARD.tabletLandscape.width, REAL_BOARD.tabletLandscape.height)).toBe(false);
  });

  test("this fix never reads or touches saved x/y -- Mesa 4 and Mesa 6 keep their exact saved coordinates through resolveTablePositions()", () => {
    expect(byNumber(4).x).toBe(30.000); expect(byNumber(4).y).toBe(62.000);
    expect(byNumber(6).x).toBe(50.000); expect(byNumber(6).y).toBe(50.000);
  });
});

describe("progressive enhancement: unsupported browsers keep today's exact fixed-px behavior", () => {
  const { mesaCss } = require("./TabMesa");

  test("the responsive override is scoped inside @supports(container-type: inline-size), never unconditional", () => {
    expect(mesaCss).toContain("@supports (container-type: inline-size) {");
    expect(mesaCss).toContain(".mesa-board{container-type:inline-size}");
  });

  test("the original fixed-px rules (what TabMesa.test.js pins) still exist verbatim, outside and before the @supports block", () => {
    const supportsIndex = mesaCss.indexOf("@supports (container-type: inline-size)");
    const baseRuleIndex = mesaCss.indexOf(".mesa-table{box-sizing:border-box;position:absolute;transform:translate(-50%,-50%);width:100px;height:100px;");
    const rectangleRuleIndex = mesaCss.indexOf(".mesa-table.rectangle{width:132px;border-radius:16px}");
    expect(baseRuleIndex).toBeGreaterThan(-1);
    expect(rectangleRuleIndex).toBeGreaterThan(-1);
    expect(baseRuleIndex).toBeLessThan(supportsIndex);
    expect(rectangleRuleIndex).toBeLessThan(supportsIndex);
  });

  test("the old two-tier mobile breakpoint for rectangle/rectangle-long width is gone -- superseded by the continuous clamp(), not left to conflict with it", () => {
    expect(mesaCss).not.toContain("width:118px");
    expect(mesaCss).not.toContain("width:146px");
    // the rest of that same breakpoint (unrelated to table footprint) is untouched
    expect(mesaCss).toContain("@media(max-width:620px){.mesa-board{min-height:440px}");
  });
});
