import { ORDER_STATES, normalizeOrderState } from "./stateMachine";

export function buildOrderCreationIntent({
  tempId,
  clientReqId,
  source = "unknown",
  canal = "unknown",
  initialState,
  component = "unknown",
  action = "createOrder",
  timestamp,
  metadata = {},
} = {}) {
  return {
    tempId: tempId || null,
    clientReqId: clientReqId || null,
    source,
    canal,
    initialState: initialState == null ? null : normalizeOrderState(initialState),
    component,
    action,
    timestamp: timestamp || new Date().toISOString(),
    metadata,
  };
}

export function buildWaOrderCreationIntent({
  tempId,
  clientReqId,
  waMsgId,
  waId,
  hora,
  items,
  component = "unknown",
  action = "waConfirm.createOrder",
  timestamp,
  metadata = {},
} = {}) {
  return buildOrderCreationIntent({
    tempId,
    clientReqId,
    source: "whatsapp",
    canal: "WA",
    initialState: ORDER_STATES.EN_COCINA,
    component,
    action,
    timestamp,
    metadata: {
      waMsgId: waMsgId || null,
      waId: waId || null,
      hora: hora || null,
      itemsCount: Array.isArray(items) ? items.length : 0,
      hasClientReqId: !!clientReqId,
      temp: true,
      ...metadata,
    },
  });
}

export function buildOperatorOrderCreationIntent(order, {
  component = "unknown",
  action = "addOrden",
  timestamp,
  metadata = {},
} = {}) {
  const hasDescuento = !!(order?.descuento_tipo && order?.descuento_valor != null);
  return buildOrderCreationIntent({
    tempId: order?.id,
    clientReqId: order?.client_req_id,
    source: "operator",
    canal: order?.canal || "unknown",
    initialState: order?.estado,
    component,
    action,
    timestamp,
    metadata: {
      tipo_consegna: order?.tipo_consegna || null,
      itemsCount: Array.isArray(order?.items) ? order.items.length : 0,
      hasClienteId: !!order?.cliente_id,
      hasTelefono: !!order?.tel,
      hasDireccion: !!order?.direccion,
      zona: order?.zona || null,
      zonaManuale: !!order?.zona_manuale,
      forzado: !!order?.forzado,
      yaPagado: !!order?.ya_pagado,
      hasDescuento,
      temp: true,
      ...metadata,
    },
  });
}
