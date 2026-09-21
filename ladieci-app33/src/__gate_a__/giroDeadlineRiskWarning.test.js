/**
 * [LIVE 2026-09-21] Avviso REVISAR nel modal Crear giro: uscita scelta dopo la promessa di un cliente.
 *
 * Il campo "Personalizado" (placeholder HH:MM) imposta `mode="custom"` al
 * primo carattere digitato — non serve cliccare il radio separatamente.
 * Mock del solo `../api`: nessuna rete reale, nessun ordine reale.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("../api", () => ({
  api: {
    getManualGiros: jest.fn().mockResolvedValue({ giros: [] }),
    createManualGiro: jest.fn().mockResolvedValue({ ok: true, giro: { id: "G1" } }),
    removeOrderFromManualGiro: jest.fn().mockResolvedValue({ ok: true }),
    dissolveManualGiro: jest.fn().mockResolvedValue({ ok: true }),
  },
  auth: { getToken: () => "t", isAuthenticated: () => true },
}));

import TabEntregas from "../components/entregas/TabEntregas";
import { api } from "../api";

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
const setInputValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const deliveries = [
  { id: "D-1", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle A", zona: "Q1", hora: "20:40", items: [] },
  { id: "D-2", tipo_consegna: "DOMICILIO", estado: "EN_COCINA", direccion: "Calle B", zona: "Q1", hora: "20:45", items: [] },
];

const openGiroModal = async () => {
  const el = mount(<TabEntregas ordenes={deliveries} notify={() => {}} setOrdenes={() => {}} />);
  await flush();
  const selectors = [...el.querySelectorAll("button[aria-pressed]")]
    .filter((b) => /giro manual|seleccion manual/i.test(b.getAttribute("title") || ""));
  expect(selectors.length).toBeGreaterThanOrEqual(2);
  click(selectors[0]); click(selectors[1]);
  const cta = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro manual");
  expect(cta.disabled).toBe(false);
  click(cta);
  return el;
};

test("uscita entro tutte le promesse: nessun REVISAR", async () => {
  const el = await openGiroModal();
  setInputValue(el.querySelector('input[placeholder="HH:MM"]'), "20:35");
  expect(el.textContent).not.toContain("REVISAR");
});

test("uscita dopo la promessa di un membro: REVISAR fattuale col solo membro a rischio; confermare = override, hora cliente intatta", async () => {
  const el = await openGiroModal();
  setInputValue(el.querySelector('input[placeholder="HH:MM"]'), "20:42");
  expect(el.textContent).toContain("REVISAR");
  expect(el.textContent).toContain("Salida 20:42 > cliente 20:40 · D-1");
  expect(el.textContent).not.toContain("cliente 20:45 · D-2");
  const confirm = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro");
  await act(async () => { confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
  expect(api.createManualGiro).toHaveBeenCalledTimes(1);
  const [ids, horaRef] = api.createManualGiro.mock.calls[0];
  expect([...ids].sort()).toEqual(["D-1", "D-2"]);
  expect(horaRef).toBe("20:42");
  expect(deliveries.map(o => o.hora)).toEqual(["20:40", "20:45"]);
});
