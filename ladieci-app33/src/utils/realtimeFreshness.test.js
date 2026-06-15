import { shouldSafetyReload, isWsZombie } from './realtimeFreshness';

// HOTFIX cocina-realtime-polling — il safety poll deve ricaricare quando i dati
// sono stantii a PRESCINDERE dallo stato del socket (bug: prima girava solo se
// !wsConnected → socket zombie = Cocina ferma).
describe("shouldSafetyReload", () => {
  const STALE = 7000;
  test("dati freschi (appena caricati) → NON ricarica", () => {
    expect(shouldSafetyReload(10000, 10000, STALE)).toBe(false);
    expect(shouldSafetyReload(13000, 10000, STALE)).toBe(false); // 3s < 7s
  });
  test("dati stantii (>= soglia) → ricarica", () => {
    expect(shouldSafetyReload(17000, 10000, STALE)).toBe(true);  // 7s
    expect(shouldSafetyReload(99000, 10000, STALE)).toBe(true);  // 89s
  });
  test("limite esatto incluso (>=)", () => {
    expect(shouldSafetyReload(7000, 0, STALE)).toBe(true);
    expect(shouldSafetyReload(6999, 0, STALE)).toBe(false);
  });
  test("non dipende dallo stato del WebSocket (è un parametro a parte)", () => {
    // qualunque sia wsConnected, se è stantio si ricarica → la rete è sempre attiva
    expect(shouldSafetyReload(20000, 10000, STALE)).toBe(true);
  });
});

describe("isWsZombie", () => {
  const SILENCE = 35000;
  test("socket NON connesso → mai zombie (ci pensa onclose/reconnect)", () => {
    expect(isWsZombie(100000, 0, false, SILENCE)).toBe(false);
  });
  test("connesso e ha ricevuto messaggi di recente → vivo", () => {
    expect(isWsZombie(40000, 20000, true, SILENCE)).toBe(false); // 20s < 35s
  });
  test("connesso ma muto da oltre la soglia → zombie (reconnect)", () => {
    expect(isWsZombie(60000, 20000, true, SILENCE)).toBe(true);  // 40s > 35s
  });
  test("limite esatto NON incluso (>)", () => {
    expect(isWsZombie(35000, 0, true, SILENCE)).toBe(false); // 35s == soglia
    expect(isWsZombie(35001, 0, true, SILENCE)).toBe(true);
  });
});
