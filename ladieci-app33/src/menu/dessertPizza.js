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
 */

/** Il dessert è una pizza vera e propria (occupa il forno)? */
export function isDessertPizza(item) {
  if (!item) return false;
  if (item.dulce === true) return true;
  // Ordini storici precedenti al flag `dulce`.
  return item.n === "Pizza Nutella";
}

export default isDessertPizza;
