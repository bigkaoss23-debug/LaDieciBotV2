// Pure delivery scheduling engine.
// No React, no network, no storage: all domain dependencies are passed in.

import {
  BUFFER_OPS_DRIVER_MIN,
  calcolaTempoGiro,
} from "./geo";
import {
  ORDER_STATES,
  isCompletedState,
} from "../orders";

export function risolviTempoAndata(durataAndataMin, lat, lon, zonaObj, calcolaTempoGiroFn = calcolaTempoGiro) {
  if (durataAndataMin != null) return durataAndataMin;
  if (lat != null && lon != null && typeof calcolaTempoGiroFn === "function") {
    return calcolaTempoGiroFn(lat, lon, zonaObj);
  }
  return zonaObj?.tempoGiro ?? 20;
}

export function tempoAndata(o, zonaObj, calcolaTempoGiroFn = calcolaTempoGiro) {
  return risolviTempoAndata(
    o?.durata_andata_min ?? null,
    o?.zona_lat ?? null,
    o?.zona_lon ?? null,
    zonaObj,
    calcolaTempoGiroFn
  );
}

const horaToMinute = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + (m || 0);
};

export function getOperationalReadyMinute(order, options = {}, deps = {}) {
  const {
    zoneDelivery = [],
    calcolaTempoGiroFn = calcolaTempoGiro,
  } = deps;
  const offsetMin = Number.isFinite(Number(order?.ui_offset_min))
    ? Number(order.ui_offset_min)
    : 0;
  const fornoOutMin = horaToMinute(order?.forno_out);
  if (fornoOutMin != null) return fornoOutMin + offsetMin;

  const horaMin = horaToMinute(order?.hora);
  if (horaMin == null) return null;

  const zonaObj = options.zonaObj
    || zoneDelivery.find(z => z.id === order?.zona)
    || null;
  const tg = Number.isFinite(Number(options.tempoAndataMin))
    ? Number(options.tempoAndataMin)
    : tempoAndata(order, zonaObj, calcolaTempoGiroFn);

  return horaMin - tg + offsetMin;
}

