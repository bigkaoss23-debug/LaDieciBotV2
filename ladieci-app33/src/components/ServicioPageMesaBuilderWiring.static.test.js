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

  test("MesaOrderBuilder is mounted separately, gated on mesaCommandTarget, receiving target/onClose/onSubmit", () => {
    const idx = src.indexOf("<MesaOrderBuilder");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 40), idx + 300);
    expect(block).toMatch(/mesaCommandTarget && <MesaOrderBuilder/);
    expect(block).toMatch(/target=\{mesaCommandTarget\}/);
    expect(block).toMatch(/onSubmit=\{addMesaCommand\}/);
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
});

describe("the Mesa contract addMesaCommand still posts through mesaApi.addCommand unchanged", () => {
  test("addMesaCommand still sends items/note/kitchenNote/coversTotal/clientRequestId", () => {
    const idx = src.indexOf("const addMesaCommand");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/mesaApi\.addCommand\(target\.sessionId/);
    expect(block).toMatch(/note: order\.nota \|\| ""/);
    expect(block).toMatch(/kitchenNote: order\.nota \|\| ""/);
    expect(block).toMatch(/clientRequestId: order\.client_req_id/);
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
