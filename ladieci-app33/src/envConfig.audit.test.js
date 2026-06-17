// src/envConfig.audit.test.js
// ENV_SPLIT_V1_02 — static guard: i 3 hardcode backend/Supabase sono env-based
// con default prod (production non si rompe se le env mancano). Source-inspection
// pura: nessun import/esecuzione, nessun segreto stampato, nessuna rete.
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('ENV_SPLIT_V1_02 env-based config', () => {
  test('functions/api.js: BACKEND_API_URL env + default prod', () => {
    const s = read('../netlify/functions/api.js');
    expect(s).toMatch(/process\.env\.BACKEND_API_URL/);
    expect(s).toMatch(/ladiecibot-production\.up\.railway\.app\/api/); // default prod
    expect(s).toMatch(/DEFAULT_BACKEND/);
  });

  test('functions/auth.js: SUPABASE_URL env + default prod + anon fallback', () => {
    const s = read('../netlify/functions/auth.js');
    expect(s).toMatch(/process\.env\.SUPABASE_URL/);
    expect(s).toMatch(/wnswassgfuuivmfwjxsf\.supabase\.co/); // default prod
    expect(s).toMatch(/process\.env\.SUPABASE_ANON_KEY/);
  });

  test('src/api.js: REACT_APP_SUPABASE_* env + default prod', () => {
    const s = read('./api.js');
    expect(s).toMatch(/process\.env\.REACT_APP_SUPABASE_URL/);
    expect(s).toMatch(/process\.env\.REACT_APP_SUPABASE_ANON_KEY/);
    expect(s).toMatch(/wnswassgfuuivmfwjxsf\.supabase\.co/); // default prod
  });

  test('nessun comportamento prod cambia se le env mancano (default presenti in tutti e 3)', () => {
    const api = read('../netlify/functions/api.js');
    const auth = read('../netlify/functions/auth.js');
    const fe = read('./api.js');
    // ogni file ha un fallback con `||`
    expect(api).toMatch(/BACKEND_API_URL[\s\S]{0,120}DEFAULT_BACKEND/);
    expect(auth).toMatch(/process\.env\.SUPABASE_URL\s*\|\|/);
    expect(fe).toMatch(/process\.env\.REACT_APP_SUPABASE_URL\s*\|\|/);
  });
});
