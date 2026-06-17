// src/envConfig.audit.test.js
// ENV_SPLIT_V1_08 — static guard: la config backend/Supabase è FAIL-CLOSED.
// Il fallback prod è permesso SOLO sul sito di produzione reale (SITE_ID); in
// V1/staging/preview, env mancanti → errore (niente fallback prod silenzioso).
// Source-inspection pura: nessun import/esecuzione qui, nessun segreto, niente rete.
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('ENV_SPLIT_V1_08 fail-closed config', () => {
  test('functions/api.js: usa il resolver e fa fail-closed (no default prod inline)', () => {
    const s = read('../netlify/functions/api.js');
    expect(s).toMatch(/require\(['"]\.\/_env['"]\)/);
    expect(s).toMatch(/resolveBackendUrl/);
    expect(s).toMatch(/CONFIG_ERROR/);
    expect(s).toMatch(/respond\(503/);
    // il default prod NON deve più stare in api.js (si trova solo in _env.js, gated)
    expect(s).not.toMatch(/ladiecibot-production\.up\.railway\.app/);
  });

  test('functions/auth.js: usa il resolver e fa fail-closed (no ref prod inline)', () => {
    const s = read('../netlify/functions/auth.js');
    expect(s).toMatch(/require\(['"]\.\/_env['"]\)/);
    expect(s).toMatch(/resolveSupabase/);
    expect(s).toMatch(/CONFIG_ERROR/);
    expect(s).toMatch(/respond\(503/);
    // il ref Supabase prod NON deve più stare in auth.js
    expect(s).not.toMatch(/wnswassgfuuivmfwjxsf/);
  });

  test('functions/_env.js: il fallback prod è gated da SITE_ID di produzione', () => {
    const s = read('../netlify/functions/_env.js');
    expect(s).toMatch(/PROD_SITE_ID\s*=\s*["']02bd4c7a-a50b-4964-90da-8c1af1122932["']/);
    expect(s).toMatch(/STAGING_SITE_ID\s*=\s*["']a3ad035a-e73f-4da3-8873-6403e31f04b6["']/);
    expect(s).toMatch(/function isRealProd/);
    // i default prod esistono SOLO qui, e accanto a isRealProd()
    expect(s).toMatch(/ladiecibot-production\.up\.railway\.app/);
    expect(s).toMatch(/wnswassgfuuivmfwjxsf\.supabase\.co/);
    expect(s).toMatch(/isRealProd\([\s\S]{0,200}prodFallback/);
  });

  test('src/api.js: REACT_APP_SUPABASE_* + fallback gated dal build-guard', () => {
    const s = read('./api.js');
    expect(s).toMatch(/process\.env\.REACT_APP_SUPABASE_URL/);
    expect(s).toMatch(/process\.env\.REACT_APP_SUPABASE_ANON_KEY/);
    // il commento deve dichiarare il gating via build-guard (non più silenzioso)
    expect(s).toMatch(/guard-env-fail-closed/);
  });

  test('build-guard esiste, blocca i build non-prod e è in prebuild', () => {
    const g = read('../scripts/guard-env-fail-closed.js');
    expect(g).toMatch(/PROD_SITE_ID\s*=\s*["']02bd4c7a-a50b-4964-90da-8c1af1122932["']/);
    expect(g).toMatch(/process\.exit\(1\)/);            // fa fallire il build
    expect(g).toMatch(/REACT_APP_SUPABASE_URL/);
    const pkg = read('../package.json');
    expect(pkg).toMatch(/guard-env-fail-closed\.js/);   // wired in prebuild
  });
});
