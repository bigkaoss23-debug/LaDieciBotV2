import { resolveHoraFornoCard } from '../manualGiroCocina';

// [LIVE 2026-09-21] +5 per-card anche dentro un giro manuale; la promessa cliente (o.hora) non cambia mai.
describe('resolveHoraFornoCard', () => {
  const giro = { id: 'mg_260921_1', hora_ref: '21:10', entrega_ref: '21:35' };

  test('ordine singolo DOMICILIO: forno_out + offset (comportamento LIVE invariato)', () => {
    expect(resolveHoraFornoCard({ ui_offset_min: 0 }, null, '21:00', true)).toBe('21:00');
    expect(resolveHoraFornoCard({ ui_offset_min: 5 }, null, '21:00', true)).toBe('21:05');
  });

  test('RITIRO: offset ignorato (comportamento LIVE invariato)', () => {
    expect(resolveHoraFornoCard({ ui_offset_min: 10 }, null, '21:00', false)).toBe('21:00');
  });

  test('membro di giro: base hora_ref, +5 applicato sopra', () => {
    expect(resolveHoraFornoCard({ ui_offset_min: 0 }, giro, '20:50', true)).toBe('21:10');
    expect(resolveHoraFornoCard({ ui_offset_min: 5 }, giro, '20:50', true)).toBe('21:15');
    expect(resolveHoraFornoCard({ ui_offset_min: 20 }, giro, '20:50', true)).toBe('21:30');
  });

  test('giro senza hora_ref: ricade su forno_out + offset', () => {
    expect(resolveHoraFornoCard({ ui_offset_min: 5 }, { id: 'g', hora_ref: null }, '20:50', true)).toBe('20:55');
  });

  test('non muta ordine né giro (hora cliente e riferimenti del giro invariati)', () => {
    const o = { hora: '21:20', ui_offset_min: 5 };
    const g = { ...giro };
    resolveHoraFornoCard(o, g, '20:50', true);
    expect(o).toEqual({ hora: '21:20', ui_offset_min: 5 });
    expect(g).toEqual(giro);
  });
});
