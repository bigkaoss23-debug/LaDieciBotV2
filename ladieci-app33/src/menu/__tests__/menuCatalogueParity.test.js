/**
 * Test di parità del catalogo — sessione menu 2026-07-08/09
 * (commit aa1332e → e1b5b08 → 6741e58 → 3d4c4d4), aggiornato alla carta
 * del 2026-09-17 (16 pizze, categoria Cocina, postres e bebidas nuovi).
 *
 * Blocca la regressione osservata il 2026-07-29: un deploy costruito da una
 * sorgente non allineata ha rimesso live un catalogo vecchio.
 * Questi test asseriscono sui DATI e sulla LOGICA esportata, non su stringhe
 * pescate nel bundle.
 */
import {
  MENU,
  CATS,
  INGREDIENTI,
  EXTRAS_DULCES,
  pizzaLabel,
  esDulce,
  findExtra,
} from "../../constants";

const pizzas = () => MENU.filter((p) => p.cat === "Pizzas");
const byId = (id) => MENU.find((p) => String(p.id) === String(id));

describe("catalogo — numerazione ufficiale", () => {
  test("16 pizze, numeri 1..16 senza buchi né duplicati", () => {
    const nums = pizzas().map((p) => p.num);
    expect(nums).toHaveLength(16);
    expect(new Set(nums).size).toBe(16);
    expect([...nums].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1)
    );
  });

  test("l'ordine dell'array coincide con il numero ufficiale", () => {
    expect(pizzas().map((p) => p.num)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1)
    );
  });

  test("solo le pizze hanno `num` (cocina, bevande e postres no)", () => {
    MENU.filter((m) => m.cat !== "Pizzas").forEach((m) => {
      expect(m.num).toBeUndefined();
    });
  });

  test("gli id interni restano stabili: ordini storici li referenziano", () => {
    // id → num. Un rename è ammesso, un rimescolamento di id NO.
    const expected = {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
      8: 8, 9: 9, 10: 10, 11: 11, 38: 12, 37: 13, 39: 14,
      51: 15, 52: 16,
    };
    Object.entries(expected).forEach(([id, num]) => {
      const pizza = byId(id);
      expect(pizza).toBeDefined();
      expect(pizza.num).toBe(num);
    });
  });

  test("nessun id duplicato nel catalogo", () => {
    const ids = MENU.map((m) => String(m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("catalogo — carta pizze 2026-09-17", () => {
  const carta = [
    [1, 1, "El Pelusa", "Margherita", 12.0],
    [2, 2, "Zizou", "Bufalina", 12.5],
    [3, 3, "O Rei", "Marinara", 10.0],
    [4, 4, "Il Maestro", "Inferno", 13.5],
    [5, 5, "El Gaucho", "Diavola", 13.0],
    [6, 6, "Divino Codino", "Prosciutto", 12.5],
    [7, 7, "La Pulga", "Prosciutto e Funghi", 13.0],
    [8, 8, "Tulipano Nero", "5 Formaggi", 14.5],
    [9, 9, "Mago de Zadar", "Vegetariana", 14.5],
    [10, 10, "Último 10", "Tonno e Cipolla", 14.0],
    [11, 11, "Il Gladiatore", "Capricciosa", 14.5],
    [38, 12, "La Joya", "Carbodieci", 15.0],
    [37, 13, "Magic Box", "Parmazola", 16.5],
    [39, 14, "Pinturicchio", "La Affumicata", 15.0],
    [51, 15, "Il Professore", "La Genovese", 16.5],
    [52, 16, "Il Zorro", "Dolce Vita", 15.5],
  ];

  carta.forEach(([id, num, n, sub, p]) => {
    test(`nº ${num} → ${n} «${sub}» ${p.toFixed(2)} €`, () => {
      const pizza = byId(id);
      expect(pizza).toBeDefined();
      expect(pizza.cat).toBe("Pizzas");
      expect(pizza.num).toBe(num);
      expect(pizza.n).toBe(n);
      expect(pizza.sub).toBe(sub);
      expect(pizza.p).toBe(p);
      expect(pizza.ing).toBeTruthy();
    });
  });

  test("Il Zorro / Dolce Vita è la nº 16 (nessuna voce Il Barone / La Mortadella)", () => {
    const n16 = pizzas().find((p) => p.num === 16);
    expect(n16.n).toBe("Il Zorro");
    expect(n16.sub).toBe("Dolce Vita");
    const nomi = MENU.map((m) => `${m.n} ${m.sub}`);
    nomi.forEach((x) => {
      expect(x).not.toMatch(/Barone/);
      expect(x).not.toMatch(/Mortadella/);
    });
  });

  test("i nomi spagnoli pre-luglio non tornano", () => {
    const regressions = [
      "Margarita Clásica", "Marinara Clásica",
      "Jamón y Champiñones", "Cuatro Quesos", "Atún y Cebolla",
      "Caprichosa", "Carbonara", "La Ahumada",
    ];
    const subs = MENU.map((m) => m.sub);
    regressions.forEach((old) => expect(subs).not.toContain(old));
  });

  test("ingredienti descrittivi aggiornati (5 Formaggi, Carbodieci)", () => {
    expect(byId(8).ing).toContain("Pecorino DOP");
    expect(byId(38).ing).toContain("coppa stagionata");
  });
});

describe("catalogo — categoria Cocina", () => {
  test("categorie nell'ordine Pizzas, Cocina, Postres, Bebidas", () => {
    expect(CATS).toEqual(["Pizzas", "Cocina", "Postres", "Bebidas"]);
  });

  test("4 piatti Cocina con id nuovi 47–50 e prezzi corretti", () => {
    const cocina = MENU.filter((m) => m.cat === "Cocina");
    expect(cocina.map((m) => [m.id, m.n, m.p])).toEqual([
      [47, "Gnocchi alla Sorrentina", 10.0],
      [48, "Cannelloni Ricotta y Espinacas", 10.0],
      [49, "Parmigiana de Berenjena", 11.0],
      [50, "Lasagna Bolognese", 11.0],
    ]);
    cocina.forEach((m) => {
      expect(m.num).toBeUndefined();
      expect(m.dulce).toBeUndefined();
    });
  });

  test("ogni categoria del catalogo è una delle CATS", () => {
    MENU.forEach((m) => expect(CATS).toContain(m.cat));
  });
});

describe("catalogo — postres 2026-09-17", () => {
  test("11 postres con nomi e prezzi della carta", () => {
    const postres = MENU.filter((m) => m.cat === "Postres");
    expect(postres.map((m) => [m.id, m.n, m.p])).toEqual([
      [12, "Tiramisú Clásico (Casero)", 5.0],
      [13, "Tiramisú Especial (Casero)", 6.0],
      [14, "Helado Ferrero", 7.0],
      [15, "Babá Napoletano", 5.0],
      [18, "Tartufo nero", 4.5],
      [17, "Tartufo bianco", 4.5],
      [19, "Tartufo Pistacho", 4.5],
      [20, "Tartufo Limoncello", 4.5],
      [16, "Pizza de Nutella (28cm)", 9.0],
      [40, "Pizza de KitKat (28cm)", 9.0],
      [41, "Pizza de Kinder (28cm)", 9.0],
    ]);
  });

  test("le tre pizze dolci restano marcate dulce", () => {
    [16, 40, 41].forEach((id) => {
      const item = byId(id);
      expect(item.dulce).toBe(true);
      expect(item.cat).toBe("Postres");
    });
  });
});

describe("catalogo — bebidas 2026-09-17", () => {
  test("17 bebidas con nome, formato e prezzo della carta", () => {
    const bebidas = MENU.filter((m) => m.cat === "Bebidas");
    expect(bebidas.map((m) => [m.id, m.n, m.sub, m.p])).toEqual([
      [26, "Coca Cola", "33cl", 2.0],
      [28, "Coca Cola Zero", "33cl", 2.0],
      [30, "Fanta Naranja", "33cl", 2.0],
      [53, "Fanta Limón", "33cl", 2.0],
      [54, "FuzeTea Limón", "33cl", 2.0],
      [55, "FuzeTea Maracuyá", "33cl", 2.0],
      [45, "Aquarius Limón", "33cl", 2.0],
      [46, "Aquarius Naranja", "33cl", 2.0],
      [35, "Sprite", "33cl", 2.0],
      [25, "Agua natural", "50cl", 1.5],
      [42, "Agua natural", "1L", 2.5],
      [56, "Agua con gas San Pellegrino", "1L", 3.5],
      [57, "Peroni Rossa", "33cl", 3.5],
      [44, "Brutus / San Miguel", "33cl", 3.0],
      [58, "Tinto de verano La Casera", "33cl", 3.0],
      [59, "Vino Bianco / Blanco", "75cl", 12.0],
      [60, "Vino Rosato / Rosado", "75cl", 12.0],
    ]);
  });

  test("prodotti eliminati non sono più nel catalogo attivo (id non riciclati)", () => {
    // 21 Estrella, 22 Heineken, 23 Peroni 50cl, 27/29/31 formati 1L, 32/33 Nestea,
    // 34 Aquarius, 36 Agua con Gas 0,5L, 43 San Miguel 0,0
    [21, 22, 23, 27, 29, 31, 32, 33, 34, 36, 43, 24].forEach((id) => {
      expect(byId(id)).toBeUndefined();
    });
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

  test("extra salati Salami Napoli e Coppa presenti (carta 2026-09-17)", () => {
    const names = INGREDIENTI.map((i) => i.n);
    expect(names).toContain("Salami Napoli");
    expect(names).toContain("Coppa");
    expect(names).toContain("Rúcula");
    // rinominato dalla carta: "Salami picante Napoli" → "Salami picante"
    expect(names).toContain("Salami picante");
    // il catalogo completo e i prezzi sono in extrasCanonicalCatalogue.test.js
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
    expect(label.primary).toBe("MARGHERITA");
    expect(label.secondary).toBe("«El Pelusa»");
  });

  test("il numero ufficiale NON compare nel titolo (va nel badge footer)", () => {
    pizzas().forEach((p) => {
      expect(pizzaLabel(p).primary).not.toMatch(/^\d+\./);
    });
  });

  test("non-pizza: primario = nome, secondario = sub", () => {
    const label = pizzaLabel(byId(42));
    expect(label.primary).toBe("Agua natural");
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

  test("false su pizza salata, bevanda, piatto Cocina, null e oggetto sconosciuto", () => {
    expect(esDulce({ id: 1 })).toBe(false);
    expect(esDulce({ id: 26 })).toBe(false);
    expect(esDulce({ id: 50 })).toBe(false);
    expect(esDulce(null)).toBe(false);
    expect(esDulce({ id: 99999 })).toBe(false);
  });
});

describe("findExtra", () => {
  test("trova un extra salato con prezzo ed emoji", () => {
    const coppa = findExtra("Coppa");
    expect(coppa).not.toBeNull();
    expect(coppa.prezzo).toBe(2); // carta 2026-09-17
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
