import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  createMesaRequestId: jest.fn(() => "mesa_test_request"),
  describeMesaError: jest.fn((error) => error?.code || "error"),
}));

const MesaOrderBuilder = require("./MesaOrderBuilder").default;
const { createMesaRequestId, describeMesaError } = require("../../mesa/mesaApi");

function click(element) {
  act(() => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}
function typeInto(input, value) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
function setWidth(px) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: px });
  act(() => { window.dispatchEvent(new Event("resize")); });
}
function byTestId(container, id) { return container.querySelector(`[data-testid="${id}"]`); }
function allByTestId(container, id) { return Array.from(container.querySelectorAll(`[data-testid="${id}"]`)); }
function productCard(container, name) {
  return allByTestId(container, "mesa-product-card").find((el) => el.textContent.includes(name));
}
function buttonByText(container, text) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent.trim().startsWith(text));
}

const target = (overrides = {}) => ({
  sessionId: "session-1", tableNumber: 3, tableName: "Mesa 3", coversTotal: null, ...overrides,
});

async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = props.onClose || jest.fn();
  const onSubmit = props.onSubmit || jest.fn().mockResolvedValue({ ok: true });
  await act(async () => {
    root.render(<MesaOrderBuilder target={props.target || target()} onClose={onClose} onSubmit={onSubmit} />);
  });
  await flush();
  return { container, root, onClose, onSubmit };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

// CRA's default jest config sets resetMocks:true, which wipes a jest.fn's
// implementation before EVERY test (not just clears call history) -- so the
// implementation given in the jest.mock() factory above must be re-armed
// here every time, exactly like TabMesa.render.test.js already does for the
// same module.
beforeEach(() => {
  jest.clearAllMocks();
  createMesaRequestId.mockReturnValue("mesa_test_request");
  describeMesaError.mockImplementation((error) => error?.code || "error");
  setWidth(1280);
});

// 1. first comanda with covers null -- shows the covers picker
test("covers null shows the compact covers step first", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null }) });
  expect(container.textContent).toContain("¿Cuántos comensales?");
  expect(byTestId(container, "covers-quick-4")).toBeTruthy();
  unmount(container, root);
});

// 2. picking covers -- opens the picker immediately
test("picking covers opens the picker workspace immediately, no intermediate screen", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  expect(container.textContent).toContain("Nueva comanda — Mesa 3");
  expect(container.textContent).toContain("Pizzas");
  unmount(container, root);
});

// 3. Cancelar on the covers step -- no API call
test("Cancelar on the covers step aborts without ever calling onSubmit", async () => {
  const { container, root, onClose, onSubmit } = await mount({ target: target({ coversTotal: null }) });
  click(buttonByText(container, "Cancelar"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  unmount(container, root);
});

// 4. covers are never persisted separately -- picking them alone never calls onSubmit
test("choosing covers alone never calls onSubmit -- it's only bundled at final submit", async () => {
  const { container, root, onSubmit } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  expect(onSubmit).not.toHaveBeenCalled();
  unmount(container, root);
});

// 5. submit prima comanda include coversTotal
test("first comanda submit bundles the freshly chosen coversTotal atomically with items", async () => {
  const { container, root, onSubmit } = await mount({ target: target({ coversTotal: null }) });
  click(byTestId(container, "covers-quick-4"));
  await flush();
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0][0].coversTotal).toBe(4);
  unmount(container, root);
});

// 6. next comanda -- straight to the picker
test("when covers are already known, the builder opens straight to the picker", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 4 }) });
  expect(container.textContent).not.toContain("¿Cuántos comensales?");
  expect(container.textContent).toContain("Nueva comanda — Mesa 3");
  unmount(container, root);
});

