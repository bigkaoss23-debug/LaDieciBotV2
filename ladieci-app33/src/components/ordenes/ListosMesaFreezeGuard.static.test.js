// LISTOS_UNIFICADO_V1 -- regression guard proving the Mesa-frozen surface was
// not touched by the Todo/Sala/Takeaway unification. Two things are checked:
//   1. None of the four frozen files reference the new Listos modules --
//      Listos was built to REUSE Mesa's existing read-model (mesaApi.floor(),
//      useMesaReadyCommands, WaiterListosView), never the other way around.
//   2. ServicioPage.jsx's Cocina/Entregas tab wiring is untouched by this
//      slice (this slice never edited that file at all).
const fs = require("fs");
const path = require("path");

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

describe("Mesa-frozen files never reference the new Listos surfaces", () => {
  const frozenFiles = {
    "TabMesa.jsx": "../mesa/TabMesa.jsx",
    "MesaOrderBuilder.jsx": "../mesa/MesaOrderBuilder.jsx",
    "ItemPickerModal.jsx": "../ItemPickerModal.jsx",
  };

  Object.entries(frozenFiles).forEach(([name, rel]) => {
    test(`${name} does not import or mention ListosUnificado/ListosArchivados`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/ListosUnificado/);
      expect(src).not.toMatch(/ListosArchivados/);
    });
  });
});

describe("Cocina/Entregas wiring in ServicioPage.jsx is untouched by this slice", () => {
  test("the Cocina and Entregas tab entries are still present, unchanged shape", () => {
    const src = read("../ServicioPage.jsx");
    expect(src).toMatch(/\{id:"cocina",\s*icon:"🍕",\s*label:"Cocina"/);
    expect(src).toMatch(/\{id:"entregas",\s*icon:"🛵",\s*label:"Entregas"/);
  });
});
