import { C } from '../../constants';

// ===============================================================
// EconomiaBottomNav — ECONOMÍA V2
//
// The persistent navigation of the Economía module. Five destinations,
// one bar, always the same five, always in the same order.
//
// STEP 1.1 — the first tab is `General`, not `Resumen`. The rename is a
// product boundary, not cosmetics: General is the read-only economic
// truth, Caja is physical cash reconciliation. While both were called
// something like "resumen" they read as two versions of one page.
//
// VECTOR ICONS, NOT EMOJI — deliberately, and there is a static test that
// fails the build if an emoji ever reappears here. Two reasons, both real:
// an emoji renders as a different picture on every OS (so the product has
// no controlled visual identity), and it lands in the button's accessible
// name, so a screen reader announces "chart increasing Estadísticas".
// Stroke only, currentColor, aria-hidden — the same HubIcon convention the
// certified Payment Hub uses.
//
// This bar NEVER contains a lifecycle action. Finalizar servicio lives in
// Servicio and only there — Economía reads the economy and counts the
// drawer; it does not close the service.
// ===============================================================

// Warm amber on black, taken from the approved reference screens. C.orange
// is the codebase's existing warm accent — this is not a new palette.
export const ECONOMIA_ACCENT = C.orange;      // #F97316
const MUTED = 'rgba(255,255,255,0.42)';

const NavIcon = ({ d }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);

// A pie with one segment read out: the economic picture at a glance.
const ICON_GENERAL = <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v8.5h8.5" /></>;
// A cash drawer with its coin slot.
const ICON_CAJA = <><rect x="2.5" y="6.5" width="19" height="12" rx="2.5" /><path d="M2.5 11h19" /><path d="M10 15h4" /></>;
// A document with lines: the list of what already happened.
const ICON_HISTORIAL = <><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>;
// Bars.
const ICON_ESTADISTICAS = <><path d="M5 20v-6M12 20V4M19 20v-9" /><path d="M2.5 20h19" /></>;
// Two people.
const ICON_CLIENTES = <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.4c2.4.6 4 2.7 4 5.6" /></>;

export const ECONOMIA_TABS = [
  { id: 'general',      label: 'General',      icon: ICON_GENERAL },
  { id: 'caja',         label: 'Caja',         icon: ICON_CAJA },
  { id: 'historial',    label: 'Historial',    icon: ICON_HISTORIAL },
  { id: 'estadisticas', label: 'Estadísticas', icon: ICON_ESTADISTICAS },
  { id: 'clientes',     label: 'Clientes',     icon: ICON_CLIENTES },
];

export default function EconomiaBottomNav({ tab, onTab }) {
  return (
    <nav data-testid="economia-bottom-nav" role="tablist" aria-label="Secciones de Economía"
      style={{
        // Fixed rather than a flex sibling: the bar must stay put while the
        // active tab scrolls, and pinning it here keeps the page's existing
        // sticky-header / scrolling-body layout exactly as it was.
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 190,
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        gap: 2, padding: '8px 6px calc(10px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(180deg, rgba(17,15,13,.97), rgba(8,8,8,.99))',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
        boxShadow: '0 -14px 30px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)',
      }}>
      {ECONOMIA_TABS.map((item) => {
        const active = tab === item.id;
        return (
          <button key={item.id} type="button" role="tab" aria-selected={active}
            data-testid={`economia-tab-${item.id}`}
            onClick={() => onTab(item.id)}
            style={{
              flex: '1 1 0', minWidth: 0, minHeight: 52,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              // Restrained: colour, a hairline and a soft glow — not a filled slab.
              background: active ? 'rgba(249,115,22,.12)' : 'transparent',
              border: `1px solid ${active ? 'rgba(249,115,22,.32)' : 'transparent'}`,
              boxShadow: active ? '0 0 18px rgba(249,115,22,.13)' : 'none',
              borderRadius: 13, cursor: 'pointer', padding: '5px 2px',
              color: active ? ECONOMIA_ACCENT : MUTED,
              transition: 'color .15s, background .15s, border-color .15s',
            }}>
            <NavIcon d={item.icon} />
            <span style={{
              fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: .1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
            }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
