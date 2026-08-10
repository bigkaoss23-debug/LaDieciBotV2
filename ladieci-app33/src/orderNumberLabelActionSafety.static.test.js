// P1-A -- static guard: the disambiguated ticket label (from
// buildVisibleOrderLabels/resolveVisibleOrderLabel, src/utils/orderNumber.js)
// is presentation ONLY. This proves, by source inspection across every file
// this slice touched, that:
//   (a) no React `key` is ever derived from the computed label -- keys stay
//       on the canonical order id;
//   (b) no action callback (onConfirm/onElimina/onModifica/... ) is ever
//       invoked with the label instead of the canonical id;
//   (c) the disambiguation is actually wired in (not silently reverted).
// A future change that piped a label into either position would fail this
// test immediately, before it could ship a "clicking #001 · B edits order A"
// bug.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const FILES = [
  "src/components/ordenes/OrdenCard.jsx",
  "src/components/cocina/TabCocina.jsx",
  "src/components/cocina/PanelCocina.jsx",
  "src/components/ordenes/TabListos.jsx",
  "src/components/ordenes/ListosArchivados.jsx",
  "src/components/ordenes/TabManual.jsx",
  "src/components/ordenes/TabBanco.jsx",
  "src/components/entregas/TabEntregas.jsx",
  "src/components/repartidor/RepartidorPage.jsx",
];

// Every prop/callback in these files that dispatches a real action against a
// specific order -- deliberately over-inclusive so a new one added later is
// still covered as soon as it's added to this list.
const ACTION_CALLBACKS = [
  "onConfirm", "onElimina", "onModifica", "onForzarEntrega", "onOpenTicket",
  "onRetirado", "onVolverACocina", "onCambiaPago", "onListo",
];

// Bare "label" is deliberately excluded from the key-expression check: these
// files are large enough to have their OWN, unrelated local variables named
// "label" (e.g. a zone/category summary chip keyed by its own label field --
// nothing to do with order ticket numbers). The helper names below are the
// ones this slice actually introduced and are specific enough not to collide.
const KEY_CHECK_IDENTIFIERS = ["orderLabels", "resolveVisibleOrderLabel", "buildVisibleOrderLabels"];
const labelWordRe = (name) => new RegExp(`\\b${name}\\b`);

function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("P1-A visible label stays presentation-only (canonical id remains the identity everywhere)", () => {
  for (const file of FILES) {
    test(`${file}: no key={...} attribute derives from the disambiguated label`, () => {
      const src = readSource(file);
      const keyExprs = [...src.matchAll(/\bkey=\{([^}]*)\}/g)].map((m) => m[1]);
      expect(keyExprs.length).toBeGreaterThan(0); // the file must still render a keyed list
      for (const expr of keyExprs) {
        for (const name of KEY_CHECK_IDENTIFIERS) {
          expect(labelWordRe(name).test(expr)).toBe(false);
        }
      }
    });

    test(`${file}: no action callback is ever called with the label instead of the order id`, () => {
      const src = readSource(file);
      for (const cb of ACTION_CALLBACKS) {
        // Matches e.g. onConfirm(o.id) fine, but flags onConfirm(label) /
        // onConfirm(orderLabels...) / onConfirm(resolveVisibleOrderLabel(...)).
        const callRe = new RegExp(`\\b${cb}\\(\\s*(label|orderLabels|resolveVisibleOrderLabel)\\b`);
        expect(callRe.test(src)).toBe(false);
      }
    });
  }

  test("every touched file that renders formatted numbers actually wires the collision-aware helpers (not silently reverted to the old bare formatter)", () => {
    // OrdenCard is the exception: it accepts label as an optional prop and
    // falls back to formatOrderNumber itself -- it doesn't compute labels.
    const shouldWireDirectly = FILES.filter((f) => !f.endsWith("OrdenCard.jsx"));
    for (const file of shouldWireDirectly) {
      const src = readSource(file);
      const usesHelper = /resolveVisibleOrderLabel\(|buildVisibleOrderLabels\(/.test(src);
      expect(usesHelper).toBe(true);
    }
  });

  test("OrdenCard exposes label as an explicit, optional, presentation-only prop", () => {
    const src = readSource("src/components/ordenes/OrdenCard.jsx");
    expect(src).toMatch(/\blabel\b/);
    // Falls back to the plain formatter when no label is supplied -- never
    // required, never defaults to blank/undefined text.
    expect(src).toMatch(/label\s*\?\?\s*formatOrderNumber\(o\)/);
  });
});
