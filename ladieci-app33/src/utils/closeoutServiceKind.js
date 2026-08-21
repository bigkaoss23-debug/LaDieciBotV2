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
//   - status: a closed session says nothing about which kind it was (status
//     does select the TITLE's tense — see UX-01 below — but never the kind);
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
//
// UX-01 (2026-08-21 forensic audit) — the title is now STATE-AWARE. It used to
// read "Cierre del servicio" unconditionally, so a still-open service was
// reported under a heading announcing its own closure, with a full final-looking
// economy underneath and no confirmation control anywhere on the page. Proven
// live on service 480eca89: the owner read that page, reasonably concluded the
// service had been finalized, and it had not — zero closeout attempts were ever
// recorded. A report may only call itself a "Cierre" once the service it
// describes is actually closed.
const PRESENTATION = Object.freeze({
  PRANZO: Object.freeze({
    kind: 'PRANZO', eyebrow: 'SERVICIO · MEDIODÍA', noun: 'la comida',
    closedTitle: 'Cierre de la comida',
    liveTitle: 'Resumen de la comida en curso',
    title: 'Resumen de la comida',
  }),
  SERA: Object.freeze({
    kind: 'SERA', eyebrow: 'SERVICIO · NOCHE', noun: 'la cena',
    closedTitle: 'Cierre de la cena',
    liveTitle: 'Resumen de la cena en curso',
    title: 'Resumen de la cena',
  }),
});

const NEUTRAL = Object.freeze({
  kind: null, eyebrow: 'SERVICIO ACTUAL', noun: 'el servicio',
  closedTitle: 'Cierre del servicio',
  liveTitle: 'Resumen del servicio en curso',
  title: 'Resumen del servicio',
});

// The only two statuses that mean "this service is still running". Anything
// else — including an absent status while the report is still loading — is
// UNKNOWN and gets the non-committal title: never announce a closure that has
// not been proven, and never assert progress that has not been read.
const LIVE_STATUSES = new Set(['open', 'closing']);
const CLOSED_STATUS = 'closed';

// describeCloseoutKind(closeout) → { kind, eyebrow, title, noun, closedTitle, liveTitle }
// Takes the WHOLE closeout response, not a loose string, so no caller can slip
// in a value from somewhere other than the contract. Any absent, null or
// unrecognised kind falls back to neutral rather than throwing or inventing.
//
// `status` selects the TITLE only. It can never influence `kind`, which stays
// derived from serviceKind alone — locked by closeoutServiceKind.test.js.
export function describeCloseoutKind(closeout) {
  const raw = closeout && closeout.serviceKind;
  const base = (typeof raw === 'string' && PRESENTATION[raw.trim().toUpperCase()]) || NEUTRAL;
  const rawStatus = closeout && closeout.status;
  const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  const title = status === CLOSED_STATUS ? base.closedTitle
    : LIVE_STATUSES.has(status) ? base.liveTitle
      : base.title;
  return Object.freeze({ ...base, title });
}
