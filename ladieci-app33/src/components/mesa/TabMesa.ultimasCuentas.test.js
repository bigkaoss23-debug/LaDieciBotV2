// ===============================================================
// ACC-01 FRONTEND CRASH HOTFIX (2026-08-21) — mounts the REAL
// UltimasCuentasModal component, the only consumer of the ACC-01 reader.
//
// WHY THIS FILE EXISTS. The backend reader (mesaClosedAccountReader.test.js,
// 16 tests) was thoroughly proven correct, but nothing ever MOUNTED this
// modal. It called `formatClockTime(...)` at three call sites and that
// helper was never defined anywhere in the frontend -- a plain
// `grep -c formatClockTime` returned 3 and was misread as "it exists", when
// it was only counting these very call sites. The deployed modal crashed
// the whole React tree to a black screen the first time a real operator
// opened "🧾 Últimas cuentas" on staging (ReferenceError: formatClockTime is
// not defined). This file is the missing coverage: it renders the component
// for real, the same way ServicioPage -> TabMesa -> Mesa dock does.
//
// The fixture below is the REAL 2026-08-20 Mesa 4 forensic session
// (b490d667), matching mesaClosedAccountReader.test.js and
// TabMesa.billDocument.test.js byte-for-byte: comanda #999015 = 101.00,
// comanda #999017 = 27.50 (the two pizzas added after the table had already
// been settled), five payments totalling 128.50, outstanding 0.
// ===============================================================

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// REFUND V1 -- UltimasCuentasModal now renders MesaPaymentsList (the shared
// payments/refund component also used by the open-table Payment Hub), which
// needs createMesaRequestId and mesaApi.refund even when no test here
// actually exercises a refund.
jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  describeMesaError: jest.fn((err) => err?.message || "No se pudo cargar."),
  createMesaRequestId: jest.fn(() => "mesa_test_refund_request"),
  mesaApi: {
    recentClosedSessions: jest.fn(),
    sessionAccount: jest.fn(),
    refund: jest.fn(),
  },
}));

const { UltimasCuentasModal } = require("./TabMesa");
const { mesaApi, describeMesaError, createMesaRequestId } = require("../../mesa/mesaApi");

const SESSION_ID = "b490d667-5747-485b-8821-fdbdb579446f";

const RECENT_SESSIONS = Object.freeze({
  ok: true,
  sessions: [
    {
      tableSessionId: SESSION_ID,
      tableRef: "Mesa 4",
      tableId: "table-4",
      serviceSessionId: "480eca89-33cd-43ba-ac7f-5ed0a0473639",
      coversTotal: 4,
      openedAt: "2026-08-20T19:11:02Z",
      closedAt: "2026-08-20T19:30:01Z",
      closedBy: "owner",
    },
  ],
});

// A second, closed-but-untimestamped session -- exercises the null/invalid
// timestamp path (case J) through the real list row, not a bare helper call.
const RECENT_SESSIONS_WITH_MISSING_CLOSE = Object.freeze({
  ok: true,
  sessions: [
    ...RECENT_SESSIONS.sessions,
    {
      tableSessionId: "22222222-3333-4444-8555-666666666666",
      tableRef: "Mesa 9",
      tableId: "table-9",
      serviceSessionId: "480eca89-33cd-43ba-ac7f-5ed0a0473639",
      coversTotal: null,
      openedAt: "2026-08-20T20:00:00Z",
      closedAt: null,
      closedBy: null,
    },
  ],
});

