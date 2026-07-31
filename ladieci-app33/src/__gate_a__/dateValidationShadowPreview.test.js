/**
 * GATE A · 5-6 — validazione data, provata montando ShadowPreviewPanel per
 * davvero (non solo grep sul testo del messaggio, che la suite esistente in
 * core/orders/gitLinePreservation.static.test.js già copre).
 *
 * Mock del solo client di rete `../api/shadowPreview` — il pannello è
 * dichiaratamente di SOLA LETTURA (vedi commento in testa al componente):
 * niente scritture, niente ordini, niente produzione.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api/shadowPreview", () => ({ fetchShadowPreview: jest.fn() }));

import ShadowPreviewPanel from "../components/ShadowPreviewPanel";
import { fetchShadowPreview } from "../api/shadowPreview";

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
  jest.clearAllMocks();
});

const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

test("data valida: nessun messaggio di errore, il pannello resta di sola lettura", async () => {
  fetchShadowPreview.mockResolvedValue({
    ok: true, status: 200,
    data: { version: 1, status: "ok", title: "Vista previa planner", groups: [], actions: [], summary: null },
  });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  expect(el.textContent).not.toContain("Fecha no válida");
  expect(el.textContent).toContain("Solo lectura");
  expect([...el.querySelectorAll("button")].some((b) => /aplicar|forzar|modificar/i.test(b.textContent))).toBe(false);
});

test("data non valida: appare esattamente 'Fecha no válida. Usa el formato YYYY-MM-DD.'", async () => {
  fetchShadowPreview.mockResolvedValue({ ok: false, status: 400, data: { error: "invalid_date" } });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  expect(el.textContent).toContain("Fecha no válida. Usa el formato YYYY-MM-DD.");
});

test("data mancante: messaggio distinto 'Falta la fecha...'", async () => {
  fetchShadowPreview.mockResolvedValue({ ok: false, status: 400, data: { error: "missing_date" } });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  expect(el.textContent).toContain("Falta la fecha. Selecciona un día (YYYY-MM-DD).");
});

test("401 durante la vista: invita a rientrare col PIN, non un errore generico", async () => {
  fetchShadowPreview.mockResolvedValue({ ok: false, status: 401, data: {} });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  expect(el.textContent).toContain("Sesión expirada o no autorizada. Vuelve a entrar con el PIN.");
});

test("403: 'Acceso no permitido para este rol' — un errore di ruolo non si confonde con uno di data", async () => {
  fetchShadowPreview.mockResolvedValue({ ok: false, status: 403, data: {} });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  expect(el.textContent).toContain("Acceso no permitido para este rol.");
});

test("cambiare la data e ricaricare invoca fetchShadowPreview con la nuova data — sola GET, mai una scrittura", async () => {
  fetchShadowPreview.mockResolvedValue({ ok: true, status: 200, data: { version: 1, status: "ok", groups: [], actions: [] } });
  const el = mount(<ShadowPreviewPanel onBack={() => {}} />);
  await flush();
  const input = el.querySelector('input[type="date"]');
  expect(input).toBeTruthy();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "2026-08-01");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const reloadBtn = [...el.querySelectorAll("button")].find((b) => /Cargar/.test(b.textContent));
  click(reloadBtn);
  await flush();
  const lastCall = fetchShadowPreview.mock.calls[fetchShadowPreview.mock.calls.length - 1][0];
  expect(lastCall.date).toBe("2026-08-01");
});
