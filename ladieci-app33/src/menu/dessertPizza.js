/**
 * dessertPizza.js — un solo predicato per "questo dolce occupa il forno?".
 *
 * PERCHÉ ESISTE
 * La sessione menu di luglio ha aggiunto due pizze dolci al catalogo
 * (id 40 "Pizza KitKat", id 41 "Pizza Kinder", entrambe `cat:"Postres"` e
 * `dulce:true`) accanto alla preesistente id 16 "Pizza Nutella". Sette punti
 * del codice decidevano però se un dessert conta come pizza confrontando il
 * NOME con la stringa "Pizza Nutella". Risultato: KitKat e Kinder non venivano
 * conteggiate nel carico forno, negli slot di capacità e nello scheduling del
 * driver — il forno risultava più libero di quanto fosse.
 *
 * Il predicato vive qui, in un modulo puro senza dipendenze (niente React,
 * niente constants.js), così anche `core/kitchen` e `core/delivery` — che sono
 * volutamente privi di import — possono usarlo senza accoppiarsi alla UI.
 *
 * COMPATIBILITÀ CON GLI ORDINI STORICI
 * `dulce` esiste solo dal luglio 2026. Gli ordini salvati prima non lo hanno,
 * ma possono contenere soltanto Pizza Nutella: KitKat e Kinder non erano ancora
 * a catalogo. Il fallback sul nome copre quindi per costruzione tutto lo
 * storico, e il flag copre tutto ciò che nasce dal catalogo nuovo.
 *
 * CARTA 2026-09-17
 * Le tre pizze dolci sono state rinominate ("Pizza de Nutella (28cm)" …).
 * Non tutti i percorsi conservano `dulce`: WADettaglio, per esempio, ricopia
 * l'item senza il flag. I nomi nuovi entrano quindi nello stesso fallback,
 * altrimenti una pizza dolce aggiunta da lì sparirebbe dalla Pizzeria e dal
 * carico forno.
 */

const DESSERT_PIZZA_NAMES = new Set([
  // Ordini storici precedenti al flag `dulce`.
  "Pizza Nutella",
  // Nomi della carta 2026-09-17 (id 16 / 40 / 41).
  "Pizza de Nutella (28cm)",
  "Pizza de KitKat (28cm)",
  "Pizza de Kinder (28cm)",
]);

/** Il dessert è una pizza vera e propria (occupa il forno)? */
export function isDessertPizza(item) {
  if (!item) return false;
  if (item.dulce === true) return true;
  return DESSERT_PIZZA_NAMES.has(item.n);
}

export default isDessertPizza;
