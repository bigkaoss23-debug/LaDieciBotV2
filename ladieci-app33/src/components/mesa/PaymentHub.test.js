// PAYMENT HUB MESA V1 — SLICE 1 UI, against the approved mockup.
//
// The mandated hierarchy, top to bottom:
//   1  Mesa X · Ver cuenta
//   2  Resumen del ticket (productos, cantidades, precios, Total,
//      Ya cobrado, Resta por pagar)
//   3  EXACTLY three primary actions: Cobrar todo · Pago parcial · Descuento
//   4  ONE contextual drawer beneath them
//   5  Imprimir ticket as a secondary action
//
// And an exclusion list this file guards just as hard as the inclusion one:
// no dashboard, no KPI, no Business Day, no Cash Count, no analytics, no
// economic timeline, no "Personas 0/2".
//
// THE ECONOMICS ARE NOT THIS SLICE. Every assertion about money here is that
// the hub DISPLAYS session.total / session.paid / session.outstanding and
// SENDS the same mesaApi.pay arguments Mesa already sent. Nothing is
// re-derived and no new call is invented.
import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: {
    floor: jest.fn(), openTable: jest.fn(), releaseEmptyTable: jest.fn(), closeTable: jest.fn(),
    saveTable: jest.fn(), addCommand: jest.fn(), markServed: jest.fn(), pay: jest.fn(),
    createReservation: jest.fn(), updateReservation: jest.fn(), setReservationStatus: jest.fn(),
    openReservation: jest.fn(),
  },
}));

const TabMesa = require("./TabMesa").default;
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

// react-scripts' jest config sets resetMocks:true, which strips even the
// factory-level implementations above before every test. Without re-arming
// them here, describeMesaError returns undefined (so no inline error ever
// mounts) and createMesaRequestId returns undefined (so the idempotency key
// assertion below would pass vacuously against a real regression).
beforeEach(() => {
  describeMesaError.mockImplementation((error) => error?.code || "error");
  createMesaRequestId.mockImplementation(() => "mesa_test_request");
});

// The mockup's own table: Mesa 4, 4 personas, 39,50 € total, 10,00 € cobrado.
const MOCKUP_SESSION = {
  id: "session-mockup", coversTotal: 4, coversRemaining: 3,
  total: 39.5, paid: 10, outstanding: 29.5, nextEqualShare: 9.88,
  paymentTotals: { efectivo: 10 },
  commands: [{ id: "c1", commandNumber: 1, state: "EN_COCINA", time: "14:20", items: [{ n: "El Pelusa", q: 1 }] }],
  payments: [],
  lines: [
    // Real staging shapes: pizzas carry officialNumber/classicName/fantasyName,
    // drinks carry no number and use classicName for the format. l1 is fully
    // paid, so the ticket must show it as Pagado and refuse to re-charge it.
    { id: "l1", description: "El Pelusa", amount: 12, paid: 12, remaining: 0,
      product: { officialNumber: 1, classicName: "Margherita Classica", fantasyName: "El Pelusa", category: "Pizzas" } },
    { id: "l2", description: "La Joya", amount: 15, paid: 0, remaining: 15,
      product: { officialNumber: 2, classicName: "Bufala", fantasyName: "La Joya", category: "Pizzas" } },
    { id: "l3", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3,
      product: { classicName: "33cl", fantasyName: "Estrella Galicia", category: "Bebidas" } },
    { id: "l4", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3,
      product: { classicName: "33cl", fantasyName: "Estrella Galicia", category: "Bebidas" } },
    { id: "l5", description: "Fanta Naranja", amount: 3.5, paid: 0, remaining: 3.5,
      product: { classicName: "0,33L", fantasyName: "Fanta Naranja", category: "Bebidas" } },
    { id: "l6", description: "San Miguel 0,0", amount: 3, paid: 0, remaining: 3, product: {} },
  ],
};