const MESA_4_ACCOUNT = Object.freeze({
  ok: true,
  tableSessionId: SESSION_ID,
  status: "closed",
  closedAt: "2026-08-20T19:30:01Z",
  closedBy: "owner",
  tableRef: "Mesa 4",
  table: { id: "table-4", number: 4, name: "Mesa 4", capacity: 4 },
  account: {
    id: SESSION_ID,
    serviceSessionId: "480eca89-33cd-43ba-ac7f-5ed0a0473639",
    assignedWaiterActor: null,
    coversTotal: 4,
    coversRemaining: 0,
    openedAt: "2026-08-20T19:11:02Z",
    settledAt: "2026-08-20T19:30:01Z",
    total: 128.5,
    paid: 128.5,
    outstanding: 0,
    nextEqualShare: 0,
    paymentTotals: { efectivo: 30, tarjeta: 51, bizum: 47.5, other: 0 },
    commands: [
      { id: "#999015", commandNumber: 1, serviceOrderNumber: 3, state: "RETIRADO", total: 101, time: "21:13", items: [], note: null, kitchenNote: null },
      { id: "#999017", commandNumber: 2, serviceOrderNumber: 5, state: "RETIRADO", total: 27.5, time: "21:27", items: [], note: null, kitchenNote: null },
    ],
    lines: [
      { id: "l1", orderId: "#999015", sourceLineId: "g1", sourceLineIndex: 1, unitIndex: 1, description: "El Divino Codino", product: {}, amount: 101, paid: 101, remaining: 0 },
      { id: "l4", orderId: "#999017", sourceLineId: "g4", sourceLineIndex: 1, unitIndex: 1, description: "La Pulga", product: {}, amount: 13, paid: 13, remaining: 0 },
      { id: "l5", orderId: "#999017", sourceLineId: "g5", sourceLineIndex: 2, unitIndex: 1, description: "Il Tulipano Nero", product: {}, amount: 14.5, paid: 14.5, remaining: 0 },
    ],
    payments: [
      { id: "tx1", kind: "payment", mode: "item_selection", amount: 33.5, method: "tarjeta", coversSettled: 1, actor: "owner", createdAt: "2026-08-20T19:23:34Z" },
      { id: "tx2", kind: "payment", mode: "custom_amount", amount: 20, method: "bizum", coversSettled: 1, actor: "owner", createdAt: "2026-08-20T19:24:09Z" },
      { id: "tx3", kind: "payment", mode: "custom_amount", amount: 30, method: "efectivo", coversSettled: 1, actor: "owner", createdAt: "2026-08-20T19:25:12Z" },
      { id: "tx4", kind: "payment", mode: "full", amount: 17.5, method: "tarjeta", coversSettled: 1, actor: "owner", createdAt: "2026-08-20T19:25:23Z" },
      { id: "tx5", kind: "payment", mode: "full", amount: 27.5, method: "bizum", coversSettled: 0, actor: "owner", createdAt: "2026-08-20T19:29:54Z" },
    ],
  },
});

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
function click(element) { act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }

async function mount(onClose = jest.fn(), canRefund = false) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<UltimasCuentasModal onClose={onClose} canRefund={canRefund} />);
  });
  await flush();
  return { container, root, onClose };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's default Jest config sets `resetMocks: true`, which wipes every
  // mock's IMPLEMENTATION (not just its call history) before each test --
  // including one set only inside a `jest.mock(...)` factory, since the
  // factory itself runs once and is never re-invoked per test. Without this
  // line, describeMesaError silently degrades to a no-op returning
  // `undefined` from the second test onward, and the error-banner test
  // below would render an EMPTY string instead of catching a real defect --
  // exactly the kind of gap that let the ACC-01 crash through in the first
  // place. Re-establish it explicitly, every test, same as the two mesaApi
  // methods just below.
  describeMesaError.mockImplementation((err) => err?.message || "No se pudo cargar.");
  createMesaRequestId.mockImplementation(() => "mesa_test_refund_request");
  mesaApi.recentClosedSessions.mockResolvedValue(RECENT_SESSIONS);
  mesaApi.sessionAccount.mockResolvedValue(MESA_4_ACCOUNT);
});

