// ===============================================================
// mesaSurface — the small shared visual primitive that lets the Servicio /
// Finalizar / Contar Caja surfaces speak MESA's visual language.
//
// WHY THIS FILE EXISTS. Mesa's look lives in a <style> template string
// INSIDE TabMesa.jsx, so it only exists while a table workspace is mounted.
// Servicio, Finalizar and Contar Caja are inline-styled components far from
// that tree, and importing TabMesa just to inherit a border colour would be
// an ugly dependency. So this module extracts ONLY the tokens — the values
// are lifted verbatim from that stylesheet — with no new framework, no
// global CSS and no component library.
//
// PRESENTATION ONLY. Nothing here computes, formats or decides anything
// about money, lifecycle or state. It is colours, geometry and spacing.
//
// ─── ONE DELIBERATE IMPROVEMENT OVER MESA ─────────────────────────────
// Mesa leans on very low-opacity text (#978d7c secondary, and
// `.mesa-btn:disabled{opacity:.4}`), which on a phone in a dark room reads
// as grey-on-grey and makes a disabled control look broken rather than
// intentionally off. The owner asked for the Mesa STRUCTURE with MORE
// contrast, so:
//   • MUTED/LABEL pick the readable end of Mesa's OWN palette range
//     (#a99d89 / #c9bd9f) instead of its dimmest value;
//   • `disabled` is a real state — its own background, border and text
//     colour — never a blanket opacity fade.
// Everything else (geometry, borders, radii, gold accents) is Mesa's.
// ===============================================================

// ── Surfaces ───────────────────────────────────────────────────────────
export const SURFACE = Object.freeze({
  sheet: '#12110f',        // .mesa-modal background
  sheetHead: 'rgba(18,17,15,.96)',
  scrim: 'rgba(8,7,6,.62)', // .mesa-overlay, a touch deeper for contrast
  cardNeutral: 'rgba(255,255,255,.035)',
  cardGold: 'rgba(215,168,75,.055)',
  inputBg: '#0b0b0a',
});

// ── Lines ──────────────────────────────────────────────────────────────
export const LINE = Object.freeze({
  sheet: '1px solid rgba(208,184,145,.28)',
  head: '1px solid rgba(208,184,145,.18)',
  cardNeutral: '1px solid rgba(255,255,255,.11)',
  cardGold: '1px solid rgba(215,168,75,.4)',
  row: '1px solid rgba(255,255,255,.075)',
  dashed: '1px dashed rgba(215,168,75,.28)',
});

// ── Type ───────────────────────────────────────────────────────────────
// STRONG  — the number or name the operator is actually looking for.
// BODY    — normal readable copy.
// LABEL   — the word next to a value. Subordinate, never illegible.
// MUTED   — genuinely secondary context.
export const TEXT = Object.freeze({
  strong: '#f8f0df',
  value: '#f4ecdd',
  body: '#e3d9c6',
  label: '#c9bd9f',
  muted: '#a99d89',
  gold: '#e9c983',
  goldStrong: '#f3d9a4',
});

// ── Semantic accents (existing La Dieci meanings, unchanged) ───────────
export const ACCENT = Object.freeze({
  gold: '#d7a84b',      // Mesa's own accent / section eyebrows
  positive: '#65d995',  // collected / confirmed money
  warn: '#f0a93c',      // pending, operational warnings
  refund: '#7ab8f5',    // over-collected / to refund
  danger: '#ff8f80',    // destructive confirmation
  service: '#fb923c',   // Servicio operational accent
});

// ── Geometry ───────────────────────────────────────────────────────────
export const RADIUS = Object.freeze({ sheet: 20, card: 16, control: 12, chip: 999 });

// ── Composed style objects ─────────────────────────────────────────────
export const overlay = Object.freeze({
  position: 'fixed', inset: 0, zIndex: 9999,
  background: SURFACE.scrim, backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
});

export const sheet = (maxWidth = 440) => ({
  width: `min(${maxWidth}px, 100%)`, maxHeight: '92vh', overflowY: 'auto',
  background: SURFACE.sheet, color: TEXT.strong,
  border: LINE.sheet, borderRadius: RADIUS.sheet,
  boxShadow: '0 26px 80px rgba(0,0,0,.68)',
});

