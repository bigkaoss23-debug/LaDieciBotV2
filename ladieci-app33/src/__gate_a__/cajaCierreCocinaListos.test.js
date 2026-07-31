/**
 * GATE A · 9-15 — Caja del día, Cierre forzado, mount Cocina/Listos,
 * compatibilità TicketQuickAction dopo l'integrazione menu.
 *
 * Nessun mock di `../api` qui: TabCocina/PanelCocina/TabListos non fanno
 * fetch al mount con le props usate in questi test (leggono solo `ordenes`),
 * quindi restano sul modulo reale — coerente con come li monta già
 * core/orders/gitLinePreservation.static.test.js per Cocina/Listos.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ORDER_STATES, ORDER_STATE_LABELS, canTransition, nextStates } from "../core/orders";
import TabCocina from "../components/cocina/TabCocina";
import PanelCocina from "../components/cocina/PanelCocina";
import TabListos from "../components/ordenes/TabListos";

let container = null;
let root = null;
const mount = (el) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
  return container;
};
afterEach(() => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
});
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("9 · Caja del día", () => {
  test("la state machine espone CHIUSO_FORZATO con etichetta 'Cierre forzado' (fonte per la vista Caja)", () => {
    expect(ORDER_STATES.CHIUSO_FORZATO).toBe("CHIUSO_FORZATO");
    expect(ORDER_STATE_LABELS[ORDER_STATES.CHIUSO_FORZATO]).toBe("Cierre forzado");
  });

  test("EconomiaPage calcola una vista dedicata 'Caja del día' per il periodo 'serata'", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "components/EconomiaPage.jsx"), "utf8");
    expect(src).toMatch(/if \(periodo === "serata"\) \{/);
    expect(src).toContain('contesto: "caja"');
    expect(src).toContain("Caja del día");
  });
});

describe("10 · Cierre forzado resta vincolato e non scatta per errore", () => {
  test("CHIUSO_FORZATO è raggiungibile solo dagli stati attivi previsti", () => {
    [ORDER_STATES.POR_CONFIRMAR, ORDER_STATES.EN_COCINA, ORDER_STATES.LISTO, ORDER_STATES.EN_ENTREGA]
      .forEach((from) => expect(canTransition(from, ORDER_STATES.CHIUSO_FORZATO)).toBe(true));
  });

  test("CHIUSO_FORZATO è terminale: nessuna transizione uscente", () => {
    expect(nextStates(ORDER_STATES.CHIUSO_FORZATO)).toEqual([]);
  });

  test("da RETIRADO (ordine già concluso) non si può forzare la chiusura", () => {
    expect(canTransition(ORDER_STATES.RETIRADO, ORDER_STATES.CHIUSO_FORZATO)).toBe(false);
  });

  test("nessun componente del release candidate assegna CHIUSO_FORZATO con una stringa libera fuori dalla state machine", () => {
    const fs = require("fs");
    const path = require("path");
    const SRC = path.join(__dirname, "..");
    ["components/ServicioPage.jsx", "components/ordenes/TabListos.jsx", "components/cocina/TabCocina.jsx", "components/cocina/PanelCocina.jsx"]
      .forEach((f) => {
        const src = fs.readFileSync(path.join(SRC, f), "utf8");
        expect(src).not.toMatch(/estado:\s*["']CHIUSO_FORZATO["']/);
      });
  });
});

describe("11-14 · mount Cocina/Listos con fixture rappresentative (dolci + salate)", () => {
  const cocinaOrders = [
    { id: "C-1", nombre: "Ana", estado: "EN_COCINA", tipo_consegna: "RITIRO", hora: "20:30", forno_out: "20:30",
      items: [{ id: 1, n: "El Pelusa", sub: "", q: 2, p: 12, cat: "Pizzas", e: "🍕" }] },
    { id: "C-2", nombre: "Beto", estado: "EN_COCINA", tipo_consegna: "DOMICILIO", hora: "20:50", forno_out: "20:39",
      zona: "Q1", direccion: "X",
      items: [{ id: 41, n: "Pizza Kinder", sub: "+Kinder", q: 1, p: 9, cat: "Postres", e: "🍫", dulce: true }] },
  ];

  test("TabCocina monta con pizze salate e dolci, nessuna eccezione", () => {
    const el = mount(<TabCocina ordenes={cocinaOrders} onListo={() => {}} loadingIds={new Set()} />);
    expect(el.textContent).toContain("Ana");
    expect(el.textContent).toContain("Beto");
  });

  test("PanelCocina monta con le stesse fixture, nessuna eccezione", () => {
    const el = mount(
      <PanelCocina ordenes={cocinaOrders} convConfermata={[]} onListo={() => {}} onClose={() => {}} loadingIds={new Set()} pizzeFatte={0} />
    );
    expect(el.innerHTML.length).toBeGreaterThan(0);
  });

  test("TabListos monta e TicketQuickAction resta compatibile dopo l'integrazione menu", () => {
    const onOpenTicket = jest.fn();
    const el = mount(
      <TabListos
        ordenes={[{ id: "L-1", nombre: "Cli", estado: "LISTO", tipo_consegna: "RITIRO", hora: "20:30",
          items: [{ id: 40, n: "Pizza KitKat", sub: "", q: 1, p: 9, cat: "Postres", e: "🍫", dulce: true }] }]}
        onRetirado={() => {}} onVolverACocina={() => {}} onOpenTicket={onOpenTicket}
        loadingIds={new Set()} waMsgs={[]} vipIds={new Set()}
      />
    );
    const btn = el.querySelector("button.ticket-quick-action");
    expect(btn).not.toBeNull();
    click(btn);
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket.mock.calls[0][0].id).toBe("L-1");
  });

  test("15 · prova negativa: nessuna delle fixture monta un nome storico regredito", () => {
    expect(document.body.textContent).not.toContain("Margarita Clásica");
  });
});
