import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(__dirname, "ServicioPage.jsx"), "utf8");

describe("instant order feedback integration", () => {
  test("Confirmar pedido uses the local queue instead of a full-screen network pending state", () => {
    const start = source.indexOf("const addOrden  = async");
    const end = source.indexOf("const modificaOrden", start);
    const block = source.slice(start, end);

    expect(block).not.toContain('title: "Confirmando pedido…"');
    expect(block).toContain("creationQueue.begin(o)");
    expect(block.indexOf('setTab("manual")')).toBeLessThan(block.indexOf("await api.createOrden(o)"));
    expect(block).toContain("creationQueue.confirm(requestId, persisted)");
    expect(block).toContain('title: "¡Pedido confirmado!"');
    expect(block).toContain('subtitle: "Listo para cocina."');
    expect(block).toContain("creationQueue.fail(requestId)");
  });

  test("A Cocina has no full-screen pending and updates locally only after one valid backend response", () => {
    const start = source.indexOf("const confirmaOrdine = async");
    const end = source.indexOf("const forzaEntrega", start);
    const block = source.slice(start, end);

    expect(block).not.toContain('phase: "pending"');
    expect(block.match(/api\.updateEstado/g)).toHaveLength(1);
    expect(block).toContain("res._ok === false");
    expect(block.indexOf("setOrdenes")).toBeGreaterThan(block.indexOf("res._ok === false"));
    expect(block).toContain('title: "¡Pedido enviado a cocina!"');
    expect(block).toContain("setSuccessSplash(null)");
    expect(block).not.toContain("optimisticOrden");
  });

  test("shared wiring uses a 300 ms success duration and no deferred tab callback", () => {
    const splashStart = source.indexOf("{successSplash&&<OperationalSuccessSplash");
    const splashEnd = source.indexOf("/>}", splashStart);
    const block = source.slice(splashStart, splashEnd);

    expect(block).toContain("phase={successSplash.phase}");
    expect(block).toContain("duration={300}");
    expect(block).not.toContain("nextTab");
    expect(block).not.toMatch(/duration=\\{(?:8|9|10)00\\}/);
  });
});
