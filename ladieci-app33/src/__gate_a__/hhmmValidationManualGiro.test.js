/**
 * GATE A · 7-8 — validazione HH:MM del giro manuale, montata per davvero.
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

test("HH:MM non valido: appare esattamente 'Formato HH:MM no válido' e il giro NON viene creato", async () => {
  const el = await openGiroModal();
  const hhmmInput = el.querySelector('input[placeholder="HH:MM"]');
  expect(hhmmInput).toBeTruthy();

  setInputValue(hhmmInput, "99:99");
  const confirm = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro");
  click(confirm);

  expect(el.textContent).toContain("Formato HH:MM no válido");
  expect(api.createManualGiro).not.toHaveBeenCalled();
});

test("testo non numerico: stesso messaggio di errore, nessuna chiamata", async () => {
  const el = await openGiroModal();
  const hhmmInput = el.querySelector('input[placeholder="HH:MM"]');
  setInputValue(hhmmInput, "abcd");
  click([...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro"));
  expect(el.textContent).toContain("Formato HH:MM no válido");
  expect(api.createManualGiro).not.toHaveBeenCalled();
});

test("HH:MM valido: nessun errore, api.createManualGiro chiamata con gli id selezionati", async () => {
  const el = await openGiroModal();
  const hhmmInput = el.querySelector('input[placeholder="HH:MM"]');
  setInputValue(hhmmInput, "20:45");
  const confirm = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro");

  await act(async () => {
    confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  expect(el.textContent).not.toContain("Formato HH:MM no válido");
  expect(api.createManualGiro).toHaveBeenCalledTimes(1);
  const [orderIds, horaRef] = api.createManualGiro.mock.calls[0];
  expect(orderIds).toEqual(expect.arrayContaining(["D-1", "D-2"]));
  expect(horaRef).toBe("20:45");
});

test("ora limite valida (23:59) accettata, oltre il limite (24:00) rifiutata", async () => {
  const elOk = await openGiroModal();
  setInputValue(elOk.querySelector('input[placeholder="HH:MM"]'), "23:59");
  await act(async () => {
    [...elOk.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro").click();
    await Promise.resolve();
  });
  expect(elOk.textContent).not.toContain("Formato HH:MM no válido");

  act(() => root.unmount()); container.remove();
  jest.clearAllMocks();

  const elBad = await openGiroModal();
  setInputValue(elBad.querySelector('input[placeholder="HH:MM"]'), "24:00");
  click([...elBad.querySelectorAll("button")].find((b) => b.textContent.trim() === "Crear giro"));
  expect(elBad.textContent).toContain("Formato HH:MM no válido");
  expect(api.createManualGiro).not.toHaveBeenCalled();
});
