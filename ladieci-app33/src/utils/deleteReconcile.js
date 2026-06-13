"use strict";
// ─── Riconciliazione delete ordini (root cause fantasma #001) ────────────────
// Logica PURA, CommonJS → testabile con `node` (convenzione del progetto, no Jest).
//
// Problema: l'operatore cancellava un ordine, la UI lo nascondeva subito
// (optimisticDelete), ma se il delete backend falliva l'errore veniva inghiottito
// e l'ordine restava vivo nel DB/API pur essendo invisibile su quel browser
// (in modalità WebSocket, senza polling, la verità server non lo riportava mai).

// TTL del patch ottimistico _deleted: oltre questa finestra, se il backend non ha
// confermato la cancellazione, NON nascondiamo più l'ordine → il merge del polling
// fa riapparire la verità server. Evita il fantasma invisibile-per-sempre.
const DELETE_PATCH_TTL_MS = 30000;

// True SOLO se il backend ha CONFERMATO la cancellazione: HTTP ok, nessun campo
// `error`, e `ok !== false`. proxyPost annota `_ok`/`_status`; le write backend
// possono restituire `{ ok:false, error }` anche con HTTP 200 → vanno trattate
// come fallimento (altrimenti la UI "crede" di aver cancellato e nasconde un
// ordine ancora vivo).
function isDeleteConfirmed(res) {
  return !!(res && res._ok === true && !res.error && res.ok !== false);
}

// True se un patch ottimistico `_deleted` deve ANCORA nascondere l'ordine nel
// merge: solo se marcato `_deleted` ed entro il TTL. Scaduto → l'ordine può
// riapparire (riconciliazione con la verità server quando il delete non è stato
// confermato / è rimasto appeso).
function shouldHideDeleted(entry, now, ttlMs = DELETE_PATCH_TTL_MS) {
  if (!entry || !entry.patch || !entry.patch._deleted) return false;
  const ts = Number(entry.ts) || 0;
  return (now - ts) < ttlMs;
}

module.exports = { DELETE_PATCH_TTL_MS, isDeleteConfirmed, shouldHideDeleted };
