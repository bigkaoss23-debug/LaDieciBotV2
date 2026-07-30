/**
 * Test di parità del catalogo — sessione menu 2026-07-08/09
 * (commit aa1332e → e1b5b08 → 6741e58 → 3d4c4d4).
 *
 * Blocca la regressione osservata il 2026-07-29: un deploy costruito da una
 * sorgente non allineata ha rimesso live il catalogo spagnolo pre-luglio.
 * Questi test asseriscono sui DATI e sulla LOGICA esportata, non su stringhe
 * pescate nel bundle.
 */
import {
  MENU,
  INGREDIENTI,
  EXTRAS_DULCES,
  pizzaLabel,
  esDulce,
  findExtra,
} from "../../constants";

const pizzas = () => MENU.filter((p) => p.cat === "Pizzas");
const byId = (id) => MENU.find((p) => String(p.id) === String(id));

describe("catalogo — numerazione ufficiale", () => {
  test("14 pizze, numeri 1..14 senza buchi né duplicati", () => {
    const nums = pizzas().map((p) => p.num);
    expect(nums).toHaveLength(14);
    expect(new Set(nums).size).toBe(14);
    expect([...nums].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1)
    );
  });

  test("l'ordine dell'array coincide con il numero ufficiale", () => {
    expect(pizzas().map((p) => p.num)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1)
    );
  });

  test("solo le pizze hanno `num` (bevande e postres no)", () => {
    MENU.filter((m) => m.cat !== "Pizzas").forEach((m) => {
      expect(m.num).toBeUndefined();
    });
  });

  test("gli id interni restano stabili: ordini storici li referenziano", () => {
    // id → num atteso dopo 3d4c4d4. Un rename è ammesso, un rimescolamento di id NO.
    const expected = {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
      8: 8, 9: 9, 10: 10, 11: 11, 38: 12, 37: 13, 39: 14,
    };
    Object.entries(expected).forEach(([id, num]) => {
      const pizza = byId(id);
      expect(pizza).toBeDefined();
      expect(pizza.num).toBe(num);
    });
  });
});

