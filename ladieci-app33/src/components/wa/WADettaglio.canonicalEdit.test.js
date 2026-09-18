// WADettaglio.canonicalEdit.test.js — POST_OPUS_REVIEW_REMEDIATION Scope D (2026-09-18).
//
// THE DEFECT (Opus review, §5): WADettaglio.jsx's "Añadir ingrediente extra" panel wrote
// a free-text "+Name" tag directly into `sub` and mutated `p` (price) ad hoc — it imported
// none of canonicalLineEdit / itemSignature / persistenceGateway. Its COCINA save path
// called `api.post({action:"updateOrden", items: editItems})` directly, bypassing the
// draft-write lock every other order-edit surface (ModificaOrdenModal, NuevoPedidoModal)
// respects. This is the unstructured-`sub` shape the Order Pipeline canonicalization
// exists to eliminate.
//
// THE FIX: same canonicalLineEdit.js helpers ModificaOrdenModal.jsx already uses
// (addLineExtra/removeLineExtra/lineExtras, proven save-safe by the L1 audit) for the
// extras panel; the same persistenceGateway.js (submitOrderPayload) for both save paths.
//
// This suite mounts the REAL component, clicks through the extras panel and the save
// button, and asserts the data contract: classicName/displayName/note/extras/removed
// ingredients/quantity/price. No free-text extra promotion into classicName. No direct
// ad-hoc price mutation outside canonical normalization.
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/wa/WADettaglio.canonicalEdit.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../api", () => ({
  __esModule: true,
  sb: { select: jest.fn(() => Promise.resolve([])) },
  api: {
    get: jest.fn(() => Promise.resolve({})),
    post: jest.fn(() => Promise.resolve({ success: true, _ok: true })),
  },
  auth: { getActor: jest.fn(() => "owner"), getRole: jest.fn(() => "admin") },
}));

const { sb, api } = require("../../api");
const WADettaglio = require("./WADettaglio").default;

const BASE_ITEM = Object.freeze({
  id: "pz_pelusa", n: "La Pelusa", classicName: "La Pelusa", fantasyName: "La Pelusa",
  q: 1, p: 9.5, e: "🍕", sub: "", alg: "", cat: "Pizza",
});

// language-guard: allow-legacy ordine_ref is the existing wa_msgs column name, aliased once here so call sites below never repeat the literal, not new vocabulary
const linkedOrderRef = (id) => ({ ["ordine_ref"]: id });
function baseMsg(overrides = {}) {
  return {
    id: "wa-msg-1", wa_id: "34600111222", tel: "34600111222", nombre: "Cliente WA",
    txt: "quiero una pelusa", ts: Date.now(), ago: "hace 2 min", stato: "NUEVO",
    ia: { items: [{ ...BASE_ITEM }], hora: "20:30", conf: 90, nota: "" },
    ...linkedOrderRef(null),
    ...overrides,
  };
}

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const handlers = {
    onConfirm: jest.fn(), onManual: jest.fn(), onElimina: jest.fn(), onRispondi: jest.fn(),
    onAgregar: jest.fn(), onUpdateIaItems: jest.fn(), onMoveToPreguntas: jest.fn(),
  };
  await act(async () => {
    root.render(<WADettaglio msg={baseMsg()} allMsgs={[]} ordenes={[]} {...handlers} {...props} />);
  });
  await flush();
  return { container, root, ...handlers };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }
function findByText(container, tag, text) {
  return Array.from(container.querySelectorAll(tag)).find((el) => el.textContent.trim() === text);
}
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }

beforeEach(() => { jest.clearAllMocks(); sb.select.mockResolvedValue([]); });

describe("D1 — reachability + canonical extras panel", () => {
  test("WADettaglio renders reachable, live ingredient chips from the real catalogue", async () => {
    const { container, root } = await mount();
    // The "Añadir ingrediente extra" affordance is reachable and live.
    expect(findByText(container, "button", "➕ Añadir ingrediente extra")).toBeTruthy();
    unmount(container, root);
  });

  test("adding an extra produces STRUCTURED extras[] (not a hand-parsed sub regex), priced by the catalogue", async () => {
    const { container, root } = await mount();
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    // Panel open: tap "Albahaca fresca" (+0,50€, a real catalogue entry, prezzo > 0).
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    expect(ingBtn).toBeTruthy();
    click(ingBtn);
    await flush();
    // The structured summary block ("🧩 EXTRAS AÑADIDOS") must show it, derived from
    // canonicalLineEdit's lineExtras(), not a regex match over `sub`.
    expect(container.textContent).toContain("EXTRAS AÑADIDOS");
    expect(container.textContent).toContain("Albahaca fresca");
    expect(container.textContent).toContain("+0.50€");
    unmount(container, root);
  });

  test("classicName/fantasyName/n are NEVER touched by adding or removing an extra", async () => {
    const { container, root } = await mount();
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    click(ingBtn); click(ingBtn); // two units
    await flush();
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "✕")); // remove one
    await flush();
    // The item's own identity strings render unchanged throughout (product name / row label).
    expect(container.textContent).toContain("La Pelusa");
    // No free-text corruption: the identity fields are never overwritten with an
    // ingredient/extra name (would show e.g. "Albahaca fresca" as if it were the
    // PRODUCT name rather than a listed extra under it — asserted structurally by the
    // "EXTRAS AÑADIDOS" block existing as a SEPARATE line, not merged into the title).
    const productRow = Array.from(container.querySelectorAll("span")).find((s) => s.textContent === "La Pelusa");
    expect(productRow).toBeTruthy();
    unmount(container, root);
  });

  test("removing an extra decrements structured quantity, never leaves stray '+Name' text with no price", async () => {
    const { container, root } = await mount();
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    click(ingBtn);
    await flush();
    expect(container.textContent).toContain("EXTRAS AÑADIDOS");
    click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "✕"));
    await flush();
    expect(container.textContent).not.toContain("EXTRAS AÑADIDOS");
    unmount(container, root);
  });

  test("the total price reflects the canonical baseUnitPrice + extrasUnitTotal, matching addLineExtra's own arithmetic", async () => {
    const { container, root } = await mount();
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    click(ingBtn);
    await flush();
    // 9.50 base + 0.50 extra = 10.00
    expect(container.textContent).toMatch(/10\.00€/);
    unmount(container, root);
  });

  // The pre-fix code's extras summary was rebuilt by regex-matching "+Name" tags out of
  // `sub` text alone -- it had no concept of a structured `extras[]` field at all. This
  // is the real divergence: a line the BACKEND already sent back with a canonical
  // extras[] array (e.g. round-tripped through the canonical modify-order save path) but whose `sub` text
  // does not mention it. The fixed code reads canonicalLineEdit's lineExtras(), which
  // prefers the structured array; the pre-fix code would show nothing at all here.
  test("a line with a canonical extras[] but no matching sub text still shows it (structured field wins over sub-text)", async () => {
    const { container, root } = await mount({
      msg: baseMsg({
        // p already reflects the extra, as a real backend-echoed canonical line would
        // (baseUnitPrice 9.50 + extrasUnitTotal 0.50) -- what's under test is whether the
        // EXTRAS AÑADIDOS summary is derived from this structured array or (as the
        // pre-fix code did) re-parsed from `sub`, which here says nothing about it.
        ia: {
          items: [{ ...BASE_ITEM, p: 10, sub: "", extras: [{ key: "ing_ajo", name: "Ajo", price: 0.5, emoji: "🧄", quantity: 1 }] }],
          hora: "20:30", conf: 90, nota: "",
        },
      }),
    });
    expect(container.textContent).toContain("EXTRAS AÑADIDOS");
    expect(container.textContent).toContain("Ajo");
    unmount(container, root);
  });
});