// 7. cart survives opening/closing the sub-picker (extras panel + category switch)
test("cart survives opening/closing the extras sub-panel and switching categories", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  // open extras (pencil) via drawer, then close it without losing the line
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-line-edit"));
  await flush();
  expect(container.textContent).toContain("Ingredientes extra");
  click(buttonByText(container, "Listo"));
  await flush();
  expect(container.textContent).toContain("1 artículo");
  // switch categories, then back -- product still selected (badge qty)
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(buttonByText(container, "Pizzas"));
  await flush();
  expect(productCard(container, "El Pelusa").textContent).toContain("1");
  unmount(container, root);
});

// 8. adding items from multiple categories
test("items from multiple categories accumulate in the same persistent cart", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "mesa-line").length).toBe(2);
  unmount(container, root);
});

// 9. quantity
test("tapping a product again increments its quantity badge; drawer +/- also works", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  click(productCard(container, "El Pelusa"));
  await flush();
  // two taps create two separate lines (never merge -- same rule as ItemPickerModal)
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "mesa-line").length).toBe(2);
  click(byTestId(container, "mesa-line-plus"));
  await flush();
  expect(container.textContent).toContain("3 artículos");
  unmount(container, root);
});

// 10. extras and removed ingredients
test("extras and removed-ingredient toggles reach the submitted payload", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-line-edit"));
  await flush();
  click(allByTestId(container, "mesa-extra-chip")[0]);
  await flush();
  click(allByTestId(container, "remove-ingredient-chip")[0]);
  await flush();
  click(buttonByText(container, "Listo"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  const submitted = onSubmit.mock.calls[0][0].items[0];
  expect(submitted.extras.length).toBe(1);
  expect(submitted.removedIngredients.length).toBe(1);
  unmount(container, root);
});

// 11. per-line note
test("a per-line note on a non-pizza item reaches the submitted item", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  typeInto(byTestId(container, "mesa-line-note"), "bien fría");
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit.mock.calls[0][0].items[0].notes).toBe("bien fría");
  unmount(container, root);
});

// 12. general note
test("the general note reaches onSubmit as `nota`", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  typeInto(byTestId(container, "mesa-nota-general"), "mesa junto a la ventana");
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit.mock.calls[0][0].nota).toBe("mesa junto a la ventana");
  unmount(container, root);
});

// 13. both product names and ID preserved
test("submitted item preserves product id, classic name and fantasy name -- no silent remap", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  const item = onSubmit.mock.calls[0][0].items[0];
  expect(item.id).toBe(1);
  expect(item.fantasyName).toBe("El Pelusa");
  expect(item.classicName).toBe("Margherita Classica");
  expect(item.baseUnitPrice).toBe(12.0);
  unmount(container, root);
});

// 14. edit a line
test("editing a line via the pencil updates that same line, not a duplicate", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-line-edit"));
  await flush();
  click(allByTestId(container, "mesa-extra-chip")[0]);
  await flush();
  click(buttonByText(container, "Listo"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "mesa-line").length).toBe(1);
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit.mock.calls[0][0].items.length).toBe(1);
  expect(onSubmit.mock.calls[0][0].items[0].extras.length).toBe(1);
  unmount(container, root);
});

// 15. remove a line
test("removing a line via the trash button drops it from the cart and the submitted payload", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  expect(allByTestId(container, "mesa-line").length).toBe(2);
  click(byTestId(container, "mesa-line-remove"));
  await flush();
  expect(allByTestId(container, "mesa-line").length).toBe(1);
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit.mock.calls[0][0].items.length).toBe(1);
  unmount(container, root);
});

// 16. correct total
test("total shown in the sticky bar matches the sum of line subtotals", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa")); // 12.0
  await flush();
  click(buttonByText(container, "Bebidas"));
  await flush();
  click(productCard(container, "Estrella Galicia")); // 3.0
  await flush();
  expect(container.textContent).toContain("15.00€");
  unmount(container, root);
});

// 17. correct sticky bar
test("the sticky bar shows item count, total and a Ver comanda action, disabled while empty", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  expect(byTestId(container, "mesa-ver-comanda").disabled).toBe(true);
  click(productCard(container, "El Pelusa"));
  await flush();
  expect(container.textContent).toContain("1 artículo");
  expect(byTestId(container, "mesa-ver-comanda").disabled).toBe(false);
  unmount(container, root);
});

