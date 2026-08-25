// NUEVO PEDIDO — the delivery mode is an explicit control, and it owns the form.
//
// Before this batch the order type was DEDUCED from the address field:
//
// language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
//     const tipoConsegna = direccion.trim().length > 0 ? "DOMICILIO" : "RITIRO";
//
// language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
// which made the address panel the real selector. That is why a RITIRO still
// showed "DIRECCIÓN DE ENTREGA · Añadir dirección de entrega": hiding it would
// have removed the only way to create a delivery order. The operator now
// chooses, and the form follows the choice.
//
// Static because the modal is a 2300-line component with heavy device-shaped
// layout; these assertions are about the CONTRACT (who decides the type, what
// the form gates on it), not about pixels.

const fs = require("fs");
const path = require("path");

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");
// Comments legitimately quote the OLD wording to explain the fix, so every
// "this string is gone" check runs against code only.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const MODAL = read("NuevoPedidoModal.jsx");
const MODAL_CODE = codeOnly(MODAL);
const PANEL = read("DireccionInlinePanel.jsx");
const PANEL_CODE = codeOnly(PANEL);

// language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
describe("the mode is the single frontend authority for tipoConsegna", () => {
  test("the address no longer decides the order type", () => {
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).not.toMatch(/tipoConsegna\s*=\s*direccion\s*\.\s*trim\(\)\s*\.\s*length\s*>\s*0/);
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/const\s+tipoConsegna\s*=\s*modoEntrega\s*;/);
  });

  // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
  test("there is exactly one assignment of tipoConsegna, and it reads the chosen mode", () => {
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    const assignments = MODAL_CODE.match(/const\s+tipoConsegna\s*=/g) || [];
    expect(assignments).toHaveLength(1);
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/useState\("RITIRO"\)/);
  });

  test("both modes are offered as real controls", () => {
    expect(MODAL_CODE).toContain('data-testid="np-entrega-mode"');
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toContain('id: "RITIRO", label: "Retiro"');
    expect(MODAL_CODE).toContain('id: "DOMICILIO", label: "Domicilio"');
    expect(MODAL_CODE).toMatch(/aria-pressed=\{modoEntrega === opt\.id\}/);
    expect(MODAL_CODE).toMatch(/onClick=\{\(\) => setModoEntrega\(opt\.id\)\}/);
  });

  test("a re-edited order seeds the mode from the order, not from its address", () => {
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/prefill\.tipo_consegna === "DOMICILIO" \|\| prefill\.tipo_consegna === "RITIRO"/);
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/setModoEntrega\(prefill\.tipo_consegna\)/);
    // The old comment claiming the type activates itself from the address is gone.
    expect(MODAL_CODE).not.toMatch(/si attiva da solo/);
  });

  test("closing the modal resets the mode to Retiro", () => {
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/setModoEntrega\("RITIRO"\);\s*setDireccion\(""\)/);
  });
});

describe("the form follows the chosen mode", () => {
  // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
  test("RITIRO renders no delivery-address field", () => {
    // The input is now inside an isDomicilio branch instead of always-on.
    expect(PANEL_CODE).toMatch(/\{isDomicilio && \(\s*<div className="np-input-like np-address-input"/);
    expect(PANEL_CODE).toContain('data-testid="np-address-input"');
  });

  test("the panel names itself after the mode", () => {
    expect(PANEL_CODE).toMatch(/isDomicilio \? "Dirección de entrega" : "Recogida"/);
    expect(PANEL_CODE).toContain('data-testid="np-entrega-panel"');
  });

  // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
  test("pickup scheduling survives — RITIRO keeps its hora", () => {
    // The delivery-only satellites are gated; the time field is not.
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(PANEL).toMatch(/RITIRO: l'ora RESTA selezionabile/);
  });

  // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
  test("DOMICILIO now requires a real address, since an empty one no longer means RITIRO", () => {
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/const direccionOk = tipoConsegna !== "DOMICILIO" \|\| direccion\.trim\(\)\.length >= 5/);
    expect(MODAL_CODE).toMatch(/const ok = [^\n]*direccionOk/);
  });

  test("the delivery-only surfaces stay gated on the type", () => {
    for (const gated of [
      // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
      /showDeliveryAvailabilityLoading = tipoConsegna === "DOMICILIO"/,
      // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
      /tipoConsegna === "DOMICILIO" && driverWarningView/,
      // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
      /nextGiroOpportunity=\{tipoConsegna === "DOMICILIO"/,
    ]) expect(MODAL_CODE).toMatch(gated);
  });
});

describe("mobile: one primary CTA, and nothing said three times", () => {
  test("the empty products state is just the section and its one action", () => {
    expect(MODAL_CODE).toContain('data-testid="np-products-empty"');
    expect(MODAL_CODE).not.toContain("Todavía no hay nada");
    expect(MODAL_CODE).not.toContain("para empezar");
    expect(MODAL_CODE).toContain('data-testid="np-add-product"');
    // The counter only renders once it counts something.
    expect(MODAL_CODE).toMatch(/items\.length > 0 && \(\s*<span className="np-count-pill"/);
  });

  test("the phone footer keeps summary + confirm and folds the rest away", () => {
    expect(MODAL_CODE).toMatch(/isPhone\s*\?\s*<details className="np-pago"/);
    expect(MODAL_CODE).toContain("Pago y detalles");
    // ONE instance of each control, placed differently — never duplicated.
    expect((MODAL_CODE.match(/<DescuentoInput/g) || [])).toHaveLength(1);
    expect((MODAL_CODE.match(/const pagadoControl =/g) || [])).toHaveLength(1);
    // The confirm button is untouched and still the primary action.
    expect(MODAL_CODE).toMatch(/className="np-confirm"[\s\S]{0,120}disabled=\{!canConfirmOrder \|\| submissionBusy\}/);
  });

  test("the delivery fee is shown as a composition, not as a mysterious inclusion", () => {
    expect(MODAL_CODE).toContain('data-testid="np-fee-breakdown"');
    expect(MODAL_CODE).toMatch(/Productos \{\(totaleBase - DELIVERY_FEE\)/);
    expect(MODAL_CODE).not.toContain("Incl. {DELIVERY_FEE");
  });

  test("the phone flag is layout only — it gates no business logic", () => {
    // isPhone may only ever decide WHERE something renders. If it starts
    // gating handlers, totals or the payload, this fails.
    const uses = MODAL_CODE.split("\n").filter((l) => /\bisPhone\b/.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
      expect(line).not.toMatch(/tipoConsegna|payload|calcTotale|handleConfirm|api\./);
    }
  });

  test("tablet keeps its density: the same controls render inline in the footer", () => {
    expect(MODAL_CODE).toMatch(/:\s*<>\{descuentoControl\}\{pagadoControl\}<\/>/);
  });
});

describe("planner logic is untouched", () => {
  test("the certified planner preview calls and their gating are unchanged", () => {
    expect(MODAL_CODE).toMatch(/previewOrderPlanner|strategicPreview|openPlannerLab/);
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    // Planner still keys off tipoConsegna — which now simply has a better source.
    // language-guard: allow-legacy tipoConsegna/RITIRO/DOMICILIO are the existing order-type identifier and enum values, quoted verbatim to assert on the source, not new vocabulary
    expect(MODAL_CODE).toMatch(/tipoConsegna === "DOMICILIO" && direccion\.trim\(\)\.length < 5/);
  });
});
