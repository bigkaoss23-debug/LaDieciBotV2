import { describeCloseoutKind } from './closeoutServiceKind';

describe('closeout service kind — from the contract only', () => {
  test('PRANZO gets lunch wording; the backend token stays an internal discriminant, never rendered', () => {
    const d = describeCloseoutKind({ serviceKind: 'PRANZO', status: 'closed' });
    expect(d.kind).toBe('PRANZO');
    expect(d.title).toBe('Cierre de la comida');
    expect(d.eyebrow).toBe('SERVICIO · MEDIODÍA');
    expect(d.eyebrow).not.toMatch(/PRANZO/);
  });

  test('SERA gets evening wording; the backend token stays an internal discriminant, never rendered', () => {
    const d = describeCloseoutKind({ serviceKind: 'SERA', status: 'closed' });
    expect(d.kind).toBe('SERA');
    expect(d.title).toBe('Cierre de la cena');
    expect(d.eyebrow).toBe('SERVICIO · NOCHE');
    expect(d.eyebrow).not.toMatch(/\bSERA\b/);
  });

  test('lunch and dinner never share wording, in either state', () => {
    for (const status of ['closed', 'open', undefined]) {
      const lunch = describeCloseoutKind({ serviceKind: 'PRANZO', status });
      const dinner = describeCloseoutKind({ serviceKind: 'SERA', status });
      expect(lunch.title).not.toBe(dinner.title);
      expect(lunch.eyebrow).not.toBe(dinner.eyebrow);
    }
  });

  test('legacy null is neutral "Servicio" — never guessed, never "Serata"', () => {
    for (const c of [{ serviceKind: null }, {}, null, undefined, { serviceKind: '' }, { serviceKind: 42 }]) {
      const d = describeCloseoutKind(c);
      expect(d.kind).toBeNull();
      expect(d.title).toBe('Resumen del servicio');
      expect(d.eyebrow).toBe('SERVICIO ACTUAL');
      expect(JSON.stringify(d)).not.toMatch(/Serata|PRANZO|SERA/);
    }
    expect(describeCloseoutKind({ serviceKind: null, status: 'closed' }).title).toBe('Cierre del servicio');
  });

  test('an unrecognised kind falls back to neutral instead of inventing one', () => {
    expect(describeCloseoutKind({ serviceKind: 'BRUNCH' }).kind).toBeNull();
  });

  test('the kind is never inferred from businessDate, status, openedAt or the clock', () => {
    // Same date, same times, same status — only serviceKind differs.
    const base = { businessDate: '2026-07-26', status: 'closed', openedAt: '2026-07-26T20:00:00.000Z' };
    expect(describeCloseoutKind({ ...base, serviceKind: 'PRANZO' }).kind).toBe('PRANZO');
    expect(describeCloseoutKind({ ...base, serviceKind: 'SERA' }).kind).toBe('SERA');
    // A lunch closeout stays lunch even with an evening timestamp on it.
    expect(describeCloseoutKind({ ...base, serviceKind: 'PRANZO' }).title).toBe('Cierre de la comida');
    // No date/status alone can produce a kind.
    expect(describeCloseoutKind(base).kind).toBeNull();
  });

  test('the module reads no clock and no ensure session', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, 'closeoutServiceKind.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/new Date|Date\.now|getHours|businessDate|useSilentServiceEnsure/);
  });
});

// UX-01 (2026-08-21 forensic audit) — a report may only call itself a "Cierre"
// once the service it describes is actually closed. On 2026-08-20 the owner
// opened this page on a STILL-OPEN service, read the heading "Cierre del
// servicio" over a full final-looking economy, found no confirmation control,
// and concluded the service had been finalized. It had not: service 480eca89
// recorded zero closeout attempts and is open to this day.
describe('the title is state-aware — a still-open service is never called a "Cierre"', () => {
  // language-guard: allow-legacy PRANZO/SERA are the existing service_kind enum
  const [LUNCH, DINNER] = ['PRANZO', 'SERA'];
  const OPENISH = ['open', 'closing', 'OPEN', ' Closing '];

  test('an open or closing service reads as a live summary, never as a closure', () => {
    for (const status of OPENISH) {
      for (const serviceKind of [null, LUNCH, DINNER]) {
        const d = describeCloseoutKind({ serviceKind, status });
        expect(d.title).toMatch(/^Resumen /);
        expect(d.title).toMatch(/ en curso$/);
        expect(d.title).not.toMatch(/Cierre/);
      }
    }
  });

  test('the exact open-service wording the operator sees', () => {
    expect(describeCloseoutKind({ status: 'open' }).title).toBe('Resumen del servicio en curso');
    expect(describeCloseoutKind({ serviceKind: LUNCH, status: 'open' }).title).toBe('Resumen de la comida en curso');
    expect(describeCloseoutKind({ serviceKind: DINNER, status: 'open' }).title).toBe('Resumen de la cena en curso');
  });

  test('a genuinely closed service keeps the finalized "Cierre" wording', () => {
    expect(describeCloseoutKind({ status: 'closed' }).title).toBe('Cierre del servicio');
    expect(describeCloseoutKind({ serviceKind: LUNCH, status: 'closed' }).title).toBe('Cierre de la comida');
    expect(describeCloseoutKind({ serviceKind: DINNER, status: 'closed' }).title).toBe('Cierre de la cena');
  });

  test('an unknown status claims neither closure nor progress', () => {
    // this is the loading state (data still null) and any status the contract
    // has not taught us — assert nothing that has not been read
    for (const status of [undefined, null, '', 'weird', 42]) {
      const d = describeCloseoutKind({ status });
      expect(d.title).toBe('Resumen del servicio');
      expect(d.title).not.toMatch(/Cierre|en curso/);
    }
  });

  test('status moves the title but can never move the kind', () => {
    for (const status of ['open', 'closing', 'closed', undefined]) {
      expect(describeCloseoutKind({ serviceKind: LUNCH, status }).kind).toBe(LUNCH);
      expect(describeCloseoutKind({ serviceKind: DINNER, status }).kind).toBe(DINNER);
      expect(describeCloseoutKind({ status }).kind).toBeNull();
      // and the eyebrow is kind-derived, so it must not move with status either
      expect(describeCloseoutKind({ serviceKind: DINNER, status }).eyebrow).toBe('SERVICIO · NOCHE');
    }
  });

  test('the open-service title is exactly what the forensic case needed', () => {
    // service 480eca89: status open, service_kind null -> the NEUTRAL branch,
    // which is precisely the combination that produced "Cierre del servicio"
    const d = describeCloseoutKind({
      serviceKind: null, status: 'open', businessDate: '2026-08-20',
      available: true, totals: { gross: 262.5, collected: 262.5 },
    });
    expect(d.title).toBe('Resumen del servicio en curso');
    expect(d.title).not.toBe('Cierre del servicio');
  });
});