const TABLE = {
  id: "t4", number: 4, x: 40, y: 40, shape: "square", shapePreset: "standard",
  active: true, capacity: 4, reservations: [], status: "open", session: MOCKUP_SESSION,
};

function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
const byTestId = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const buttonByText = (c, text) =>
  Array.from(c.querySelectorAll("button")).find((b) => b.textContent.trim() === text);

async function openHub({ table = TABLE, compact = false } = {}) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables: [table] });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<TabMesa role="admin" notify={jest.fn()} onNewCommand={jest.fn()} onCountChange={jest.fn()}
      compact={compact} mesaDrafts={{}} onClearDraft={jest.fn()} onSendToCocina={jest.fn()} />);
  });
  click(container.querySelector(".mesa-table"));
  await flush();
  click(buttonByText(container, "Ver cuenta"));
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// ── 1. HEADER ──────────────────────────────────────────────────────────────
test("1 · the surface is titled 'Mesa 4 · Ver cuenta' with the covers as context", async () => {
  const { container, root } = await openHub();
  expect(container.textContent).toContain("Mesa 4 · Ver cuenta");
  expect(container.textContent).toContain("4 personas");
  unmount(container, root);
});

// ── 2. RESUMEN DEL TICKET ──────────────────────────────────────────────────
test("2 · the ticket lists every product with quantity and price, grouped as in the mockup", async () => {
  const { container, root } = await openHub();
  const ticket = byTestId(container, "mesa-hub-ticket");
  expect(ticket.textContent).toContain("Resumen del ticket");
  const rows = Array.from(ticket.querySelectorAll('[data-testid="mesa-hub-line"]'));
  expect(rows).toHaveLength(5);
  const read = (row) => ({
    qty: row.querySelector(".mesa-hub-qty").textContent,
    name: row.querySelector(".mesa-hub-name").textContent,
    alias: row.querySelector(".mesa-hub-alias")?.textContent ?? null,
    // Intl currency output separates the amount from € with a NON-BREAKING
    // space; normalise it so the assertion compares money, not whitespace.
    amount: row.querySelector(".mesa-hub-amount").textContent.replace(/\s/g, " "),
  });
  expect(read(rows[0])).toEqual({ qty: "1", name: "Nº 1 · Margherita Classica", alias: "El Pelusa", amount: "12,00 €" });
  // Two real units, one displayed row.
  expect(read(rows[2])).toEqual({ qty: "2", name: "Estrella Galicia", alias: "33cl", amount: "6,00 €" });
  expect(read(rows[4])).toEqual({ qty: "1", name: "San Miguel 0,0", alias: null, amount: "3,00 €" });
  unmount(container, root);
});

test("2 · Total / Ya cobrado / Resta por pagar come straight from the session", async () => {
  const { container, root } = await openHub();
  expect(byTestId(container, "mesa-hub-total").textContent).toMatch(/Total39,50\s?€/);
  expect(byTestId(container, "mesa-hub-paid").textContent).toMatch(/Ya cobrado10,00\s?€/);
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/Resta por pagar29,50\s?€/);
  unmount(container, root);
});

test("2 · the displayed total is the session's, never re-derived from the ticket rows", async () => {
  // A session whose lines deliberately do NOT sum to its total: the operator
  // must still be shown the authoritative figure, not the frontend's guess.
  const skewed = { ...TABLE, session: { ...MOCKUP_SESSION, total: 99, paid: 0, outstanding: 99 } };
  const { container, root } = await openHub({ table: skewed });
  expect(byTestId(container, "mesa-hub-total").textContent).toMatch(/99,00\s?€/);
  expect(byTestId(container, "mesa-hub-total").textContent).not.toMatch(/39,50/);
  unmount(container, root);
});

// ── 3. EXACTLY THREE PRIMARY ACTIONS ───────────────────────────────────────
test("3 · exactly three primary actions, in the approved order", async () => {
  const { container, root } = await openHub();
  const labels = Array.from(byTestId(container, "mesa-hub-actions").querySelectorAll("button"))
    .map((b) => b.textContent.trim());
  expect(labels).toEqual(["Cobrar todo", "Pago parcial", "Descuento"]);
  unmount(container, root);
});

