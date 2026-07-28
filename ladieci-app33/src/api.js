// ─── API — Architettura pulita ──────────────────────────────────────────────
// Il backend Railway è l'UNICA fonte di verità per tutte le scritture critiche.
// Il frontend non scrive più direttamente su Supabase per ordini/conv/wa_msgs.
//
// READS: rimangono diretti a Supabase via anon key (RLS protegge i campi sensibili).
//        Più veloce, niente race condition, niente cerotti React per "preservare campi locali".
//
// WRITES: tutte via proxyPost → Netlify Function (con JWT) → Railway → Supabase service_role.
// ─────────────────────────────────────────────────────────────────────────────

import { calcTotale } from "./constants";
import { isDeleteConfirmed } from "./utils/deleteReconcile";
import { BACKEND_BASE_URL } from "./utils/backendBase";
import { isBlockedMutation, assertMutationAllowed, DraftWriteBlockedError } from "./draftGuard";

const PROXY_URL = "/api/proxy";
// S2-7D2 cutover: the operational keypad authenticates against the CANONICAL Auth V2 login,
// which verifies auth_actors.pin_hash and returns an actor/role/session-version token.
// The old /api/auth Netlify function (plaintext config.APP_PIN → role-only JWT) is retired
// and now fails closed; it is never called from here again.
const AUTH_V2_LOGIN_URL = "/api/auth/v2/login";

// ═══ SUPABASE (anon key — public by design, RLS protegge i sensibili) ═══
// Env-based (build-time CRA, prefisso REACT_APP_). FAIL-CLOSED (ENV_SPLIT_V1_08):
// il default prod sotto NON è più silenzioso — il build-guard
// scripts/guard-env-fail-closed.js (in prebuild) FA FALLIRE ogni build
// NON-production (SITE_ID ≠ prod) che non imposti REACT_APP_SUPABASE_URL /
// REACT_APP_SUPABASE_ANON_KEY espliciti. Quindi questi default vengono inlineati
// SOLO nel build production reale; un bundle V1/staging senza env non compila.
// Nessun segreto qui: la anon key è public by design.
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "https://wnswassgfuuivmfwjxsf.supabase.co";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "sb_publishable_esObmXoAcWH9z27Sj_-jtw_PO0VeL5O";

// Chiave di cache "edificio-level" — due clienti nello stesso condominio
// condividono la stessa chiave (stesso edificio = stessa geocodifica).
// "Calle Cuba 5, 3ºA" / "C/ Cuba 5 piso 4" → "calle cuba 5"
// Mirror di direccionToCacheKey() in ladieci-bot/src/utils/helpers.js —
// DEVE restare allineata finché lo Step 5 non centralizza tutto sul backend.
function direccionToCacheKey(s) {
  let r = String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Rimuove suffissi località/CAP/provincia/paese — richiede virgola davanti
  // per non tagliare parole legittime ("Avenida Reino de España 250" resta intatto).
  r = r.replace(/,\s*\d{5}\b/g, ",");
  r = r.replace(/,\s*roquetas\s+de\s+mar\b/gi, ",");
  r = r.replace(/,\s*roquetas\b/gi, ",");
  r = r.replace(/,\s*aguadulce\b/gi, ",");
  r = r.replace(/,\s*almer[ií]a\b/gi, ",");
  r = r.replace(/,\s*(?:espa[ñn]a|spain)\b/gi, ",");
  r = r.replace(/,(?:\s*,)+/g, ",").replace(/,\s*$/g, "");
  r = r.replace(/[\s,]+(?:piso|planta|puerta|pta\b\.?|escalera?|esc\b\.?|bloque?|blq\b\.?|portal|apto\b\.?|apartamento|interior|int\b\.?|letra|izq(?:uierda)?|dcha?|derecha|bajo|atico|sotano).*$/gi, "");
  r = r.replace(/[\s,]+\d+\s*[ºª°o]\s*[a-z]*\s*$/gi, "");
  r = r.replace(/[\s,]+\d+\s*[\-/]\s*[a-z]\s*$/gi, "");
  r = r.replace(/^\s*c\s*[\/.,]\s*/i,                "calle ");
  r = r.replace(/^\s*calle\b\.?/i,                   "calle");
  r = r.replace(/^\s*(?:av|avd|avda)\b\.?/i,         "avenida");
  r = r.replace(/^\s*avenida\b\.?/i,                 "avenida");
  r = r.replace(/^\s*(?:pza|pl)\b\.?/i,              "plaza");
  r = r.replace(/^\s*plaza\b\.?/i,                   "plaza");
  r = r.replace(/^\s*(?:ctra|crta)\b\.?/i,           "carretera");
  r = r.replace(/^\s*carretera\b\.?/i,               "carretera");
  r = r.replace(/^\s*paseo\b\.?/i,                   "paseo");
  r = r.replace(/^\s*p\s*\.?\s*[ºª°]\s+/i,           "paseo ");
  r = r.replace(/^\s*(?:urb|urbanizacion|urbanización)\b\.?/i, "urbanizacion");
  r = r.replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim();
  return r;
}

