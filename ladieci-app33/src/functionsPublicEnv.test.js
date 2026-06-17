// src/functionsPublicEnv.test.js
// ENV_SPLIT_V1_17 — test del generated public env per le Netlify functions.
//   A) resolver _env.js che consuma il `generated` (iniettato): PASS / fail-closed
//      / fail su ref prod / fallback prod reale.
//   B) lo script generate-functions-public-env.js: produce SOLO le 3 config
//      pubbliche, blocca i build non-prod incompleti o che puntano a prod, e non
//      scrive MAI segreti server.
// Nessuna rete, nessun segreto reale. Lo script gira in child process con env finte.

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  resolveBackendUrl, resolveSupabase,
  PROD_SITE_ID, STAGING_SITE_ID,
} = require('../netlify/functions/_env');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'generate-functions-public-env.js');
const OUT    = path.join(__dirname, '..', 'netlify', 'functions', '_publicEnv.generated.js');

// env finte ma realistiche (non-segrete)
const STG_BACKEND  = 'https://fearless-reverence-production-80bc.up.railway.app';
const STG_SUPA_URL = 'https://tdikhfeinufaahagmpjz.supabase.co';
const STG_ANON     = 'sb_publishable_qMYSRpFm1TQ4S04nD8Bw3Q_7Fc92qaS';

// ─── A) resolver con generated iniettato ─────────────────────────────────────
describe('V1_17 resolver con _publicEnv.generated', () => {
  const generated = {
    BACKEND_API_URL: STG_BACKEND + '/api',
    SUPABASE_URL: STG_SUPA_URL,
    SUPABASE_ANON_KEY: STG_ANON,
  };

  test('staging senza process.env ma con generated → PASS', () => {
    const b = resolveBackendUrl({ SITE_ID: STAGING_SITE_ID }, generated);
    expect(b.error).toBeUndefined();
    expect(b.url).toBe(STG_BACKEND + '/api');
    expect(b.source).toBe('generated');

    const s = resolveSupabase({ SITE_ID: STAGING_SITE_ID }, generated);
    expect(s.error).toBeUndefined();
    expect(s.url).toBe(STG_SUPA_URL);
    expect(s.key).toBe(STG_ANON);
    expect(s.source).toBe('generated');
  });

  test('staging senza process.env e senza generated → fail-closed', () => {
    const b = resolveBackendUrl({ SITE_ID: STAGING_SITE_ID }, {});
    expect(b.url).toBeUndefined();
    expect(b.error).toMatch(/fail-closed/i);

    const s = resolveSupabase({ SITE_ID: STAGING_SITE_ID }, {});
    expect(s.url).toBeUndefined();
    expect(s.error).toMatch(/fail-closed/i);
  });

  test('staging con generated che punta a PROD → FAIL', () => {
    const b = resolveBackendUrl({ SITE_ID: STAGING_SITE_ID }, {
      BACKEND_API_URL: 'https://ladiecibot-production.up.railway.app/api',
    });
    expect(b.url).toBeUndefined();
    expect(b.error).toMatch(/PROD/);

    const s = resolveSupabase({ SITE_ID: STAGING_SITE_ID }, {
      SUPABASE_URL: 'https://wnswassgfuuivmfwjxsf.supabase.co',
      SUPABASE_ANON_KEY: STG_ANON,
    });
    expect(s.url).toBeUndefined();
    expect(s.error).toMatch(/PROD/);
  });

  test('production reale senza env/generated → fallback prod PASS', () => {
    const b = resolveBackendUrl({ SITE_ID: PROD_SITE_ID }, {});
    expect(b.error).toBeUndefined();
    expect(b.prodFallback).toBe(true);
    expect(b.url).toMatch(/ladiecibot-production/);

    const s = resolveSupabase({ SITE_ID: PROD_SITE_ID }, {});
    expect(s.error).toBeUndefined();
    expect(s.prodFallback).toBe(true);
    expect(s.url).toMatch(/wnswassgfuuivmfwjxsf/);
  });

  test('production reale NON consuma generated staging (mai downgrade)', () => {
    // anche se passiamo un generated staging, prod reale ignora il generated.
    const b = resolveBackendUrl({ SITE_ID: PROD_SITE_ID }, generated);
    expect(b.url).toMatch(/ladiecibot-production/);
    expect(b.source).toBe('prod-fallback');
  });
});

