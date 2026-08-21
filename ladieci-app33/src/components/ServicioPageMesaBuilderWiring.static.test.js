// V1_STAGING_MESA_ORDER_BUILDER_39 slice -- source-contract tests proving the
// new dedicated MesaOrderBuilder is wired in WITHOUT touching the Teléfono/
// Recogida/Domicilio path through NuevoPedidoModal. Same reasoning as
// ServicioPageListosUnificadoWiring.static.test.js: ServicioPage.jsx has no
// render-test harness, so these are static, source-level assertions. The
// dynamic Mesa-builder behavior itself is covered by MesaOrderBuilder.test.js.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "ServicioPage.jsx"), "utf8");
const nuevoPedidoSrc = fs.readFileSync(path.join(__dirname, "NuevoPedidoModal.jsx"), "utf8");

describe("MesaOrderBuilder is a separate mount, never routed through NuevoPedidoModal", () => {
  test("ServicioPage imports MesaOrderBuilder from ./mesa/MesaOrderBuilder", () => {
    expect(src).toMatch(/import MesaOrderBuilder from ['"]\.\/mesa\/MesaOrderBuilder['"]/);
  });

  test("NuevoPedidoModal is always mounted with tableContext={null} -- Mesa never reaches it", () => {
    const idx = src.indexOf("<NuevoPedidoModal");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/tableContext=\{null\}/);
  });

  test("NuevoPedidoModal's onConfirm no longer branches on mesaCommandTarget -- it only calls addOrden", () => {
    const idx = src.indexOf("<NuevoPedidoModal");
    const end = src.indexOf("{mesaCommandTarget && <MesaOrderBuilder", idx);
    const block = src.slice(idx, end);
    expect(block).not.toMatch(/mesaCommandTarget/);
    expect(block).toMatch(/addOrden\(o\)/);
  });

  test("MesaOrderBuilder is mounted separately, gated on mesaCommandTarget, receiving target/draft/onClose/onConfirm (local-only, no onSubmit)", () => {
    const idx = src.indexOf("<MesaOrderBuilder");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 40), idx + 400);
    expect(block).toMatch(/mesaCommandTarget && <MesaOrderBuilder/);
    expect(block).toMatch(/target=\{mesaCommandTarget\}/);
    expect(block).toMatch(/draft=\{mesaDrafts\[mesaCommandTarget\.sessionId\] \|\| null\}/);
    expect(block).toMatch(/onConfirm=\{/);
    expect(block).not.toMatch(/onSubmit=/);
  });

  test("Confirmar comanda (onConfirm) only ever writes to local mesaDrafts state -- no mesaApi call in this wiring", () => {
    const idx = src.indexOf("<MesaOrderBuilder");
    const end = src.indexOf("{ordenModifica", idx);
    const block = src.slice(idx, end);
    expect(block).toMatch(/setMesaDrafts/);
    expect(block).not.toMatch(/mesaApi\.addCommand/);
  });

  test("TabMesa's onNewCommand no longer opens the Cliente-panel modal (no setShowNuevo/setPrefillCliente for Mesa)", () => {
    const idx = src.indexOf("onNewCommand={(table)");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).not.toMatch(/setShowNuevo/);
    expect(block).not.toMatch(/setPrefillCliente/);
    expect(block).toMatch(/setMesaCommandTarget/);
    expect(block).toMatch(/table\.session\.coversTotal/);
  });

  test("TabMesa also receives mesaDrafts/onClearDraft/onSendToCocina -- MesaWorkspace, not ServicioPage, owns the Cocina send", () => {
    const idx = src.indexOf("<TabMesa role=");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/mesaDrafts=\{mesaDrafts\}/);
    expect(block).toMatch(/onClearDraft=\{/);
    expect(block).toMatch(/onSendToCocina=\{sendMesaCommandToCocina\}/);
  });

  test("TabMesa is mounted with hideToolbar -- the Sala principal selector/legend are map clutter Mesa doesn't need", () => {
    const idx = src.indexOf("<TabMesa role=");
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/\bhideToolbar\b/);
  });
});

describe("Mesa map cleanup: the dead 'SELECCIONA UNA MESA' bottom CTA is gone", () => {
  test("the literal 'SELECCIONA UNA MESA' label no longer exists in source", () => {
    expect(src).not.toMatch(/SELECCIONA UNA MESA/);
  });
  test("the generic NUEVO PEDIDO bottom button is not rendered while on the Mesa tab", () => {
    const idx = src.indexOf('>NUEVO PEDIDO<');
    expect(idx).toBeGreaterThan(-1);
    // FIN-01 widened this button's own style block (flex:1 -> flex:"1 1 190px"
    // so the bar can wrap onto a second row on a phone), which pushed the gate
    // a few characters past the old 700-char window. The assertion's intent is
    // unchanged: the Mesa gate must sit immediately before this button, not
    // merely somewhere in the file.
    const before = src.slice(Math.max(0, idx - 800), idx);
    expect(before).toMatch(/!\(MESA_UI_ENABLED && tab === "banco"\) && <button/);
  });
});

describe("the Mesa contract sendMesaCommandToCocina still posts through mesaApi.addCommand unchanged", () => {
  test("sendMesaCommandToCocina still sends items/note/kitchenNote/coversTotal/clientRequestId", () => {
    const idx = src.indexOf("const sendMesaCommandToCocina");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/mesaApi\.addCommand\(sessionId/);
    expect(block).toMatch(/note: draft\.nota \|\| ""/);
    expect(block).toMatch(/kitchenNote: draft\.nota \|\| ""/);
    expect(block).toMatch(/clientRequestId: draft\.client_req_id/);
  });

  test("addMesaCommand (the old direct-submit path) no longer exists -- fully replaced by the draft flow", () => {
    expect(src).not.toMatch(/const addMesaCommand/);
  });
});

describe("NuevoPedidoModal.jsx itself is untouched -- the generic Cliente/planner/delivery UI still exists", () => {
  test("isTableOrder gate is still present (now permanently false, not removed)", () => {
    expect(nuevoPedidoSrc).toMatch(/const isTableOrder = Boolean\(tableContext && tableContext\.sessionId\)/);
  });
  test("the Cliente/nombre panel is unconditional (no isTableOrder gate hiding it)", () => {
    expect(nuevoPedidoSrc).toMatch(/nombre/);
  });
  test("planner/direccion/zona logic is still present in source (never stripped for Mesa)", () => {
    expect(nuevoPedidoSrc).toMatch(/direccion/);
    expect(nuevoPedidoSrc).toMatch(/PremiumPlannerPopup/);
  });
});