// ── 4. ONE DRAWER ──────────────────────────────────────────────────────────
test("4 · no drawer until an action is chosen, and never more than one at a time", async () => {
  const { container, root } = await openHub();
  expect(container.querySelectorAll('[data-testid="mesa-hub-drawer"]')).toHaveLength(0);

  click(byTestId(container, "mesa-hub-cobrar-todo"));
  expect(container.querySelectorAll('[data-testid="mesa-hub-drawer"]')).toHaveLength(1);
  expect(byTestId(container, "mesa-hub-drawer-cobrar-todo")).not.toBeNull();
  expect(byTestId(container, "mesa-hub-drawer-pago-parcial")).toBeNull();

  click(byTestId(container, "mesa-hub-pago-parcial"));
  expect(container.querySelectorAll('[data-testid="mesa-hub-drawer"]')).toHaveLength(1);
  expect(byTestId(container, "mesa-hub-drawer-cobrar-todo")).toBeNull();
  expect(byTestId(container, "mesa-hub-drawer-pago-parcial")).not.toBeNull();

  click(byTestId(container, "mesa-hub-pago-parcial")); // same action toggles shut
  expect(container.querySelectorAll('[data-testid="mesa-hub-drawer"]')).toHaveLength(0);
  unmount(container, root);
});

test("4 · Cobrar todo offers the outstanding amount, the three methods and one confirm", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-cobrar-todo"));
  const drawer = byTestId(container, "mesa-hub-drawer-cobrar-todo");
  expect(byTestId(container, "mesa-hub-full-amount").textContent).toMatch(/29,50\s?€/);
  // Icon and label are separate nodes so the label alone is the readable name.
  expect(Array.from(drawer.querySelectorAll(".mesa-method .mesa-method-label")).map((n) => n.textContent))
    .toEqual(["Efectivo", "Tarjeta", "Bizum"]);
  expect(buttonByText(drawer, "Confirmar cobro")).not.toBeUndefined();
  unmount(container, root);
});

test("4 · Cobrar todo sends exactly the arguments Mesa already sent for a full payment", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 29.5, outstandingAfter: 0 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-cobrar-todo"));
  click(Array.from(container.querySelectorAll(".mesa-method")).find((b) => b.textContent.includes("Tarjeta")));
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-mockup", {
    paymentMethod: "tarjeta",
    mode: "full",
    coversSettled: 3,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

test("4 · Pago parcial offers EXACTLY three ways, and no more", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  const labels = Array.from(byTestId(container, "mesa-hub-partial-modes").querySelectorAll("button"))
    .map((b) => b.textContent.trim());
  expect(labels).toEqual(["Por productos", "Por personas", "Importe libre"]);
  unmount(container, root);
});

// ── POR PRODUCTOS — the ticket IS the picker ───────────────────────────────
test("5 · Por productos makes the ticket selectable in place — no second list", async () => {
  const { container, root } = await openHub();
  // Not selectable until the mode is chosen.
  expect(container.querySelectorAll('[data-testid="mesa-hub-line"].selectable')).toHaveLength(0);
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  expect(container.querySelectorAll('[data-testid="mesa-hub-line"].selectable').length).toBeGreaterThan(0);
  // and no separate dialog was opened to show the same products again
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(byTestId(container, "mesa-hub-pick-hint")).not.toBeNull();
  unmount(container, root);
});

test("5 · tap selects, second tap deselects, and the total follows", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  const laJoya = rows.find((r) => r.textContent.includes("La Joya"));

  expect(byTestId(container, "mesa-hub-selected-total").textContent).toMatch(/0,00\s?€/);
  click(laJoya);
  expect(laJoya.getAttribute("data-selected")).toBe("true");
  expect(byTestId(container, "mesa-hub-selected-total").textContent).toMatch(/15,00\s?€/);
  click(laJoya);
  expect(laJoya.getAttribute("data-selected")).toBe("false");
  expect(byTestId(container, "mesa-hub-selected-total").textContent).toMatch(/0,00\s?€/);
  unmount(container, root);
});

