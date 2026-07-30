/**
 * Parità catalogo staging ↔ produzione.
 *
 * La linea staging discende dal rescue incompleto 4be285d, che aveva fermato il
 * catalogo allo stato aa1332e: numerazione e pizze dolci sì, ma nomi classici
 * ancora spagnoli e numero ufficiale ancora dentro il titolo. Questi test
 * impediscono che lo staging riporti quella versione parziale a valle.
 *
 * Il catalogo statico resta la sorgente di fallback anche con il menu dinamico
 * attivo (useMenuData → REACT_APP_DYNAMIC_MENU_EMERGENCY_FALLBACK), quindi deve
 * essere corretto a prescindere dal flag.
 */
import { MENU, pizzaLabel } from "../../constants";

const pizzas = () => MENU.filter((p) => p.cat === "Pizzas");
const byId = (id) => MENU.find((p) => String(p.id) === String(id));

describe("catalogo statico staging — parità con la linea di produzione", () => {
  test("14 pizze, num 1..14 contigui, ordine array = numero ufficiale", () => {
    const nums = pizzas().map((p) => p.num);
    expect(nums).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  test("id interni stabili (gli ordini storici li referenziano)", () => {
    const expected = {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
      8: 8, 9: 9, 10: 10, 11: 11, 38: 12, 37: 13, 39: 14,
    };
    Object.entries(expected).forEach(([id, num]) => {
      expect(byId(id)).toBeDefined();
      expect(byId(id).num).toBe(num);
    });
  });

  test("nomi classici italiani finali (3d4c4d4)", () => {
    const expected = {
      1: "Margherita Classica",
      2: "Margherita di Bufala",
      3: "Marinara Classica",
      7: "Prosciutto e Funghi",
      8: "Quattro Formaggi",
      10: "Tonno e Cipolla",
      11: "Capricciosa",
      38: "CarboDieci",
      39: "affumicata",
    };
    Object.entries(expected).forEach(([id, sub]) => expect(byId(id).sub).toBe(sub));
  });

  test("nessun residuo spagnolo dello stato aa1332e", () => {
    const subs = MENU.map((m) => m.sub);
    [
      "Margarita Clásica", "Bufalina", "Marinara Clásica",
      "Jamón y Champiñones", "Cuatro Quesos", "Atún y Cebolla",
      "Caprichosa", "Carbonara", "La Ahumada",
    ].forEach((old) => expect(subs).not.toContain(old));
  });

  test("soprannomi finali", () => {
    expect(byId(10).n).toBe("El Último 10");
    expect(byId(39).n).toBe("Pinturicchio");
  });

  test("La Joya 12 / Magicbox 13", () => {
    expect(byId(38).num).toBe(12);
    expect(byId(37).num).toBe(13);
  });
});

describe("pizzaLabel — numero fuori dal titolo (e1b5b08)", () => {
  test("il titolo non inizia più con 'N.'", () => {
    pizzas().forEach((p) => {
      expect(pizzaLabel(p).primary).not.toMatch(/^\d+\./);
    });
  });

  test("primario = classico maiuscolo, secondario = soprannome", () => {
    const label = pizzaLabel(byId(1));
    expect(label.primary).toBe("MARGHERITA CLASSICA");
    expect(label.secondary).toBe("«El Pelusa»");
  });
});
