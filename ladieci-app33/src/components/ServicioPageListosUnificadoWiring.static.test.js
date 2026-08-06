// S2-7D4C "Listos unificado" -- source-contract tests for ServicioPage.jsx's
// wiring after removing the standalone "Para servir" tab. Same reasoning as
// the file this replaces (ServicioPageParaServirTab.static.test.js, deleted
// in this slice): ServicioPage.jsx has no render-test harness, so these are
// static, source-level assertions; the actual dynamic behavior (column
// appears/disappears, phone selector, badge sums) is covered by
// ListosUnificado.test.js, which DOES have a harness since it's a small,
// self-contained component.
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "ServicioPage.jsx"), "utf8");

describe("1. the standalone Para servir tab is gone", () => {
  test("no \"paraservir\" tab entry remains in the TABS array", () => {
    expect(src).not.toMatch(/\{id:"paraservir"/);
  });
  test("no \"Para servir\" label string remains", () => {
    expect(src).not.toMatch(/label:"Para servir"/);
  });
  test("WaiterListos is no longer imported directly by ServicioPage", () => {
    expect(src).not.toMatch(/import WaiterListos from ['"]\.\.\/waiter\/WaiterListos['"]/);
  });
});

describe("2. Mesa stays in the main nav, Listos now renders ListosUnificado", () => {
  test("TABS still includes the Mesa/Barra tab (id \"banco\")", () => {
    expect(src).toMatch(/\{id:"banco"/);
  });
  test("nav order is wa, manual, banco, listos, cocina, entregas", () => {
    const ids = ["wa", "manual", "banco", "listos", "cocina", "entregas"];
    const positions = ids.map((id) => src.indexOf(`{id:"${id}"`));
    positions.forEach((p) => expect(p).toBeGreaterThan(-1));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });
  test("ServicioPage imports ListosUnificado from the ordenes module", () => {
    expect(src).toMatch(/import ListosUnificado from ['"]\.\/ordenes\/ListosUnificado['"]/);
  });
  test("tab===\"listos\" renders <ListosUnificado ...> and nothing else", () => {
    const idx = src.indexOf('tab==="listos"');
    expect(idx).toBeGreaterThan(-1);
    const line = src.slice(idx, src.indexOf("\n", idx));
    expect(line).toMatch(/<ListosUnificado\b/);
  });
  test("ListosUnificado receives the Sala plumbing (notify, refreshKey, onSalaCountChange, listosN)", () => {
    const idx = src.indexOf("<ListosUnificado");
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/notify=\{notify\}/);
    expect(block).toMatch(/refreshKey=\{mesaRefreshKey\}/);
    expect(block).toMatch(/onSalaCountChange=\{setSalaN\}/);
    expect(block).toMatch(/listosN=\{listosN\}/);
  });
});

describe("3. the main Listos badge sums both queues", () => {
  test("listosBadgeN = listosN + salaN feeds the listos tab badge", () => {
    expect(src).toMatch(/const listosBadgeN = listosN \+ salaN;/);
    const idx = src.indexOf('{id:"listos"');
    const line = src.slice(idx, src.indexOf("\n", idx));
    expect(line).toMatch(/badge:\{n:listosBadgeN/);
  });
});

describe("4. stale \"paraservir\" tab reference falls back safely", () => {
  test("an effect redirects a lingering tab===\"paraservir\" value to \"listos\"", () => {
    expect(src).toMatch(/if \(tab === "paraservir"\) setTab\("listos"\)/);
  });
});

describe("TabListos and its Retirado flow are untouched by this slice", () => {
  test("TabListos import is unchanged (default + caricoTotale named export)", () => {
    expect(src).toMatch(/import TabListos, \{ caricoTotale \} from ['"]\.\/ordenes\/TabListos['"]/);
  });
});
