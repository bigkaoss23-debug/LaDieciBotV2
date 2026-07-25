// ===============================================================
// useMenuData.js (frontend) — Phase 3A
// Drop-in menu source hook. Returns the SAME shape existing components
// expect ({ MENU, CATS, INGREDIENTI }) plus load/error state.
//
// Flags (build-time, CRA REACT_APP_*):
//   REACT_APP_DYNAMIC_MENU_FRONTEND_ENABLED = "true"  → dynamic getMenu
//   REACT_APP_DYNAMIC_MENU_EMERGENCY_FALLBACK = "true" → allow static
//        constants as a VISIBLE emergency fallback on failure (default false)
//
// OFF/absent → returns static constants unchanged (existing behavior).
// ON + failure → controlled error (no silent constants fallback) unless the
//        emergency flag is set, which surfaces a visible diagnostic marker.
// ===============================================================
import { useState, useEffect, useCallback } from "react";
import { MENU as STATIC_MENU, CATS as STATIC_CATS, INGREDIENTI as STATIC_INGREDIENTI } from "../constants";
import { fetchDynamicMenu } from "./menuClient";

const DYNAMIC_ON = process.env.REACT_APP_DYNAMIC_MENU_FRONTEND_ENABLED === "true";
const EMERGENCY_FALLBACK = process.env.REACT_APP_DYNAMIC_MENU_EMERGENCY_FALLBACK === "true";

const STATIC_SOURCE = {
  MENU: STATIC_MENU, CATS: STATIC_CATS, INGREDIENTI: STATIC_INGREDIENTI,
  ready: true, error: null, source: "static", emergency: false,
};

export function useMenuData() {
  const [state, setState] = useState(() =>
    DYNAMIC_ON
      ? { MENU: [], CATS: [], INGREDIENTI: [], ready: false, error: null, source: "dynamic", emergency: false }
      : STATIC_SOURCE
  );
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!DYNAMIC_ON) return; // static: nothing to load
    let alive = true;
    setState((s) => ({ ...s, ready: false, error: null }));
    fetchDynamicMenu()
      .then((data) => {
        if (!alive) return;
        setState({ ...data, ready: true, error: null, source: "dynamic", emergency: false });
      })
      .catch((err) => {
        if (!alive) return;
        if (EMERGENCY_FALLBACK) {
          // explicit, visible emergency fallback — NOT silent
          console.warn("[menu] DYNAMIC FAILED — EMERGENCY static fallback active:", err.message);
          setState({ ...STATIC_SOURCE, error: err.message, source: "static", emergency: true });
        } else {
          setState({ MENU: [], CATS: [], INGREDIENTI: [], ready: false, error: err.message, source: "dynamic", emergency: false });
        }
      });
    return () => { alive = false; };
  }, [attempt]);

  return { ...state, retry, dynamicEnabled: DYNAMIC_ON };
}