const sbHeaders = {
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

// sb è SOLO per letture dirette. Niente più sb.update/insert/del nei flussi critici.
const sb = {
  async select(table, query) {
    const res = await fetch(SUPABASE_URL+"/rest/v1/"+table+"?select=*"+(query?"&"+query:""), {
      headers: sbHeaders,
      cache: "no-store"
    });
    return res.json();
  },
  // upsert/update/insert/del esposti SOLO per casi non critici (geo_cache, ecc.).
  // Per ordini/conv/wa_msgs usare SEMPRE api.* che passa da Railway.
  async upsert(table, data, onConflict = null) {
    // S2-7D4D-FIX1 — direct Supabase writes bypass the proxy entirely, so they
    // need their own lock. Guarded BEFORE the fetch.
    assertMutationAllowed(`sb.upsert(${table})`);
    // PostgREST richiede on_conflict=<col> quando il prefer è merge-duplicates,
    // altrimenti risponde 400. Per retrocompatibilità onConflict è opzionale, ma
    // chi lo omette deve sapere che è in realtà un INSERT puro.
    const qs = onConflict ? "?on_conflict=" + encodeURIComponent(onConflict) : "";
    const res = await fetch(SUPABASE_URL+"/rest/v1/"+table+qs, {
      method: "POST", headers: {...sbHeaders, "Prefer":"return=representation,resolution=merge-duplicates"},
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async update(table, query, data) {
    assertMutationAllowed(`sb.update(${table})`);
    const res = await fetch(SUPABASE_URL+"/rest/v1/"+table+"?"+query, {
      method: "PATCH", headers: sbHeaders, body: JSON.stringify(data)
    });
    if (!res.ok) return { error: res.status };
    if (res.status === 204) return { success: true };
    return res.json();
  },
  async insert(table, data) {
    assertMutationAllowed(`sb.insert(${table})`);
    const res = await fetch(SUPABASE_URL+"/rest/v1/"+table, {
      method: "POST", headers: sbHeaders, body: JSON.stringify(data)
    });
    return res.json();
  },
  async del(table, query) {
    assertMutationAllowed(`sb.del(${table})`);
    const res = await fetch(SUPABASE_URL+"/rest/v1/"+table+"?"+query, {
      method: "DELETE", headers: sbHeaders
    });
    return res.ok ? {success:true} : {error:"delete failed"};
  }
};

// ═══ AUTH TOKEN MANAGEMENT ═══
const auth = {
  getToken() {
    try { return sessionStorage.getItem("ld_token") || ""; } catch(e) { return ""; }
  },
  setToken(token) {
    try { sessionStorage.setItem("ld_token", token); } catch(e) {}
  },
  getRole() {
    try { return sessionStorage.getItem("ld_role") || ""; } catch(e) { return ""; }
  },
  setRole(role) {
    try { sessionStorage.setItem("ld_role", role); } catch(e) {}
  },
  // Canonical actor identity, from the verified Auth V2 response. Presentation only —
  // authorization is decided by Railway from the token, never from this value.
  getActor() {
    try { return sessionStorage.getItem("ld_actor") || ""; } catch(e) { return ""; }
  },
  // The ONLY gate for entering an authenticated operational surface: a canonical Auth V2
  // token. ld_pin_ok / ld_role are presentation caches and can never admit on their own.
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      // canonical Auth V2 claims: role, sub (actor), sv (session version), exp
      if (!payload.sub || !payload.role || !Number.isInteger(payload.sv)) return false;
      return payload.exp > Math.floor(Date.now() / 1000);
    } catch(e) { return false; }
  },
  clear() {
    try {
      sessionStorage.removeItem("ld_token");
      sessionStorage.removeItem("ld_role");
      sessionStorage.removeItem("ld_actor");
      sessionStorage.removeItem("ld_pin_ok");
      // S2-7D2: purge any pre-cutover operational credential left in localStorage by an
      // older build. The operational token is tab-scoped and must never outlive the tab
      // on a shared device.
      localStorage.removeItem("ld_token");
      localStorage.removeItem("ld_role");
      localStorage.removeItem("ld_pin_ok");
    } catch(e) {}
  },
  // Canonical operational login. Universal contract: the COMPLETE entered PIN, nothing else.
  // Role/actor are resolved by the backend from auth_actors — never asserted by the client.
  async login(pin) {
    try {
      const res = await fetch(AUTH_V2_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        this.setToken(data.token);
        this.setRole(data.role);
        try { sessionStorage.setItem("ld_actor", data.actor || ""); } catch(e) {}
        try { sessionStorage.setItem("ld_pin_ok", "1"); } catch(e) {}
        return { success: true, role: data.role, actor: data.actor };
      }
      return { error: "PIN incorrecto" }; // neutral: never surfaces the backend reason
    } catch(err) {
      return { error: "PIN incorrecto" };
    }
  }
};

// S2-7D3: an Auth V2 rejection (expired / malformed / stale session_version / inactive
// actor) must reach THE one operational-logout path, not just drop the token locally. The
// app listens for this event and runs the canonical logout: realtime + polling torn down,
// operational state cleared, back to the PIN screen — personal account session untouched.
function onOperationalUnauthorized() {
  try { auth.clear(); } catch (e) {}
  try { window.dispatchEvent(new Event("ld-operational-unauthorized")); } catch (e) {}
}

// S2-7D6E6 — real staging defect: a wrong step-up PIN (verifyOwnPin -> 401 PIN_INCORRECTO)
// was force-logging the operator out, because the transport layer treated EVERY 401/403 as
// proof the operational Bearer itself was dead. It is not: legacyAuthGuard.js and the
// admin-only gate for verifyOwnPin/setActorPin (index.js) both return 401/403 for perfectly
// normal, in-band DOMAIN answers too (wrong PIN, locked, insufficient role, a legacy
// pre-sid session). The status code alone can never distinguish "your token is unusable"
// from "here is a typed answer to the thing you asked" — only the error CODE inside the
// body can. So: always read the JSON body first, then decide from the code, never the
// status alone. This applies globally (every proxyGet/proxyPost caller), not a per-action
// exception — a ROLE_FORBIDDEN 403 on ANY legacy action is exactly as harmless as it is here.
//
// Reconstructed exhaustively from the backend guards (src/auth/legacyAuthGuard.js,
// index.js verifyOwnPin/setActorPin branches) — not guessed:
//   MISSING_TOKEN / INVALID_TOKEN / SESSION_STALE / INACTIVE_OR_UNKNOWN_ACTOR (401, guard) —
//     the Bearer itself cannot be used again; only a fresh login fixes it.
//   REAUTH_REQUIRED (401, verifyOwnPin only) — a legacy session signed before the per-login
//     sid existed; it can never mint or use a step-up proof, by design, no weaker fallback.
// Everything else that happens to carry 401/403 is a domain answer the caller already
// renders inline: PIN_INCORRECTO, LOCKED (429, not even in this set), BAD_REQUEST (400),
// UNAVAILABLE (503), admin_action_failed (400), ROLE_FORBIDDEN (403, from the guard's own
// per-action role check OR the verifyOwnPin/setActorPin admin-only gate).
const SESSION_INVALID_CODES = Object.freeze(new Set([
  "MISSING_TOKEN", "INVALID_TOKEN", "SESSION_STALE", "INACTIVE_OR_UNKNOWN_ACTOR",
  "REAUTH_REQUIRED",
]));

// Pure, exported for direct testing. `errorCode` is the backend's `error` field from the
// (already-parsed) JSON body — never inferred from status alone.
function shouldInvalidateOperationalSession(status, errorCode) {
  if (status !== 401 && status !== 403) return false;
  return SESSION_INVALID_CODES.has(errorCode);
}

// S2-7D6E6 — module-level in-flight locks for the two admin PIN-management calls (see
// api.verifyOwnPin/setActorPin below). Deliberately NOT per-component-instance state: a
// stray duplicate mount, a double-fired DOM event, or a second click that lands before
// React's next render disables the button all share this SAME lock, so at most one real
// request for each ever leaves the browser regardless of what caused the second attempt.
let verifyOwnPinInFlight = null;
let setActorPinInFlight = null;

// ═══ PROXY HELPERS — Railway via Netlify Function con JWT ═══
function proxyHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + auth.getToken()
  };
}

