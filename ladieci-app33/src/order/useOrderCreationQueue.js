import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CONFIRMED_GUARD_MS = 15000;

const requestIdOf = (order) => String(order?.client_req_id || order?.clientRequestId || "");

export const orderIdentity = (order) => {
  if (order?.id) return `id:${order.id}`;
  const requestId = requestIdOf(order);
  return requestId ? `request:${requestId}` : "";
};

export const buildPendingOrder = (order) => {
  const requestId = requestIdOf(order);
  const { id: _localId, ...snapshot } = order;
  return {
    ...snapshot,
    items: Array.isArray(snapshot.items) ? snapshot.items.map(item => ({ ...item })) : snapshot.items,
    client_req_id: requestId,
    clientRequestId: requestId,
    _localKey: `pending:${requestId}`,
    _localPhase: "saving",
    _temp: true,
  };
};

export const mergeOrderCreationQueue = (persistedOrders, pendingOrders, confirmedOrders) => {
  const persisted = Array.isArray(persistedOrders) ? persistedOrders : [];
  const pending = Array.isArray(pendingOrders) ? pendingOrders : [];
  const confirmed = Array.isArray(confirmedOrders) ? confirmedOrders : [];
  const seenIds = new Set(persisted.map(o => o?.id).filter(Boolean).map(String));
  const seenRequests = new Set(persisted.map(requestIdOf).filter(Boolean));
  const additions = [...pending, ...confirmed].filter(order => {
    const id = order?.id ? String(order.id) : "";
    const requestId = requestIdOf(order);
    if ((id && seenIds.has(id)) || (requestId && seenRequests.has(requestId))) return false;
    if (id) seenIds.add(id);
    if (requestId) seenRequests.add(requestId);
    return true;
  });
  return [...additions, ...persisted];
};

export const useOrderCreationQueue = (persistedOrders) => {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [confirmedOrders, setConfirmedOrders] = useState([]);
  const inFlight = useRef(new Set());

  useEffect(() => {
    const ids = new Set((persistedOrders || []).map(o => o?.id).filter(Boolean).map(String));
    const requests = new Set((persistedOrders || []).map(requestIdOf).filter(Boolean));
    setConfirmedOrders(prev => prev.filter(o =>
      !(o.id && ids.has(String(o.id))) && !(requestIdOf(o) && requests.has(requestIdOf(o)))
    ));
  }, [persistedOrders]);

  const begin = useCallback((order) => {
    const requestId = requestIdOf(order);
    if (!requestId || inFlight.current.has(requestId)) return null;
    inFlight.current.add(requestId);
    const pending = buildPendingOrder(order);
    setPendingOrders(prev => [pending, ...prev.filter(o => requestIdOf(o) !== requestId)]);
    return pending;
  }, []);

  const confirm = useCallback((requestId, persistedOrder) => {
    setPendingOrders(prev => prev.filter(o => requestIdOf(o) !== requestId));
    setConfirmedOrders(prev => [
      { ...persistedOrder, _localKey: `confirmed:${requestId}`, _confirmedAt: Date.now() },
      ...prev.filter(o => requestIdOf(o) !== requestId && o.id !== persistedOrder.id),
    ]);
    inFlight.current.delete(requestId);
  }, []);

  const fail = useCallback((requestId) => {
    setPendingOrders(prev => prev.filter(o => requestIdOf(o) !== requestId));
    inFlight.current.delete(requestId);
  }, []);

  const updateConfirmed = useCallback((id, patch) => {
    setConfirmedOrders(prev => prev.map(order => order.id === id ? { ...order, ...patch } : order));
  }, []);

  useEffect(() => {
    if (!confirmedOrders.length) return undefined;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - CONFIRMED_GUARD_MS;
      setConfirmedOrders(prev => prev.filter(o => Number(o._confirmedAt || 0) > cutoff));
    }, CONFIRMED_GUARD_MS);
    return () => clearTimeout(timer);
  }, [confirmedOrders]);

  const visibleOrders = useMemo(
    () => mergeOrderCreationQueue(persistedOrders, pendingOrders, confirmedOrders),
    [persistedOrders, pendingOrders, confirmedOrders]
  );

  return { visibleOrders, pendingOrders, confirmedOrders, begin, confirm, fail, updateConfirmed };
};
