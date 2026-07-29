const words = (value) => String(value ?? "").trim().split(/\s+/).filter(Boolean);

export function maskCustomerName(value) {
  return words(value)
    .map((word) => `${Array.from(word)[0] || ""}***`)
    .join(" ");
}

export function maskCustomerPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const visible = digits.slice(-3);
  return `*** *** ${visible.padStart(3, "*")}`;
}
