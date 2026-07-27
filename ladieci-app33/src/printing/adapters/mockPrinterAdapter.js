import { MOCK_PRINT_STATUSES, assertTicketDocument, deepFreeze } from "../contracts";

export const MOCK_OUTCOMES = Object.freeze({
  SUCCESS: "success",
  FAILED: "failed",
  UNKNOWN: "unknown",
});

export function createMockPrinterAdapter({ outcome = MOCK_OUTCOMES.SUCCESS, latencyMs = 0 } = {}) {
  if (!Object.values(MOCK_OUTCOMES).includes(outcome)) throw new TypeError(`Unsupported mock outcome: ${String(outcome)}`);
  if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new TypeError("latencyMs must be a non-negative number");
  return {
    async print(document) {
      assertTicketDocument(document);
      if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
      if (outcome === MOCK_OUTCOMES.FAILED) {
        return deepFreeze({ status: MOCK_PRINT_STATUSES.FAILED, ok: false, error_code: "MOCK_FAILURE" });
      }
      if (outcome === MOCK_OUTCOMES.UNKNOWN) {
        return deepFreeze({ status: MOCK_PRINT_STATUSES.UNKNOWN, ok: false, error_code: null });
      }
      return deepFreeze({ status: MOCK_PRINT_STATUSES.PRINTED, ok: true, error_code: null });
    },
  };
}