test("5 · several products can be selected at once and the total sums", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  click(rows.find((r) => r.textContent.includes("La Joya")));       // 15,00
  click(rows.find((r) => r.textContent.includes("Fanta Naranja"))); // 3,50
  expect(byTestId(container, "mesa-hub-selected-total").textContent).toMatch(/18,50\s?€/);
  unmount(container, root);
});

test("5 · a fully paid product is shown as Pagado and can never be re-selected", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  const paidRow = rows.find((r) => r.textContent.includes("Margherita Classica"));
  expect(paidRow.textContent).toContain("Pagado");
  expect(paidRow.disabled).toBe(true);
  click(paidRow);
  expect(paidRow.getAttribute("data-selected")).toBe("false");
  expect(byTestId(container, "mesa-hub-selected-total").textContent).toMatch(/0,00\s?€/);
  unmount(container, root);
});

test("5 · the REAL economic line ids are what reach the writer, grouping and all", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 6, outstandingAfter: 23.5 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-productos"));
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  // One displayed row, TWO real units behind it.
  const beers = rows.find((r) => r.textContent.includes("Estrella Galicia"));
  expect(beers.textContent).toContain("2");
  click(beers);
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-mockup", {
    paymentMethod: "efectivo",
    mode: "item_selection",
    lineIds: ["l3", "l4"],
    // Choosing products says nothing about how many people ate.
    coversSettled: 0,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

// ── POR PERSONAS ───────────────────────────────────────────────────────────
test("6 · 4 covers / 80 € — 2 personas suggests 40,00 €", async () => {
  const table = { ...TABLE, session: { ...MOCKUP_SESSION, total: 80, paid: 0, outstanding: 80, coversTotal: 4, coversRemaining: 4 } };
  const { container, root } = await openHub({ table });
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-personas"));
  expect(byTestId(container, "mesa-hub-person-options").querySelectorAll("button")).toHaveLength(4);
  click(byTestId(container, "mesa-hub-person-2"));
  expect(byTestId(container, "mesa-hub-persons-amount").textContent).toMatch(/2 personas40,00\s?€/);
  unmount(container, root);
});

test("6 · 4 covers / 80 € — 1 persona suggests 20,00 €, and charges custom_amount + 1 cover", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 20, outstandingAfter: 60 });
  const table = { ...TABLE, session: { ...MOCKUP_SESSION, total: 80, paid: 0, outstanding: 80, coversTotal: 4, coversRemaining: 4 } };
  const { container, root } = await openHub({ table });
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-personas"));
  click(byTestId(container, "mesa-hub-person-1"));
  expect(byTestId(container, "mesa-hub-persons-amount").textContent).toMatch(/1 persona20,00\s?€/);
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-mockup", {
    paymentMethod: "efectivo", mode: "custom_amount", amount: 20, coversSettled: 1,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

test("6 · after two people paid, the split follows the table: 2 left, 40 € across them", async () => {
  // The session the backend gives back afterwards.
  const table = { ...TABLE, session: { ...MOCKUP_SESSION, total: 80, paid: 40, outstanding: 40, coversTotal: 4, coversRemaining: 2 } };
  const { container, root } = await openHub({ table });
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-personas"));
  expect(byTestId(container, "mesa-hub-person-options").querySelectorAll("button")).toHaveLength(2);
  click(byTestId(container, "mesa-hub-person-1"));
  expect(byTestId(container, "mesa-hub-persons-amount").textContent).toMatch(/20,00\s?€/);
  unmount(container, root);
});