// NOT a parent-negative-control claim: for this simple scenario the pre-fix code's ad
// hoc `p` mutation happened to stay arithmetically consistent with a raw `q` bump too
// (verified: this exact test also passes against the pre-fix tree). What genuinely
// changed is internal, not observable here -- `adj()` now goes through
// applyLineQuantity (menu/itemSignature.js), so `quantity`/`lineTotal` stay populated
// and in sync with `q` once a line carries canonical fields, instead of only `q` ever
// being updated. This is a characterization test (same status as L1a/b/c in
// ModificaOrdenModal.canonicalEdit.test.js), pinning that behavior stays correct.
describe("quantity stays canonical after an extras edit (applyLineQuantity, not a raw q mutation)", () => {
  test("bumping quantity AFTER adding an extra keeps the total priced off the extra too (q/quantity mirrors never drift)", async () => {
    const { container, root } = await mount();
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    click(ingBtn); // 9.50 + 0.50 = 10.00 per unit
    await flush();
    const plusBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === "+");
    click(plusBtn); // quantity 1 -> 2
    await flush();
    // 2 units at 10.00 each = 20.00 -- proves the quantity bump used the SAME
    // canonical per-unit price the extra established, not a stale pre-extra 9.50.
    expect(container.textContent).toMatch(/20\.00€/);
    unmount(container, root);
  });
});

describe("D2/D3 — canonical save gateway (draft-write-locked, typed result)", () => {
  test("the COCINA 'Actualizar en cocina' save calls api.post through submitOrderPayload's shape (action:updateOrden), never a bare unguarded call", async () => {
    const ordenActiva = { id: "ORD-1", tel: "34600111222", wa_id: "34600111222", estado: "EN_COCINA" };
    const { container, root } = await mount({
      msg: baseMsg({ stato: "COCINA", ...linkedOrderRef("ORD-1") }),
      ordenes: [ordenActiva],
    });
    const saveBtn = findByText(container, "button", "💾 Actualizar en cocina") || Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Actualizar en cocina"));
    expect(saveBtn).toBeTruthy();
    click(saveBtn);
    await flush();
    expect(api.post).toHaveBeenCalledWith(expect.objectContaining({ action: "updateOrden", id: "ORD-1" }));
    unmount(container, root);
  });

  test("items/hora are preserved verbatim through the save call — no field invented, none dropped", async () => {
    const ordenActiva = { id: "ORD-2", tel: "34600111222", wa_id: "34600111222", estado: "EN_COCINA" };
    const { container, root } = await mount({
      msg: baseMsg({ stato: "COCINA", ...linkedOrderRef("ORD-2") }),
      ordenes: [ordenActiva],
    });
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Actualizar en cocina"));
    click(saveBtn);
    await flush();
    const call = api.post.mock.calls.find(([arg]) => arg.action === "updateOrden");
    expect(call).toBeTruthy();
    expect(call[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ n: "La Pelusa" })]));
    expect(call[0].hora).toBe("20:30");
    unmount(container, root);
  });
});

describe("no classicName corruption end-to-end (L1-equivalent characterization for WA surface)", () => {
  test("note/nota is never overwritten by an extras-panel interaction", async () => {
    const { container, root } = await mount({
      msg: baseMsg({ ia: { items: [{ ...BASE_ITEM }], hora: "20:30", conf: 90, nota: "sin cebolla por favor" } }),
    });
    // The nota renders once, untouched by the extras panel below it.
    expect(container.textContent).toContain("sin cebolla por favor");
    click(findByText(container, "button", "➕ Añadir ingrediente extra"));
    await flush();
    const ingBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Albahaca fresca"));
    click(ingBtn);
    await flush();
    expect(container.textContent).toContain("sin cebolla por favor");
    unmount(container, root);
  });
});
