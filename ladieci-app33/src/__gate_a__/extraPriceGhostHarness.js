/**
 * Harness condiviso dei test "extra price ghost" — pilota i componenti REALI via DOM
 * (react-dom + act, stesso stile di extrasCanonicalCatalogue.test.js), senza testing-library.
 * Nessuna logica di prezzo qui: legge solo ciò che l'operatore vede e ciò che i componenti emettono.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MENU, INGREDIENTI, EXTRAS_DULCES, findExtra } from "../constants";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export const r2 = (n) => Math.round(n * 100) / 100;
export const catalog = (id) => MENU.find((m) => String(m.id) === String(id));

// ── DOM helpers ─────────────────────────────────────────────────────────────
let container = null;
let root = null;
export const mountEl = (el) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
  return container;
};
export const rerender = (el) => act(() => { root.render(el); });
export const unmountAll = () => {
  if (root) { act(() => root.unmount()); root = null; }
  if (container) { container.remove(); container = null; }
};
export const click = (el) => {
  if (!el) throw new Error("click su elemento nullo");
  act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
export const typeInto = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
export const buttons = (scope) => Array.from(scope.querySelectorAll("button"));
export const btnExact = (scope, text) => buttons(scope).find((b) => b.textContent.trim() === text);
export const btnMatch = (scope, re) => buttons(scope).find((b) => re.test(b.textContent));

// ── lettura "come la vede l'operatore" ─────────────────────────────────────
/** Estrae i token "+Nome" dal sub (stessa regola che usano i tre consumer). */
export const extraTokens = (sub) =>
  ((sub || "").match(/\+[^,]+/g) || []).map((m) => m.replace(/^\+/, "").trim());

/** Somma dei prezzi dei token riconosciuti nel sub. */
export const extrasSum = (sub) =>
  r2(extraTokens(sub).reduce((s, name) => s + (findExtra(name)?.prezzo || 0), 0));

/** Traccia di una riga: base catalogo + extra riconosciuti vs prezzo salvato. */
export const rowTrace = (step, item, extra = {}) => {
  const base = catalog(item.id)?.p ?? null;
  const sum = extrasSum(item.sub);
  const expected = base == null ? null : r2(base + sum);
  return {
    step,
    id: item.id,
    n: item.n,
    p: item.p,
    q: item.q,
    sub: item.sub || "",
    extras: extraTokens(item.sub),
    base,
    extras_expected: sum,
    expected_p: expected,
    delta: expected == null ? null : r2(item.p - expected),
    ...extra,
  };
};

// ── ItemPickerModal ─────────────────────────────────────────────────────────
export const pickerCardClick = (el, primaryLabel) => {
  const span = Array.from(el.querySelectorAll("span")).find((s) => s.textContent === primaryLabel);
  if (!span) throw new Error(`card ${primaryLabel} non trovata nel picker`);
  click(span);
};
export const pickerRows = (el) => {
  const label = Array.from(el.querySelectorAll("div")).find((d) => d.children.length === 0 && d.textContent === "En el pedido");
  if (!label) return [];
  return Array.from(label.parentElement.children).slice(1);
};
export const readPickerRow = (row) => {
  const head = row.firstChild;
  const q = Number(head.children[2].children[1].textContent);
  const lineTotal = parseFloat(head.children[3].textContent);
  return {
    n: head.children[1].textContent,
    q,
    lineTotal,
    unit: q ? r2(lineTotal / q) : null,
    sub: row.querySelector("input")?.value ?? "",
    chips: Array.from(row.querySelectorAll("span")).map((s) => s.textContent).filter((t) => /€/.test(t) && /✕/.test(t)),
  };
};
export const pickerFooterTotal = (el) => {
  const m = el.textContent.match(/seleccionados(\d+\.\d{2})€/);
  return m ? parseFloat(m[1]) : null;
};
export const pickerRowPlus = (row) => click(btnExact(row.firstChild, "+"));
export const pickerRowMinus = (row) => click(btnExact(row.firstChild, "−"));
export const pickerRowOpenExtras = (row) => {
  const b = btnMatch(row, /Añadir ingrediente extra|Añadir extra dulce/);
  if (!b) throw new Error("bottone Añadir ingrediente extra non trovato (pannello già aperto?)");
  click(b);
};
export const pickerRowAddExtra = (row, nome) => {
  if (!btnMatch(row, /Cerrar extras/)) pickerRowOpenExtras(row);
  const b = buttons(row).find((x) => x.textContent.includes(nome) && /\+\d+\.\d{2}€/.test(x.textContent) && !/✕/.test(x.textContent));
  if (!b) throw new Error(`extra ${nome} non trovato nel pannello`);
  click(b);
};
export const pickerRowRemoveExtraChip = (row, nome) => {
  const chip = Array.from(row.querySelectorAll("span")).find((s) => s.textContent.includes(nome) && /✕/.test(s.textContent) && s.querySelector("button"));
  if (!chip) throw new Error(`chip ${nome} non trovato`);
  click(chip.querySelector("button"));
};
export const pickerRowSetVariaciones = (row, value) => typeInto(row.querySelector("input"), value);
export const pickerConfirm = (el) => click(btnMatch(el, /Añadir \d+ items?|Actualizar/));

