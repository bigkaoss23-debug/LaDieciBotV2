import { useEffect, useRef, useState } from "react";
import "./TicketQuickAction.css";

const parseItems = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const isValidItem = (item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const name = String(item.name ?? item.n ?? "").trim();
  const quantity = Number(item.quantity ?? item.q ?? item.qty ?? 1);
  return !!name && Number.isInteger(quantity) && quantity > 0;
};

export function isTicketQuickActionOrderValid(order) {
  if (!order || typeof order !== "object" || Array.isArray(order)) return false;
  if (!String(order.id ?? "").trim() || order._temp) return false;
  return parseItems(order.items).some(isValidItem);
}

export default function TicketQuickAction({
  order,
  onOpenTicket,
  variant = "default",
  className = "",
}) {
  const valid = isTicketQuickActionOrderValid(order) && typeof onOpenTicket === "function";
  const clickLock = useRef(false);
  const releaseTimer = useRef(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
  }, []);

  useEffect(() => {
    clickLock.current = false;
    setLocked(false);
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = null;
  }, [order, onOpenTicket]);

  if (!valid) return null;

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (clickLock.current) return;

    clickLock.current = true;
    setLocked(true);
    try {
      onOpenTicket(order);
    } catch (error) {
      clickLock.current = false;
      setLocked(false);
      throw error;
    }

    releaseTimer.current = setTimeout(() => {
      clickLock.current = false;
      setLocked(false);
      releaseTimer.current = null;
    }, 600);
  };

  return (
    <button
      type="button"
      className={`ticket-quick-action ticket-quick-action--${variant} ${className}`.trim()}
      onClick={handleClick}
      disabled={locked}
      aria-label="Abrir ticket del pedido"
    >
      🖨 Ticket
    </button>
  );
}
