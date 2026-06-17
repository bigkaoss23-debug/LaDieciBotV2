// scripts/generate-functions-public-env.js
// ENV_SPLIT_V1_17 — genera netlify/functions/_publicEnv.generated.js a build-time.
//
// Problema (V1_07 → V1_16): sul sito git-linked V1 le Netlify Functions runtime
// NON ricevono lo store env utente; arrivano solo poche var account-level. Le
// functions cadevano in fail-closed (503) e l'app staging restava inoperativa.
//
// Soluzione: le 3 config necessarie alle functions sono NON-SEGRETE (URL backend
// V1, URL Supabase staging, anon/publishable key Supabase) — finiscono comunque
// nel bundle browser. Le materializziamo a build-time in un file che il deploy
// delle functions include. Le sorgenti sono il build env già disponibile.
//
// ⛔ VIETATO scrivere qui segreti server: SUPABASE_KEY/service_role, JWT_SECRET,
//    RAILWAY_API_KEY, WA_ACCESS_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, ANTHROPIC_KEY.
//
// Path production NON toccato: sul sito di produzione reale (SITE_ID prod) NON si
// genera nulla — le functions usano il fallback prod gated dentro _env.js. In
// V1/staging mai fallback prod. Log safe: solo host/ref, mai token interi.

const fs   = require('fs');
const path = require('path');

const PROD_SITE_ID      = "02bd4c7a-a50b-4964-90da-8c1af1122932";
const PROD_BACKEND_REF  = "ladiecibot-production";
const PROD_SUPABASE_REF = "wnswassgfuuivmfwjxsf";

const OUT = path.join(__dirname, '..', 'netlify', 'functions', '_publicEnv.generated.js');

const siteId     = (process.env.SITE_ID || "").trim();
const ctx        = process.env.CONTEXT || "local";
const isRealProd = siteId === PROD_SITE_ID;

function nonEmpty(v) { return typeof v === "string" && v.trim() !== ""; }
function fail(msg)   { console.error("\n[generate-functions-public-env] 🛑 " + msg + "\n"); process.exit(1); }

// Backend: preferisci BACKEND_API_URL (già con suffisso /api, da netlify.toml),
// altrimenti normalizza REACT_APP_BACKEND_API_URL aggiungendo /api se manca.
function deriveBackend() {
  const explicit = (process.env.BACKEND_API_URL || "").trim();
  if (nonEmpty(explicit)) return explicit.replace(/\/+$/, "");
  const base = (process.env.REACT_APP_BACKEND_API_URL || "").trim().replace(/\/+$/, "");
  if (!nonEmpty(base)) return "";
  return /\/api$/.test(base) ? base : base + "/api";
}

const BACKEND_API_URL   = deriveBackend();
const SUPABASE_URL      = (process.env.SUPABASE_URL      || process.env.REACT_APP_SUPABASE_URL      || "").trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || "").trim();

// PRODUCTION reale → niente file generato: le functions usano il prod-fallback
// gated in _env.js. Skip pulito, senza far fallire il build.
if (isRealProd) {
  console.log("[generate-functions-public-env] build PRODUCTION reale (SITE_ID prod) → nessun file generato (functions usano prod-fallback gated). OK.");
  process.exit(0);
}

// Build NON-production: le 3 config pubbliche sono obbligatorie e NON devono
// puntare a prod (fail-closed, coerente con guard-env-fail-closed).
const missing = [];
if (!nonEmpty(BACKEND_API_URL))   missing.push("BACKEND_API_URL (da REACT_APP_BACKEND_API_URL)");
if (!nonEmpty(SUPABASE_URL))      missing.push("SUPABASE_URL (da REACT_APP_SUPABASE_URL)");
if (!nonEmpty(SUPABASE_ANON_KEY)) missing.push("SUPABASE_ANON_KEY (da REACT_APP_SUPABASE_ANON_KEY)");
if (missing.length) {
  fail("build non-production (SITE_ID='" + (siteId || "?") + "', CONTEXT='" + ctx +
    "') senza " + missing.join(", ") + ". Impossibile generare _publicEnv per le functions.");
}
if (BACKEND_API_URL.includes(PROD_BACKEND_REF)) {
  fail("BACKEND_API_URL punta al backend PROD (" + PROD_BACKEND_REF + ") in build non-production. Vietato in V1/staging.");
}
if (SUPABASE_URL.includes(PROD_SUPABASE_REF)) {
  fail("SUPABASE_URL punta a Supabase PROD (" + PROD_SUPABASE_REF + ") in build non-production. Vietato in V1/staging.");
}

const body =
`// _publicEnv.generated.js — GENERATO da scripts/generate-functions-public-env.js (ENV_SPLIT_V1_17).
// NON committare, NON modificare a mano. Rigenerato ad ogni build non-production.
// Contiene SOLO config pubbliche (URL backend V1, URL Supabase staging, anon key).
// Nessun segreto server (service_role / JWT / RAILWAY / WA / ANTHROPIC) deve mai finire qui.
module.exports = {
  BACKEND_API_URL: ${JSON.stringify(BACKEND_API_URL)},
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)}
};
`;

fs.writeFileSync(OUT, body, 'utf8');

// Log safe: host/ref, mai token interi (anon key è pubblica ma non la stampiamo tutta).
const host = (u) => { try { return new URL(u).host; } catch (e) { return "?"; } };
const keyHint = SUPABASE_ANON_KEY.slice(0, 12) + "…(" + SUPABASE_ANON_KEY.length + " chars)";
console.log("[generate-functions-public-env] scritto " + path.relative(path.join(__dirname, '..'), OUT) +
  " (SITE_ID='" + (siteId || "?") + "', CONTEXT='" + ctx + "')");
console.log("  backend host:  " + host(BACKEND_API_URL));
console.log("  supabase host: " + host(SUPABASE_URL) + " (anon key " + keyHint + ")");
