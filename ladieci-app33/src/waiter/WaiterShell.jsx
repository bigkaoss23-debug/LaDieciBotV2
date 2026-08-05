import { useEffect, useState } from "react";
import { C } from "../constants";
import TabMesa from "../components/mesa/TabMesa";
import WaiterListos from "./WaiterListos";

// ===============================================================
// WaiterShell — dedicated camarero surface: Mesa + Listos ONLY.
//
// This is a NEW, local composition, not a mode bolted onto
// ServicioPage.jsx: ServicioPage's own tab bar has no per-tab role gating
// (see audit -- WhatsApp/Tel/Cocina/Entregas are unconditional today) and
// stitching "if role===waiter hide these five tabs" into a 1966-line file
// solely to reuse its outer chrome was explicitly ruled out by the brief.
// Both real, self-contained tab components are reused as-is here (TabMesa
// gets a `compact` prop for the mobile-mockup toolbar; WaiterListos is a
// new list view but reuses TabMesa's own hasReadyOrder()/CSS, see that
// file's header comment) -- no Mesa/Listos business logic is duplicated.
//
// NOT wired into App.jsx's real screen routing in this session (see the
// dev-only mount in index.js) -- the brief is explicit that the RBAC/
// production-routing wiring is a separate, later, approved slice. The
// known gap this shell does NOT attempt to fix: `role==="waiter"` cannot
// reach ANY of this today via the real login+ServiceStateGate path, because
// adminRbac.js's canOpenService() only recognizes admin/operator. This
// shell only proves the UI/UX; wiring a real waiter session into it is
// that separate slice.
// ===============================================================

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const TABS = [
  { id: "mesa", icon: "🍽", label: "Mesa" },
  { id: "listos", icon: "✅", label: "Listos" },
];

export default function WaiterShell({ role = "waiter", notify }) {
  const [tab, setTab] = useState("mesa");
  const [listosN, setListosN] = useState(0);
  const now = useClock();
  const localNotify = notify || (() => {});

  const onNewCommand = (table) => {
    // The product picker (NuevoPedidoModal) is ServicioPage-owned machinery
    // (order-creation queue, catalog, etc.) -- genuinely out of scope for a
    // Mesa+Listos-only slice, so this is an honest placeholder rather than a
    // silently-broken button. mesaApi.openTable()/addCommand() themselves
    // are untouched and already exercised by "Crear pedido" above this.
    localNotify(`🍽 Mesa ${table.number} · aquí se abriría el selector de productos (fuera del alcance de esta sesión)`, C.blu);
  };

  return <div style={{ height: "100dvh", minHeight: "100dvh", background: "#0b0b0a", color: "#f7f0df", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "12px 16px", borderBottom: "1px solid rgba(208,184,145,.18)",
      background: "rgba(18,17,15,.96)", position: "sticky", top: 0, zIndex: 50,
    }}>
      <img src="/logo-red.jpg" alt="La Dieci" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(208,184,145,.3)" }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 17 }}>{now.toLocaleTimeString("es-ES")}</div>
        <div style={{ fontSize: 11, color: "#a99d89" }}>{now.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" })}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(208,184,145,.25)", borderRadius: 12, padding: "8px 12px", fontWeight: 800, fontSize: 13 }}>
        Sala principal
      </div>
    </header>

    <nav style={{ display: "flex", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(208,184,145,.12)" }}>
      {TABS.map((item) => <button key={item.id} onClick={() => setTab(item.id)}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "12px 10px", borderRadius: 14, fontWeight: 900, fontSize: 15, cursor: "pointer",
          border: `1px solid ${tab === item.id ? "#d7a84b" : "rgba(208,184,145,.2)"}`,
          background: tab === item.id ? "rgba(215,168,75,.16)" : "rgba(255,255,255,.03)",
          color: tab === item.id ? "#f8ecd2" : "#e7dcc7",
        }}>
        <span>{item.icon}</span><span>{item.label}</span>
        {item.id === "listos" && listosN > 0 && <span style={{
          minWidth: 20, height: 20, borderRadius: 10, background: C.verde, color: "#04210f",
          fontSize: 11, fontWeight: 950, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px",
        }}>{listosN}</span>}
      </button>)}
    </nav>

    <main style={{ flex: 1, minHeight: 0, padding: 14, overflow: "auto" }}>
      {tab === "mesa" && <TabMesa role={role} notify={localNotify} onNewCommand={onNewCommand} compact />}
      {tab === "listos" && <WaiterListos notify={localNotify} onCountChange={setListosN} />}
    </main>
  </div>;
}
