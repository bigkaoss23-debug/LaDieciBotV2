// Same crypto.randomUUID()-with-fallback pattern already used for order idempotency
// keys (see src/components/ServicioPage.jsx, `reqId`) — reused here for consistency
// rather than inventing a second generator.
export function generateClientRequestId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('access-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
}
