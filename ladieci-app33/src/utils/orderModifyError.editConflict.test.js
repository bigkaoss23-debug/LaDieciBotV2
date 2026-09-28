// POST-ASTRA F5 / F7 -- the editor's two new typed refusals reach the operator through the one resolver every call site uses,
// and every whole-item-list edit pins the list it was computed from (expected_items).
const fs = require("fs");
const path = require("path");
const {
  parseOrderWriteRefusal, ORDER_EDIT_CONFLICT, ORDER_EDIT_CONFLICT_MESSAGE, ORDER_WRITE_FAILED, ORDER_WRITE_FAILED_MESSAGE,
} = require("./orderModifyError");

test("ORDER_EDIT_CONFLICT is a blocked write with the conflict message (code or error)", () => {
  expect(parseOrderWriteRefusal({ success: false, code: ORDER_EDIT_CONFLICT })).toEqual({ blocked: true, message: ORDER_EDIT_CONFLICT_MESSAGE, estado: null });
  expect(parseOrderWriteRefusal({ success: false, error: ORDER_EDIT_CONFLICT, message: "Del backend." }).message).toBe("Del backend.");
});

test("ORDER_WRITE_FAILED is a blocked write (never a false success)", () => {
  expect(parseOrderWriteRefusal({ success: false, error: ORDER_WRITE_FAILED })).toEqual({ blocked: true, message: ORDER_WRITE_FAILED_MESSAGE, estado: null });
});

test("a success carrying the code is not blocked; unrelated failures are not claimed", () => {
  expect(parseOrderWriteRefusal({ success: true, code: ORDER_EDIT_CONFLICT }).blocked).toBe(false);
  expect(parseOrderWriteRefusal({ success: false, code: "OTHER" }).blocked).toBe(false);
  expect(parseOrderWriteRefusal(null).blocked).toBe(false);
});

test("static · every whole-item-list updateOrden call sends expected_items", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const sites = [
    ...read("components/ServicioPage.jsx").split("\n").filter((l) => /action:\s*"updateOrden"/.test(l) && /items/.test(l)),
    ...read("components/cocina/TabCocina.jsx").split("\n").filter((l) => /action:\s*"updateOrden"/.test(l)),
  ];
  expect(sites.length).toBeGreaterThanOrEqual(3);
  for (const line of sites) expect(line).toMatch(/expected_items/);
  // the modal path spreads its basis on the following line
  expect(read("components/ServicioPage.jsx")).toMatch(/\.\.\.\(basisItems \? \{ expected_items: basisItems \} : \{\}\)/);
  expect(read("components/cocina/TabCocina.jsx")).toMatch(/parseOrderWriteRefusal\(res\)/);
});
