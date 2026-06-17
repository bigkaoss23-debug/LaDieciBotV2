// scripts/guard-env-fail-closed.js
// ENV_SPLIT_V1_08 — build guard FAIL-CLOSED per le REACT_APP_* (build-time CRA).
//
// Il bundle del browser inlina REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY
// a build time. Il browser NON può conoscere SITE_ID, quindi la condizione
// "fallback prod solo se prod reale" si applica QUI, al build:
//   - build production reale (SITE_ID = prod)  → fallback prod consentito, passa.
//   - build NON-production (staging/unknown/local) → pretende le REACT_APP_*
//     esplicite e NON-prod, altrimenti FA FALLIRE il build (exit 1).
// Così nessun bundle V1/staging cade silenziosamente su Supabase prod.
//
// Non stampa segreti: logga solo SITE_ID/CONTEXT e i NOMI delle env mancanti.

const PROD_SITE_ID    = "02bd4c7a-a50b-4964-90da-8c1af1122932";
const STAGING_SITE_ID = "a3ad035a-e73f-4da3-8873-6403e31f04b6";
const PROD_REF        = "wnswassgfuuivmfwjxsf";

const siteId = (process.env.SITE_ID || "").trim();
const ctx    = process.env.CONTEXT || "local";
const url    = (process.env.REACT_APP_SUPABASE_URL || "").trim();
const key    = (process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();
const isRealProd = siteId === PROD_SITE_ID;

function fail(msg) {
  console.error("\n[guard-env-fail-closed] 🛑 BUILD BLOCCATO: " + msg + "\n");
  process.exit(1);
}

if (isRealProd) {
  console.log("[guard-env-fail-closed] build PRODUCTION reale (SITE_ID prod) → fallback prod consentito. OK.");
  process.exit(0);
}

// Build NON-production: staging / unknown / local → env esplicite obbligatorie.
const missing = [];
if (!url) missing.push("REACT_APP_SUPABASE_URL");
if (!key) missing.push("REACT_APP_SUPABASE_ANON_KEY");
if (missing.length) {
  fail("build NON-production (SITE_ID='" + (siteId || "?") + "', CONTEXT='" + ctx +
    "') senza " + missing.join(", ") +
    ". Impostare le env Supabase staging esplicite (fail-closed: niente default prod).");
}
if (url.includes(PROD_REF)) {
  fail("build NON-production punta a Supabase PROD (" + PROD_REF +
    "). Vietato in V1/staging.");
}

const tag = siteId === STAGING_SITE_ID ? "V1 staging" : "non-prod";
console.log("[guard-env-fail-closed] build " + tag +
  " con REACT_APP_SUPABASE_* esplicite e non-prod (SITE_ID='" + (siteId || "?") + "'). OK.");
