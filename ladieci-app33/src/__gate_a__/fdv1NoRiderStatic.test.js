/**
 * [FDV1] punti 1–2 della review pre-DDL, verificati sul sorgente:
 *   1. nessuna lettura/scrittura della telemetria rider (DRIVER_STATO, registrarSalidaDriver, chiudiGiro) nel percorso operativo;
 *   2. `hora` (promessa cliente) viaggia come dato dell'operatore; la deadline la fissa solo il backend.
 */
const fs = require("fs");
const path = require("path");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("FDV1 — nessun rider nel percorso operativo", () => {
  test("nessun caller FDV1 di getDriverStatus / registrarSalidaDriver / chiudiGiro, nessuna lettura DRIVER_STATO", () => {
    const code = (rel) => read(rel).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const rel of ["components/entregas/TabEntregas.jsx", "components/NuevoPedidoModal.jsx", "components/ServicioPage.jsx",
      "components/cocina/TabCocina.jsx", "components/cocina/PanelCocina.jsx", "components/repartidor/RepartidorPage.jsx"]) {
      const src = code(rel);
      expect(src).not.toMatch(/getDriverStatus\s*\(|registrarSalidaDriver|['"]chiudiGiro['"]|DRIVER_STATO/);
    }
  });
  test("Entregas: nessun 'Registrar salida', nessun banner rientro, RETIRADO = 'Entregado'", () => {
    const src = read("components/entregas/TabEntregas.jsx");
    expect(src).toMatch(/const \[driverStato\] = useState\(null\);/);
    expect(src).toMatch(/const salidaMancante = !FDV1_NO_RIDER &&/);
    expect(src).not.toMatch(/Driver volvió|Driver de vuelta/);
  });
  test("Nuevo Pedido: DRIVER_STATO non viene letto", () => {
    const src = read("components/NuevoPedidoModal.jsx");
    expect(src).toMatch(/const \[driverStato\]\s+= useState\(null\);/);
  });
  test("range ± UI = contratto backend (±30, passo 5)", () => {
    const { UI_OFFSET_MAX, UI_OFFSET_STEP } = require("../utils/uiOffset");
    expect(UI_OFFSET_MAX).toBe(30); expect(UI_OFFSET_STEP).toBe(5);
  });
  test("nessun file FE scrive la telemetria rider", () => {
    for (const rel of ["api.js", "components/entregas/TabEntregas.jsx", "components/NuevoPedidoModal.jsx", "components/repartidor/RepartidorPage.jsx"]) {
      const src = read(rel).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
      expect(src).not.toMatch(/registrarSalidaDriver|['"]chiudiGiro['"]|upsert\([^)]*DRIVER_STATO/);
    }
  });
});

describe("FDV1 — hora e deadline separate", () => {
  test("Nuevo Pedido invia hora come dato operatore, nessun flag che la trasformi in deadline", () => {
    const src = read("components/NuevoPedidoModal.jsx");
    expect(src).not.toMatch(/delivery_contract/);
    expect(src).toMatch(/nota: notaFinale, hora, ts: Date\.now\(\)/);
    expect(src).toMatch(/Hora prometida al cliente/);
    // la proposta iniziale della hora è una sola volta e mai sopra una scelta dell'operatore
    expect(src).toMatch(/!fdv1HoraPrefilled\.current && !horaCustom\.current/);
  });
});
