import { resolveHoraFornoCard, sanitizeGiroRefs, buildManualGiroMetaById, compareWithinGiro } from '../manualGiroCocina';

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

// [LIVE 2026-09-21] 3→2 togliendo l'anchor: i riferimenti del giro derivati da lui non guidano più i membri.
describe('sanitizeGiroRefs', () => {
  const g = { id: 'mg_1', hora_ref: '09:40', entrega_ref: '09:45', anchor_order_id: '#003' };
  const members = [{ id: '#001', manual_giro_id: 'mg_1', hora: '09:05' }, { id: '#002', manual_giro_id: 'mg_1', hora: '09:25' }];

  test('anchor ancora membro: giro invariato', () => {
    const all = [...members, { id: '#003', manual_giro_id: 'mg_1', hora: '09:45' }];
    expect(sanitizeGiroRefs(g, all)).toBe(g);
  });
  test('anchor uscito dal giro (singolo o cancellato): hora_ref/entrega_ref ignorati in lettura', () => {
    for (const all of [[...members, { id: '#003', manual_giro_id: null, hora: '09:45' }], members]) {
      const r = sanitizeGiroRefs(g, all);
      expect(r).toMatchObject({ id: 'mg_1', hora_ref: null, entrega_ref: null, anchor_order_id: null });
      expect(g.hora_ref).toBe('09:40');   // oggetto originale non mutato
    }
  });
  test('giro personalizzato (anchor null): invariato', () => {
    const c = { id: 'mg_1', hora_ref: '09:30', entrega_ref: '09:45', anchor_order_id: null };
    expect(sanitizeGiroRefs(c, members)).toBe(c);
  });
  test('buildManualGiroMetaById senza lista ordini: comportamento LIVE invariato', () => {
    expect(buildManualGiroMetaById([g]).mg_1).toBe(g);
    expect(buildManualGiroMetaById([g], members).mg_1.hora_ref).toBeNull();
  });
});

describe('compareWithinGiro', () => {
  test('a pari target di produzione, esce prima la promessa cliente più urgente', () => {
    const cards = [{ id: 'C', horaForno: '09:40', hora: '09:45' }, { id: 'B', horaForno: '09:40', hora: '09:25' }, { id: 'A', horaForno: '09:40', hora: '09:05' }];
    expect(cards.slice().sort(compareWithinGiro).map(c => c.id)).toEqual(['A', 'B', 'C']);
  });
  test('il target di produzione (es. dopo +5) resta il criterio primario', () => {
    const cards = [{ id: 'A', horaForno: '09:45', hora: '09:05' }, { id: 'B', horaForno: '09:40', hora: '09:25' }];
    expect(cards.slice().sort(compareWithinGiro).map(c => c.id)).toEqual(['B', 'A']);
  });
});