test("6 · with no covers on the table, Por personas is simply unavailable", async () => {
  const table = { ...TABLE, session: { ...MOCKUP_SESSION, coversTotal: null, coversRemaining: 0 } };
  const { container, root } = await openHub({ table });
  click(byTestId(container, "mesa-hub-pago-parcial"));
  expect(byTestId(container, "mesa-hub-mode-personas").disabled).toBe(true);
  unmount(container, root);
});

// ── IMPORTE LIBRE ──────────────────────────────────────────────────────────
test("7 · Importe libre never asks for a number of people", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-libre"));
  const drawer = byTestId(container, "mesa-hub-partial-libre");
  expect(drawer.textContent).not.toMatch(/personas/i);
  expect(container.textContent).not.toContain("Personas que quedan saldadas");
  expect(byTestId(container, "mesa-hub-free-amount")).not.toBeNull();
  unmount(container, root);
});

test("7 · a free amount charges custom_amount and consumes nobody's share", async () => {
  mesaApi.pay.mockResolvedValue({ amount: 10, outstandingAfter: 19.5 });
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  click(byTestId(container, "mesa-hub-mode-libre"));
  const input = byTestId(container, "mesa-hub-free-amount");
  act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
      .set.call(input, "10");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  click(buttonByText(container, "Confirmar cobro"));
  await flush();
  expect(mesaApi.pay).toHaveBeenCalledWith("session-mockup", {
    paymentMethod: "efectivo", mode: "custom_amount", amount: 10, coversSettled: 0,
    clientRequestId: "mesa_test_request",
  });
  unmount(container, root);
});

// ── PRODUCT LABELS ─────────────────────────────────────────────────────────
test("8 · a pizza shows its number and real name, with the nickname beneath", async () => {
  const { container, root } = await openHub();
  const row = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'))
    .find((r) => r.textContent.includes("Bufala"));
  expect(row.querySelector(".mesa-hub-name").textContent).toBe("Nº 2 · Bufala");
  expect(row.querySelector(".mesa-hub-alias").textContent).toBe("La Joya");
  unmount(container, root);
});

test("8 · a drink shows its name and format; a line with no product data falls back cleanly", async () => {
  const { container, root } = await openHub();
  const rows = Array.from(container.querySelectorAll('[data-testid="mesa-hub-line"]'));
  const beer = rows.find((r) => r.textContent.includes("Estrella Galicia"));
  expect(beer.querySelector(".mesa-hub-name").textContent).toBe("Estrella Galicia");
  expect(beer.querySelector(".mesa-hub-alias").textContent).toBe("33cl");
  // No product data at all: the description, and nothing invented.
  const bare = rows.find((r) => r.textContent.includes("San Miguel"));
  expect(bare.querySelector(".mesa-hub-name").textContent).toBe("San Miguel 0,0");
  expect(bare.querySelector(".mesa-hub-alias")).toBeNull();
  unmount(container, root);
});

test("4 · Descuento is present but inert -- it never charges and says why", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-descuento"));
  const drawer = byTestId(container, "mesa-hub-drawer-descuento");
  expect(drawer.textContent.trim()).toBe("Próximamente");
  expect(drawer.querySelectorAll("button")).toHaveLength(0);
  expect(mesaApi.pay).not.toHaveBeenCalled();
  unmount(container, root);
});

// ── 5. SECONDARY ACTION ────────────────────────────────────────────────────
test("5 · Imprimir ticket is present, secondary, and prints the existing bill document", async () => {
  const { container, root } = await openHub();
  const print = byTestId(container, "mesa-hub-imprimir");
  expect(print).not.toBeNull();
  expect(print.textContent.trim()).toBe("Imprimir ticket");
  // Secondary: it is not one of the three primary actions.
  expect(byTestId(container, "mesa-hub-actions").contains(print)).toBe(false);
  click(print);
  await flush();
  expect(container.textContent).toContain("CUENTA CLIENTE");
  unmount(container, root);
});

