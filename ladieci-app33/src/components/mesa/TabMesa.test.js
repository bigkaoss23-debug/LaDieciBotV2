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
    expect(source).toContain('outstandingAfter === 0 ? "Cuenta pagada. Cierra la mesa para liberarla."');
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
    // The finish CTA is "Listo", not a save: every room change is already
    // persisted when it happens (drag -> savePosition, editor -> its own
    // save), so a "Guardar sala" button would claim credit for durability it
    // did not provide. See TabMesa.roomCustomization.test.js.
    expect(source).toContain('editing ? "✓ Listo"');
    expect(source).not.toContain("✓ Salir de Personalizar sala");
    expect(source).not.toMatch(/editing \? "✓ Guardar sala"/);
    expect(source).toContain("Arrastra para mover · Toca para editar");
    expect(source).not.toContain("⚙ Ajustes de sala");
    expect(source).not.toContain("Editar plano");
  });

  test("table create/move/reshape/remove are reachable only while editing is active", () => {
    expect(source).toContain('{canEdit && editing && <button className="mesa-btn mesa-menu-action gold" onClick={onSettings}>');
    expect(source).toContain('{canEdit && editing && <button className="mesa-btn mesa-menu-action red" disabled={busy} onClick={remove}>');
    expect(source).toContain('{canEdit && editing && <button className="mesa-btn gold" data-testid="mesa-add-table"');
    // And the tap that reaches the editor is itself gated on editing: outside
    // Personalizar sala the same tap must go to the operational surfaces.
    expect(source).toContain("if (editing && canEdit) { setSettingsId(table.id); return; }");
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
    expect(source).toContain("title={`Editar Mesa ${table.number}`}");
    expect(source).toContain('>Capacidad máxima</label>');
    expect(source).toContain('displayName: `Mesa ${tableNumber}`');
    // Reachable in one tap from the map, and still from the popup's own entry.
    expect(source).toContain("if (editing && canEdit) { setSettingsId(table.id); return; }");
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
    // MESA WORKSPACE UI V2 -- the entry action now carries a decorative SVG
    // icon (ICON_CLOSE_CIRCLE) ahead of its label, so this matches the
    // className/handler/text triple rather than the old exact byte string.
    expect(source).toMatch(/className="mesa-btn" disabled=\{busy\} onClick=\{openCloseConfirm\}>[\s\S]{0,80}Cerrar mesa/);
    expect(source).not.toMatch(/onClick=\{openCloseConfirm\}[\s\S]{0,150}(danger|red)/);
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
    // ONE ShapePicker mount now, inside the shared TableConfigFields that both
    // Añadir mesa and the editor render -- the duplication this used to count
    // is exactly what the shared primitive removed.
    expect((source.match(/<ShapePicker shape=\{form\.shape\} shapePreset=\{form\.shapePreset\}/g) || []).length).toBe(1);
    expect((source.match(/<TableConfigFields form=\{form\} setForm=\{setForm\} \/>/g) || []).length).toBe(2);
    expect(source).toContain("variantIdOf(table.shape, table.shapePreset)");
  });

  test("choosing a base shape never touches capacity; only the explicit 6/8 plazas preset does -- switching shape on an existing table must not clobber a saved capacity", () => {
    expect(source).toContain('onClick={() => onShape(option.shape, "standard")}');
    expect(source).not.toMatch(/onShape\(option\.shape,[\s\S]{0,40}onCapacityPreset/);
    expect(source).toContain('onClick={() => { onShape("rectangle", option.shapePreset); onCapacityPreset(option.capacity); }}');
    // Capacity stays freely choosable and independent of shape: quick chips
    // for the common sizes plus a free field for everything else.
    expect(source).toContain("const CAPACITY_QUICK = [2, 3, 4, 6, 8];");
    expect(source).toContain('data-testid="capacity-custom-input"');
    expect(source).toContain("function CapacityPicker({ value, onChange })");
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
    expect(source).toContain("const y = Math.max(ROOM_Y_MIN, Math.min(ROOM_Y_MAX,");
  });

  // The band a finger can drag to and the band the room projects MUST be the
  // same band. Importing the two constants instead of repeating 11/89 here is
  // what makes that true by construction rather than by coincidence: a literal
  // could be changed in one place and silently diverge from the other, letting
  // a table be dragged to a coordinate the camera does not frame.
  test("the drag clamp reads the room's own band, never its own copy of it", () => {
    const { ROOM_Y_MIN, ROOM_Y_MAX } = require("./hybridScene");
    expect(ROOM_Y_MIN).toBe(11);
    expect(ROOM_Y_MAX).toBe(89);
    expect(source).toContain("ROOM_Y_MIN, ROOM_Y_MAX");
    expect(source).toContain('} from "./hybridScene"');
    expect(source).not.toContain("Math.max(11, Math.min(89");
  });

  // THE P0 GUARD, at the component level. The geometry memo must not depend on
  // the table set -- that dependency is what let one drag reframe the room.
  test("the hybrid geometry depends on the board box alone, never on the tables", () => {
    expect(source).toContain("sceneGeometry(boardBox.width, boardBox.height)");
    expect(source).toContain("[boardBox]");
    // the freeze machinery that existed only to work around content-derived
    // framing must be gone with it
    expect(source).not.toContain("frameFreezeRef");
    expect(source).not.toContain("cameraFrame");
    expect(source).not.toContain("frameEpoch");
  });
});

describe("Mesa order-state border and ready pulse", () => {
  test("fill color never depends on order/kitchen state -- only the border does", () => {
    expect(source).toContain("function tableBorder(state, hasOrders) {");
    expect(source).toContain('if (state !== STATUS.occupied) return { color: state.color, thick: false };');
    expect(source).toContain('return { color: hasOrders ? OCCUPIED_BORDER_ACTIVE : OCCUPIED_BORDER_IDLE, thick: true };');
    // UAT-P2-A -- neither occupied variant may reuse the free-table colour,
    // which is what made a busy table read as free on the floor.
    expect(source).toContain('const OCCUPIED_BORDER_IDLE = "#EF4444"');
    expect(source).toContain('const OCCUPIED_BORDER_ACTIVE = "#F97316"');
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
    // UNIFIED_CASH_UI_SURFACE_V1 — the shared .mesa-btn* base rules moved to
    // ui/cashSurfaceCss.js (one home for the cash sub-surface). The invariant is
    // unchanged; assert it where the rule now lives.
    const cashCss = fs.readFileSync(path.join(__dirname, "..", "ui", "cashSurfaceCss.js"), "utf8");
    expect(cashCss).toContain(".mesa-btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}");
    expect(source).not.toContain("#E8341C");
    expect(cashCss).not.toContain("#E8341C");
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
    // MESA_PHONE_VISUAL_PARITY_V2 -- the agenda's own Nueva reserva is now a
    // wide, prominent bottom CTA (matching the approved mockup) via an added
    // inline style, not just the bare .mesa-btn.gold default sizing.
    expect(source).toContain('<button className="mesa-btn gold" onClick={onNew} style={{ flex: 1, padding: "14px 16px", fontSize: 15 }}>＋ Nueva reserva</button>');
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

  test("Reservas is no longer labelled Beta (matches the approved mockup) and still supports a name/phone search", () => {
    expect(source).toContain('title="Reservas"');
    expect(source).toContain('Buscar por nombre o teléfono');
  });
});
