import { useEffect, useState } from "react";
import { C } from "../../constants";
import TabMesa, { canEditMesaRoom, canManageMesaReservations } from "./TabMesa";
import MesaListaView from "./MesaListaView";

// ===============================================================
// MesaPhoneShell — MESA_P1_C, the approved phone-portrait Mesa shell.
//
// Dedicated shell for phone width (see ServicioPage's own showMesaPhoneShell
// gate: MESA_UI_ENABLED && headerPhone && tab==="banco"), replacing
// ServicioPage's normal header/tab-bar/footer chrome for that one case only
// -- tablet/desktop and every other tab render exactly as before. The four
// internal screens (Mapa/Lista/Listos/Más) are its own local nav, distinct
// from ServicioPage's outer tab bar; the admin-only back arrow is the way
// out, back to that outer chrome (see onExit).
//
// No Mesa data/action logic lives here or is reimplemented: Mapa is TabMesa
// itself (compact), Listos is the exact same authoritative <ListosUnificado/>
// ServicioPage's own Listos tab renders (passed in as `listosElement`, built
// once by the caller), and Lista/Más both drive TabMesa via `initialAction`
// rather than duplicating its reservations/editing/table-open state.
// ===============================================================

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const NAV_ITEMS = [
  { id: "mapa", icon: "🗺", label: "Mapa" },
  { id: "lista", icon: "☰", label: "Lista" },
  { id: "listos", icon: "✅", label: "Listos" },
  { id: "mas", icon: "⋯", label: "Más" },
];

// MOBILE_SHELL_POLISH_01 -- one shared definition so the two NAV_ITEMS halves
// (either side of the center + button) can never drift apart in size again.
function navButtonStyle(active) {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    background: "none", border: "none", padding: "6px 12px", cursor: "pointer",
    minWidth: 52, minHeight: 48,
    color: active ? "#FF6A45" : "rgba(255,255,255,.45)",
    fontWeight: active ? 800 : 600, fontSize: 12,
  };
}

function backArrowButton(onExit) {
  return <button onClick={onExit} title="Volver a Servicio" aria-label="Volver a Servicio" style={{
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 16,
    flexShrink: 0, padding: 0,
  }}>←</button>;
}

// P1_D_TABLE_FIRST_01 -- Reservas is now first-class bottom navigation (see
// the center nav button below), so it is no longer duplicated here. Más's
// only remaining secondary function is room editing, which stays admin-only
// exactly as before -- canManageMesaReservations is no longer needed in this
// component at all.
function MasScreen({ role, onPersonalizar }) {
  const canEdit = canEditMesaRoom(role);
  const rowStyle = {
    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
    padding: "16px 14px", borderRadius: 14, border: "1px solid rgba(208,184,145,.18)",
    background: "rgba(255,255,255,.03)", color: "#f7f0df", fontSize: 15, fontWeight: 700,
    cursor: "pointer", marginBottom: 10,
  };
  if (!canEdit) {
    return <div style={{ padding: 16, color: "rgba(255,255,255,.5)", fontSize: 14 }}>No hay acciones secundarias disponibles para este acceso.</div>;
  }
  return <div style={{ padding: 14 }}>
    <button style={rowStyle} onClick={onPersonalizar}><span style={{ fontSize: 20 }}>🛠</span> Personalizar sala</button>
  </div>;
}

