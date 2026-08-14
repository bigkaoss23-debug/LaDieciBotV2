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

// MESA_PHONE_VISUAL_PARITY_V2 -- Reservas is now a genuine, uniformly-styled
// nav item, in its approved position (center), not a separate raised FAB
// (see navButtonStyle below and its own comment) -- the mockup's bottom nav
// treats all five identically, and a floating red/gold circle read as "a
// recording button or an unrelated FAB", not navigation.
// MESA_PHONE_NAV_LABEL_MICROFIX -- visible label only, "Lista" -> "Sala":
// removes the confusable Lista/Listos pair and reads as "Sala = the room's
// tables, as a list" against "Mapa = the room's tables, graphically". The
// internal id stays "lista" on purpose (shellTab value, initialAction
// routing, MesaListaView itself, every test helper) -- nothing about the
// underlying screen/component/data path changed, only this one string.
const NAV_ITEMS = [
  { id: "mapa", icon: "🗺", label: "Mapa" },
  { id: "lista", icon: "☰", label: "Sala" },
  { id: "reservas", icon: "📅", label: "Reservas" },
  { id: "listos", icon: "✅", label: "Listos" },
  { id: "mas", icon: "⋯", label: "Más" },
];

// MOBILE_SHELL_POLISH_01 -- one shared definition so all five nav items can
// never drift apart in size/treatment again.
// MESA_PHONE_VISUAL_PARITY_V2 -- active state is now a filled/bordered pill
// behind the icon+label (matching the approved mockup) instead of just a
// color swap -- "immediately obvious", per the brief, and the SAME treatment
// for every item including Reservas (no more raised gold FAB).
function navButtonStyle(active) {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
    background: active ? "linear-gradient(180deg, rgba(215,168,75,.24), rgba(215,168,75,.09))" : "transparent",
    border: active ? "1px solid rgba(215,168,75,.5)" : "1px solid transparent",
    borderRadius: 14, padding: "8px 6px 7px", cursor: "pointer",
    flex: "1 1 0", minWidth: 0, minHeight: 52,
    color: active ? "#f3d9a4" : "rgba(255,255,255,.5)",
    fontWeight: active ? 800 : 650, fontSize: 11,
    boxShadow: active ? "0 3px 10px rgba(215,168,75,.2), inset 0 1px 0 rgba(255,255,255,.08)" : "none",
    transition: "background .15s, border-color .15s, color .15s, box-shadow .15s",
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

  // MESA_HYBRID_VIEWPORT_01 — the operational shell is one fixed screen: top
  // status + Mapa + bottom nav, never a document the operator has to scroll to
  // reach its own navigation. The dvh chain (constants.js) is what makes that
  // true; this class is the scoped guarantee, and it exists ONLY while this
  // shell is mounted -- every other page in the app keeps normal document
  // scrolling, including ServicioPage's own tablet/desktop chrome. The
  // cleanup is why this lives here rather than in a global effect: unmounting
  // the shell (the admin back arrow, a width change past the phone
  // breakpoint) must hand scrolling straight back.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mesa-fixed-viewport");
    return () => root.classList.remove("mesa-fixed-viewport");
  }, []);

  const goToTable = (tableId) => {
    setMesaAction({ token: Date.now(), type: "selectTable", tableId });
    setShellTab("mapa");
  };
  // MESA_PHONE_VISUAL_PARITY_V2 -- shellTab becomes its own "reservas" value
  // (previously this parked on "mapa") so the nav's Reservas item can show
  // a real, distinct active state (see the Mapa wrapper's display condition
  // below, which now also stays mounted/visible for "reservas" -- same
  // underlying map+overlay, just a different nav highlight and header
  // title). This is the only call site for this action (the table modal's
  // own RESERVAS section calls TabMesa's internal state directly, and
  // deliberately does NOT move the outer nav selection -- see its own
  // comment where that happens).
  const openReservations = () => {
    setMesaAction({ token: Date.now(), type: "reservations" });
    setShellTab("reservas");
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
      {/* MESA_PHONE_VISUAL_PARITY_V2 -- each screen gets its own contextual
          title (matching the approved mockup's Mapa/Lista/Reservas headers)
          instead of always showing the live clock. Mapa keeps the clock --
          it already matched the reference closely -- Lista/Listos/Más get a
          plain title+subtitle. Reservas' own header briefly shows behind the
          agenda overlay it opens (see openReservations); this is the same
          pattern Lista/Listos/Más already use, just one more case. */}
      <div style={{ textAlign: "center" }}>
        {shellTab === "lista" ? <>
          <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: 0.2 }}>Mesas</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 3, fontWeight: 700 }}>Estado en tiempo real</div>
        </> : shellTab === "reservas" ? <>
          <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: 0.2 }}>Reservas</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 3, fontWeight: 700 }}>
            {now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" }).toUpperCase()}
          </div>
        </> : shellTab === "listos" ? <>
          <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: 0.2 }}>Listos</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 3, fontWeight: 700 }}>Comandas listas para servir</div>
        </> : shellTab === "mas" ? <>
          <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: 0.2 }}>Más</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 3, fontWeight: 700 }}>Acciones secundarias</div>
        </> : <>
          <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 30, letterSpacing: 0.5, lineHeight: 1.1 }}>
            {now.toLocaleTimeString("es-ES")}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.verde, display: "inline-block" }} />
            SERVICIO · {now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "")}
          </div>
        </>}
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
      <div style={{ display: (shellTab === "mapa" || shellTab === "reservas") ? "contents" : "none" }}>
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

    {/* MESA_PHONE_VISUAL_PARITY_V2 -- raised/tactile 3D nav bar (approved
        mockup): an outer wrapper carries the "lifted off the screen" depth
        (top highlight inset + a stronger drop shadow than before) so the bar
        reads as a substantial physical object, not five icons floating on
        black. All five items (Mapa/Lista/Reservas/Listos/Más) are now one
        uniform row, same navButtonStyle, same pill active-state -- Reservas
        no longer gets special raised-FAB treatment (see P1_D_TABLE_FIRST_01's
        old comment, superseded): the approved reference treats bottom-nav
        selection as pure navigation state, with Reservas' own gold identity
        expressed inside the screen content instead (see ReservationAgenda). */}
    <nav style={{
      flexShrink: 0, display: "flex", alignItems: "stretch", justifyContent: "space-around", gap: 4,
      padding: "10px 8px calc(14px + env(safe-area-inset-bottom, 0px))",
      background: "linear-gradient(180deg, rgba(27,24,19,.97), rgba(13,12,11,.98))",
      backdropFilter: "blur(14px)",
      borderTop: "1px solid rgba(255,255,255,.07)",
      borderRadius: "22px 22px 0 0",
      boxShadow: "0 -16px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(0,0,0,.3)",
    }}>
      {NAV_ITEMS.map((item) => {
        const active = shellTab === item.id;
        return <button key={item.id} onClick={() => item.id === "reservas" ? openReservations() : setShellTab(item.id)}
          title={item.label} aria-label={item.label} style={navButtonStyle(active)}>
          <span aria-hidden="true" style={{ fontSize: 22 }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
