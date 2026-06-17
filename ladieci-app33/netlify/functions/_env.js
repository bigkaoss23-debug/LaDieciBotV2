// netlify/functions/_env.js
// ENV_SPLIT_V1_08 — resolver env FAIL-CLOSED per le Netlify functions.
//
// Regola: il fallback ai default PRODUCTION è permesso SOLO sul sito di
// produzione reale, riconosciuto da SITE_ID. In V1/staging/deploy-preview o in
// contesti sconosciuti, se l'env esplicita manca → ERRORE (CONFIG_ERROR): niente
// fallback prod silenzioso (era la causa del fail-open in ENV_SPLIT_V1_07).
//
// Nessun segreto viene loggato o stampato qui. I default prod restano come
// stringhe SOLO per il path production reale; gli errori non contengono segreti.

const PROD_SITE_ID    = "02bd4c7a-a50b-4964-90da-8c1af1122932";
const STAGING_SITE_ID = "a3ad035a-e73f-4da3-8873-6403e31f04b6";

// Default PRODUCTION — usati SOLO se isRealProd().
const PROD_BACKEND       = "https://ladiecibot-production.up.railway.app/api";
const PROD_SUPABASE_URL  = "https://wnswassgfuuivmfwjxsf.supabase.co";
const PROD_SUPABASE_ANON = "sb_publishable_esObmXoAcWH9z27Sj_-jtw_PO0VeL5O";

function nonEmpty(v) { return typeof v === "string" && v.trim() !== ""; }
function siteId(env)  { return ((env || process.env).SITE_ID || "").trim(); }
function isRealProd(env) { return siteId(env) === PROD_SITE_ID; }
function isStaging(env)  { return siteId(env) === STAGING_SITE_ID; }

// Risolve l'URL del backend (usato da api.js). Ritorna {url} oppure {error}.
function resolveBackendUrl(env) {
  env = env || process.env;
  const explicit = env.BACKEND_API_URL;
  if (nonEmpty(explicit)) {
    return { url: explicit.trim().replace(/\/+$/, ""), source: "env" };
  }
  if (isRealProd(env)) {
    return { url: PROD_BACKEND, source: "prod-fallback", prodFallback: true };
  }
  return {
    error: "BACKEND_API_URL mancante in un deploy non-production (SITE_ID='" +
      (siteId(env) || "?") + "'). Fail-closed: nessun fallback al backend prod. " +
      "Impostare BACKEND_API_URL sul sito V1/staging."
  };
}

// Risolve URL+key Supabase (usato da auth.js). Ritorna {url,key} oppure {error}.
function resolveSupabase(env) {
  env = env || process.env;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
  if (nonEmpty(url) && nonEmpty(key)) {
    return { url: url.trim(), key: key, source: "env" };
  }
  if (isRealProd(env)) {
    return {
      url: nonEmpty(url) ? url.trim() : PROD_SUPABASE_URL,
      key: nonEmpty(key) ? key : PROD_SUPABASE_ANON,
      source: "prod-fallback", prodFallback: true
    };
  }
  const missing = [];
  if (!nonEmpty(url)) missing.push("SUPABASE_URL");
  if (!nonEmpty(key)) missing.push("SUPABASE_ANON_KEY/SUPABASE_KEY");
  return {
    error: "Config Supabase incompleta in deploy non-production (SITE_ID='" +
      (siteId(env) || "?") + "'): manca " + missing.join(", ") +
      ". Fail-closed: nessun fallback a Supabase prod."
  };
}

module.exports = {
  PROD_SITE_ID, STAGING_SITE_ID,
  isRealProd, isStaging,
  resolveBackendUrl, resolveSupabase,
};