// ── ModificaOrdenModal ──────────────────────────────────────────────────────
export const modRows = (el) =>
  Array.from(el.querySelectorAll('input[placeholder^="Variaciones"]')).map((i) => i.parentElement);
export const readModRow = (row) => {
  const head = row.firstChild;
  const kids = head.children; // emoji, nome, −, qty, +, totale
  const q = Number(kids[3].textContent);
  const lineTotal = parseFloat(kids[5].textContent);
  return {
    n: kids[1].textContent,
    q,
    lineTotal,
    unit: q ? r2(lineTotal / q) : null,
    sub: row.querySelector('input[placeholder^="Variaciones"]').value,
  };
};
export const modTotal = (el) => {
  const m = el.textContent.match(/Total(\d+\.\d{2})€/);
  return m ? parseFloat(m[1]) : null;
};
export const modRowPlus = (row) => click(btnExact(row.firstChild, "+"));
export const modRowMinus = (row) => click(btnExact(row.firstChild, "−"));
export const modRowSetVariaciones = (row, value) => typeInto(row.querySelector('input[placeholder^="Variaciones"]'), value);
export const modRowAddExtra = (row, nome) => {
  if (!btnMatch(row, /✕ Cerrar/)) click(btnMatch(row, /Añadir ingrediente extra|Añadir extra dulce/));
  const b = buttons(row).find((x) => x.textContent.includes(nome) && /\+\d+\.\d{2}€/.test(x.textContent) && !/✕/.test(x.textContent));
  if (!b) throw new Error(`extra ${nome} non trovato nel pannello Modifica`);
  click(b);
};
export const modRowRemoveExtra = (row, nome) => {
  // riga extra = <div><span>emoji qty× nome</span><span>+prezzo</span><button>✕</button></div> (3 figli, l'ultimo è il bottone)
  const line = Array.from(row.querySelectorAll("div")).find((d) => d.children.length === 3 && d.lastElementChild.tagName === "BUTTON" && d.firstElementChild.textContent.includes(nome));
  if (!line) throw new Error(`riga extra ${nome} non trovata`);
  click(line.querySelector("button"));
};
export const modGridTap = (el, primaryLabel) => {
  const span = Array.from(el.querySelectorAll("span")).find((s) => s.textContent === primaryLabel);
  if (!span) throw new Error(`card ${primaryLabel} non trovata in Modifica`);
  click(span.closest("button"));
};
export const modSave = (el) => click(btnMatch(el, /Salva modifiche/));

export { React, INGREDIENTI, EXTRAS_DULCES, findExtra, MENU };
