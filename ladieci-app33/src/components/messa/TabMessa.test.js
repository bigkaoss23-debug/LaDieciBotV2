import { equalShares } from "./TabMessa";

const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "TabMessa.jsx"), "utf8");

describe("Mesa equal split preview", () => {
  test("splits 50 euro across five covers", () => {
    expect(equalShares(50, 5)).toEqual([10, 10, 10, 10, 10]);
  });

  test("keeps uneven cents exact and deterministic", () => {
    const shares = equalShares(50, 3);
    expect(shares).toEqual([16.67, 16.67, 16.66]);
    expect(Math.round(shares.reduce((sum, share) => sum + share, 0) * 100)).toBe(5000);
  });

  test("handles an early payer by dividing only the residual", () => {
    expect(equalShares(38, 4)).toEqual([9.5, 9.5, 9.5, 9.5]);
  });
});

describe("Mesa closed-account boundary", () => {
  test("full payment closes without an intermediate occupied-table workflow", () => {
    expect(source).toContain('outstandingAfter === 0 ? "Cuenta cerrada."');
    expect(source).not.toContain("paid_occupied");
    expect(source).not.toContain("Mesa libre");
    expect(source).not.toContain("Abrir cuenta nueva");
    expect(source).not.toContain("sigue ocupada");
  });
});

describe("Mesa floor editor instructions", () => {
  test("names the room settings and explains the table settings interaction", () => {
    expect(source).toContain("⚙ Ajustes de sala");
    expect(source).toContain("Tócala para abrir su menú, cambiar los ajustes o quitarla.");
    expect(source).not.toContain("usa el botón rojo");
    expect(source).not.toContain("Editar plano");
  });
});

describe("Mesa free-table capacity label", () => {
  test("keeps capacity out of the operational table card", () => {
    expect(source).not.toContain('>máx. {table.capacity || "—"}p</span>');
    expect(source).not.toContain('hasta {table.capacity || "—"} cubiertos');
  });
});

describe("Mesa capacity settings", () => {
  test("edits maximum capacity inside room settings and keeps exact Mesa numbering", () => {
    expect(source).toContain('title="Ajustes de sala"');
    expect(source).toContain('>Capacidad máxima</label>');
    expect(source).toContain('displayName: `Mesa ${tableNumber}`');
    expect(source).toContain('setSettingsId(menuTable.id)');
  });

  test("removal is explicit, keeps history and is disabled for an open account", () => {
    expect(source).toContain('<strong>Quitar mesa</strong>');
    expect(source).toContain('El historial se conservará.');
    expect(source).toContain('if (table.status === "open") { setError("Cobra la cuenta antes de quitar esta mesa."); return; }');
  });
});

describe("Mesa reservations", () => {
  test("uses the approved two-hour reservation and all operational fields", () => {
    expect(source).toContain('subtitle="Duración reservada: 2 horas"');
    expect(source).toContain('>Nombre del cliente</label>');
    expect(source).toContain('>Número de cubiertos</label>');
    expect(source).toContain('>Teléfono</label>');
    expect(source).toContain('>Nota</label>');
  });

  test("keeps reservation work available to waiter without exposing room settings", () => {
    expect(source).toContain('"cashier", "waiter", "shift_manager"');
    expect(source).toContain('const canEdit = role === "admin" || role === "owner";');
    expect(source).toContain('messaApi.updateReservation');
  });

  test("renders today's reservation in red with the customer under the table number", () => {
    expect(source).toContain('STATUS.reserved');
    expect(source).toContain('nextReservation.guestName');
    expect(source).toContain('nextReservation.coversTotal');
  });
});
