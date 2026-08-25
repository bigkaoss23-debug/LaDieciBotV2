// ===============================================================
// EconomiaBottomNav — ECONOMÍA V2 / STEP 1
//
// The persistent navigation of the Economía module. Five destinations,
// one bar, always the same five, always in the same order.
//
// VECTOR ICONS, NOT EMOJI — deliberately, and there is a static test that
// fails the build if an emoji ever reappears here. Two reasons, both real:
// an emoji renders as a different picture on every OS (so the product has
// no controlled visual identity), and it lands in the button's accessible
// name, so a screen reader announces "chart increasing Estadísticas".
// Same HubIcon convention the certified Payment Hub uses: stroke only,
// currentColor, no fills, aria-hidden.
//
// This bar NEVER contains a lifecycle action. Finalizar servicio lives in
// Servicio and only there — Economía reads the economy, it does not close
// the service. See the FINALIZAR BOUNDARY note in EconomiaPage.
// ===============================================================

// Warm gold on black — the Payment Hub / cash-collection family.
const GOLD = '#d7a84b';
const MUTED = '#8b8172';

const NavIcon = ({ d }) => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{d}</svg>
);

// A summary sheet: the headline figures of the period.
const ICON_RESUMEN = <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h4" /></>;
// A cash drawer.
const ICON_CAJA = <><rect x="2.5" y="7.5" width="19" height="12" rx="2.5" /><path d="M2.5 12h19M10 16h4M6 7.5 8 4h8l2 3.5" /></>;
// A clock turned back: what already happened.
const ICON_HISTORIAL = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>;
// Bars.
const ICON_ESTADISTICAS = <><path d="M4 20V11M10 20V4M16 20v-6M22 20H2" /></>;
// Two people.
const ICON_CLIENTES = <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.4c2.4.6 4 2.7 4 5.6" /></>;

export const ECONOMIA_TABS = [
  { id: 'resumen',      label: 'Resumen',      icon: ICON_RESUMEN },
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
        background: 'linear-gradient(180deg, rgba(18,16,13,.97), rgba(8,8,8,.99))',
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
              // Restrained: the active state is colour and a hairline, not a filled slab.
              background: active ? 'rgba(215,168,75,.10)' : 'transparent',
              border: `1px solid ${active ? 'rgba(215,168,75,.30)' : 'transparent'}`,
              borderRadius: 13, cursor: 'pointer', padding: '5px 2px',
              color: active ? GOLD : MUTED,
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
