import { createLatestOnly, shouldGeocode, GEOCODE_DEBOUNCE_MS } from './nuevoPedidoGeocode';

describe("createLatestOnly — last-wins / risposta vecchia ignorata", () => {
  test("la richiesta corrente è valida", () => {
    const g = createLatestOnly();
    const isCurrent = g.begin();
    expect(isCurrent()).toBe(true);
  });

  test("una nuova richiesta invalida la precedente (ULTIMA vince, la vecchia NON aggiorna)", () => {
    const g = createLatestOnly();
    const first = g.begin();   // richiesta 1 in volo
    const second = g.begin();  // l'operatore cambia indirizzo → richiesta 2
    expect(first()).toBe(false);  // risposta vecchia → IGNORATA
    expect(second()).toBe(true);  // risposta nuova → applicata
  });

  test("cancel() invalida la corrente (cleanup/unmount): nessun update post-chiusura", () => {
    const g = createLatestOnly();
    const isCurrent = g.begin();
    expect(isCurrent()).toBe(true);
    g.cancel();
    expect(isCurrent()).toBe(false);
  });

  test("simulazione out-of-order: 3 richieste, solo l'ultima applica", () => {
    const g = createLatestOnly();
    const a = g.begin();
    const b = g.begin();
    const c = g.begin();
    // arrivano fuori ordine: a (vecchia), c (ultima), b (intermedia)
    expect(a()).toBe(false);
    expect(c()).toBe(true);
    expect(b()).toBe(false);
  });
});

describe("shouldGeocode — input vuoto/non valido non chiama", () => {
  test("DOMICILIO con indirizzo valido → true", () => {
    expect(shouldGeocode({ tipoConsegna: "DOMICILIO", direccion: "Calle Cuba 5", zonaManuale: false })).toBe(true);
  });
  test("indirizzo vuoto o troppo corto → false (niente chiamata)", () => {
    expect(shouldGeocode({ tipoConsegna: "DOMICILIO", direccion: "", zonaManuale: false })).toBe(false);
    expect(shouldGeocode({ tipoConsegna: "DOMICILIO", direccion: "   ", zonaManuale: false })).toBe(false);
    expect(shouldGeocode({ tipoConsegna: "DOMICILIO", direccion: "Cuba", zonaManuale: false })).toBe(false);
  });
  test("RITIRO → false", () => {
    expect(shouldGeocode({ tipoConsegna: "RITIRO", direccion: "Calle Cuba 5", zonaManuale: false })).toBe(false);
  });
  test("zona manuale → false (niente geocodifica automatica)", () => {
    expect(shouldGeocode({ tipoConsegna: "DOMICILIO", direccion: "Calle Cuba 5", zonaManuale: true })).toBe(false);
  });
  test("argomenti mancanti → false (difensivo)", () => {
    expect(shouldGeocode()).toBe(false);
    expect(shouldGeocode({})).toBe(false);
  });
});

describe("GEOCODE_DEBOUNCE_MS", () => {
  test("debounce allineato a ~600ms", () => {
    expect(GEOCODE_DEBOUNCE_MS).toBe(600);
  });
});
