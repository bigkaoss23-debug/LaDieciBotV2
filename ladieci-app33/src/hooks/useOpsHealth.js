// OPS-HEALTH-01-FE-BADGE — hook polling /status backend.
//
// Politica:
// - polling ogni 30s
// - timeout client 4s (gestito dentro api.getStatus)
// - niente suoni, niente notification, niente localStorage
// - fail tolerance:
//   - 1 fail isolato → mantiene il livello precedente, non grida
//   - 3 fail consecutivi → forza level="red" (sin conexión)
// - cleanup interval su unmount
//
// Stato esposto:
// { level, payload, fetchFailCount, lastError, lastCheckedAt }

import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const POLL_MS = 30000;
const FAIL_RED_THRESHOLD = 3;

export function useOpsHealth({ enabled = true } = {}) {
  const [state, setState] = useState({
    level: "checking",
    payload: null,
    fetchFailCount: 0,
    lastError: null,
    lastCheckedAt: null,
  });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return undefined;
    let cancelled = false;

    async function tick() {
      try {
        const data = await api.getStatus();
        if (cancelled || !mounted.current) return;
        setState({
          level: (data && data.level) || "yellow",
          payload: data || null,
          fetchFailCount: 0,
          lastError: null,
          lastCheckedAt: Date.now(),
        });
      } catch (e) {
        if (cancelled || !mounted.current) return;
        setState(prev => {
          const next = (prev.fetchFailCount || 0) + 1;
          const fallbackLevel = next >= FAIL_RED_THRESHOLD
            ? "red"
            : (prev.payload && prev.payload.level) || prev.level || "yellow";
          return {
            level: fallbackLevel,
            payload: prev.payload,
            fetchFailCount: next,
            lastError: String((e && e.message) || e).slice(0, 80),
            lastCheckedAt: Date.now(),
          };
        });
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(id);
    };
  }, [enabled]);

  return state;
}
