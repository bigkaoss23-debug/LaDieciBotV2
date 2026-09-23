/**
 * @jest-environment node
 *
 * [PIN-RATE-LIMIT 2026-09-23] Rate limit NATIVO Netlify su /api/auth (10 richieste / 180 s, ip+domain).
 * Il vecchio contatore AUTH_BLOCK_* in Supabase `config` (scritto con la chiave publishable, rifiutato
 * dalla RLS, mai bloccante) è rimosso. Il 429 lo emette Netlify prima della Function: qui si verificano
 * config dichiarata, comportamento reale della Function in Node e gestione del 429 nel FE.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const FN = path.join(ROOT, "netlify", "functions", "auth.mjs");
const SRC = fs.readFileSync(FN, "utf8");
const TOML = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");

// Esegue la Function VERA in un processo Node (Request/Response nativi), con env di test finti.
function runFn(calls, env = {}) {
  const script = `
    const h = (await import(${JSON.stringify("file://" + FN)})).default;
    const out = [];
    for (const [method, body] of ${JSON.stringify(calls)}) {
      const r = await h(new Request("https://x.test/api/auth", { method, headers: { "content-type": "application/json" }, body: body === null ? undefined : JSON.stringify(body) }), { deploy: { context: "production" } });
      const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
      out.push({ status: r.status, error: j && j.error, hasToken: !!(j && j.token), role: j && j.role });
    }
    process.stdout.write(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { PATH: process.env.PATH, APP_PIN: "482917", REPARTIDOR_PIN: "731065", JWT_SECRET: "zz-test-secret-0123456789", CONTEXT: "production", ...env },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe("config nativa Netlify", () => {
  test("path /api/auth + rateLimit 10/180 per ip+domain, dichiarati come letterale statico", () => {
    expect(SRC).toMatch(/export const config = \{\s*path: "\/api\/auth",\s*rateLimit: \{\s*windowLimit: 10,\s*windowSize: 180,\s*aggregateBy: \["ip", "domain"\],\s*\},\s*\};/);
  });
  test("formato moderno: export default (Functions API v2), niente exports.handler", () => {
    expect(SRC).toMatch(/export default async \(req, context\)/);
    expect(SRC).not.toMatch(/exports\.handler/);
    expect(fs.existsSync(path.join(ROOT, "netlify", "functions", "auth.js"))).toBe(false);
  });
  test("netlify.toml: niente rewrite /api/auth (doppio routing), /api/proxy e SPA fallback intatti", () => {
    expect(TOML).not.toMatch(/from = "\/api\/auth"/);
    expect(TOML).not.toMatch(/\.netlify\/functions\/auth/);
    expect(TOML).toMatch(/from = "\/api\/proxy"\s*\n\s*to = "\/\.netlify\/functions\/api"/);
    expect(TOML).toMatch(/from = "\/\*"\s*\n\s*to = "\/index\.html"/);
  });
  test("nessun accesso a Supabase / config / AUTH_BLOCK / nuove secret", () => {
    // solo codice eseguibile: i commenti spiegano la rimozione e citano i vecchi nomi
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
    for (const re of [/supabase/i, /rest\/v1/, /AUTH_BLOCK/, /SUPABASE_/, /sb_publishable_/, /fetch\(/, /@netlify\/blobs/, /\bconfig\s*\(/]) expect(code).not.toMatch(re);
    expect(code).toMatch(/process\.env\[k\]/);   // env letti solo per nome: APP_PIN, REPARTIDOR_PIN, JWT_SECRET, CONTEXT, DEV_AUTH_BYPASS
    expect([...code.matchAll(/env\("([A-Z_]+)"\)/g)].map((m) => m[1]).sort()).toEqual(["APP_PIN", "CONTEXT", "DEV_AUTH_BYPASS", "JWT_SECRET", "REPARTIDOR_PIN"]);
  });
  test("il FE chiama ancora esattamente /api/auth", () => {
    expect(fs.readFileSync(path.join(ROOT, "src", "api.js"), "utf8")).toMatch(/const AUTH_URL = "\/api\/auth";/);
  });
});

describe("Function reale (Node)", () => {
  test("login corretto operador/repartidor, PIN errato 401, malformato 400, OPTIONS 204, GET 405", () => {
    const r = runFn([
      ["POST", { pin: "482917", role: "operador" }],
      ["POST", { pin: "731065", role: "repartidor" }],
      ["POST", { pin: "000000", role: "operador" }],
      ["POST", { pin: "12a" }],
      ["OPTIONS", null],
      ["GET", null],
    ]);
    expect(r[0]).toMatchObject({ status: 200, hasToken: true, role: "operador" });
    expect(r[1]).toMatchObject({ status: 200, hasToken: true, role: "repartidor" });
    expect(r[2]).toMatchObject({ status: 401, error: "PIN incorrecto", hasToken: false });
    expect(r[3].status).toBe(400);
    expect(r[4].status).toBe(204);
    expect(r[5].status).toBe(405);
  });
  test("sotto soglia la Function risponde sempre (nessun contatore interno): 10 errati = 10×401, poi login ok", () => {
    const r = runFn([...Array.from({ length: 10 }, () => ["POST", { pin: "000000" }]), ["POST", { pin: "482917" }]]);
    expect(r.slice(0, 10).every((x) => x.status === 401)).toBe(true);
    expect(r[10]).toMatchObject({ status: 200, hasToken: true });
  });
  test("env mancante → 503 fail closed (contratto invariato)", () => {
    expect(runFn([["POST", { pin: "482917" }]], { JWT_SECRET: "" })[0]).toMatchObject({ status: 503, error: "auth no configurado" });
  });
  test("DEV_AUTH_BYPASS mai attivo in produzione", () => {
    expect(runFn([["POST", { pin: "123456" }]], { DEV_AUTH_BYPASS: "true" })[0].status).toBe(401);
  });
});

describe("FE: auth.login", () => {
  let auth, RATE_LIMIT_MSG;
  beforeAll(() => {
    global.sessionStorage = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } };
    ({ auth, RATE_LIMIT_MSG } = require("../api"));
  });
  const mockFetch = (status, body, isJson = true) => {
    global.fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (!isJson) throw new SyntaxError("Unexpected token <"); return body; } }));
  };
  afterEach(() => { delete global.fetch; });
  test("429 del rate limit Netlify (corpo non JSON) → copy breve, NON 'Errore di rete'", async () => {
    mockFetch(429, null, false);
    const r = await auth.login("000000", "operador");
    expect(RATE_LIMIT_MSG).toBe("Troppi tentativi. Riprova tra poco.");
    expect(r).toEqual({ error: "Troppi tentativi. Riprova tra poco.", status: 429 });
  });
  test("401 → PIN incorrecto", async () => {
    mockFetch(401, { error: "PIN incorrecto" });
    expect(await auth.login("000000", "operador")).toEqual({ error: "PIN incorrecto", status: 401 });
  });
  test("503 → errore server del backend, non rete", async () => {
    mockFetch(503, { error: "auth no configurado" });
    expect(await auth.login("000000", "operador")).toEqual({ error: "auth no configurado", status: 503 });
  });
  test("200 → token salvato", async () => {
    mockFetch(200, { token: "a.b.c", role: "operador" });
    expect(await auth.login("482917", "operador")).toEqual({ success: true, role: "operador" });
  });
  test("solo una vera eccezione di rete → 'Errore di rete'", async () => {
    global.fetch = jest.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await auth.login("482917", "operador")).toEqual({ error: "Errore di rete" });
  });
});

describe("FE: schermate PIN mostrano il 429", () => {
  test.each([
    ["src/App.jsx", "setPinErrorMsg", "pinErrorMsg"],
    ["src/components/repartidor/RepartidorPage.jsx", "setRepPinErrorMsg", "repPinErrorMsg"],
  ])("%s: 429 → messaggio del limite, altrimenti PIN incorrecto", (file, setter, state) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    expect(src).toContain("const limited = result.status === 429;");
    expect(src).toContain(`${setter}(limited ? result.error : "PIN incorrecto");`);
    expect(src).toContain(`{${state}}`);
    expect(src).not.toMatch(/>\s*PIN incorrecto\s*</);
  });
});
