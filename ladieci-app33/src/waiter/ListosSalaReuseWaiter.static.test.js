// LISTOS_UNIFICADO_V1 -- proves the future Waiter Mode reuses the exact same
// Sala module as the operator's Listos "Sala" filter, instead of a second
// grafica being built later. Source-level check: both consumers import
// WaiterListosView/useMesaReadyCommands from this one file/hook -- neither
// re-implements the floor()/hasReadyOrder() read or the markServed mutation.
const fs = require("fs");
const path = require("path");

const waiterListosSrc = fs.readFileSync(path.join(__dirname, "WaiterListos.jsx"), "utf8");
const waiterShellSrc = fs.readFileSync(path.join(__dirname, "WaiterShell.jsx"), "utf8");
const listosUnificadoSrc = fs.readFileSync(
  path.join(__dirname, "../components/ordenes/ListosUnificado.jsx"),
  "utf8"
);

test("WaiterShell mounts the shared WaiterListos component for its Listos tab", () => {
  expect(waiterShellSrc).toMatch(/import WaiterListos from ['"]\.\/WaiterListos['"]/);
  expect(waiterShellSrc).toMatch(/<WaiterListos\b/);
});

test("ListosUnificado's Sala filter imports the same WaiterListosView export WaiterListos.jsx defines", () => {
  expect(waiterListosSrc).toMatch(/export function WaiterListosView/);
  expect(listosUnificadoSrc).toMatch(/import \{ WaiterListosView \} from ['"]\.\.\/\.\.\/waiter\/WaiterListos['"]/);
});

test("both consumers source Sala data from the single useMesaReadyCommands hook -- no second poll/chime implementation", () => {
  expect(waiterListosSrc).toMatch(/useMesaReadyCommands/);
  expect(listosUnificadoSrc).toMatch(/useMesaReadyCommands/);
  // WaiterListosView itself takes rows as props -- it must not call the hook.
  const viewFnIdx = waiterListosSrc.indexOf("export function WaiterListosView");
  const viewFnEnd = waiterListosSrc.indexOf("\n}", viewFnIdx);
  const viewFnBody = waiterListosSrc.slice(viewFnIdx, viewFnEnd);
  expect(viewFnBody).not.toMatch(/useMesaReadyCommands\(/);
});

test("the waiter's Sala view shows nothing but Mesa data -- no Recogida/Domicilio/financial imports in WaiterListos.jsx", () => {
  expect(waiterListosSrc).not.toMatch(/import .*TabListos/);
  expect(waiterListosSrc).not.toMatch(/PaymentModal/);
  expect(waiterListosSrc).not.toMatch(/mesaApi\.pay\b/);
});