describe("catalogo — nomi classici italiani (3d4c4d4)", () => {
  const expectedSubs = {
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

  Object.entries(expectedSubs).forEach(([id, sub]) => {
    test(`id ${id} → "${sub}"`, () => {
      expect(byId(id).sub).toBe(sub);
    });
  });

  test("i nomi spagnoli pre-luglio non sono più presenti", () => {
    const regressions = [
      "Margarita Clásica", "Bufalina", "Marinara Clásica",
      "Jamón y Champiñones", "Cuatro Quesos", "Atún y Cebolla",
      "Caprichosa", "Carbonara", "La Ahumada",
    ];
    const subs = MENU.map((m) => m.sub);
    regressions.forEach((old) => expect(subs).not.toContain(old));
  });

  test("soprannomi (fantasy name) preservati", () => {
    expect(byId(1).n).toBe("El Pelusa");
    expect(byId(10).n).toBe("El Último 10");
    expect(byId(39).n).toBe("Pinturicchio");
  });

  test("La Joya è la 12 e Magicbox la 13 (scambio della sessione)", () => {
    expect(byId(38).n).toBe("La Joya");
    expect(byId(38).num).toBe(12);
    expect(byId(37).n).toBe("Magicbox");
    expect(byId(37).num).toBe(13);
  });
});

describe("catalogo — pizze dolci e bevande aggiunte", () => {
  test("Pizza Nutella / KitKat / Kinder esistono e sono marcate dulce", () => {
    [16, 40, 41].forEach((id) => {
      const item = byId(id);
      expect(item).toBeDefined();
      expect(item.dulce).toBe(true);
      expect(item.cat).toBe("Postres");
    });
    expect(byId(40).n).toBe("Pizza KitKat");
    expect(byId(41).n).toBe("Pizza Kinder");
  });

  test("bevande nuove presenti con prezzo corretto", () => {
    expect(byId(43).n).toBe("San Miguel 0,0");
    expect(byId(44).n).toBe("Brutus");
    expect(byId(45).n).toBe("Aquarius Limón");
    expect(byId(46).n).toBe("Aquarius Naranja");
    expect(byId(42).n).toBe("Agua Natural");
    expect(byId(42).sub).toBe("1L");
    expect(byId(42).p).toBe(2.5);
  });

  test("formati lattina corretti a 0,33L (non 0,5L)", () => {
    [26, 28, 30].forEach((id) => expect(byId(id).sub).toBe("0,33L"));
  });
});

describe("extra — salati e dolci", () => {
  test("EXTRAS_DULCES contiene i 5 topping a 0,50", () => {
    const names = EXTRAS_DULCES.map((e) => e.n);
    expect(names).toEqual(
      expect.arrayContaining(["Nutella", "Kinder", "KitKat", "Pistacho", "Almendra"])
    );
    EXTRAS_DULCES.forEach((e) => {
      expect(e.prezzo).toBe(0.5);
      expect(e.tipo).toBe("dulce");
    });
  });

  test("extra salati Salami Napoli e Coppa aggiunti, resto invariato", () => {
    const names = INGREDIENTI.map((i) => i.n);
    expect(names).toContain("Salami Napoli");
    expect(names).toContain("Coppa");
    // preesistenti: non devono sparire
    expect(names).toContain("Rúcula");
    expect(names).toContain("Salami picante Napoli");
  });

  test("nessun extra dolce è finito dentro INGREDIENTI (liste separate)", () => {
    const saltyNames = INGREDIENTI.map((i) => i.n);
    ["Kinder", "KitKat", "Almendra"].forEach((n) =>
      expect(saltyNames).not.toContain(n)
    );
  });
});

describe("pizzaLabel", () => {
  test("pizza: primario = nome classico maiuscolo, secondario = soprannome fra virgolette", () => {
    const label = pizzaLabel(byId(1));
    expect(label.primary).toBe("MARGHERITA CLASSICA");
    expect(label.secondary).toBe("«El Pelusa»");
  });

  test("il numero ufficiale NON compare nel titolo (va nel badge footer)", () => {
    pizzas().forEach((p) => {
      expect(pizzaLabel(p).primary).not.toMatch(/^\d+\./);
    });
  });

  test("non-pizza: primario = nome, secondario = sub", () => {
    const label = pizzaLabel(byId(42));
    expect(label.primary).toBe("Agua Natural");
    expect(label.secondary).toBe("1L");
  });
});

describe("esDulce", () => {
  test("true con flag dulce esplicito", () => {
    expect(esDulce({ id: 40, dulce: true })).toBe(true);
  });

  test("true via lookup per id anche senza flag (ordine storico salvato)", () => {
    expect(esDulce({ id: 41 })).toBe(true);
    expect(esDulce({ id: "41" })).toBe(true);
  });

  test("false su pizza salata, bevanda, null e oggetto sconosciuto", () => {
    expect(esDulce({ id: 1 })).toBe(false);
    expect(esDulce({ id: 43 })).toBe(false);
    expect(esDulce(null)).toBe(false);
    expect(esDulce({ id: 99999 })).toBe(false);
  });
});

describe("findExtra", () => {
  test("trova un extra salato con prezzo ed emoji", () => {
    const coppa = findExtra("Coppa");
    expect(coppa).not.toBeNull();
    expect(coppa.prezzo).toBe(0.5);
    expect(coppa.e).toBeTruthy();
  });

  test("trova un extra dolce con prezzo ed emoji (regressione: prima dava 0,00 € e ➕)", () => {
    ["Nutella", "Kinder", "KitKat", "Pistacho", "Almendra"].forEach((n) => {
      const extra = findExtra(n);
      expect(extra).not.toBeNull();
      expect(extra.prezzo).toBe(0.5);
      expect(extra.e).toBeTruthy();
    });
  });

  test("null su nome inesistente", () => {
    expect(findExtra("Ananas")).toBeNull();
    expect(findExtra("")).toBeNull();
  });

  test("supplemento cumulativo: 3 extra dolci = 1,50", () => {
    const total = ["Nutella", "Kinder", "KitKat"]
      .map((n) => findExtra(n).prezzo)
      .reduce((a, b) => a + b, 0);
    expect(Math.round(total * 100) / 100).toBe(1.5);
  });
});
