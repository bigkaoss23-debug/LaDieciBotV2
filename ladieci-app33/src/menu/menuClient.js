// ===============================================================
// menuClient.js (frontend) — Phase 3A
// Fetches getMenu through the existing authenticated proxy (api.getMenu),
// with a shared module-level in-flight promise so concurrent consumers
// share one request. No silent hardcoded fallback here.
// ===============================================================
import { api } from "../api";
import { toLegacyMenu } from "./menuAdapter";

let _inFlight = null;

// Returns the adapted legacy menu, or throws (caller shows controlled error).
export async function fetchDynamicMenu() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const payload = await api.getMenu();
      if (!payload || payload.error) {
        throw new Error("getMenu failed: " + (payload && payload.error ? payload.error : "no payload"));
      }
      return toLegacyMenu(payload);
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}
