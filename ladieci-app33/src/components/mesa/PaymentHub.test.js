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
    { id: "l1", description: "El Pelusa", amount: 12, paid: 10, remaining: 2 },
    { id: "l2", description: "La Joya", amount: 15, paid: 0, remaining: 15 },
    { id: "l3", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3 },
    { id: "l4", description: "Estrella Galicia", amount: 3, paid: 0, remaining: 3 },
    { id: "l5", description: "Fanta Naranja", amount: 3.5, paid: 0, remaining: 3.5 },
    { id: "l6", description: "San Miguel 0,0", amount: 3, paid: 0, remaining: 3 },
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
  const rows = Array.from(ticket.querySelectorAll('[data-testid="mesa-hub-line"]'))
    .map((row) => row.textContent);
  expect(rows).toHaveLength(5);
  expect(rows[0]).toMatch(/^1El Pelusa12,00\s?€$/);
  expect(rows[2]).toMatch(/^2Estrella Galicia6,00\s?€$/); // two lines, one row
  expect(rows[4]).toMatch(/^1San Miguel 0,03,00\s?€$/);
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

test("4 · Pago parcial offers the two existing Mesa capabilities, and opens the real picker", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  const drawer = byTestId(container, "mesa-hub-drawer-pago-parcial");
  expect(drawer.textContent).toContain("Elegir productos");
  expect(drawer.textContent).toContain("Selecciona qué cobrar");
  expect(drawer.textContent).toContain("Importe libre");
  expect(drawer.textContent).toContain("Introduce un importe");

  click(byTestId(container, "mesa-hub-elegir-productos"));
  // The existing, unmodified PaymentModal -- same line picker as before.
  const dialogs = container.querySelectorAll('[role="dialog"]');
  expect(dialogs[dialogs.length - 1].textContent).toContain("Cobrar productos");
  expect(dialogs[dialogs.length - 1].querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
  unmount(container, root);
});

test("4 · the method chosen in the drawer is carried into the partial flow", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-pago-parcial"));
  const drawer = byTestId(container, "mesa-hub-drawer-pago-parcial");
  click(Array.from(drawer.querySelectorAll(".mesa-method")).find((b) => b.textContent.includes("Bizum")));
  click(byTestId(container, "mesa-hub-importe-libre"));
  const dialogs = container.querySelectorAll('[role="dialog"]');
  const active = dialogs[dialogs.length - 1].querySelector(".mesa-method.active");
  expect(active.textContent).toContain("Bizum");
  unmount(container, root);
});

test("4 · Descuento is present but inert -- it never charges and says why", async () => {
  const { container, root } = await openHub();
  click(byTestId(container, "mesa-hub-descuento"));
  const drawer = byTestId(container, "mesa-hub-drawer-descuento");
  expect(drawer.textContent).toContain("Próximamente");
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
