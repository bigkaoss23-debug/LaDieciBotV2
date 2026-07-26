// src/envConfig.audit.test.js
// ENV_SPLIT_V1_08 — static guard: la config backend/Supabase è FAIL-CLOSED.
// Il fallback prod è permesso SOLO sul sito di produzione reale (SITE_ID); in
// V1/staging/preview, env mancanti → errore (niente fallback prod silenzioso).
// Source-inspection pura: nessun import/esecuzione qui, nessun segreto, niente rete.
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

// Rimuove commenti /* */ e // per poter asserire su ciò che il file ESEGUE,
// non su ciò che documenta. Usato solo dove il commento cita i simboli vietati.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

  // S2-7D2 — auth.js è stato RITIRATO (commit d668a4b): il login operativo è passato
  // alla rotta canonica Auth V2 su Railway. Il contratto qui non è più "usa il resolver
  // e fa fail-closed", ma il suo superset: la function NON legge affatto config, NON
  // confronta PIN, NON può più emettere token, e risponde 410 su ogni metodo (POST
  // incluso). Il guard è quindi più forte di prima, non più debole.
  test('functions/auth.js: stub ritirato fail-closed (nessuna config, nessun token)', () => {
    // Il commento di ritiro CITA i simboli vietati (APP_PIN, token...) per spiegare cosa
    // è stato rimosso: le asserzioni vanno fatte sul CODICE, non sulla prosa.
    const code = stripComments(read('../netlify/functions/auth.js'));
    // 410 Gone, nessun ramo può tornare 200 con un token
    expect(code).toMatch(/statusCode:\s*410/);
    expect(code).not.toMatch(/statusCode:\s*200/);
    // non legge NESSUNA config né segreto (né via resolver né inline)
    expect(code).not.toMatch(/require\(['"]\.\/_env['"]\)/);
    expect(code).not.toMatch(/resolveSupabase/);
    expect(code).not.toMatch(/process\.env\./);
    expect(code).not.toMatch(/APP_PIN|REPARTIDOR_PIN/);
    // non può firmare/emettere credenziali
    expect(code).not.toMatch(/jsonwebtoken|jwt\.sign|createHmac/);
    // il ref Supabase prod NON deve stare in auth.js
    expect(code).not.toMatch(/wnswassgfuuivmfwjxsf/);
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

  // ── ENV_SPLIT_V1_12 — base URL backend (/status, /health) env-based ─────────
  test('utils/backendBase.js: REACT_APP_BACKEND_API_URL + fallback gated dal build-guard', () => {
    const s = read('./utils/backendBase.js');
    expect(s).toMatch(/process\.env\.REACT_APP_BACKEND_API_URL/);
    expect(s).toMatch(/guard-env-fail-closed/);          // dichiara il gating
    // il default prod può vivere SOLO qui (resolver dedicato), non nei componenti
    expect(s).toMatch(/ladiecibot-production\.up\.railway\.app/);
  });

  test('src/api.js e ServicioPage.jsx: NESSUN backend prod hardcoded (V1/staging safe)', () => {
    expect(read('./api.js')).not.toMatch(/ladiecibot-production/);
    expect(read('./components/ServicioPage.jsx')).not.toMatch(/ladiecibot-production/);
    // usano il resolver env-based condiviso
    expect(read('./api.js')).toMatch(/BACKEND_BASE_URL/);
    expect(read('./components/ServicioPage.jsx')).toMatch(/BACKEND_BASE_URL/);
  });

  test('build-guard: fail-closed anche sul backend (REACT_APP_BACKEND_API_URL)', () => {
    const g = read('../scripts/guard-env-fail-closed.js');
    expect(g).toMatch(/REACT_APP_BACKEND_API_URL/);
    expect(g).toMatch(/ladiecibot-production/);          // ref prod backend vietato in non-prod
  });
});
