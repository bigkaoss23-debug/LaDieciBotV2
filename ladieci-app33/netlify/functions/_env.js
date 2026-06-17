// netlify/functions/_env.js
// ENV_SPLIT_V1_08 / V1_17 — resolver env FAIL-CLOSED per le Netlify functions.
//
// Ordine di risoluzione:
//   1) process.env (store Netlify / build env) — sorgente preferita.
//   2) _publicEnv.generated.js (V1_17) — file pubblico materializzato a build-time
//      dallo script generate-functions-public-env.js, usato SOLO in non-prod,
//      perché sul sito git-linked V1 le functions non ricevono lo store env utente.
//   3) fallback default PRODUCTION — permesso SOLO sul sito di produzione reale
//      (riconosciuto da SITE_ID). In V1/staging/preview/unknown niente fallback prod.
//
// Regola dura: in deploy NON-production una config che punta a prod
// (ladiecibot-production / wnswassgfuuivmfwjxsf) è un errore (fail-closed), sia che
// arrivi da process.env sia dal generated. Nessun segreto viene loggato o stampato
// qui; i default prod restano stringhe SOLO per il path production reale.

const PROD_SITE_ID    = "02bd4c7a-a50b-4964-90da-8c1af1122932";
const STAGING_SITE_ID = "a3ad035a-e73f-4da3-8873-6403e31f04b6";

// Ref prod vietati nei deploy non-production.
const PROD_BACKEND_REF  = "ladiecibot-production";
const PROD_SUPABASE_REF = "wnswassgfuuivmfwjxsf";

// Default PRODUCTION — usati SOLO se isRealProd().
const PROD_BACKEND       = "https://ladiecibot-production.up.railway.app/api";
const PROD_SUPABASE_URL  = "https://wnswassgfuuivmfwjxsf.supabase.co";
const PROD_SUPABASE_ANON = "sb_publishable_esObmXoAcWH9z27Sj_-jtw_PO0VeL5O";

function nonEmpty(v) { return typeof v === "string" && v.trim() !== ""; }
function siteId(env)  { return ((env || process.env).SITE_ID || "").trim(); }
function isRealProd(env) { return siteId(env) === PROD_SITE_ID; }
function isStaging(env)  { return siteId(env) === STAGING_SITE_ID; }

// Carica il file pubblico generato a build-time, se presente. In dev/CI/test il
// file non esiste → {} (nessun throw). Il modulo è opzionale per definizione.
function loadGenerated() {
  try {
    return require('./_publicEnv.generated.js') || {};
  } catch (e) {
    return {};
  }
}

// Risolve l'URL del backend (usato da api.js). Ritorna {url} oppure {error}.
// `generated` è iniettabile nei test; in runtime arriva da loadGenerated().
function resolveBackendUrl(env, generated) {
  env = env || process.env;

  // 1) process.env esplicito.
  const explicit = env.BACKEND_API_URL;
  if (nonEmpty(explicit)) {
    return checkBackend(explicit, env, "env");
  }
  // 2) generated public env — solo non-prod.
  if (!isRealProd(env)) {
    const gen = generated || loadGenerated();
    if (nonEmpty(gen.BACKEND_API_URL)) {
      return checkBackend(gen.BACKEND_API_URL, env, "generated");
    }
  }
  // 3) fallback prod — solo produzione reale.
  if (isRealProd(env)) {
    return { url: PROD_BACKEND, source: "prod-fallback", prodFallback: true };
  }
  return {
    error: "BACKEND_API_URL mancante in un deploy non-production (SITE_ID='" +
      (siteId(env) || "?") + "'). Fail-closed: nessun fallback al backend prod. " +
      "Impostare BACKEND_API_URL sul sito V1/staging o generare _publicEnv."
  };
}

function checkBackend(url, env, source) {
  const clean = url.trim().replace(/\/+$/, "");
  if (!isRealProd(env) && clean.includes(PROD_BACKEND_REF)) {
    return {
      error: "BACKEND_API_URL punta al backend PROD (" + PROD_BACKEND_REF +
        ") in un deploy non-production (SITE_ID='" + (siteId(env) || "?") +
        "', source=" + source + "). Fail-closed: vietato in V1/staging."
    };
  }
  return { url: clean, source };
}

// Risolve URL+key Supabase (usato da auth.js). Ritorna {url,key} oppure {error}.
function resolveSupabase(env, generated) {
  env = env || process.env;
  let url    = env.SUPABASE_URL;
  let key    = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
  let source = "env";

  // 2) completa da generated (solo non-prod) ciò che manca da process.env.
  if (!(nonEmpty(url) && nonEmpty(key)) && !isRealProd(env)) {
    const gen = generated || loadGenerated();
    if (!nonEmpty(url) && nonEmpty(gen.SUPABASE_URL))      { url = gen.SUPABASE_URL;      source = "generated"; }
    if (!nonEmpty(key) && nonEmpty(gen.SUPABASE_ANON_KEY)) { key = gen.SUPABASE_ANON_KEY; source = "generated"; }
  }

  if (nonEmpty(url) && nonEmpty(key)) {
    if (!isRealProd(env) && url.includes(PROD_SUPABASE_REF)) {
      return {
        error: "SUPABASE_URL punta a Supabase PROD (" + PROD_SUPABASE_REF +
          ") in un deploy non-production (SITE_ID='" + (siteId(env) || "?") +
          "', source=" + source + "). Fail-closed: vietato in V1/staging."
      };
    }
    return { url: url.trim(), key: key, source };
  }

  // 3) fallback prod — solo produzione reale.
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
  loadGenerated,
};
