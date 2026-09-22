// HOTFIX prod-wa-orphan-visible (base 777ae55)
// ─────────────────────────────────────────────────────────────────────────────
// Un ordine con canal="WA" ma SENZA wa_id (nessuna conversazione collegata) non
// compare in TabWA — che disegna solo dalla tabella `wa_msgs` — e prima veniva
// scartato anche da TabManual/Pedidos (filtro MANUAL/TEL/vuoto). Risultato:
// restava INVISIBILE in ogni tab (caso reale ordine #014 / "ordine #1").
//
// Qui centralizziamo la regola di appartenenza al tab Pedidos così TabManual e
// OrdenCard ragionano in modo identico:
//   - MANUAL / TEL / canal vuoto         → Pedidos (flusso normale)
//   - WA SENZA wa_id (orfano)            → Pedidos come fallback (badge "WA sin conversación")
//   - WA CON wa_id (conversazione reale) → resta nel flusso WhatsApp (NON in Pedidos)
//   - BANCO                              → tab Barra (NON in Pedidos)
// ─────────────────────────────────────────────────────────────────────────────

// Ordine canal=WA senza conversazione collegata (wa_id vuoto/assente).
export const isWaSinConversacion = (o) =>
  !!o && o.canal === "WA" && !String(o.wa_id || "").trim();

// L'ordine deve apparire nel tab Pedidos (TabManual)?
export const belongsToPedidos = (o) => {
  if (!o) return false;
  if (o.canal === "MANUAL" || o.canal === "TEL" || !o.canal) return true;
  if (isWaSinConversacion(o)) return true; // fallback anti-orfano
  return false; // BANCO, e WA con wa_id (flusso WhatsApp)
};

// Origine WhatsApp da mostrare come badge "💬 WhatsApp" in Pedidos.
//
// [ORIGINE-ORDINI 2026-09-22] Ora si decide su `canal`, non più su `wa_id`.
// `wa_id` NON è un marcatore d'origine: il backend LIVE (agentOrdini.js:330,
// `wa_id: params.waId || params.tel || ""`) lo popola col telefono su OGNI
// ordine, anche telefonico e da banco. La vecchia regola (canal !== BANCO &&
// wa_id non vuoto) marchiava quindi come "💬 WhatsApp" tutti gli ordini TEL
// appena il polling li rileggeva dal DB. Il bottone "💬 WhatsApp" di Nuevo
// Pedido non esiste più, quindi l'unico vero WhatsApp è il canale bot.
// Invariata la semantica per il flusso bot: l'orfano ha il suo badge dedicato.
export const isWaOrigen = (o) =>
  !!o && o.canal === "WA" && !isWaSinConversacion(o);
