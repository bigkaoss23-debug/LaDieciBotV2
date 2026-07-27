// ===============================================================
// closeoutServiceKind.js — S2-7D6C2
//
// The closeout must say WHICH service it is reporting. The ONLY admissible
// source is closeout.serviceKind, projected by the backend straight from the
// session row (S2-7D6C2, currentServiceCloseout.js).
//
// Explicitly NOT sources, and why:
//   - the browser clock: a closeout is routinely read AFTER its service ended
//     (an evening report opened at 01:00, a lunch report read at 18:00);
//   - businessDate: lunch and dinner share one business date by design, so it
//     cannot discriminate them;
//   - status: a closed session says nothing about which kind it was;
//   - the silent-ensure session: that is the CURRENT service, while the
//     closeout may legitimately report a previous, closed one of another kind.
//
// A legacy session closed before service_kind existed arrives as null. That is
// reported neutrally — "Servicio" — never guessed, and never called "Serata".
// ===============================================================

export const SERVICE_KIND = Object.freeze({ PRANZO: 'PRANZO', SERA: 'SERA' });

// S2-7D6E — the backend token (`kind`) is kept as an internal discriminant only;
// it is never rendered. `eyebrow`/`title`/`noun` are the only fields this page
// paints on screen, and they use the same "mediodía"/"noche" vocabulary as the
// Servicio status pill (ensuredStatusLabel) — never the raw PRANZO/SERA word.
const PRESENTATION = Object.freeze({
  PRANZO: Object.freeze({ kind: 'PRANZO', eyebrow: 'SERVICIO · MEDIODÍA', title: 'Cierre de la comida', noun: 'la comida' }),
  SERA: Object.freeze({ kind: 'SERA', eyebrow: 'SERVICIO · NOCHE', title: 'Cierre de la cena', noun: 'la cena' }),
});

const NEUTRAL = Object.freeze({ kind: null, eyebrow: 'SERVICIO ACTUAL', title: 'Cierre del servicio', noun: 'el servicio' });

// describeCloseoutKind(closeout) → { kind, eyebrow, title, noun }
// Takes the WHOLE closeout response, not a loose string, so no caller can slip
// in a value from somewhere other than the contract. Any absent, null or
// unrecognised kind falls back to neutral rather than throwing or inventing.
export function describeCloseoutKind(closeout) {
  const raw = closeout && closeout.serviceKind;
  if (typeof raw !== 'string') return NEUTRAL;
  return PRESENTATION[raw.trim().toUpperCase()] || NEUTRAL;
}