// ── EXCLUSIONS ─────────────────────────────────────────────────────────────
test("the surface shows no dashboard, KPI, Business Day, Cash Count, analytics or timeline", async () => {
  const { container, root } = await openHub();
  const hub = byTestId(container, "mesa-payment-hub").textContent;
  for (const forbidden of [
    /dashboard/i, /ventas/i, /\bKPI\b/i, /business\s*day/i, /d[íi]a operativo/i,
    /conteo de caja/i, /cash\s*count/i, /arqueo/i, /anal[íi]tic/i, /gr[áa]fic/i,
    /hist[óo]rico/i, /informe/i, /reconciliaci[óo]n/i,
  ]) {
    expect(hub).not.toMatch(forbidden);
  }
  unmount(container, root);
});

test("'Personas 0/2' is gone from this surface entirely", async () => {
  const { container, root } = await openHub();
  const hub = byTestId(container, "mesa-payment-hub").textContent;
  expect(hub).not.toMatch(/Personas\s*\d/);
  expect(hub).not.toMatch(/\d\s*\/\s*\d/);
  unmount(container, root);
});

test("the retired stat tiles and side panels are not rendered any more", async () => {
  const { container, root } = await openHub();
  const hub = byTestId(container, "mesa-payment-hub").textContent;
  expect(hub).not.toContain("Cobrado por método");
  expect(hub).not.toContain("Pendiente de pago");
  expect(hub).not.toContain("Imprimir división");
  unmount(container, root);
});

// ── STATE GUARDS ───────────────────────────────────────────────────────────
test("a settled table keeps the ticket readable but offers nothing to charge", async () => {
  const settled = { ...TABLE, session: { ...MOCKUP_SESSION, paid: 39.5, outstanding: 0 } };
  const { container, root } = await openHub({ table: settled });
  expect(byTestId(container, "mesa-hub-outstanding").textContent).toMatch(/0,00\s?€/);
  expect(byTestId(container, "mesa-hub-cobrar-todo").disabled).toBe(true);
  expect(byTestId(container, "mesa-hub-pago-parcial").disabled).toBe(true);
  // still exactly three, never a shifting set
  expect(byTestId(container, "mesa-hub-actions").querySelectorAll("button")).toHaveLength(3);
  unmount(container, root);
});

test("the hub renders the same way on the phone, with no second overlay", async () => {
  const { container, root } = await openHub({ compact: true });
  expect(byTestId(container, "mesa-payment-hub")).not.toBeNull();
  expect(byTestId(container, "mesa-hub-actions").querySelectorAll("button")).toHaveLength(3);
  expect(container.querySelectorAll(".mesa-overlay")).toHaveLength(0);
  expect(container.textContent).toContain("Mesa 4 · Ver cuenta");
  unmount(container, root);
});

// ── NAVIGATION ─────────────────────────────────────────────────────────────
test("navigation · Ver cuenta opens the Payment Hub directly, on ONE surface", async () => {
  // V1.1 §3. This used to stack a second overlay, leaving the table's little
  // summary visible behind the hub. One tap, one surface, nothing behind it.
  const { container, root } = await openHub();
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(byTestId(container, "mesa-payment-hub")).not.toBeNull();
  expect(container.textContent).toContain("Mesa 4 · Ver cuenta");
  // The intermediate preview's own content is gone, not merely covered.
  expect(container.textContent).not.toContain("Pedido en curso");
  expect(container.textContent).not.toContain("Todavía no hay comandas.");
  unmount(container, root);
});

test("navigation · the same one-surface rule holds on the phone", async () => {
  const { container, root } = await openHub({ compact: true });
  expect(container.querySelectorAll(".mesa-overlay")).toHaveLength(0);
  expect(container.querySelectorAll('[data-testid="mesa-payment-hub"]')).toHaveLength(1);
  expect(container.textContent).not.toContain("Pedido en curso");
  unmount(container, root);
});

test("navigation · going back returns to the table, and the hub is gone", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-account-back"));
  await flush();
  expect(byTestId(container, "mesa-payment-hub")).toBeNull();
  expect(container.textContent).toContain("Comanda actual");
  expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  unmount(container, root);
});