// ─── B) lo script generator ──────────────────────────────────────────────────
describe('V1_17 generate-functions-public-env.js', () => {
  function runGenerator(env) {
    return execFileSync('node', [SCRIPT], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  }
  function cleanup() {
    if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  }
  afterEach(cleanup);
  afterAll(cleanup);

  test('staging → genera SOLO le 3 config pubbliche, niente segreti server', () => {
    runGenerator({
      SITE_ID: STAGING_SITE_ID,
      CONTEXT: 'branch-deploy',
      REACT_APP_BACKEND_API_URL: STG_BACKEND,
      REACT_APP_SUPABASE_URL: STG_SUPA_URL,
      REACT_APP_SUPABASE_ANON_KEY: STG_ANON,
      // segreti server presenti nel build env: NON devono finire nell'output
      SUPABASE_KEY: 'sb_secret_NON_DEVE_USCIRE',
      SUPABASE_SERVICE_KEY: 'sb_secret_NON_DEVE_USCIRE2',
      JWT_SECRET: 'jwt_NON_DEVE_USCIRE',
      RAILWAY_API_KEY: 'ld_NON_DEVE_USCIRE',
      WA_ACCESS_TOKEN: 'wa_NON_DEVE_USCIRE',
      ANTHROPIC_KEY: 'sk-ant-NON_DEVE_USCIRE',
    });
    expect(fs.existsSync(OUT)).toBe(true);
    const gen = require(OUT);
    expect(gen).toEqual({
      BACKEND_API_URL: STG_BACKEND + '/api',
      SUPABASE_URL: STG_SUPA_URL,
      SUPABASE_ANON_KEY: STG_ANON,
    });
    // nessun segreto server nel file, in nessuna forma
    const raw = fs.readFileSync(OUT, 'utf8');
    for (const secret of ['SUPABASE_KEY', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET',
      'RAILWAY_API_KEY', 'WA_ACCESS_TOKEN', 'WA_PHONE_ID', 'WA_VERIFY_TOKEN',
      'ANTHROPIC_KEY', 'sb_secret', 'NON_DEVE_USCIRE']) {
      expect(raw).not.toMatch(new RegExp(secret));
    }
  });

  test('staging con env mancanti → build BLOCCATO (exit non-zero), niente file', () => {
    cleanup();
    expect(() => runGenerator({
      SITE_ID: STAGING_SITE_ID,
      CONTEXT: 'branch-deploy',
      REACT_APP_BACKEND_API_URL: '',
      REACT_APP_SUPABASE_URL: '',
      REACT_APP_SUPABASE_ANON_KEY: '',
      BACKEND_API_URL: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
    })).toThrow();
    expect(fs.existsSync(OUT)).toBe(false);
  });

  test('staging che punta a PROD → build BLOCCATO, niente file', () => {
    cleanup();
    expect(() => runGenerator({
      SITE_ID: STAGING_SITE_ID,
      CONTEXT: 'branch-deploy',
      REACT_APP_BACKEND_API_URL: 'https://ladiecibot-production.up.railway.app',
      REACT_APP_SUPABASE_URL: 'https://wnswassgfuuivmfwjxsf.supabase.co',
      REACT_APP_SUPABASE_ANON_KEY: STG_ANON,
      BACKEND_API_URL: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
    })).toThrow();
    expect(fs.existsSync(OUT)).toBe(false);
  });

  test('production reale → nessun file generato (usa prod-fallback gated)', () => {
    cleanup();
    const out = runGenerator({
      SITE_ID: PROD_SITE_ID,
      CONTEXT: 'production',
      REACT_APP_BACKEND_API_URL: '', REACT_APP_SUPABASE_URL: '', REACT_APP_SUPABASE_ANON_KEY: '',
      BACKEND_API_URL: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
    });
    expect(out).toMatch(/nessun file generato/);
    expect(fs.existsSync(OUT)).toBe(false);
  });
});
