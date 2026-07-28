import fs from "fs";
import path from "path";

const source = fs.readFileSync(path.join(__dirname, "ServicioPage.jsx"), "utf8");
const modalSource = fs.readFileSync(path.join(__dirname, "NuevoPedidoModal.jsx"), "utf8");

describe("instant order feedback integration", () => {
  test("Confirmar pedido starts one truthful transaction before its backend await", () => {
    const start = source.indexOf("const addOrden  = async");
    const end = source.indexOf("const modificaOrden", start);
    const block = source.slice(start, end);

    expect(block).toContain('pendingTitle: "Guardando pedido…"');
    expect(block).toContain('successTitle: "Pedido confirmado"');
    expect(block).toContain("creationQueue.begin(snapshot)");
    expect(block.indexOf('setTab("manual")')).toBeLessThan(block.indexOf("await api.createOrden(snapshot)"));
    expect(block.indexOf("setShowNuevo(false)")).toBeLessThan(block.indexOf("await api.createOrden(snapshot)"));
    expect(block.indexOf("creationQueue.begin(snapshot)")).toBeLessThan(block.indexOf("await api.createOrden(snapshot)"));
    expect(block).toContain("creationQueue.confirm(requestId, persisted)");
    expect(block).toContain("id: res.id, _temp: false");
    expect(block).toContain("creationQueue.fail(requestId)");
  });

  test("modal starts the transaction before preferred-customer persistence", () => {
    const start = modalSource.indexOf("const buildAndSendOrder = async");
    const end = modalSource.indexOf("// SUCCESS is the only outcome", start);
    const block = modalSource.slice(start, end);

    expect(block).toContain("onTransactionStart?.(orderAttempt)");
    expect(block.indexOf("onTransactionStart?.(orderAttempt)"))
      .toBeLessThan(block.indexOf("await api.upsertCliente"));
    expect(source).toContain("onTransactionStart={startCreateTransaction}");
    expect(source).toContain('title: "Guardando pedido…"');
  });

  test("A Cocina publishes pending before request and updates locally only after valid success", () => {
    const start = source.indexOf("const confirmaOrdine = async");
    const end = source.indexOf("const forzaEntrega", start);
    const block = source.slice(start, end);

    expect(block).toContain('pendingTitle: "Enviando a cocina…"');
    expect(block).toContain('successTitle: "Pedido enviado a cocina"');
    expect(block.match(/api\.updateEstado/g)).toHaveLength(1);
    expect(block).toContain("res._ok === false");
    expect(block.indexOf("setOrdenes")).toBeGreaterThan(block.indexOf("res._ok === false"));
    expect(block).not.toContain("optimisticOrden");
    expect(block).not.toMatch(/\b(?:loadAll|refetch|syncOrdenes)\s*\(/);
    const failureBlock = block.slice(block.indexOf("onFailure:"), block.indexOf("});", block.indexOf("onFailure:")));
    expect(failureBlock).not.toContain("setOrdenes");
    expect(block).toContain("endAction(id);");
  });

  test("shared wiring carries the click timestamp and one-second minimum", () => {
    const splashStart = source.indexOf("{successSplash&&<OperationalSuccessSplash");
    const splashEnd = source.indexOf("/>}", splashStart);
    const block = source.slice(splashStart, splashEnd);

    expect(block).toContain("phase={successSplash.phase}");
    expect(block).toContain("duration={successSplash.minDuration || OPERATIONAL_SUCCESS_DURATION_MS}");
    expect(block).toContain("startedAt={successSplash.startedAt}");
    expect(block).not.toContain("nextTab");
    expect(source).toContain("OPERATIONAL_SUCCESS_DURATION_MS");
    expect(block).not.toContain("nextTab");
  });

  test("create failure has one operator-facing message and no duplicate notify", () => {
    const start = source.indexOf("const addOrden  = async");
    const end = source.indexOf("const waConfirm", start);
    const block = source.slice(start, end);
    const failureText = "No se pudo confirmar el pedido.";

    expect(block.match(new RegExp(failureText.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "g"))).toHaveLength(2);
    const failureStart = block.indexOf("onFailure:");
    expect(block.slice(failureStart)).not.toContain('notify("❌');
    expect(block).toContain("setShowNuevo(true)");
  });
});
