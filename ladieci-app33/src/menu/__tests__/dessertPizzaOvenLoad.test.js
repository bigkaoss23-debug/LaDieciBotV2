/**
 * Regressione D-01 — le pizze dolci devono contare come carico forno.
 *
 * Il catalogo di luglio ha aggiunto Pizza KitKat (id 40) e Pizza Kinder (id 41),
 * entrambe cat:"Postres" con dulce:true. Sette punti del codice decidevano se un
 * dessert occupasse il forno confrontando il nome con "Pizza Nutella": le due
 * nuove pizze non venivano quindi conteggiate né in capacità, né negli slot, né
 * nello scheduling del driver.
 */
import { isDessertPizza } from "../dessertPizza";
import { isPizzaItem } from "../../core/kitchen/capacity";
import { MENU } from "../../constants";

const fromMenu = (id) => MENU.find((m) => String(m.id) === String(id));

describe("isDessertPizza", () => {
  test("true per le tre pizze dolci a catalogo", () => {
    [16, 40, 41].forEach((id) => {
      const item = fromMenu(id);
      expect(item).toBeDefined();
      expect(isDessertPizza(item)).toBe(true);
    });
  });

  test("false per i dessert che NON sono pizze", () => {
    [12, 13, 14, 15, 17, 18, 19].forEach((id) => {
      const item = fromMenu(id);
      if (item) expect(isDessertPizza(item)).toBe(false);
    });
  });

  test("compatibilità storica: Pizza Nutella senza flag `dulce` è riconosciuta dal nome", () => {
    expect(isDessertPizza({ n: "Pizza Nutella", cat: "Postres" })).toBe(true);
    expect(isDessertPizza({ n: "Pizza Nutella", cat: "Postres", q: 2, p: 9 })).toBe(true);
  });

  test("il flag ha la precedenza sul nome", () => {
    expect(isDessertPizza({ n: "Qualunque cosa", dulce: true })).toBe(true);
    expect(isDessertPizza({ n: "Tiramisú", dulce: false })).toBe(false);
  });

  test("input degeneri non lanciano", () => {
    [null, undefined, {}, { n: "" }].forEach((x) => expect(isDessertPizza(x)).toBe(false));
  });
});

describe("carico forno — le pizze dolci contano", () => {
  test("KitKat e Kinder sono conteggiate come pizza (regressione D-01)", () => {
    expect(isPizzaItem(fromMenu(40))).toBe(true);
    expect(isPizzaItem(fromMenu(41))).toBe(true);
  });

  test("Pizza Nutella continua a contare, anche senza flag (ordini storici)", () => {
    expect(isPizzaItem(fromMenu(16))).toBe(true);
    expect(isPizzaItem({ n: "Pizza Nutella", cat: "Postres" })).toBe(true);
  });

  test("i dessert non-pizza e le bevande NON contano", () => {
    expect(isPizzaItem(fromMenu(12))).toBe(false); // Misu Clásico
    expect(isPizzaItem(fromMenu(14))).toBe(false); // Ferrero Rocher
    expect(isPizzaItem(fromMenu(26))).toBe(false); // Coca Cola
    expect(isPizzaItem({ n: "Entrega a domicilio" })).toBe(false);
  });

  test("le pizze salate continuano a contare", () => {
    [1, 2, 11, 38, 39].forEach((id) => expect(isPizzaItem(fromMenu(id))).toBe(true));
  });

  test("nessun consumatore usa più il confronto per nome", () => {
    const fs = require("fs");
    const path = require("path");
    const SRC = path.join(__dirname, "..", "..");
    const files = [
      "core/kitchen/capacity.js",
      "core/delivery/scheduling.js",
      "components/ServicioPage.jsx",
      "components/cocina/PanelCocina.jsx",
      "components/cocina/TabCocina.jsx",
      "components/ordenes/TabListos.jsx",
    ];
    files.forEach((f) => {
      const src = fs.readFileSync(path.join(SRC, f), "utf8");
      expect(src).not.toMatch(/!==\s*"Pizza Nutella"/);
      expect(src).not.toMatch(/===\s*"Pizza Nutella"/);
      expect(src).toContain("isDessertPizza");
    });
  });
});
