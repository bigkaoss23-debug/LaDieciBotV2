// WADettaglio.draftLock.test.js — POST_OPUS_REVIEW_REMEDIATION Scope D (2026-09-18).
//
// The genuine behavioral differentiator between the pre-fix and fixed WADettaglio save
// path. The pre-fix code called `api.post({action:'updateOrden', ...})` directly from
// the COCINA save handler; the fixed code routes it through persistenceGateway.js's
// `submitOrderPayload`, whose own contract is: "the write lock is evaluated BEFORE the
// injected persist function is called". In a draft/no-persist build (the environment
// this repo's draft-preview deploys run under), the pre-fix code would still fire a real
// mutating request; the fixed code must not construct one at all.
//
// A SEPARATE file (not appended to WADettaglio.canonicalEdit.test.js) specifically so
// `../../draftGuard` can be mocked at module-load time via the standard jest.mock
// hoisting, without a jest.resetModules() mid-file (which desyncs the React module
// instance a re-required component hooks into).
//
// Run: CI=true npx react-scripts test --watchAll=false src/components/wa/WADettaglio.draftLock.test.js

import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../draftGuard", () => ({
  __esModule: true,
  DRAFT_NO_PERSIST: true,
  DRAFT_NOTICE: "Borrador de prueba — no se guardarán cambios",
}));
jest.mock("../../api", () => ({
  __esModule: true,
  sb: { select: jest.fn(() => Promise.resolve([])) },
  api: {
    get: jest.fn(() => Promise.resolve({})),
    post: jest.fn(() => Promise.resolve({ success: true, _ok: true })),
  },
  auth: { getActor: jest.fn(() => "owner"), getRole: jest.fn(() => "admin") },
}));

const { api, sb } = require("../../api");
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
function click(el) { act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }

beforeEach(() => {
  jest.clearAllMocks();
  sb.select.mockResolvedValue([]);
  api.get.mockResolvedValue({});
  api.post.mockResolvedValue({ success: true, _ok: true });
});

test("in a draft/no-persist build, the COCINA save is BLOCKED before any network call is made", async () => {
  const ordenActiva = { id: "ORD-DRAFT", tel: "34600111222", wa_id: "34600111222", estado: "EN_COCINA" };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<WADettaglio msg={baseMsg({ stato: "COCINA", ...linkedOrderRef("ORD-DRAFT") })}
      allMsgs={[]} ordenes={[ordenActiva]}
      onConfirm={jest.fn()} onManual={jest.fn()} onElimina={jest.fn()} onRispondi={jest.fn()}
      onAgregar={jest.fn()} onUpdateIaItems={jest.fn()} onMoveToPreguntas={jest.fn()} />);
  });
  await flush();
  const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Actualizar en cocina"));
  expect(saveBtn).toBeTruthy();
  click(saveBtn);
  await flush();
  // The gateway's fail-closed draft lock means the wire call never happens at all.
  expect(api.post).not.toHaveBeenCalledWith(expect.objectContaining({ action: "updateOrden" }));
  act(() => { root.unmount(); });
  container.remove();
});
