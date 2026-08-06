// "Para servir" stopgap tab — source-contract tests.
//
// ServicioPage.jsx has never been render-tested (no harness exists for its
// WhatsApp/Realtime/Supabase dependencies), and building one just for this
// slice is out of proportion -- same reasoning already applied to the
// App.jsx auth-bootstrap fix (see appOrdersAuthBootstrap.static.test.js).
// These are static, source-level assertions on the exact wiring; the actual
// runtime behavior (the current Mesa LISTO comanda appears once, correct
// products/quantity/note, Servida works end-to-end) is verified live against
// real staging in this slice's deploy report, not simulated here.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "ServicioPage.jsx"), "utf8");

describe("1. Para servir exists only when Mesa is enabled", () => {
  test("the TABS array includes paraservir behind a MESA_UI_ENABLED conditional spread", () => {
    expect(src).toMatch(/\.\.\.\(MESA_UI_ENABLED \? \[\{id:"paraservir"/);
  });

  test("the tab label is exactly \"Para servir\"", () => {
    const idx = src.indexOf('id:"paraservir"');
    const nearby = src.slice(idx, idx + 200);
    expect(nearby).toMatch(/label:"Para servir"/);
  });

  test("it sits between banco (Mesa) and listos in the TABS array, matching the requested nav order", () => {
    const bancoIdx = src.indexOf('id:"banco"');
    const paraservirIdx = src.indexOf('id:"paraservir"');
    const listosIdx = src.indexOf('id:"listos"');
    expect(bancoIdx).toBeLessThan(paraservirIdx);
    expect(paraservirIdx).toBeLessThan(listosIdx);
  });
});

describe("2. the tab genuinely mounts WaiterListos, reused as-is", () => {
  test("ServicioPage imports WaiterListos from the waiter module, not a local copy", () => {
    expect(src).toMatch(/import WaiterListos from ['"]\.\.\/waiter\/WaiterListos['"]/);
  });

  test("tab===\"paraservir\" renders <WaiterListos ...> and nothing else", () => {
    const idx = src.indexOf('tab==="paraservir"');
    expect(idx).toBeGreaterThan(-1);
    const line = src.slice(idx, src.indexOf("\n", idx));
    expect(line).toMatch(/<WaiterListos\b/);
  });

  test("no duplicated ready-order heuristic or second polling loop was introduced in ServicioPage itself", () => {
    // WaiterListos owns its own mesaApi.floor() poll; ServicioPage must not
    // reimplement hasReadyOrder or start a second interval for this tab.
    expect(src).not.toMatch(/function hasReadyOrder/);
    const paraservirBlockIdx = src.indexOf('tab==="paraservir"');
    const blockEnd = src.indexOf(";", paraservirBlockIdx);
    const block = src.slice(paraservirBlockIdx, blockEnd);
    expect(block).not.toMatch(/setInterval/);
  });
});

describe("TabListos and its Retirado flow are untouched by this slice", () => {
  test("TabListos import is unchanged (default + caricoTotale named export)", () => {
    expect(src).toMatch(/import TabListos, \{ caricoTotale \} from ['"]\.\/ordenes\/TabListos['"]/);
  });
});