export function simulateDriverSchedule(orders, options = {}, deps = {}) {
  const {
    zoneDelivery = [],
    bufferOpsDriverMin = BUFFER_OPS_DRIVER_MIN,
    calcolaTempoGiroFn = calcolaTempoGiro,
  } = deps;
  const toMin = (t) => { if (!t) return null; const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
  const slot10 = (min) => {
    const mArr = Math.round(min / 10) * 10;
    const h = Math.floor(mArr / 60), m = mArr % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };

  const validi = (orders || []).filter(o =>
    o && o.tipo_consegna === "DOMICILIO" && o.hora && o.zona
    && !isCompletedState(o.estado) && o.estado !== ORDER_STATES.POR_CONFIRMAR
  );

  const contaPizze = (items) => (items || [])
    .filter(it => it && it.n !== "Entrega a domicilio")
    .filter(it => {
      const cat = it.cat || "Pizzas";
      if (cat === "Bebidas") return false;
      if (cat === "Postres" && it.n !== "Pizza Nutella") return false;
      return true;
    })
    .reduce((s, it) => s + (parseInt(it.q) || 1), 0);

  const giriMap = new Map();
  for (const o of validi) {
    const zona = zoneDelivery.find(z => z.id === o.zona);
    if (!zona) continue;
    const minOra = toMin(o.hora);
    const sl = slot10(minOra);
    const key = `${o.zona}|${sl}`;
    if (!giriMap.has(key)) {
      giriMap.set(key, {
        zona: o.zona, zonaObj: zona, hora: sl, slot: sl,
        horaMin: minOra,
        count: 0, pizze: 0,
        tg: 0,
      });
    }
    const g = giriMap.get(key);
    g.count += 1;
    g.pizze += contaPizze(o.items);
    g.horaMin = Math.min(g.horaMin, minOra);
    const tgO = tempoAndata(o, zona, calcolaTempoGiroFn);
    g.tg = Math.max(g.tg, tgO);
  }

  const giri = Array.from(giriMap.values()).sort((a, b) => a.horaMin - b.horaMin);

  let t = toMin(options.startTime || "00:00") || 0;
  for (const g of giri) {
    const partTeorica = g.horaMin - g.tg;
    g.partenzaMin = Math.max(t, partTeorica);
    g.consegnaMin = g.partenzaMin + g.tg;
    g.rientroMin  = g.consegnaMin + bufferOpsDriverMin + g.tg;
    t = g.rientroMin;
  }

  return { giri, driverLiberoMin: t };
}

export function proposeForNewOrder(orders, newOrder, options = {}, deps = {}) {
  const {
    zoneDelivery = [],
    calcolaTempoGiroFn = calcolaTempoGiro,
  } = deps;
  const toMin = (t) => { if (!t) return null; const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
  const toH = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const latestDeliveryMinute = Number.isFinite(Number(options.latestDeliveryMinute))
    ? Number(options.latestDeliveryMinute)
    : 23 * 60;
  const serviceEndH = toH(latestDeliveryMinute);
  const outOfService = (extra = {}) => ({
    ok: false,
    consegnaPropostaMin: null,
    consegnaPropostaH: null,
    motivo: `Delivery non disponibile oltre le ${serviceEndH}`,
    aggregato: false,
    giroEsistente: null,
    outOfServiceWindow: true,
    latestDeliveryMinute,
    ...extra,
  });
  const slot10 = (min) => {
    const mArr = Math.round(min / 10) * 10;
    const h = Math.floor(mArr / 60), m = mArr % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  };

  const zona = zoneDelivery.find(z => z.id === newOrder.zona);
  if (!zona) return { ok: true, consegnaPropostaMin: toMin(newOrder.hora), consegnaPropostaH: newOrder.hora, motivo: null, aggregato: false, outOfServiceWindow: false };

  const tgNew = risolviTempoAndata(newOrder.durata_andata_min ?? null, newOrder.zona_lat, newOrder.zona_lon, zona, calcolaTempoGiroFn);
  const horaNewMin = toMin(newOrder.hora);
  const slotNew = slot10(horaNewMin);

  const sim = simulateDriverSchedule(orders, options, deps);

  const AGGREGATION_WINDOW_MIN = 15;
  const giroEsistente = sim.giri
    .filter(g => g.zona === newOrder.zona && g.count < zona.maxOrdiniPerGiro)
    .filter(g => Math.abs(g.horaMin - horaNewMin) <= AGGREGATION_WINDOW_MIN)
    .sort((a, b) => Math.abs(a.horaMin - horaNewMin) - Math.abs(b.horaMin - horaNewMin))[0];

  if (giroEsistente) {
    if (giroEsistente.horaMin > latestDeliveryMinute) {
      return outOfService({
        driverLiberoMin: sim.driverLiberoMin,
        sim,
      });
    }
    return {
      ok: true,
      consegnaPropostaMin: giroEsistente.horaMin,
      consegnaPropostaH: toH(giroEsistente.horaMin),
      motivo: `Se agrupa al giro ${zona.id} ${toH(giroEsistente.horaMin)} (${giroEsistente.count + 1}/${zona.maxOrdiniPerGiro})`,
      aggregato: true,
      outOfServiceWindow: false,
      giroEsistente: { hora: toH(giroEsistente.horaMin), count: giroEsistente.count },
      driverLiberoMin: sim.driverLiberoMin,
      sim,
    };
  }

  const rientroPrec = sim.driverLiberoMin;

  const partTeorica = horaNewMin - tgNew;
  const partReale = Math.max(rientroPrec, partTeorica);
  const consegnaReale = partReale + tgNew;

  const ok = consegnaReale <= horaNewMin;
  const consegnaProposta = ok ? horaNewMin : Math.ceil(consegnaReale / 5) * 5;

  let motivo = null;
  if (!ok) {
    if (sim.giri.length === 0) {
      motivo = `Driver libre solo desde ~${toH(rientroPrec)}`;
    } else if (sim.giri.length === 1) {
      const g = sim.giri[0];
      motivo = `Driver en ${g.zona} ${toH(g.horaMin)} · vuelve ~${toH(g.rientroMin)}`;
    } else {
      motivo = `Driver ocupado hasta ~${toH(rientroPrec)} (${sim.giri.length} entregas en curso)`;
    }
  }

  if (consegnaProposta > latestDeliveryMinute) {
    return outOfService({
      driverLiberoMin: sim.driverLiberoMin,
      tgNew,
      sim,
    });
  }

  return {
    ok,
    consegnaPropostaMin: consegnaProposta,
    consegnaPropostaH: toH(consegnaProposta),
    motivo,
    aggregato: false,
    outOfServiceWindow: false,
    giroEsistente: null,
    driverLiberoMin: sim.driverLiberoMin,
    tgNew,
    sim,
  };
}
