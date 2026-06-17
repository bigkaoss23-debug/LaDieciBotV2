// src/functionsEnvResolver.test.js
// ENV_SPLIT_V1_08 — unit test del resolver fail-closed delle Netlify functions.
// Esegue la logica reale di _env.js con env simulate (nessuna rete, nessun segreto).
const {
  resolveBackendUrl, resolveSupabase, isRealProd,
  PROD_SITE_ID, STAGING_SITE_ID,
} = require('../netlify/functions/_env');

describe('resolveBackendUrl (api.js)', () => {
  test('staging + BACKEND_API_URL mancante → ERRORE (fail-closed)', () => {
    const r = resolveBackendUrl({ SITE_ID: STAGING_SITE_ID });
    expect(r.url).toBeUndefined();
    expect(r.error).toMatch(/fail-closed/i);
  });

  test('staging + BACKEND_API_URL presente → OK, usa quella', () => {
    const r = resolveBackendUrl({ SITE_ID: STAGING_SITE_ID, BACKEND_API_URL: 'https://v1.example/api/' });
    expect(r.error).toBeUndefined();
    expect(r.url).toBe('https://v1.example/api'); // trailing slash rimosso
  });

  test('prod reale + BACKEND_API_URL mancante → fallback prod consentito', () => {
    const r = resolveBackendUrl({ SITE_ID: PROD_SITE_ID });
    expect(r.error).toBeUndefined();
    expect(r.url).toMatch(/ladiecibot-production/);
    expect(r.prodFallback).toBe(true);
  });

  test('SITE_ID sconosciuto + env mancante → ERRORE', () => {
    const r = resolveBackendUrl({ SITE_ID: 'qualcosa-di-ignoto' });
    expect(r.url).toBeUndefined();
    expect(r.error).toBeTruthy();
  });

  test('SITE_ID assente del tutto + env mancante → ERRORE', () => {
    const r = resolveBackendUrl({});
    expect(r.error).toBeTruthy();
  });
});

describe('resolveSupabase (auth.js)', () => {
  test('staging senza SUPABASE_URL/KEY → ERRORE', () => {
    const r = resolveSupabase({ SITE_ID: STAGING_SITE_ID });
    expect(r.url).toBeUndefined();
    expect(r.error).toMatch(/SUPABASE_URL/);
  });

  test('staging con SUPABASE_URL ma SENZA key → ERRORE', () => {
    const r = resolveSupabase({ SITE_ID: STAGING_SITE_ID, SUPABASE_URL: 'https://stg.supabase.co' });
    expect(r.error).toMatch(/SUPABASE_ANON_KEY|SUPABASE_KEY/);
  });

  test('staging con URL + anon key → OK', () => {
    const r = resolveSupabase({ SITE_ID: STAGING_SITE_ID, SUPABASE_URL: 'https://stg.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_stg' });
    expect(r.error).toBeUndefined();
    expect(r.url).toBe('https://stg.supabase.co');
    expect(r.key).toBe('sb_publishable_stg');
  });

  test('prod reale senza env → fallback prod consentito', () => {
    const r = resolveSupabase({ SITE_ID: PROD_SITE_ID });
    expect(r.error).toBeUndefined();
    expect(r.url).toMatch(/wnswassgfuuivmfwjxsf/);
    expect(r.prodFallback).toBe(true);
  });

  test('preferisce service key se presente', () => {
    const r = resolveSupabase({ SITE_ID: STAGING_SITE_ID, SUPABASE_URL: 'https://stg.supabase.co', SUPABASE_SERVICE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon' });
    expect(r.key).toBe('svc');
  });
});

describe('isRealProd', () => {
  test('vero solo per il SITE_ID di produzione', () => {
    expect(isRealProd({ SITE_ID: PROD_SITE_ID })).toBe(true);
    expect(isRealProd({ SITE_ID: STAGING_SITE_ID })).toBe(false);
    expect(isRealProd({})).toBe(false);
  });
});
