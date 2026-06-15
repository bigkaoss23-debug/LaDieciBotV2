// HOTFIX cocina-realtime-polling (base cb13736)
// ─────────────────────────────────────────────────────────────────────────────
// Predicati puri per la rete anti "Cocina stantia". Estratti per essere
// testabili: la logica di decisione del safety poll e del watchdog socket-zombie
// non deve dipendere da timer/closure di App.jsx.
// ─────────────────────────────────────────────────────────────────────────────

// Il safety poll deve ricaricare? Vero se non c'è stato un loadAll da almeno
// staleMs (a prescindere dallo stato del WebSocket).
export const shouldSafetyReload = (now, lastLoadAt, staleMs) =>
  (Number(now) - Number(lastLoadAt)) >= Number(staleMs);

// Il WebSocket è "zombie"? Lo crediamo connesso ma non riceviamo messaggi
// (nemmeno le risposte agli heartbeat) da oltre silenceMs → va riconnesso.
export const isWsZombie = (now, lastWsMsgAt, wsConnected, silenceMs) =>
  !!wsConnected && (Number(now) - Number(lastWsMsgAt)) > Number(silenceMs);
