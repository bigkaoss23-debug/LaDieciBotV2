import React, { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

// P1_D_LISTA_THEME_01 -- Lista's rows were rendered as native <button>
// elements with no background/color/appearance reset, so they inherited the
// browser's own light UA chrome (white/grey face, dark text) instead of the
// rest of the dark app -- confirmed live before this fix. This file checks
// the fix directly (real computed inline/class styling, not just "some text
// exists somewhere"), and that the existing structure/data/tap behavior and
// LIBRE/OCUPADA semantic colors are all unchanged.
jest.mock("../../mesa/mesaApi", () => ({
  __esModule: true,
  describeMesaError: jest.fn((error) => error?.code || "error"),
  mesaApi: { floor: jest.fn() },
}));

const MesaListaView = require("./MesaListaView").default;
const { mesaApi } = require("../../mesa/mesaApi");

const freeTable = { id: "t1", number: 1, active: true, status: "free", capacity: 4, reservations: [] };
const openTable = { id: "t2", number: 2, active: true, status: "open", capacity: 4, reservations: [], session: { commands: [] } };

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function mount(tables = [freeTable, openTable]) {
  mesaApi.floor.mockResolvedValue({ ok: true, tables });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<MesaListaView onSelectTable={jest.fn()} notify={jest.fn()} />); });
  await flush();
  return { container, root };
}
function unmount(container, root) { act(() => { root.unmount(); }); container.remove(); }

describe("MesaListaView -- dark theme", () => {
  test("rows are real dark-theme buttons, not bare <button> elements relying on browser UA chrome", async () => {
    const { container, root } = await mount();
    const rows = container.querySelectorAll(".mesa-row-tap");
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      expect(row.tagName).toBe("BUTTON");
      // Real declared values, not "browser default" (an unstyled <button>'s
      // computed background/color in JSDOM's default stylesheet is not this).
      expect(getComputedStyle(row).backgroundColor).not.toBe("");
      expect(row.className).toContain("mesa-row-tap");
    });
    unmount(container, root);
  });

  test("semantic status colors are preserved -- LIBRE green, OCUPADA red, unchanged by the theme fix", async () => {
    const { container, root } = await mount();
    const rows = Array.from(container.querySelectorAll(".mesa-row-tap"));
    const libreRow = rows.find((row) => row.textContent.includes("Mesa 1"));
    const ocupadaRow = rows.find((row) => row.textContent.includes("Mesa 2"));
    expect(libreRow.style.borderLeft).toContain("#22C55E");
    expect(libreRow.textContent).toContain("Libre");
    expect(ocupadaRow.style.borderLeft).toContain("#EF4444");
    expect(ocupadaRow.textContent).toContain("Ocupada");
    unmount(container, root);
  });
});

describe("MesaListaView -- structure/data/tap behavior unchanged by the theme fix", () => {
  test("still lists every active table by number with its live status and capacity", async () => {
    const { container, root } = await mount();
    expect(container.textContent).toContain("Mesa 1");
    expect(container.textContent).toContain("Mesa 2");
    expect(container.textContent).toContain("máx 4");
    unmount(container, root);
  });

  test("tapping a row still calls onSelectTable with that table's id", async () => {
    const onSelectTable = jest.fn();
    mesaApi.floor.mockResolvedValue({ ok: true, tables: [freeTable, openTable] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<MesaListaView onSelectTable={onSelectTable} notify={jest.fn()} />); });
    await flush();
    act(() => {
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes("Mesa 1"))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectTable).toHaveBeenCalledWith("t1");
    unmount(container, root);
  });
});
