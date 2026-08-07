import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../api", () => ({
  __esModule: true,
  api: { getOrdenesArchivadosSesion: jest.fn() },
}));

const { useTakeawayArchivedOrders } = require("./useTakeawayArchivedOrders");
const { api } = require("../../api");

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function Harness({ refreshKey, onRender }) {
  const state = useTakeawayArchivedOrders({ refreshKey });
  onRender(state);
  return null;
}

function mount(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let last = null;
  act(() => { root.render(<Harness {...props} onRender={(s) => { last = s; }} />); });
  return { container, root, get: () => last };
}

beforeEach(() => { jest.clearAllMocks(); });

test("fetches on mount and exposes archivedOrdenes", async () => {
  api.getOrdenesArchivadosSesion.mockResolvedValue({ ordenes: [{ id: "R1", nombre: "Juan", estado: "RETIRADO" }] });
  const { root, get } = mount({});
  await flush();
  expect(api.getOrdenesArchivadosSesion).toHaveBeenCalledTimes(1);
  expect(get().archivedOrdenes).toEqual([{ id: "R1", nombre: "Juan", estado: "RETIRADO" }]);
  expect(get().loading).toBe(false);
  expect(get().error).toBe("");
  act(() => { root.unmount(); });
});

test("refetches when refreshKey changes", async () => {
  api.getOrdenesArchivadosSesion.mockResolvedValue({ ordenes: [] });
  const { root, container } = mount({ refreshKey: 0 });
  await flush();
  expect(api.getOrdenesArchivadosSesion).toHaveBeenCalledTimes(1);
  act(() => { root.render(<Harness refreshKey={1} onRender={() => {}} />); });
  await flush();
  expect(api.getOrdenesArchivadosSesion).toHaveBeenCalledTimes(2);
  act(() => { root.unmount(); });
  container.remove();
});

test("network error surfaces without throwing, keeps previous data", async () => {
  api.getOrdenesArchivadosSesion.mockRejectedValue(new Error("boom"));
  const { root, get } = mount({});
  await flush();
  expect(get().error).toBe("No se pudo cargar el archivo.");
  expect(get().archivedOrdenes).toEqual([]);
  act(() => { root.unmount(); });
});

test("backend {error} payload is surfaced as error, not thrown", async () => {
  api.getOrdenesArchivadosSesion.mockResolvedValue({ error: "sesión expirada" });
  const { root, get } = mount({});
  await flush();
  expect(get().error).toBe("sesión expirada");
  act(() => { root.unmount(); });
});

test("unmount clears the polling interval -- no request after the component is gone", async () => {
  jest.useFakeTimers();
  try {
    api.getOrdenesArchivadosSesion.mockResolvedValue({ ordenes: [] });
    const { root, container } = mount({});
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const callsBeforeUnmount = api.getOrdenesArchivadosSesion.mock.calls.length;
    act(() => { root.unmount(); });
    container.remove();
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(api.getOrdenesArchivadosSesion.mock.calls.length).toBe(callsBeforeUnmount);
  } finally {
    jest.useRealTimers();
  }
});