async function proxyGet(action, params) {
  try {
    const p = params || {};
    const qs = Object.entries(Object.assign({action}, p))
      .map(function(e){ return e[0]+'='+encodeURIComponent(e[1]); }).join('&');
    const res = await fetch(PROXY_URL+'?'+qs, { cache: "no-store", headers: proxyHeaders() });
    let json;
    try { json = await res.json(); } catch { json = null; }
    if (shouldInvalidateOperationalSession(res.status, json && json.error)) {
      onOperationalUnauthorized(); return { error: "sesión expirada", _status: res.status };
    }
    return json || {};
  } catch(err) { console.error('API GET error:', err); return { error: err.toString() }; }
}

async function proxyPost(body) {
  // S2-7D4D-FIX1 — draft write lock, BEFORE the network call. Read-only POST
  // computations (preview*) are allowlisted in draftGuard so the planner keeps
  // working. No effect unless REACT_APP_DRAFT_NO_PERSIST === "true".
  if (isBlockedMutation((body && body.action) || "post")) {
    const e = new DraftWriteBlockedError((body && body.action) || "post");
    try { assertMutationAllowed((body && body.action) || "post"); } catch (x) { /* recorded */ }
    return { error: e.message, draftBlocked: true, _status: 0, _ok: false };
  }
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST', headers: proxyHeaders(), body: JSON.stringify(body)
    });
    // Annota _status e _ok per i chiamanti che vogliono distinguere errori HTTP
    // dai successi. Manteniamo il body originale per backwards compat.
    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (shouldInvalidateOperationalSession(res.status, json && json.error)) {
      onOperationalUnauthorized(); return { error: "sesión expirada", _status: res.status };
    }
    return { ...json, _status: res.status, _ok: res.ok };
  } catch(err) {
    console.error('API POST error:', err);
    return { error: err.toString(), _status: 0, _ok: false };
  }
}

// Helper "strict": throw su qualunque fallimento (HTTP non-2xx, network error,
// body senza id quando id era atteso). Usato dai flussi di creazione/conferma
// ordine dove serve sapere con certezza se l'ordine è stato creato lato DB.
async function proxyPostStrict(body, expectedField) {
  const res = await proxyPost(body);
  if (!res._ok) {
    const err = new Error(res.error || `HTTP ${res._status}`);
    err.status = res._status;
    err.response = res;
    throw err;
  }
  if (expectedField && res[expectedField] == null) {
    const err = new Error(`backend non ha restituito "${expectedField}"`);
    err.response = res;
    throw err;
  }
  return res;
}


