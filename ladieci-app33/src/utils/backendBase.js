// src/utils/backendBase.js
// ENV_SPLIT_V1_12 — base URL del backend Railway per gli endpoint PUBBLICI non
// proxati che il browser chiama direttamente (/status, /health). Bypassano il
// proxy Netlify perché non sono autenticati e non passano da /api?action=...
//
// Env-based (build-time CRA, prefisso REACT_APP_). FAIL-CLOSED come Supabase:
// il default prod sotto NON è silenzioso — il build-guard
// scripts/guard-env-fail-closed.js FA FALLIRE ogni build NON-production
// (SITE_ID ≠ prod) che non imposti REACT_APP_BACKEND_API_URL esplicito.
// Quindi questo default prod viene inlineato SOLO nel build production reale;
// un bundle V1/staging senza env non compila e non può puntare a prod.
//
// Il default vive QUI di proposito, fuori dai componenti V1/staging (api.js,
// ServicioPage.jsx): quei file non devono contenere alcun hardcode prod.
// Nessun segreto: è un URL pubblico, niente token.
const PROD_BACKEND_BASE = "https://ladiecibot-production.up.railway.app";

export const BACKEND_BASE_URL =
  (process.env.REACT_APP_BACKEND_API_URL || PROD_BACKEND_BASE).replace(/\/+$/, "");
