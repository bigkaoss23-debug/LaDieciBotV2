import { equalShares } from "./TabMesa";

const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "TabMesa.jsx"), "utf8");

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

describe("Mesa color semantics", () => {
  test("occupied is always red, independent of a later reservation on the same table", () => {
    expect(source).toContain("occupied: { label: \"Ocupada\", color: \"#EF4444\"");
    expect(source).toContain('if (table.status === "open") return STATUS.occupied;');
  });

  test("a free table with a booking tonight is yellow, not red", () => {
    expect(source).toContain("reserved: { label: \"Reservada\", color: \"#EAB308\"");
    expect(source).toContain("return todayReservations.length > 0 ? STATUS.reserved : STATUS.free;");
  });
});

describe("Mesa floor card stays minimal", () => {
  test("the card never renders a guest name, price or free text -- only number, capacity and a time badge", () => {
    expect(source).toContain('<strong className="mesa-number">{table.number}</strong>');
    expect(source).toContain('<span className="mesa-capacity">👥 máx {table.capacity ?? "—"}</span>');
    expect(source).not.toMatch(/mesa-table[^>]*>[\s\S]{0,40}(nextReservation\.guestName|euro\(table\.session)/);
  });

  test("badges are absolutely positioned so they never affect the fixed card height", () => {
    expect(source).toContain(".mesa-badge{position:absolute;");
    expect(source).toContain('.mesa-table{box-sizing:border-box;position:absolute;transform:translate(-50%,-50%);width:100px;height:100px;');
  });

  test("capacity is unambiguously labelled as a maximum, not a live headcount", () => {
    expect(source).toContain('👥 máx {table.capacity ?? "—"}');
  });
});

describe("Mesa floor editor instructions", () => {
  test("names Personalizar sala and explains the table settings interaction", () => {
    expect(source).toContain("🛠 Personalizar sala");
    expect(source).toContain("✓ Salir de Personalizar sala");
    expect(source).toContain("Arrastra para mover · Toca para editar");
    expect(source).not.toContain("⚙ Ajustes de sala");
    expect(source).not.toContain("Editar plano");
  });

  test("table create/move/reshape/remove are reachable only while editing is active", () => {
    expect(source).toContain('{canEdit && editing && <button className="mesa-btn mesa-menu-action gold" onClick={onSettings}>');
    expect(source).toContain('{canEdit && editing && <button className="mesa-btn mesa-menu-action red" disabled={busy} onClick={remove}>');
    expect(source).toContain("{canEdit && editing && <button className=\"mesa-btn gold\" onClick={() => setShowAdd(true)}>");
  });

  test("Personalizar sala's own toggle and Reservas · Beta are never styled with the destructive-red button class", () => {
    expect(source).not.toMatch(/editing \? "✓ Salir de Personalizar sala"[\s\S]{0,120}className="mesa-btn red"/);
    expect(source).toContain('<button className="mesa-btn primary" onClick={() => { setReservationsFilterTableId(null); setShowReservations(true); }}>📅 Reservas · Beta</button>');
    expect(source).toContain('className={`mesa-btn ${editing ? "primary" : ""}`}');
  });
});

describe("Mesa free-table capacity label", () => {
  test("keeps capacity out of the card as free text, shown only as a compact badge", () => {
    expect(source).not.toContain('>máx. {table.capacity || "—"}p</span>');
    expect(source).not.toContain('hasta {table.capacity || "—"} cubiertos');
  });
});

describe("Mesa capacity settings", () => {
  test("edits maximum capacity in a dedicated table-settings modal and keeps exact Mesa numbering", () => {
    expect(source).toContain('title="Ajustes de mesa"');
    expect(source).toContain('>Capacidad máxima</label>');
    expect(source).toContain('displayName: `Mesa ${tableNumber}`');
    expect(source).toContain('setSettingsId(menuTable.id)');
  });

  test("removal is explicit, labelled Eliminar mesa, keeps history and is disabled for an occupied table", () => {
    expect(source).toContain('<strong>Eliminar mesa</strong>');
    expect(source).toContain('El historial se conservará.');
    expect(source).toContain('if (isOccupied) { setError("Cobra la cuenta antes de eliminar esta mesa."); return; }');
    // Ajustes de mesa gets its own Eliminar mesa entry point too, with the same guard.
    expect(source).toContain('if (table.status === "open") { setError("Cobra la cuenta antes de eliminar esta mesa."); return; }');
    expect((source.match(/¿Eliminar Mesa \$\{table\.number\} del plano\? El historial se conservará\./g) || []).length).toBe(2);
  });

  test("red is reserved for Eliminar mesa; Cerrar mesa (a genuinely empty, non-destructive release) is neutral", () => {
    expect(source).toContain('<button className="mesa-btn" disabled={busy} onClick={openCloseConfirm}>Cerrar mesa</button>');
    expect(source).not.toMatch(/onClick=\{openCloseConfirm\}>[\s\S]{0,5}(danger|red)/);
    expect(source).toContain('<button className="mesa-btn red" disabled={busy} onClick={remove}>Eliminar mesa</button>');
  });

  test("Cerrar mesa no longer uses window.confirm anywhere in the runtime action", () => {
    expect(source).not.toMatch(/window\.confirm\(`¿Liberar Mesa/);
    expect(source).not.toContain("Liberar mesa");
    expect(source).not.toContain("Liberar Mesa");
  });

  test("CerrarMesaDialog is a real controlled dialog: alertdialog role, labelled title, Cancelar/Cerrar mesa actions, Escape support", () => {
    expect(source).toContain('function CerrarMesaDialog(');
    expect(source).toMatch(/role="alertdialog"/);
    expect(source).toContain('aria-labelledby="cerrar-mesa-title"');
    expect(source).toContain('`Cerrar Mesa ${tableNumber}`');
    expect(source).toContain('La mesa está vacía y no tiene comandas ni pagos.');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('>Cancelar</button>');
  });
});

describe("Mesa table shapes", () => {
  test("exactly three base shapes, always offered Redonda -> Cuadrada -> Rectangular; only rectangle has a second, longer preset", () => {
    const order = source.match(/const BASE_SHAPES = \[([\s\S]*?)\];/)?.[1] || "";
    expect(order.indexOf('"round"')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('"round"')).toBeLessThan(order.indexOf('"square"'));
    expect(order.indexOf('"square"')).toBeLessThan(order.indexOf('"rectangle"'));
    expect(source).toContain('{ shape: "round", label: "Redonda" }');
    expect(source).toContain('{ shape: "square", label: "Cuadrada" }');
    expect(source).toContain('{ shape: "rectangle", label: "Rectangular" }');
    expect(source).toContain('{ shapePreset: "standard", label: "6 plazas", capacity: 6 }');
    expect(source).toContain('{ shapePreset: "long", label: "8 plazas", capacity: 8 }');
    expect(source).not.toContain("square-rounded");
    expect(source).not.toContain("Cuadrada redondeada");
  });

  test("the same Redonda -> Cuadrada -> Rectangular order renders in the picker (BASE_SHAPES.map with no re-sort)", () => {
    expect(source).toContain("{BASE_SHAPES.map((option) =>");
    expect(source).not.toMatch(/BASE_SHAPES[\s\S]{0,40}\.sort\(/);
  });

  test("every variant has its own fixed CSS rule, footprint never varies by state", () => {
    expect(source).toContain(".mesa-table.round{border-radius:999px}");
    expect(source).toContain(".mesa-table.square{border-radius:16px}");
    expect(source).toContain(".mesa-table.rectangle{width:132px;border-radius:16px}");
    expect(source).toContain(".mesa-table.rectangle-long{width:168px;border-radius:16px}");
    // Only width/border-radius vary; height is set once on the base .mesa-table rule.
    // A thicker occupied border (.thick) must not appear in this list either.
    expect(source).not.toMatch(/\.mesa-table\.(round|square|rectangle|rectangle-long|thick|selected)\{[^}]*height:/);
  });

  test("box-sizing:border-box on .mesa-table so a thicker border never grows the rendered box", () => {
    expect(source).toMatch(/\.mesa-table\{box-sizing:border-box;/);
  });

  test("shape choice is a visual icon picker (ShapePicker), shared by Añadir mesa and the settings modal, not a text dropdown", () => {
    expect(source).toContain("function ShapePicker({ shape, shapePreset, onShape, onCapacityPreset })");
    expect((source.match(/<ShapePicker shape=\{form\.shape\} shapePreset=\{form\.shapePreset\}/g) || []).length).toBe(2);
    expect(source).toContain("variantIdOf(table.shape, table.shapePreset)");
  });

  test("choosing a base shape never touches capacity; only the explicit 6/8 plazas preset does -- switching shape on an existing table must not clobber a saved capacity", () => {
    expect(source).toContain('onClick={() => onShape(option.shape, "standard")}');
    expect(source).not.toMatch(/onShape\(option\.shape,[\s\S]{0,40}onCapacityPreset/);
    expect(source).toContain('onClick={() => { onShape("rectangle", option.shapePreset); onCapacityPreset(option.capacity); }}');
    // The capacity <input> itself stays a freely editable number field, independent of shape.
    expect(source).toMatch(/Capacidad máxima<\/label><input className="mesa-input" type="number" min="1" max="99" value=\{form\.capacity\}/);
  });

  test("moving or removing a table preserves its shapePreset instead of resetting it", () => {
    expect(source).toContain("shape: table.shape, shapePreset: table.shapePreset, active: false");
    expect(source).toContain("shape: table.shape, shapePreset: table.shapePreset, active: true");
  });

  test("drag clamping is shape-width-aware so a wide rectangle-long card cannot clip past the board edge", () => {
    expect(source).toContain("function cardWidthOf(shape, shapePreset) {");
    expect(source).toContain('if (shape === "rectangle") return shapePreset === "long" ? 168 : 132;');
    expect(source).toContain("const halfWidthPct = Math.max(7, (cardWidthOf(drag.table.shape, drag.table.shapePreset) / 2 / rect.width) * 100);");
    expect(source).toContain("const x = Math.max(halfWidthPct, Math.min(100 - halfWidthPct,");
    // Vertical clamp is unaffected -- height is fixed regardless of shape.
    expect(source).toContain('const y = Math.max(11, Math.min(89,');
  });
});

describe("Mesa order-state border and ready pulse", () => {
  test("fill color never depends on order/kitchen state -- only the border does", () => {
    expect(source).toContain("function tableBorder(state, hasOrders) {");
    expect(source).toContain('if (state !== STATUS.occupied) return { color: state.color, thick: false };');
    expect(source).toContain('return { color: hasOrders ? "#22C55E" : "#EF4444", thick: true };');
    expect(source).toContain('"--tb": state.bg');
    expect(source).toContain('"--tc": border.color');
  });

  test("the order-corner badge is gone -- the border itself now carries that signal", () => {
    expect(source).not.toContain("mesa-badge-order");
    expect(source).not.toContain("Comanda abierta");
  });

  test("ready state is derived from the exact same field the Listos screen uses (order.estado === 'LISTO'), no new backend contract", () => {
    expect(source).toContain("function hasReadyOrder(table) {");
    expect(source).toContain('return table.status === "open" && (table.session?.commands || []).some((command) => command.state === "LISTO");');
  });

  test("pulse is a soft, non-flashing, looping glow that never moves or resizes the card", () => {
    expect(source).toMatch(/@keyframes mesa-ready-pulse\{0%,100%\{box-shadow:[^}]*0 0 0 0 rgba\(34,197,94,0\)\}50%\{box-shadow:[^}]*0 0 22px 7px rgba\(34,197,94,\.65\)\}\}/);
    expect(source).toContain(".mesa-table.ready-pulse{animation:mesa-ready-pulse 1.35s ease-in-out infinite}");
    // Only box-shadow (a glow) animates -- never left/top/width/height/transform.
    const keyframes = source.match(/@keyframes mesa-ready-pulse\{[\s\S]*?\}\}/)?.[0] || "";
    expect(keyframes).not.toMatch(/(left|top|width|height|transform):/);
  });

  test("prefers-reduced-motion disables the animation and falls back to a static brighter border", () => {
    const block = source.match(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/)?.[0] || "";
    expect(block).toContain(".mesa-table.ready-pulse{animation:none;");
  });

  test("a selected table (popup or detail open) gets a discreet outline, not a fill/border change", () => {
    expect(source).toContain(".mesa-table.selected{box-shadow:");
    expect(source).toContain('const selected = table.id === menuId || table.id === selectedId;');
    expect(source).toContain('selected ? "selected" : ""');
  });
});

describe("Mesa room selector", () => {
  test("Sala principal stays a real selector (future-room-ready), not a static label", () => {
    expect(source).toContain('<option value="principal">Sala principal</option>');
    expect(source).toContain('aria-label="Sala"');
  });
});

describe("Mesa button color semantics", () => {
  test("primary (non-destructive operational) actions use blue, not the old red-orange", () => {
    expect(source).toContain(".mesa-btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}");
    expect(source).not.toContain("#E8341C");
  });

  test("red is reserved for destructive/irreversible actions only: Eliminar mesa", () => {
    const redUsages = source.match(/className="mesa-btn[^"]*\bred\b[^"]*"/g) || [];
    expect(redUsages.every((usage) => /red/.test(usage))).toBe(true);
    expect(redUsages.some((usage) => /mesa-menu-action red/.test(usage))).toBe(true); // Eliminar mesa
    // Nueva reserva (both entry points) and Reservas · Beta must NOT be in this list.
    expect(source).not.toMatch(/Nueva reserva[\s\S]{0,10}className="mesa-btn[^"]*red/);
    expect(source).not.toContain('className="mesa-btn red" onClick={() => { setReservationsFilterTableId');
  });

  test("Nueva reserva (both entry points: table popup and Reservas · Beta) uses gold, not red", () => {
    expect(source).toContain('<button className="mesa-btn small gold" onClick={onNewReservation}>＋ Nueva reserva</button>');
    expect(source).toContain('<button className="mesa-btn gold" onClick={onNew}>＋ Nueva reserva</button>');
  });

  test("ReservationModal's save action uses gold, matching every other save/confirm button", () => {
    expect(source).toContain('<button className="mesa-btn gold" disabled={busy} onClick={save}>{busy ? "Guardando…" : reservation ? "Guardar cambios" : "Reservar mesa"}</button>');
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
    // MESA_PHONE_SHELL_01 -- this check moved into the exported canEditMesaRoom()
    // (MesaPhoneShell's Más screen reuses it), same exact condition either way.
    expect(source).toContain('function canEditMesaRoom(role) {');
    expect(source).toContain('return role === "admin" || role === "owner";');
    expect(source).toContain('const canEdit = canEditMesaRoom(role);');
    expect(source).toContain('mesaApi.updateReservation');
  });

  test("a table's reservation detail lives in its own contextual popup, not on the floor card", () => {
    expect(source).toContain('<ReservationItem reservation={nextReservation} table={table} onEdit={onEditReservation} onChanged={onChanged} onOpened={onOpened} />');
    expect(source).toContain('Ver reservas de la noche');
  });

  test("Reservas is labelled Beta and supports a name/phone search", () => {
    expect(source).toContain('title="Reservas · Beta"');
    expect(source).toContain('Buscar por nombre o teléfono');
  });
});