// A. opening the modal DOES NOT THROW -- this is the regression test. It
// would have failed loudly against the pre-fix code (ReferenceError,
// uncaught, react-dom logs it and the render never settles into content).
test("A. opening Ultimas Cuentas and drilling into a closed session does not throw", async () => {
  let thrown = null;
  const { container, root } = await mount();
  try {
    click(byTestId(container, "ultimas-cuentas-item"));
    await flush();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeNull();
  unmount(container, root);
});

// B. the modal itself renders real, recognisable content
test("B. the list view renders the read-only Ultimas Cuentas surface", async () => {
  const { container, root } = await mount();
  expect(container.textContent).toContain("Últimas cuentas cerradas");
  expect(container.textContent).toContain("Solo lectura");
  expect(byTestId(container, "ultimas-cuentas-item")).toBeTruthy();
  unmount(container, root);
});

describe("the drilled-in Mesa 4 account", () => {
  async function openMesa4(canRefund = false) {
    const mounted = await mount(jest.fn(), canRefund);
    click(byTestId(mounted.container, "ultimas-cuentas-item"));
    await flush();
    return mounted;
  }

  // C. Mesa 4 appears
  test("C. Mesa 4 identifies the account", async () => {
    const { container, root } = await openMesa4();
    expect(container.textContent).toContain("Mesa 4");
    unmount(container, root);
  });

  // D/E/F. total 128.50, paid 128.50, pending 0.00
  test("D/E/F. total 128.50, paid 128.50, pending 0.00 all render", async () => {
    const { container, root } = await openMesa4();
    expect(container.textContent).toMatch(/128,50\s?€/);
    expect(container.textContent).toMatch(/0,00\s?€/);
    // paid and total are the SAME figure here (fully settled), so assert the
    // stat labels are both present alongside it rather than double-counting
    // the same regex match
    // OVER-COLLECTED / AJUSTE COMERCIAL V1 SLICE C -- Ultimas Cuentas now
    // shares MesaAccountBalance with the open Payment Hub (contract §14), so
    // the labels are that component's exact wording, not the old
    // Total/Cobrado/Pendiente stat-grid strings.
    expect(container.textContent).toContain("Total");
    expect(container.textContent).toContain("Ya cobrado");
    expect(container.textContent).toContain("Resta por pagar");
    unmount(container, root);
  });

  // G. both comandas represented, with their own totals
  test("G. both comandas -- #999015 (101.00) and #999017 (27.50) -- are visible", async () => {
    const { container, root } = await openMesa4();
    expect(container.textContent).toContain("#999015");
    expect(container.textContent).toContain("#999017");
    expect(container.textContent).toMatch(/101,00\s?€/);
    expect(container.textContent).toMatch(/27,50\s?€/);
    unmount(container, root);
  });

  // H. payment history renders
  test("H. the payment history lists real tenders and amounts", async () => {
    const { container, root } = await openMesa4();
    expect(container.textContent).toContain("Pagos");
    expect(container.textContent).toContain("Tarjeta");
    expect(container.textContent).toContain("Bizum");
    expect(container.textContent).toContain("Efectivo");
    expect(container.textContent).toMatch(/33,50\s?€/);
    expect(container.textContent).toMatch(/17,50\s?€/);
    unmount(container, root);
  });

  // I. a valid timestamp renders HH:MM (Madrid time, same convention as
  // reservationTimeLabel elsewhere in this file)
  test("I. valid timestamps render as Madrid HH:MM, not raw ISO or garbage", async () => {
    const { container, root } = await openMesa4();
    // opened 19:11:02Z / closed 19:30:01Z -> 21:11 / 21:30 in Madrid (CEST)
    expect(container.textContent).toContain("21:11");
    expect(container.textContent).toContain("21:30");
    expect(container.textContent).not.toContain("Invalid Date");
    expect(container.textContent).not.toContain("NaN");
    unmount(container, root);
  });

  test("closing the drill-in returns to the list without a second network call", async () => {
    const { container, root } = await openMesa4();
    expect(mesaApi.sessionAccount).toHaveBeenCalledTimes(1);
    click(byTestId(container, "ultimas-cuentas-back"));
    await flush();
    expect(container.textContent).toContain("Últimas cuentas cerradas");
    unmount(container, root);
  });
});

// J. null/invalid timestamp renders "—", through the real list row -- not a
// bare call to the helper.
test("J. a closed session with no closedAt renders the em-dash, never a crash or garbage", async () => {
  mesaApi.recentClosedSessions.mockResolvedValue(RECENT_SESSIONS_WITH_MISSING_CLOSE);
  let thrown = null;
  let container, root;
  try {
    ({ container, root } = await mount());
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeNull();
  const items = allByTestId(container, "ultimas-cuentas-item");
  expect(items).toHaveLength(2);
  const mesa9Row = items.find((el) => el.textContent.includes("Mesa 9"));
  expect(mesa9Row).toBeTruthy();
  expect(mesa9Row.textContent).toContain("—");
  expect(mesa9Row.textContent).not.toContain("Invalid Date");
  expect(mesa9Row.textContent).not.toContain("NaN");
  unmount(container, root);
});

// STRICTLY READ-ONLY, by construction -- no write-shaped method exists on
// the mocked client for this modal to call even by mistake.
test("the modal never calls any mutating mesaApi method", async () => {
  const { container, root } = await mount();
  click(byTestId(container, "ultimas-cuentas-item"));
  await flush();
  for (const forbidden of ["openTable", "closeTable", "pay", "setCovers", "releaseEmptyTable", "saveTable"]) {
    expect(mesaApi[forbidden]).toBeUndefined();
  }
  unmount(container, root);
});

test("a fetch failure surfaces the error banner instead of crashing", async () => {
  mesaApi.recentClosedSessions.mockRejectedValue(new Error("network down"));
  let thrown = null;
  let container, root;
  try {
    ({ container, root } = await mount());
    await flush();
    await flush();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeNull();
  expect(container.textContent).toContain("network down");
  unmount(container, root);
});

// ═══ REFUND V1 -- CLOSED TABLES ARE FIRST-CLASS (§12/§37) ═══════════════════
// This modal is otherwise strictly read-only (see its own header comment);
// MesaPaymentsList is the one write path it now carries, gated on the same
// canRefund prop TabMesa threads down from the operator's role.
describe("Refund V1 -- closed-table refund (§12/§37)", () => {
  async function openMesa4(canRefund = false) {
    const mounted = await mount(jest.fn(), canRefund);
    click(byTestId(mounted.container, "ultimas-cuentas-item"));
    await flush();
    return mounted;
  }

  test("without canRefund, no Reembolsar action exists on a closed table's payments", async () => {
    const { container, root } = await openMesa4(false);
    expect(byTestId(container, "mesa-payhist-refund-btn")).toBeNull();
    unmount(container, root);
  });

  test("with canRefund, the closed table's own payments show Reembolsar", async () => {
    const { container, root } = await openMesa4(true);
    expect(allByTestId(container, "mesa-payhist-refund-btn").length).toBe(5); // all 5 fixture payments are unrefunded originals
    unmount(container, root);
  });

  test("a real refund submitted here calls mesaApi.refund with THIS session id, refreshes from the server, and the table stays CLOSED", async () => {
    mesaApi.refund.mockResolvedValue({ ok: true, refundTransactionId: "rt-1", amount: 10 });
    // The server's account AFTER the refund -- tx1 (33.50 tarjeta) partially reversed.
    const AFTER_REFUND = {
      ...MESA_4_ACCOUNT,
      account: {
        ...MESA_4_ACCOUNT.account,
        paid: 118.5,
        outstanding: 10,
        payments: [
          ...MESA_4_ACCOUNT.account.payments,
          { id: "rt-1", kind: "refund", amount: 10, method: "tarjeta", coversSettled: 0, actor: "owner", createdAt: "2026-08-20T19:40:00Z", reversesTransactionId: "tx1" },
        ],
      },
    };
    mesaApi.sessionAccount.mockResolvedValueOnce(MESA_4_ACCOUNT).mockResolvedValueOnce(AFTER_REFUND);

    const { container, root } = await openMesa4(true);
    click(allByTestId(container, "mesa-payhist-refund-btn")[0]);
    click(byTestId(container, "mesa-refund-reason-importe"));
    click(byTestId(container, "mesa-refund-confirm"));
    await flush();

    expect(mesaApi.refund).toHaveBeenCalledTimes(1);
    expect(mesaApi.refund.mock.calls[0][0]).toBe(SESSION_ID);
    expect(mesaApi.refund.mock.calls[0][1].originalTransactionId).toBe("tx1");

    // Server-refresh proof: sessionAccount was called again for the SAME
    // session, and the refund now appears with its linkage preserved.
    expect(mesaApi.sessionAccount).toHaveBeenCalledTimes(2);
    expect(mesaApi.sessionAccount).toHaveBeenNthCalledWith(2, SESSION_ID);
    expect(allByTestId(container, "mesa-payhist-refund").length).toBe(1);

    // §12/§37 -- never reopened, never closed again, never any Mesa write.
    for (const forbidden of ["openTable", "closeTable", "pay", "setCovers", "releaseEmptyTable", "saveTable"]) {
      expect(mesaApi[forbidden]).toBeUndefined();
    }
    unmount(container, root);
  });
});
