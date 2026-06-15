// HOTFIX P1A — Nuevo Pedido performance (frontend-only, base 2195c66)
// ─────────────────────────────────────────────────────────────────────────────
// Helper puri per l'effect di geocodifica indirizzo (`resolveAddress`):
//  - createLatestOnly(): guardia "last-wins". Se l'operatore cambia indirizzo
//    mentre una richiesta è in volo, la risposta VECCHIA non deve aggiornare lo
//    stato (oggi resolveAddress non ha questa guardia, a differenza di
//    previewOrderTiming). Niente AbortController: la richiesta http parte
//    comunque, ma il suo risultato viene IGNORATO se non è più la corrente.
//  - shouldGeocode(): quando ha senso geocodare (evita chiamate inutili).
//  - GEOCODE_DEBOUNCE_MS: debounce condiviso (allineato a resolveAddress +
//    previewOrderTiming) per non martellare l'endpoint mentre si digita.
// Nessuna chiamata nuova, nessun contratto backend cambiato.
// ─────────────────────────────────────────────────────────────────────────────

// Ogni begin() rende "corrente" una nuova richiesta e invalida le precedenti.
// Ritorna isCurrent(): true finché non parte un nuovo begin() o un cancel().
export function createLatestOnly() {
  let active = 0;
  return {
    begin() {
      const my = ++active;
      return () => my === active;
    },
    // Invalida la richiesta corrente senza crearne una nuova (per il cleanup/unmount).
    cancel() {
      active++;
    },
  };
}

// Geocodare solo per DOMICILIO, non in zona manuale, e con indirizzo "sensato".
export function shouldGeocode({ tipoConsegna, direccion, zonaManuale } = {}) {
  if (tipoConsegna !== "DOMICILIO") return false;
  if (zonaManuale) return false;
  return String(direccion || "").trim().length >= 5;
}

export const GEOCODE_DEBOUNCE_MS = 600;