export const sheetHead = Object.freeze({
  position: 'sticky', top: 0, zIndex: 2,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
  padding: '16px 18px', borderBottom: LINE.head,
  background: SURFACE.sheetHead, backdropFilter: 'blur(14px)',
});

export const sheetTitle = Object.freeze({
  display: 'flex', alignItems: 'center', gap: 10,
  color: TEXT.strong, fontSize: 19, fontWeight: 900, letterSpacing: '.2px',
});

export const sheetBody = Object.freeze({ padding: '16px 18px 20px', display: 'grid', gap: 12 });

export const closeButton = Object.freeze({
  flexShrink: 0, width: 38, height: 38, borderRadius: 10,
  border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)',
  color: TEXT.body, fontSize: 20, lineHeight: 1, cursor: 'pointer',
});

// A card. `gold` marks the surface the operator is meant to read first.
export const card = (gold = false) => ({
  border: gold ? LINE.cardGold : LINE.cardNeutral,
  borderRadius: RADIUS.card,
  background: gold ? SURFACE.cardGold : SURFACE.cardNeutral,
  padding: '13px 14px 14px',
});

// The small uppercase section label above a card's content.
export const eyebrow = (gold = true) => ({
  display: 'flex', alignItems: 'center', gap: 7,
  fontSize: 11, fontWeight: 900, letterSpacing: '.6px', textTransform: 'uppercase',
  color: gold ? TEXT.gold : TEXT.label,
});

// ── Buttons ────────────────────────────────────────────────────────────
// tone: 'neutral' | 'primary' | 'gold' | 'danger' | 'positive' | 'service'
// A disabled control gets its OWN look, never a blanket opacity fade.
const TONES = {
  neutral: { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(208,184,145,.3)', color: TEXT.body },
  primary: { background: '#2563EB', border: '1px solid #2563EB', color: '#fff' },
  gold: { background: ACCENT.gold, border: `1px solid ${ACCENT.gold}`, color: '#211707' },
  positive: { background: 'rgba(34,197,94,.16)', border: '1.5px solid rgba(34,197,94,.5)', color: ACCENT.positive },
  danger: { background: 'rgba(192,57,43,.9)', border: '1.5px solid rgba(192,57,43,.95)', color: '#fff' },
  service: { background: 'rgba(249,115,22,.15)', border: '1.5px solid rgba(249,115,22,.5)', color: ACCENT.service },
};
const DISABLED = Object.freeze({
  background: 'rgba(255,255,255,.035)',
  border: '1px solid rgba(255,255,255,.10)',
  color: '#7d7466',
  cursor: 'not-allowed',
});

export function button({ tone = 'neutral', disabled = false, size = 'md', full = false } = {}) {
  const height = size === 'lg' ? 54 : size === 'sm' ? 42 : 48;
  return {
    ...(disabled ? DISABLED : TONES[tone] || TONES.neutral),
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: height, padding: size === 'lg' ? '0 18px' : '0 14px',
    width: full ? '100%' : undefined, minWidth: 0,
    borderRadius: RADIUS.control,
    fontSize: size === 'lg' ? 15.5 : 14,
    fontWeight: 850, letterSpacing: '.2px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background .15s ease, border-color .15s ease',
    WebkitTapHighlightColor: 'transparent',
  };
}

// ── Rows ───────────────────────────────────────────────────────────────
export const rowStyle = Object.freeze({
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
  gap: 12, padding: '7px 0',
});

// ── Icons ──────────────────────────────────────────────────────────────
// Same philosophy as Mesa's HubIcon: 24-box stroked vectors, currentColor,
// small and functional. Not decorative, and never mixed with emoji in the
// same control group.
export const MesaIcon = ({ d, size = 18, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }}>{d}</svg>
);

export const ICON_PLUS = <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>;
export const ICON_MOON = <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />;
export const ICON_CASH_DRAWER = <><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 12h18M9.5 15.5h5" /><path d="M7 7V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1" /></>;
export const ICON_REPORT = <><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>;
export const ICON_KEY = <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M15.5 12v2.5" /></>;
export const ICON_WARN = <><path d="M12 4.5 21 20H3L12 4.5Z" /><path d="M12 10v4M12 17h.01" /></>;
export const ICON_CHECK = <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>;
export const ICON_SCOPE = <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></>;