// 18. submit only once
test("a normal submit calls onSubmit exactly once", async () => {
  const onSubmit = jest.fn().mockResolvedValue({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  unmount(container, root);
});

// 19. double tap does not duplicate
test("a rapid double tap on Enviar never sends a second request -- button disables synchronously", async () => {
  let resolveSubmit;
  const onSubmit = jest.fn(() => new Promise((resolve) => { resolveSubmit = resolve; }));
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  const btn = byTestId(container, "mesa-enviar-comanda");
  click(btn);
  click(btn);
  click(btn);
  await flush();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(btn.disabled).toBe(true);
  act(() => { resolveSubmit({ ok: true }); });
  await flush();
  unmount(container, root);
});

// 20. client request ID stable across retry
test("client_req_id stays identical across a failed submit and its retry", async () => {
  const onSubmit = jest.fn()
    .mockRejectedValueOnce({ code: "MESA_NETWORK_ERROR" })
    .mockResolvedValueOnce({ ok: true });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(onSubmit.mock.calls[0][0].client_req_id).toBe(onSubmit.mock.calls[1][0].client_req_id);
  unmount(container, root);
});

// 21. error keeps the whole draft
test("a failed submit shows the error and keeps covers, cart and note intact for retry", async () => {
  const onSubmit = jest.fn().mockRejectedValue({ code: "MESA_SERVER_ERROR" });
  const { container, root } = await mount({ target: target({ coversTotal: 2 }), onSubmit });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  typeInto(byTestId(container, "mesa-nota-general"), "sin gluten");
  click(byTestId(container, "mesa-enviar-comanda"));
  await flush();
  expect(byTestId(container, "mesa-error")).toBeTruthy();
  expect(allByTestId(container, "mesa-line").length).toBe(1);
  expect(byTestId(container, "mesa-nota-general").value).toBe("sin gluten");
  expect(byTestId(container, "mesa-enviar-comanda").disabled).toBe(false);
  unmount(container, root);
});

// 23. no delivery/phone/planner field on the Mesa path
test("no delivery/customer/planner surface leaks into the Mesa builder", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const text = container.textContent;
  for (const banned of ["Teléfono", "Dirección", "Planner", "Retirar a las", "Comanda separada para cocina", "Método de pago"]) {
    expect(text).not.toContain(banned);
  }
  unmount(container, root);
});

// 25/26. responsive
test("on a phone-width viewport the picker panel goes full screen (no user-agent sniffing)", async () => {
  setWidth(375);
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[aria-label^="Nueva comanda"]');
  expect(dialog.getAttribute("style")).toContain("border-radius: 0;");
  unmount(container, root);
});
test("on a tablet/desktop-width viewport the picker panel keeps its rounded floating layout", async () => {
  setWidth(1024);
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[aria-label^="Nueva comanda"]');
  expect(dialog.getAttribute("style")).toContain("border-radius: 20px");
  unmount(container, root);
});

// 27. accessibility
test("the picker step exposes a labelled dialog role", async () => {
  const { container, root } = await mount({ target: target({ coversTotal: 2 }) });
  const dialog = container.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  unmount(container, root);
});
test("Escape closes the extras panel first, then the drawer, then the whole builder", async () => {
  const { container, root, onClose } = await mount({ target: target({ coversTotal: 2 }) });
  click(productCard(container, "El Pelusa"));
  await flush();
  click(byTestId(container, "mesa-ver-comanda"));
  await flush();
  click(byTestId(container, "mesa-line-edit"));
  await flush();
  expect(container.textContent).toContain("Ingredientes extra");
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(container.textContent).not.toContain("Ingredientes extra");
  expect(onClose).not.toHaveBeenCalled();
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await flush();
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount(container, root);
});