export default function MesaPhoneShell({
  role, notify, onNewCommand, onCountChange, refreshKey, mesaDrafts, onClearDraft, onSendToCocina,
  listosElement, onExit,
}) {
  const [shellTab, setShellTab] = useState("mapa");
  const [mesaAction, setMesaAction] = useState(null);
  const now = useClock();
  const isAdmin = role === "admin";

  const goToTable = (tableId) => {
    setMesaAction({ token: Date.now(), type: "selectTable", tableId });
    setShellTab("mapa");
  };
  const openReservations = () => {
    setMesaAction({ token: Date.now(), type: "reservations" });
    setShellTab("mapa");
  };
  const openEditing = () => {
    setMesaAction({ token: Date.now(), type: "editing" });
    setShellTab("mapa");
  };

  return <div style={{
    flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden",
    background: "#0b0b0a", color: "#f7f0df",
  }}>
    <header style={{
      flexShrink: 0, position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      // HEADER_NAV_REFINEMENT_01 -- App.jsx's two position:fixed banners
      // (service-status line, pending-incidents warning) are now suppressed
      // for the whole time this shell is on screen (see App.jsx's
      // mesaPhoneShellActive / ServicioPage's onMesaPhoneShellActiveChange),
      // so this header no longer needs to reserve room to clear them -- that
      // is exactly the ~50px of dead space that made the top area read as
      // loose/floating. What's left is only real safe-area clearance for a
      // notch/status bar, same order of magnitude as the bottom nav's own.
      paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
      paddingRight: 14, paddingBottom: 14, paddingLeft: 14,
      // A single hairline, same tone as the nav's own border below, so the
      // map reads as visually framed top and bottom rather than floating.
      borderBottom: "1px solid rgba(208,184,145,.14)",
    }}>
      <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
        {isAdmin && backArrowButton(onExit)}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 30, letterSpacing: 0.5, lineHeight: 1.1 }}>
          {now.toLocaleTimeString("es-ES")}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.verde, display: "inline-block" }} />
          SERVICIO · {now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "")}
        </div>
      </div>
    </header>

    <main style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "4px 10px 10px" }}>
      {/* MESA_PHONE_POLISH_01 -- Mapa (TabMesa) now stays mounted continuously
          instead of being unmounted/remounted every time shellTab changes,
          hidden via display:none (not conditional rendering) when another
          screen is active. Lista's own goToTable and Más's openReservations/
          openEditing all deep-link INTO Mapa via initialAction -- on a fresh
          mount that always meant TabMesa's own `loading:true` start state,
          which briefly replaces the whole screen with a plain "Cargando el
          plano de mesas..." banner (no map, no modal) before the very floor
          data the deep-link needs even exists. Tapping the same table
          directly on Mapa never had that extra round trip, so this read as
          "Lista doesn't behave like Mapa" even though the END state was
          already correct -- confirmed live, and by reading TabMesa's own
          loading-gated render. Keeping Mapa alive in the background (same
          10s poll Lista's own independent view already runs regardless of
          which screen is visible) means its `tables` state is already
          populated by the time any deep-link fires, so initialAction
          resolves on the same tick, with nothing to flash. display:contents
          on the wrapper keeps this a no-op for layout when visible -- byte-
          identical to TabMesa being a direct flex child of this <main>, as
          it was before this change. */}
      <div style={{ display: shellTab === "mapa" ? "contents" : "none" }}>
        <TabMesa
          role={role} notify={notify} onNewCommand={onNewCommand} onCountChange={onCountChange}
          refreshKey={refreshKey} compact hideToolbar hideDock initialAction={mesaAction}
          mesaDrafts={mesaDrafts} onClearDraft={onClearDraft} onSendToCocina={onSendToCocina}
        />
      </div>
      {shellTab === "lista" && <MesaListaView notify={notify} onSelectTable={goToTable} />}
      {shellTab === "listos" && listosElement}
      {shellTab === "mas" && <MasScreen role={role} onPersonalizar={openEditing} />}
    </main>

    <nav style={{
      flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-around",
      // HEADER_NAV_REFINEMENT_01 -- rounded top corners + an upward shadow
      // read as a real, deliberately-placed bottom bar rather than a flat
      // strip glued to the screen edge (same idea as the header's own
      // hairline: framing, not decoration). The 20px base bottom padding
      // (up from 16px) is the requested extra breathing room, still additive
      // with -- not instead of -- the real safe-area inset on a notched
      // device.
      padding: "16px 12px calc(20px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(18,17,15,.94)", backdropFilter: "blur(14px)",
      borderTop: "1px solid rgba(208,184,145,.22)",
      borderRadius: "20px 20px 0 0",
      boxShadow: "0 -8px 24px rgba(0,0,0,.35)",
    }}>
      {NAV_ITEMS.slice(0, 2).map((item) => {
        const active = shellTab === item.id;
        return <button key={item.id} onClick={() => setShellTab(item.id)} style={navButtonStyle(active)}>
          <span style={{ fontSize: 25 }}>{item.icon}</span>
          {item.label}
        </button>;
      })}

      {/* P1_D_TABLE_FIRST_01 -- the global "+" was a UX mistake: it let
          someone start an order before a table was ever chosen, needing a
          second table-selection step (see MesaWorkspace's own "＋ Nueva
          comanda", now the one and only order entrypoint, always already
          table-scoped). This freed center slot is Reservas instead -- same
          raised-circle position/size/shadow-style as the button it replaces,
          with a label added underneath (matching every other nav item)
          since a calendar glyph alone is less self-evident than "+" was.
          MESA_PHONE_POLISH_01 -- the circle's own color is gold, not the
          fiery red/orange the old "+" carried over from: red/orange read as
          "record" or "urgent", not "reservations", confirmed live. Gold
          (#d7a84b family) is this app's OWN existing accent for reservation
          context specifically -- the table modal's active RESERVAS section
          (TabMesa.jsx's .mesa-card-section.active), "Ver cuenta", and every
          other gold mesa-btn already use it -- so this reuses an established
          color language rather than inventing a new one. */}
      <button onClick={openReservations} title="Reservas" aria-label="Reservas" style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        width: 68, marginTop: -28, background: "none", border: "none", padding: 0, cursor: "pointer",
      }}>
        <span aria-hidden="true" style={{
          width: 68, height: 68, borderRadius: "50%",
          background: `linear-gradient(180deg, #E8C874 0%, #D7A84B 55%, #9C7A2E 100%)`,
          border: "3px solid #0b0b0a", color: "#2b2004", fontSize: 30, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 16px rgba(215,168,75,.45), 0 6px 18px rgba(0,0,0,.5)",
        }}>📅</span>
        <span style={{ color: "rgba(255,255,255,.75)", fontWeight: 700, fontSize: 11 }}>Reservas</span>
      </button>

      {NAV_ITEMS.slice(2).map((item) => {
        const active = shellTab === item.id;
        return <button key={item.id} onClick={() => setShellTab(item.id)} style={navButtonStyle(active)}>
          <span style={{ fontSize: 25 }}>{item.icon}</span>
          {item.label}
        </button>;
      })}
    </nav>
  </div>;
}
