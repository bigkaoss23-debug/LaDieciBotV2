import { productionTargetHHMM, orderDeadlineHHMM, orderDeadlineMs, giroEarliestDeadlineMs, compareWithinGiro } from '../manualGiroCocina';

// [FDV1] deadline DOMICILIO = delivery_deadline_at (ts + 55'); target di produzione = deadline (giro → la più urgente) + offset ±.
// Orari in Europe/Madrid (UTC+2 a settembre).
const iso = (hhmmMadrid) => `2026-09-21T${String(Number(hhmmMadrid.slice(0, 2)) - 2).padStart(2, '0')}:${hhmmMadrid.slice(3)}:00.000Z`;
const dom = (id, dl, extra = {}) => ({ id, tipo_consegna: 'DOMICILIO', estado: 'EN_COCINA', hora: dl, delivery_deadline_at: iso(dl), ui_offset_min: 0, manual_giro_id: null, ...extra });

describe('orderDeadlineHHMM / orderDeadlineMs', () => {
  test('usa delivery_deadline_at quando presente', () => {
    expect(orderDeadlineHHMM(dom('#1', '21:05', { hora: '20:00' }))).toBe('21:05');
  });
  test('ordine legacy senza deadline: fallback fail-safe su hora', () => {
    expect(orderDeadlineHHMM({ id: '#L', tipo_consegna: 'DOMICILIO', hora: '21:40' })).toBe('21:40');
  });
  test('RITIRO non ha deadline delivery', () => {
    expect(orderDeadlineMs({ tipo_consegna: 'RITIRO', hora: '21:00' })).toBeNull();
  });
});

describe('productionTargetHHMM', () => {
  test('standalone: deadline + offset (±), deadline invariata', () => {
    const o = dom('#1', '21:05');
    expect(productionTargetHHMM(o, [o])).toBe('21:05');
    expect(productionTargetHHMM({ ...o, ui_offset_min: 5 }, [o])).toBe('21:10');
    expect(productionTargetHHMM({ ...o, ui_offset_min: -5 }, [o])).toBe('21:00');
    expect(orderDeadlineHHMM({ ...o, ui_offset_min: 5 })).toBe('21:05');
  });
  test('giro: urgenza = EARLIEST MEMBER DEADLINE, + offset di blocco', () => {
    const a = dom('#A', '21:05', { manual_giro_id: 'g1' }), b = dom('#B', '21:25', { manual_giro_id: 'g1' }), c = dom('#C', '21:45');
    const all = [a, b, c];
    expect(formatMs(giroEarliestDeadlineMs('g1', all))).toBe('21:05');
    expect(productionTargetHHMM(b, all)).toBe('21:05');
    expect(productionTargetHHMM({ ...b, ui_offset_min: 5 }, all)).toBe('21:10');
    expect(productionTargetHHMM(c, all)).toBe('21:45');
  });
  test('3→2: il membro uscito non influenza più il giro (niente orario ereditato)', () => {
    const a = dom('#A', '21:05'), b = dom('#B', '21:25', { manual_giro_id: 'g1' }), c = dom('#C', '21:45', { manual_giro_id: 'g1' });
    expect(productionTargetHHMM(c, [a, b, c])).toBe('21:25');
  });
  test('membri già partiti (EN_ENTREGA) non guidano il giro finché ne resta uno in cucina', () => {
    const a = dom('#A', '21:05', { manual_giro_id: 'g1', estado: 'EN_ENTREGA' }), b = dom('#B', '21:25', { manual_giro_id: 'g1' });
    expect(productionTargetHHMM(b, [a, b])).toBe('21:25');
  });
});

describe('compareWithinGiro', () => {
  test('a pari target di produzione, esce prima la deadline cliente più urgente', () => {
    const cards = [dom('C', '21:45'), dom('B', '21:25'), dom('A', '21:05')].map(o => ({ ...o, horaForno: '21:05' }));
    expect(cards.slice().sort(compareWithinGiro).map(c => c.id)).toEqual(['A', 'B', 'C']);
  });
  test('il target di produzione resta il criterio primario', () => {
    const cards = [{ ...dom('A', '21:05'), horaForno: '21:10' }, { ...dom('B', '21:25'), horaForno: '21:05' }];
    expect(cards.slice().sort(compareWithinGiro).map(c => c.id)).toEqual(['B', 'A']);
  });
});

function formatMs(ms) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