// ═══ API: il frontend chiama solo questi metodi ══════════════════
//
// REGOLA: ogni scrittura su ordenes/conv/wa_msgs/storico/serata_summary
// passa SEMPRE da proxyPost. Niente sb.* writes in api.js.
//
const api = {
  // ── Generic proxy passthrough ──────────────────────────────────
  async get(action, params) {
    return proxyGet(action, params);
  },
  async post(body) {
    return proxyPost(body);
  },

  // ── READS diretti (no Railway round-trip — sono read-only) ─────
  getOrdenes: async function() {
    const H24 = 24*60*60*1000;
    const since = Date.now() - H24;
    const rows = await sb.select("ordenes", `ts=gte.${since}&order=ts.desc&limit=100`);
    return { ordenes: (rows||[]).map(o => ({
      ...o, ts: Number(o.ts)||Date.now(), llegado: o.llegado===true,
      items: typeof o.items === "string" ? JSON.parse(o.items) : (o.items||[])
    })), ts: Date.now() };
  },
  getWaMsgs: async function() {
    const H24 = 24*60*60*1000;
    const rows = await sb.select("wa_msgs", "order=ts.desc&limit=100");
    const now = Date.now();
    return { msgs: (rows||[]).filter(m => {
      if (!Number(m.ts)) return false;
      if ((now - Number(m.ts)) > H24) return false;
      return true;
    }).map(m => ({
      id: m.id, wa_id: m.wa_id||"", nombre: m.nombre||"", tel: m.wa_id||"",
      txt: m.txt||"", ts: Number(m.ts)||0,
      ago: (() => { const d=Math.floor((now-Number(m.ts||0))/60000); return d<1?"ahora":d<60?d+"m":Math.floor(d/60)+"h"; })(),
      leido: false, stato: m.stato||"NUEVO",
      ia: { conf:Number(m.ia_conf)||0, items:(()=>{ let x=m.ia_items||[]; if(typeof x==="string"){try{x=JSON.parse(x);}catch(e){x=[];}} return Array.isArray(x)?x:[]; })(), nota:m.ia_nota||"", hora:m.ia_hora||"" },
      bot_risposta: m.bot_risposta||"", ordine_ref: m.ordine_ref||"",
      tipo_consegna: ((m.bot_risposta||"").toLowerCase().includes("domicilio") || (m.bot_risposta||"").includes("Envío")) ? "DOMICILIO" : null
    })), ts: now };
  },
  // Ritorna SOLO i clienti preferito=true, già arricchiti con ordini_30gg e flag vip
  // (calcolo lato Railway con soglia da config.VIP_SOGLIA_30GG).
  getClientes: async function() {
    const res = await proxyGet("getClientes");
    if (Array.isArray(res)) return { clientes: res };
    return { clientes: res?.clientes || [] };
  },
  // S2-7D4C — dynamic catalogue READ (Supabase-backed, served by the deployed backend
  // `getMenu` action). Read-only: this block ships no catalogue writer of any kind.
  // It deliberately goes through proxyGet, so it inherits the CURRENT Auth V2 chain —
  // the operational bearer via proxyHeaders(), and 401/403 -> canonical operational
  // logout. No legacy /api/auth path and no role-only JWT is reintroduced here.
  getMenu: async function() {
    return proxyGet("getMenu");
  },

  // ── S2-7D5 — service session (operational shift) ───────────────
  // Both actions ride the CURRENT Auth V2 chain: proxyGet/proxyPost attach the
  // operational bearer via proxyHeaders() and funnel 401/403 into the canonical
  // operational logout. No legacy /api/auth call, no plaintext PIN, no
  // localStorage credential, and no X-Api-Key is reintroduced here.
  //
  // Current-night reconciliation only. The backend chooses the Madrid service
  // date; this contract intentionally accepts no date, range or service id —
  // the client never selects a session (docs/SERVICE_SESSION_IDENTITY.md).
  getCurrentServiceCloseout: () => proxyGet("getCurrentServiceCloseout"),
  // S2-7D6E3 — Economía's ONE money source: ledger-derived (order_financial_events, via
  // the SAME aggregate() the live closeout and serata_summary use) payment totals per
  // service-session-day, NOT a metodo_pago bucket over raw storico/ordenes rows. Rides
  // the Auth V2 proxy chain (admin-only backend action), never the anon Supabase key.
  // desde/hasta are optional YYYY-MM-DD (inclusive).
  getEconomiaLedger: (desde, hasta) => {
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    return proxyGet("getEconomiaLedger", params);
  },
  // Opens THE next service session. Takes no arguments by design: the backend
  // derives actor from the verified token and business_date in Europe/Madrid.
  openServiceSession: () => proxyPost({ action: "openServiceSession" }),
  // S2-7D6C — the SILENT path, called on every authorized entry into Servicio.
  // Idempotent: a second operator of the same shift reuses the first one's
  // session. Takes no arguments — same reason as openServiceSession, and this
  // is a genuine mutation (it may create a session row), so it is NOT added to
  // draftGuard's read-only allowlist: a no-persist draft build must still
  // refuse it before any network call, exactly like openServiceSession.
  ensureCurrentServiceSession: () => proxyPost({ action: "ensureCurrentServiceSession" }),

  upsertCliente: function(data) {
    return proxyPost({ action: "upsertCliente", ...data });
  },
  getClientePorTel: async function(tel) {
    const norm = String(tel||"").replace("+","").trim();
    if (!norm) return null;
    const rows = await sb.select("clientes", "tel=eq."+encodeURIComponent(norm)+"&limit=1");
    return (rows && rows[0]) ? rows[0] : null;
  },
  getGeoCache: async function(direccion) {
    const key = direccionToCacheKey(direccion);
    if (key.length < 5) return null;
    const rows = await sb.select("geo_cache", "direccion_key=eq."+encodeURIComponent(key)+"&limit=1");
    return (rows && rows[0]) ? rows[0] : null;
  },
  getRepartidores: async function() {
    const rows = await sb.select("config", "chiave=eq.REPARTIDORES&limit=1");
    const raw = (rows && rows[0] && rows[0].valore) ? String(rows[0].valore) : "";
    return raw.split(",").map(s=>s.trim()).filter(Boolean);
  },

  // ── WRITES: tutte via proxyPost ────────────────────────────────

  // Risolve un indirizzo (geocode + zona + tempo) usando il backend.
  // ENGINE UNICO: stesso geoResolver usato dal bot WhatsApp.
  // Sostituisce: getGeoCache, geocodificaEAssegnaZona, saveGeoCache, calcolaTempoGiro
  resolveAddress: function(direccion, opts = {}) {
    return proxyPost({
      action: 'resolveAddress',
      direccion,
      tel: opts.tel || null,
      tipoConsegna: opts.tipoConsegna || 'DOMICILIO',
      forceRefresh: !!opts.forceRefresh
    });
  },

  // Step 2 anti-cerotto: timing delivery AUTORITATIVO dal backend (fonte unica).
  // Input grezzi operatore (direccion/tel/hora/items/tipo_consegna + override
  // zona_manuale). Output deciso server-side: zona, durata_andata_min,
  // durata_google/haversine_min, geo_source, forno_out, hora_proposta,
  // suggested_hora, warnings[], driver{has_conflict,message}, giro{...}.
  // Il frontend MOSTRA questi valori: non li ricalcola e non li sovrascrive.
  previewOrderTiming: function(input = {}) {
    return proxyPost({ action: 'previewOrderTiming', ...input });
  },

  // Nuevo Pedido Premium → planner backend (read-only, contract
  // "nuevo-pedido-planner-preview-v1"). Speculare a previewOrderTiming ma punta
  // alla nuova action planner: fonte unica per disponibilità/lead-time/giri.
  // Il frontend MOSTRA il contract, non lo ricalcola.
  previewOrderPlanner: function(input = {}) {
    return proxyPost({ action: 'previewOrderPlanner', ...input });
  },

  // Premium Planner → strategic preview backend (read-only, contract
  // "premium-planner-strategic-preview-v1"). Il frontend MOSTRA il contract
  // (proposals/opportunities, firstAvailable, bestProposal, warnings, blockers),
  // NON calcola ETA/slip/capacity/compatibilità.
  previewStrategicOpportunities: function(input = {}) {
    return proxyPost({ action: 'previewStrategicOpportunities', ...input });
  },

  // Premium Planner → manual giro route preview backend (read-only, contract
  // "premium-planner-manual-giro-route-preview-v1"). El operador propone la
  // SECUENCIA de paradas (selectedStops/selectedZones, ej Q2→Q5) y el backend
  // devuelve un route-timeline-v2 (ETA/slip/return/risk/operatorMessage). El
  // frontend SOLO dibuja la respuesta. READ-ONLY: no escribe nada.
  previewManualGiroRoute: function(input = {}) {
    return proxyPost({ action: 'previewManualGiroRoute', ...input });
  },

  // Crea ordine. THROW se Railway non conferma la creazione con un id valido.
  // Il chiamante DEVE wrappare in try/catch e fare rollback dello state ottimistico.
  // `data.client_req_id` (UUID) abilita l'idempotency: retry sicuri senza duplicati.
  createOrden: function(data) {
    return proxyPostStrict({ action:'createOrden', data }, 'id');
  },
  updateOrden: function(id, patch) {
    return proxyPost({ action:'updateOrden', id, ...patch });
  },
  updateEstado: function(id, estado, metodo_pago, descuento, extras) {
    const body = { action:'updateEstado', id, estado };
    if (metodo_pago !== undefined) body.metodo_pago = metodo_pago;
    // Descuento applicato al cambio stato (es. RETIRADO con sconto last-minute).
    // Il backend ricalcola `totale` server-side e salva i 3 campi DB.
    if (descuento?.tipo)        body.descuento_tipo  = descuento.tipo;
    if (descuento?.valor != null) body.descuento_valor = descuento.valor;
    // Audit LISTO: il frontend invia solo origin/actor; listo_at è fallback server-side.
    if (extras?.listo_origin != null) body.listo_origin = extras.listo_origin;
    if (extras?.listo_actor  != null) body.listo_actor  = extras.listo_actor;
    return proxyPost(body);
  },
  updateNotaCucina: function(id, nota_cucina) {
    return proxyPost({ action:'updateNotaCucina', id, nota_cucina });
  },
  // Snooze visivo per-card DOMICILIO: sposta countdown +N min senza toccare hora/forno_out.
  // Cap backend [0, 20]. Reset naturale a chiusura serata.
  setUiOffset: function(id, offset_min) {
    return proxyPost({ action:'setUiOffset', id, offset_min });
  },
  updateWaStato: function(id, stato, ordine_ref) {
    const body = { action:'updateWaStato', id, stato };
    if (ordine_ref !== undefined) body.ordine_ref = ordine_ref;
    return proxyPost(body);
  },
  aggiornaRispostaBot: function(id, bot_risposta) {
    return proxyPost({ action:'aggiornaRispostaBot', id, bot_risposta });
  },
  // STRICT: lancia se il backend NON conferma la cancellazione (HTTP non-ok,
  // errore di rete, o body con error/ok:false). Così il chiamante può fare
  // rollback della rimozione ottimistica invece di nascondere un ordine vivo.
  eliminaOrdine: async function(id) {
    const res = await proxyPost({ action:'eliminaOrdine', id });
    if (!isDeleteConfirmed(res)) {
      const err = new Error((res && res.error) || `HTTP ${res && res._status}`);
      err.status = res && res._status;
      err.response = res;
      throw err;
    }
    return res;
  },
  eliminaConversazione: function(wa_id) {
    return proxyPost({ action:'eliminaConversazione', wa_id });
  },
  // Conferma WA: crea ordine direttamente in EN_COCINA. STRICT come createOrden.
  // `clientReqId` (UUID, opzionale ma raccomandato) abilita l'idempotency lato backend.
  confirmarWa: function(id, items, hora, nombre, tel, clientReqId) {
    const waId = String(tel||"").replace("+","");
    return proxyPostStrict({ action:'createOrden', data:{
      nombre, tel, wa_id: waId, canal:"WA",
      items, hora, nota:"", wa_msg_id: id, estado:"EN_COCINA",
      client_req_id: clientReqId || null
    }}, 'id');
  },

  // ── Delivery / driver ──────────────────────────────────────────
  marcarEnEntrega: function(id) {
    return proxyPost({ action:'marcarEnEntrega', id });
  },
  // S2-7D6E2 — `cobrado` NON viaggia più sul filo. Il client non dichiara un incasso:
  // lo registra il ledger lato server (order_financial_events) e solo lui scrive la
  // colonna. Il parametro resta nella firma per non toccare i call site esistenti, ma
  // è ignorato di proposito — il backend non lo legge più.
  marcarEntregado: function(id, _cobradoIgnorato, _ordenData, metodo_pago) {
    return proxyPost({
      action: 'marcarEntregado',
      id,
      metodo_pago: metodo_pago || ""
    });
  },
  asignarRepartidor: function(id, repartidor) {
    return proxyPost({ action:'asignarRepartidor', id, repartidor });
  },
  marcarLlegado: function(id, llegado) {
    return proxyPost({ action:'marcarLlegado', id, llegado: llegado !== false });
  },
  registrarSalidaDriver: function(zona, n_ordini) {
    return proxyPost({ action:'registrarSalidaDriver', zona, n_ordini });
  },
  chiudiGiro: function() {
    return proxyPost({ action:'chiudiGiro' });
  },

  // ── Manual giros (DELIVERY-MANUAL-GIRO-01 P1C.1) ──────────────
  // Backend è la fonte di verità: ordenes.manual_giro_id + tabella
  // manual_giros con seq per service day. Vedi LaDieciBotV2_DELIVERY_MANUAL_GIRO_01BC_SPEC.md.
  // addOrderToManualGiro esiste lato backend ma è fuori scope S3 (no workflow UI).
  getManualGiros: function(opts = {}) {
    const params = {};
    if (opts.day) params.day = opts.day;
    if (opts.onlyActive === false) params.onlyActive = "false";
    return proxyGet("getManualGiros", params);
  },
  // hora_ref: "HH:MM" orario operativo del giro (uscita forno, guida cucina/driver).
  // anchor_order_id: id ordine da cui proviene la scelta (audit/UX).
  // entrega_ref: "HH:MM" target consegna/giro comune scelto dall'operatore. Tutti opzionali.
  createManualGiro: function(order_ids, hora_ref = null, anchor_order_id = null, entrega_ref = null) {
    return proxyPost({ action: "createManualGiro", order_ids, hora_ref, anchor_order_id, entrega_ref });
  },
  removeOrderFromManualGiro: function(order_id) {
    return proxyPost({ action: "removeOrderFromManualGiro", order_id });
  },
  dissolveManualGiro: function(giro_id) {
    return proxyPost({ action: "dissolveManualGiro", giro_id });
  },

  // ── Geo cache (non critico per chiusura) ───────────────────────
  // ⚠️ Chiamare SOLO dopo che l'operatore ha confermato l'ordine — non durante il typing.
  // Rifiuta lat/lon nulli: senza coordinate non serve cachare (non possiamo calcolare nulla).
  saveGeoCache: async function(direccion, zona, lat, lon, opts = {}) {
    const key = direccionToCacheKey(direccion);
    if (!key || key.length < 5 || !zona) return;
    if (lat == null || lon == null) {
      // Scelta zona manuale (operatore) — non sappiamo le coord reali, non cachiamo.
      // Prima questo riempiva la cache di righe morte con lat=null/lon=null.
      return;
    }
    try {
      await sb.upsert("geo_cache", {
        direccion_key: key,
        direccion_orig: direccion,
        zona,
        lat, lon,
        source: opts.source || "unknown",
        durata_andata_min: opts.durataAndataMin ?? null,
        updated_at: new Date().toISOString()
      }, "direccion_key");
    } catch (e) {
      console.warn("[saveGeoCache] failed:", e?.message || e);
    }
  },
  updateClienteIndirizzo: async function(tel, direccion, direccion_note) {
    const norm = String(tel||"").replace("+","").trim();
    if (!norm) return { error: "tel vacío" };
    const upd = {};
    if (direccion !== undefined)      upd.direccion      = direccion;
    if (direccion_note !== undefined) upd.direccion_note = direccion_note;
    return await sb.update("clientes", "tel=eq."+encodeURIComponent(norm), upd);
  },

  // ── App PIN ────────────────────────────────────────────────────
  // S2-7D2: setAppPin was REMOVED. It wrote the plaintext config.APP_PIN that the retired
  // /api/auth function used to compare against. Operational credentials now live only in
  // auth_actors.pin_hash and rotate through the canonical Auth V2 path (account admin-PIN
  // form → auth_set_actor_pin_v2). It had no callers.
  getAppPin: async function() { return "server-side"; },

  // ── S2-7D6E4 — in-app PIN management (step-up gated) ────────────
  // List of canonical actors for the PIN-management picker. Admin-only on the backend
  // (legacyActionRoles); operator/rider get ROLE_FORBIDDEN.
  getAuthActors: function() { return proxyGet("getAuthActors"); },
  // Step-up confirmation: the ALREADY-authenticated admin re-enters their own PIN. On
  // success the backend returns a short-lived, session-bound proof — never a boolean.
  // actor/role/session_version are never sent: the backend takes them from the verified
  // Auth V2 bearer this call already carries.
  // S2-7D6E6 — a rejected step-up PIN (PIN_INCORRECTO/LOCKED/...) is a normal domain
  // answer, not proof the operator's own operational session is dead: proxyPost now
  // decides from the parsed body's error CODE (shouldInvalidateOperationalSession), so
  // StepUpView's own 401/403 branching renders it inline instead of being force-logged-out
  // before it ever sees the response. Deduped: however many callers ask "verify this PIN"
  // in quick succession — a double click, a stray duplicate event — AT MOST ONE real
  // verifyOwnPin request is ever in flight, exactly like createSharedEnsure in
  // serviceEnsureFlow.js dedupes ensureCurrentServiceSession for the same reason.
  verifyOwnPin: function(pin) {
    if (verifyOwnPinInFlight) return verifyOwnPinInFlight;
    verifyOwnPinInFlight = proxyPost({ action: "verifyOwnPin", pin })
      .finally(() => { verifyOwnPinInFlight = null; });
    return verifyOwnPinInFlight;
  },
  // Changes ANY actor's PIN. Requires the step-up proof from verifyOwnPin; the backend
  // rejects the call outright without one. `confirmation` is only meaningful (and only
  // sent) when targetActor is "owner" — the deliberate explicit phrase the SQL contract
  // requires for a self-change, never auto-supplied by this client. Same in-flight dedupe
  // as verifyOwnPin, same reason: a save must never fire twice from one gesture.
  setActorPin: function({ targetActor, newPin, stepUpProof, confirmation }) {
    if (setActorPinInFlight) return setActorPinInFlight;
    const body = { action: "setActorPin", targetActor, newPin, stepUpProof };
    if (confirmation !== undefined) body.confirmation = confirmation;
    setActorPinInFlight = proxyPost(body).finally(() => { setActorPinInFlight = null; });
    return setActorPinInFlight;
  },

  // ── Storico/serata: letture pesanti aggregate ──────────────────
  getStorico: async function() {
    const rows = await sb.select("storico", "order=ts.desc&limit=500");
    const now = new Date(); const oggi = new Date(now); oggi.setHours(0,0,0,0);
    const iniSett = new Date(oggi); iniSett.setDate(oggi.getDate()-oggi.getDay());
    const iniMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    let incTot=0,incOggi=0,incSett=0,incMese=0,count=0;
    const prodotti={},canali={},fasce={},giorni={},consegne={DOMICILIO:0,RITIRO:0};
    const pagamenti = {
      efectivo:        { incasso: 0, count: 0 },
      tarjeta:         { incasso: 0, count: 0 },
      bizum:           { incasso: 0, count: 0 },
      no_especificado: { incasso: 0, count: 0 },
    };
    const righeOut = (rows||[]).map(r => {
      let items = r.items||[];
      if(typeof items==="string"){try{items=JSON.parse(items);}catch(e){items=[];}}
      const totale = Number(r.totale) || 0;
      const ts = Number(r.ts)||0;
      const dR = new Date(ts);
      incTot+=totale; count++;
      if(dR>=oggi) incOggi+=totale;
      if(dR>=iniSett) incSett+=totale;
      if(dR>=iniMese) incMese+=totale;
      items.forEach(it => {
        if(!prodotti[it.n]) prodotti[it.n]={q:0,incasso:0,emoji:it.e||"🍕",cat:it.cat||"Pizzas"};
        prodotti[it.n].q+=(Number(it.q)||1);
        prodotti[it.n].incasso+=(Number(it.p)||0)*(Number(it.q)||1);
      });
      canali[r.canal||"MANUAL"]=(canali[r.canal||"MANUAL"]||0)+1;
      fasce[r.fascia_ora||"?"]=(fasce[r.fascia_ora||"?"]||0)+1;
      giorni[r.dia_semana||"?"]=(giorni[r.dia_semana||"?"]||0)+1;
      const tc = r.tipo_consegna === "DOMICILIO" ? "DOMICILIO" : "RITIRO";
      consegne[tc]=(consegne[tc]||0)+1;
      const mp = String(r.metodo_pago || "").toLowerCase();
      const pk = mp === "efectivo" ? "efectivo"
        : mp === "tarjeta" ? "tarjeta"
        : mp === "bizum"   ? "bizum"
        : "no_especificado";
      pagamenti[pk].incasso += totale;
      pagamenti[pk].count   += 1;
      return { id:r.orden_id,nombre:r.nombre,tel:r.tel,canal:r.canal,items:JSON.stringify(items),nota:r.nota,hora:r.hora,estado:r.estado,totale,delivery_fee:Number(r.delivery_fee)||0,tipo_consegna:r.tipo_consegna||"RITIRO",fecha:r.fecha,dia_semana:r.dia_semana,fascia_ora:r.fascia_ora,ts,zona:r.zona,metodo_pago:r.metodo_pago };
    });
    const topProd = Object.entries(prodotti).sort((a,b)=>b[1].q-a[1].q).map(e=>({n:e[0],e:e[1].emoji,q:e[1].q,incasso:Math.round(e[1].incasso*100)/100,cat:e[1].cat}));
    const perGiorno = {};
    righeOut.forEach(r => {
      const fechaStr = String(r.fecha||"");
      let dataKey = "";
      if(fechaStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        dataKey = fechaStr.slice(0,10);
      } else if(fechaStr.includes("T")) {
        try { dataKey = new Date(fechaStr).toISOString().slice(0,10); } catch(e){}
      } else if(fechaStr.includes("/")) {
        try { const [dd,mm,yy]=fechaStr.split("/").map(Number); dataKey=new Date(yy,mm-1,dd).toISOString().slice(0,10); } catch(e){}
      }
      if(!dataKey) return;
      let itemsR = r.items; if(typeof itemsR==="string"){try{itemsR=JSON.parse(itemsR);}catch(e){itemsR=[];}}
      let tot2=0,pizzeG=0,bevandeG=0;
      (Array.isArray(itemsR)?itemsR:[]).forEach(it=>{
        const p=parseFloat(it.p||0),q=parseInt(it.q)||1;
        if(!isNaN(p)&&p>0) tot2+=p*q;
        if(it.cat==="Bebidas") bevandeG+=q; else pizzeG+=q;
      });
      if(r.totale > 0) tot2 = r.totale;
      if(!perGiorno[dataKey]) perGiorno[dataKey]={
        data:dataKey,incasso:0,ordini:0,pizze:0,bevande:0,consegne:0,ts:r.ts||0,
        pagamenti:{
          efectivo:{incasso:0,count:0}, tarjeta:{incasso:0,count:0},
          bizum:{incasso:0,count:0},    no_especificado:{incasso:0,count:0}
        }
      };
      perGiorno[dataKey].incasso+=tot2;
      perGiorno[dataKey].ordini++;
      perGiorno[dataKey].pizze+=pizzeG;
      perGiorno[dataKey].bevande+=bevandeG;
      if(r.tipo_consegna==="DOMICILIO") perGiorno[dataKey].consegne++;
      const mpG = String(r.metodo_pago || "").toLowerCase();
      const pkG = mpG === "efectivo" ? "efectivo"
        : mpG === "tarjeta" ? "tarjeta"
        : mpG === "bizum"   ? "bizum"
        : "no_especificado";
      perGiorno[dataKey].pagamenti[pkG].incasso += tot2;
      perGiorno[dataKey].pagamenti[pkG].count   += 1;
    });
    // Arrotonda pagamenti globali e per giorno
    Object.keys(pagamenti).forEach(k => { pagamenti[k].incasso = Math.round(pagamenti[k].incasso*100)/100; });
    Object.values(perGiorno).forEach(g => {
      Object.keys(g.pagamenti).forEach(k => { g.pagamenti[k].incasso = Math.round(g.pagamenti[k].incasso*100)/100; });
    });
    const giorniDettaglio = Object.values(perGiorno).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
    return {
      righe: righeOut,
      analytics: { incassoTot:Math.round(incTot*100)/100, incassoOggi:Math.round(incOggi*100)/100,
        incassoSett:Math.round(incSett*100)/100, incassoMese:Math.round(incMese*100)/100,
        countOrdini:count, ticketMedio:count>0?Math.round((incTot/count)*100)/100:0,
        topProdotti:topProd, canali, fasceOrarie:fasce, giorniSett:giorni, consegne, giorniDettaglio,
        pagamenti },
      ts: Date.now()
    };
  },

  getSerata: async function() {
    const oggiDate = new Date();
    const oggiIso  = oggiDate.toISOString().slice(0, 10);
    const toMs = (ts) => { const n = Number(ts); if (!n) return null; return n < 1e12 ? n * 1000 : n; };
    const rowsOrdenes = await sb.select("ordenes", `estado=in.(COMPLETADO,RETIRADO)&order=ts.desc&limit=500`);
    const ordineLive = (Array.isArray(rowsOrdenes) ? rowsOrdenes : []).filter(r => {
      const ms = toMs(r.ts);
      if (!ms) return false;
      const d = new Date(ms);
      return d.toISOString().slice(0,10) === oggiIso && d.getHours() >= 19 && d.getHours() < 23;
    }).map(r => ({ ...r, _src: "live" }));
    const rowsStorico = await sb.select("storico", `fecha=eq.${oggiIso}&order=ts.desc&limit=200`);
    const ordiniStorico = (Array.isArray(rowsStorico) ? rowsStorico : []).map(r => ({
      id: r.orden_id, nombre: r.nombre, tel: r.tel, canal: r.canal,
      items: r.items, nota: r.nota, nota_cucina: r.nota_cucina, hora: r.hora, estado: r.estado,
      totale: r.totale, tipo_consegna: r.tipo_consegna || "RITIRO",
      delivery_fee: Number(r.delivery_fee) || 0,
      zona: r.zona || null,
      fecha: r.fecha || oggiIso,
      ts: r.ts, metodo_pago: r.metodo_pago || "", _src: "storico"
    }));
    const fonteOrdini = ordineLive.length > 0 ? ordineLive : ordiniStorico;
    const fonte = ordineLive.length > 0 ? "live" : "storico";
    let incasso = 0;
    const prodMap = {};
    const canali  = {};
    const consegne = { DOMICILIO: 0, RITIRO: 0 };
    const pagamenti = {
      efectivo:        { incasso: 0, count: 0 },
      tarjeta:         { incasso: 0, count: 0 },
      bizum:           { incasso: 0, count: 0 },
      no_especificado: { incasso: 0, count: 0 },
    };
    fonteOrdini.forEach(r => {
      let items = r.items;
      if (typeof items === "string") { try { items = JSON.parse(items); } catch(e) { items = []; } }
      let totale = Number(r.totale) || 0;
      if (totale <= 0 && Array.isArray(items)) {
        totale = calcTotale(items.filter(i => i.n !== "Entrega a domicilio"), r.tipo_consegna || "RITIRO");
      }
      incasso += totale;
      const canal = r.canal === "WA" ? "WA" : r.canal === "BANCO" ? "BANCO" : r.canal === "TEL" ? "TEL" : "MANUAL";
      canali[canal] = (canali[canal] || 0) + 1;
      const tc = r.tipo_consegna === "DOMICILIO" ? "DOMICILIO" : "RITIRO";
      consegne[tc] = (consegne[tc] || 0) + 1;
      const mp = String(r.metodo_pago || "").toLowerCase();
      const pk = mp === "efectivo" ? "efectivo"
        : mp === "tarjeta" ? "tarjeta"
        : mp === "bizum"   ? "bizum"
        : "no_especificado";
      pagamenti[pk].incasso += totale;
      pagamenti[pk].count   += 1;
      (Array.isArray(items) ? items : []).forEach(it => {
        if (!it || !it.n) return;
        const q = parseInt(it.q) || 1, p = parseFloat(it.p) || 0;
        if (!prodMap[it.n]) prodMap[it.n] = { n: it.n, e: it.e || "🍕", q: 0, incasso: 0, cat: it.cat || "Pizzas" };
        prodMap[it.n].q += q;
        prodMap[it.n].incasso += p * q;
      });
    });
    const prodotti   = Object.values(prodMap).sort((a, b) => b.q - a.q);
    const pizzeTot   = prodotti.filter(p => p.cat !== "Bebidas").reduce((s, p) => s + p.q, 0);
    const bevandeTot = prodotti.filter(p => p.cat === "Bebidas").reduce((s, p) => s + p.q, 0);
    // Arrotonda incassi pagamento
    Object.keys(pagamenti).forEach(k => {
      pagamenti[k].incasso = Math.round(pagamenti[k].incasso * 100) / 100;
    });
    return {
      ordini: fonteOrdini, incasso: Math.round(incasso * 100) / 100,
      countOrdini: fonteOrdini.length,
      ticketMedio: fonteOrdini.length > 0 ? Math.round((incasso / fonteOrdini.length) * 100) / 100 : 0,
      prodotti, canali, consegne, pizzeTot, bevandeTot, pagamenti, fonte
    };
  },

  // ── Ops health (OPS-HEALTH-01-FE-BADGE) ───────────────────────
  // Lettura diretta del backend /status, endpoint pubblico (no X-Api-Key).
  // Timeout client 4s. Bypass del proxy Netlify: /status non è autenticato
  // e non passa da /api proxy. Niente segreti, niente payload utenti.
  // Base URL env-based (BACKEND_BASE_URL) — niente hardcode prod qui: in
  // V1/staging punta al backend staging, mai al backend di produzione.
  getStatus: async function() {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(
        `${BACKEND_BASE_URL}/status`,
        { cache: "no-store", signal: ctrl.signal }
      );
      if (!res.ok) throw new Error(`http_${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(tid);
    }
  }
};

// API_URL e RAILWAY_API_KEY non sono più esposti — il proxy Netlify gestisce l'auth.
const API_URL = PROXY_URL;
const RAILWAY_API_KEY = ""; // legacy export, non più usato

export { sb, api, auth, SUPABASE_URL, SUPABASE_KEY, API_URL, RAILWAY_API_KEY, shouldInvalidateOperationalSession };
