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

function MasScreen({ role, onReservas, onPersonalizar }) {
  const canEdit = canEditMesaRoom(role);
  const canManageReservations = canManageMesaReservations(role);
  const rowStyle = {
    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
    padding: "16px 14px", borderRadius: 14, border: "1px solid rgba(208,184,145,.18)",
    background: "rgba(255,255,255,.03)", color: "#f7f0df", fontSize: 15, fontWeight: 700,
    cursor: "pointer", marginBottom: 10,
  };
  if (!canManageReservations && !canEdit) {
    return <div style={{ padding: 16, color: "rgba(255,255,255,.5)", fontSize: 14 }}>No hay acciones secundarias disponibles para este acceso.</div>;
  }
  return <div style={{ padding: 14 }}>
    {canManageReservations && <button style={rowStyle} onClick={onReservas}><span style={{ fontSize: 20 }}>📅</span> Reservas</button>}
    {canEdit && <button style={rowStyle} onClick={onPersonalizar}><span style={{ fontSize: 20 }}>🛠</span> Personalizar sala</button>}
  </div>;
}

export default function MesaPhoneShell({
  role, notify, onNewCommand, onCountChange, refreshKey, mesaDrafts, onClearDraft, onSendToCocina,
  listosElement, onNewOrder, onExit,
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
      // App.jsx mounts two position:fixed banners above everything (the
      // service-status line and, when any exist, the pending-incidents
      // warning -- both outside this component, outside Mesa's own scope
      // to touch) that stack up to ~63px tall from the true viewport top.
      // The old ServicioPage header was tall enough to clear them by
      // accident; this shorter one needs to reserve that same clearance on
      // purpose so the clock never renders underneath them.
      padding: "10px 14px 8px",
      paddingTop: "calc(68px + env(safe-area-inset-top, 0px))",
    }}>
      <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}>
        {isAdmin && backArrowButton(onExit)}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 30, letterSpacing: 0.5 }}>
          {now.toLocaleTimeString("es-ES")}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.verde, display: "inline-block" }} />
          SERVICIO · {now.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "")}
        </div>
      </div>
    </header>

    <main style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "4px 10px 10px" }}>
      {shellTab === "mapa" && <TabMesa
        role={role} notify={notify} onNewCommand={onNewCommand} onCountChange={onCountChange}
        refreshKey={refreshKey} compact hideToolbar initialAction={mesaAction}
        mesaDrafts={mesaDrafts} onClearDraft={onClearDraft} onSendToCocina={onSendToCocina}
      />}
      {shellTab === "lista" && <MesaListaView notify={notify} onSelectTable={goToTable} />}
      {shellTab === "listos" && listosElement}
      {shellTab === "mas" && <MasScreen role={role} onReservas={openReservations} onPersonalizar={openEditing} />}
    </main>

    <nav style={{
      flexShrink: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-around",
      padding: "8px 10px calc(8px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(18,17,15,.92)", backdropFilter: "blur(14px)",
      borderTop: "1px solid rgba(208,184,145,.14)",
    }}>
      {NAV_ITEMS.slice(0, 2).map((item) => {
        const active = shellTab === item.id;
        return <button key={item.id} onClick={() => setShellTab(item.id)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          background: "none", border: "none", padding: "4px 10px", cursor: "pointer",
          color: active ? "#FF6A45" : "rgba(255,255,255,.45)",
          fontWeight: active ? 800 : 600, fontSize: 11,
        }}>
          <span style={{ fontSize: 19 }}>{item.icon}</span>
          {item.label}
        </button>;
      })}

      <button onClick={onNewOrder} title="Nuevo pedido" aria-label="Nuevo pedido" style={{
        width: 58, height: 58, borderRadius: "50%", marginTop: -22,
        background: `linear-gradient(180deg, #FF6040 0%, #E8341C 60%, #A01808 100%)`,
        border: "3px solid #0b0b0a", color: "#fff", fontSize: 28, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 20px rgba(232,52,28,.55), 0 6px 18px rgba(0,0,0,.5)",
        cursor: "pointer", flexShrink: 0,
      }}>+</button>

      {NAV_ITEMS.slice(2).map((item) => {
        const active = shellTab === item.id;
        return <button key={item.id} onClick={() => setShellTab(item.id)} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          background: "none", border: "none", padding: "4px 10px", cursor: "pointer",
          color: active ? "#FF6A45" : "rgba(255,255,255,.45)",
          fontWeight: active ? 800 : 600, fontSize: 11,
        }}>
          <span style={{ fontSize: 19 }}>{item.icon}</span>
          {item.label}
        </button>;
      })}
    </nav>
  </div>;
}
