// Pure kitchen/oven capacity helpers.
// Throughput model: the oven is the bottleneck, with about 4 pizzas every 5 minutes.

export const PIZZAS_PER_5_MINUTES = 4;
export const DEFAULT_WINDOW_MINUTES = 10;
export const DEFAULT_SEARCH_LIMIT_MINUTES = 120;

const DEFAULT_INCLUDED_STATES = Object.freeze([
  "POR_CONFIRMAR",
  "EN_COCINA",
  "LISTO",
]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function horaToMinutes(hora) {
  if (hora == null || hora === "") return null;
  const [hh, mm = "0"] = String(hora).split(":");
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToHora(minutes) {
  if (!Number.isFinite(minutes)) return null;
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function floorSlot(hora, slotMinutes) {
  const minutes = horaToMinutes(hora);
  if (minutes == null || slotMinutes <= 0) return null;
  return minutesToHora(Math.floor(minutes / slotMinutes) * slotMinutes);
}

export function slot5(hora) {
  return floorSlot(hora, 5);
}

export function slot10(hora) {
  return floorSlot(hora, 10);
}

export function getKitchenCapacity(windowMinutes = DEFAULT_WINDOW_MINUTES) {
  const safeWindow = Number(windowMinutes) > 0 ? Number(windowMinutes) : DEFAULT_WINDOW_MINUTES;
  return Math.floor(safeWindow / 5) * PIZZAS_PER_5_MINUTES;
}

export function isPizzaItem(item) {
  if (!item || item.n === "Entrega a domicilio") return false;
  const cat = item.cat || "Pizzas";
  if (cat === "Bebidas") return false;
  if (cat === "Postres" && item.n !== "Pizza Nutella") return false;
  return true;
}

export function countPizzas(items) {
  return (Array.isArray(items) ? items : [])
    .filter(isPizzaItem)
    .reduce((sum, item) => {
      const qty = Number.parseInt(item.q ?? item.quantity ?? item.cantidad ?? 1, 10);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0);
}

function getOrderKitchenHora(order, options = {}) {
  if (!order) return null;
  if (typeof options.getHora === "function") return options.getHora(order);
  const field = options.horaField || null;
  if (field) return order[field] || null;
  return order.forno_out || order.hora || null;
}

function shouldCountOrder(order, options = {}) {
  if (!order) return false;
  const includedStates = options.includedStates || DEFAULT_INCLUDED_STATES;
  if (includedStates && order.estado && !includedStates.includes(order.estado)) return false;
  if (typeof options.filterOrder === "function") return options.filterOrder(order);
  return true;
}

export function countPizzasForKitchenWindow(orders, hora, options = {}) {
  const windowMinutes = Number(options.windowMinutes) > 0
    ? Number(options.windowMinutes)
    : DEFAULT_WINDOW_MINUTES;
  const slotMinutes = Number(options.slotMinutes) > 0
    ? Number(options.slotMinutes)
    : windowMinutes;
  const startHora = floorSlot(hora, slotMinutes);
  const start = horaToMinutes(startHora);
  if (start == null) return 0;
  const end = start + windowMinutes;

  return (Array.isArray(orders) ? orders : [])
    .filter(order => shouldCountOrder(order, options))
    .filter(order => {
      const orderMinutes = horaToMinutes(getOrderKitchenHora(order, options));
      return orderMinutes != null && orderMinutes >= start && orderMinutes < end;
    })
    .reduce((sum, order) => sum + countPizzas(order.items), 0);
}

export function suggestNextAvailableKitchenSlot(orders, hora, options = {}) {
  const windowMinutes = Number(options.windowMinutes) > 0
    ? Number(options.windowMinutes)
    : DEFAULT_WINDOW_MINUTES;
  const slotMinutes = Number(options.slotMinutes) > 0
    ? Number(options.slotMinutes)
    : windowMinutes;
  const capacity = Number(options.capacity) > 0
    ? Number(options.capacity)
    : getKitchenCapacity(windowMinutes);
  const searchLimitMinutes = Number(options.searchLimitMinutes) > 0
    ? Number(options.searchLimitMinutes)
    : DEFAULT_SEARCH_LIMIT_MINUTES;

  const startHora = floorSlot(hora, slotMinutes);
  const start = horaToMinutes(startHora);
  if (start == null) return null;

  for (let minutes = start + slotMinutes; minutes <= start + searchLimitMinutes; minutes += slotMinutes) {
    const candidate = minutesToHora(minutes);
    const pizzas = countPizzasForKitchenWindow(orders, candidate, {
      ...options,
      windowMinutes,
      slotMinutes,
    });
    if (pizzas <= capacity) return candidate;
  }

  return null;
}

export function getKitchenCapacityStatus(orders, hora, options = {}) {
  const windowMinutes = Number(options.windowMinutes) > 0
    ? Number(options.windowMinutes)
    : DEFAULT_WINDOW_MINUTES;
  const slotMinutes = Number(options.slotMinutes) > 0
    ? Number(options.slotMinutes)
    : windowMinutes;
  const normalizedHora = floorSlot(hora, slotMinutes);
  const capacity = Number(options.capacity) > 0
    ? Number(options.capacity)
    : getKitchenCapacity(windowMinutes);
  const pizzas = countPizzasForKitchenWindow(orders, normalizedHora || hora, {
    ...options,
    windowMinutes,
    slotMinutes,
  });
  const available = capacity - pizzas;
  const overloaded = pizzas > capacity;

  return {
    hora: normalizedHora || hora || null,
    windowMinutes,
    capacity,
    pizzas,
    available,
    overloaded,
    // If the slot is healthy, the clearest answer is "no move needed".
    suggestedHora: overloaded
      ? suggestNextAvailableKitchenSlot(orders, normalizedHora || hora, {
          ...options,
          windowMinutes,
          slotMinutes,
          capacity,
        })
      : null,
  };
}
