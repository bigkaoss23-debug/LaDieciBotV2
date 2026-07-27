import { describeCloseoutKind } from './closeoutServiceKind';

describe('closeout service kind — from the contract only', () => {
  test('PRANZO gets lunch wording; the backend token stays an internal discriminant, never rendered', () => {
    const d = describeCloseoutKind({ serviceKind: 'PRANZO' });
    expect(d.kind).toBe('PRANZO');
    expect(d.title).toBe('Cierre de la comida');
    expect(d.eyebrow).toBe('SERVICIO · MEDIODÍA');
    expect(d.eyebrow).not.toMatch(/PRANZO/);
  });

  test('SERA gets evening wording; the backend token stays an internal discriminant, never rendered', () => {
    const d = describeCloseoutKind({ serviceKind: 'SERA' });
    expect(d.kind).toBe('SERA');
    expect(d.title).toBe('Cierre de la cena');
    expect(d.eyebrow).toBe('SERVICIO · NOCHE');
    expect(d.eyebrow).not.toMatch(/\bSERA\b/);
  });

  test('lunch and dinner never share wording', () => {
    const lunch = describeCloseoutKind({ serviceKind: 'PRANZO' });
    const dinner = describeCloseoutKind({ serviceKind: 'SERA' });
    expect(lunch.title).not.toBe(dinner.title);
    expect(lunch.eyebrow).not.toBe(dinner.eyebrow);
  });

  test('legacy null is neutral "Servicio" — never guessed, never "Serata"', () => {
    for (const c of [{ serviceKind: null }, {}, null, undefined, { serviceKind: '' }, { serviceKind: 42 }]) {
      const d = describeCloseoutKind(c);
      expect(d.kind).toBeNull();
      expect(d.title).toBe('Cierre del servicio');
      expect(d.eyebrow).toBe('SERVICIO ACTUAL');
      expect(JSON.stringify(d)).not.toMatch(/Serata|PRANZO|SERA/);
    }
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
