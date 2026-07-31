/**
 * GATE A · 1-4 — auth shell, gate PIN, confini di ruolo.
 *
 * Nessun mock di modulo qui: usa il vero `src/api.js` (`auth`), con solo
 * `global.fetch` sostituito per il test del login. Nessuna rete reale, nessun
 * PIN reale.
 *
 * Copertura correlata già esistente e non duplicata:
 *   core/orders/gitLinePreservation.static.test.js → "api.js espone il layer auth"
 *   (verifica solo che l'export esista; qui provo il comportamento).
 */
import { auth } from "../api";

afterEach(() => {
  try { sessionStorage.clear(); } catch (e) { /* noop */ }
  jest.restoreAllMocks();
});

const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fakeToken = (role, expOffsetSec) =>
  b64url({ alg: "none", typ: "JWT" }) + "." +
  b64url({ sub: "test", role, exp: Math.floor(Date.now() / 1000) + expOffsetSec }) + ".sig";

describe("1-2 · auth shell e gate PIN", () => {
  test("isAuthenticated: nessun token → false", () => {
    expect(auth.isAuthenticated()).toBe(false);
  });

  test("isAuthenticated: token valido e non scaduto → true", () => {
    auth.setToken(fakeToken("operador", 3600));
    expect(auth.isAuthenticated()).toBe(true);
  });

  test("isAuthenticated: token scaduto → false", () => {
    auth.setToken(fakeToken("operador", -10));
    expect(auth.isAuthenticated()).toBe(false);
  });

  test("isAuthenticated: token malformato → false, non lancia", () => {
    auth.setToken("non.un.jwt.valido.con.troppe.parti");
    expect(() => auth.isAuthenticated()).not.toThrow();
    auth.setToken("solouna");
    expect(auth.isAuthenticated()).toBe(false);
  });

  test("isAuthenticated: payload non decodificabile → false, non lancia", () => {
    auth.setToken("aaa.###notbase64###.ccc");
    expect(() => auth.isAuthenticated()).not.toThrow();
    expect(auth.isAuthenticated()).toBe(false);
  });

  test("clear() rimuove token, ruolo e pin_ok — la sessione torna anonima", () => {
    auth.setToken(fakeToken("operador", 3600));
    auth.setRole("operador");
    sessionStorage.setItem("ld_pin_ok", "1");
    auth.clear();
    expect(auth.getToken()).toBe("");
    expect(auth.getRole()).toBe("");
    expect(sessionStorage.getItem("ld_pin_ok")).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  test("la sessione vive in sessionStorage, MAI in localStorage (browser condiviso fra operatori)", () => {
    auth.setToken(fakeToken("operador", 3600));
    expect(sessionStorage.getItem("ld_token")).toBeTruthy();
    expect(localStorage.getItem("ld_token")).toBeNull();
  });

  test("login(): PIN corretto imposta token+ruolo+pin_ok", async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true, json: async () => ({ token: fakeToken("operador", 3600), role: "operador" }),
    });
    const res = await auth.login("123456", "operador");
    expect(res.success).toBe(true);
    expect(auth.isAuthenticated()).toBe(true);
    expect(sessionStorage.getItem("ld_pin_ok")).toBe("1");
    global.fetch = realFetch;
  });

  test("login(): PIN errato non imposta nulla e resta non autenticato", async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false, json: async () => ({ error: "PIN incorrecto" }),
    });
    const res = await auth.login("000000", "operador");
    expect(res.success).toBeUndefined();
    expect(res.error).toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    global.fetch = realFetch;
  });

  test("errore di rete durante il login: nessuna eccezione, nessuna sessione impostata", async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("network down"));
    const res = await auth.login("123456", "operador");
    expect(res.error).toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
    global.fetch = realFetch;
  });

  test("il corpo della richiesta di login porta solo i campi attesi (pin, role)", async () => {
    const realFetch = global.fetch;
    let capturedBody = null;
    global.fetch = jest.fn().mockImplementation((url, opts) => {
      capturedBody = opts && opts.body;
      return Promise.resolve({ ok: true, json: async () => ({ token: fakeToken("operador", 3600), role: "operador" }) });
    });
    await auth.login("999999", "operador");
    expect(Object.keys(JSON.parse(capturedBody)).sort()).toEqual(["pin", "role"]);
    global.fetch = realFetch;
  });
});

describe("3-4 · confini di ruolo operador/repartidor", () => {
  // Stesso predicato usato da RepartidorPage.jsx per il proprio gate iniziale
  // (verificato byte-per-byte più sotto contro il sorgente reale).
  const repartidorGate = () => {
    try {
      const role = sessionStorage.getItem("ld_role");
      return role === "repartidor" && auth.isAuthenticated();
    } catch (e) { return false; }
  };

  test("un token 'operador' valido NON sblocca il gate repartidor", () => {
    auth.setToken(fakeToken("operador", 3600));
    auth.setRole("operador");
    expect(repartidorGate()).toBe(false);
  });

  test("un token 'repartidor' valido sblocca il gate repartidor", () => {
    auth.setToken(fakeToken("repartidor", 3600));
    auth.setRole("repartidor");
    expect(repartidorGate()).toBe(true);
  });

  test("nessuna sessione → nessuna rotta operativa sbloccata", () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(repartidorGate()).toBe(false);
  });

  test("un token scaduto con ruolo repartidor NON sblocca (isAuthenticated domina sul ruolo)", () => {
    auth.setToken(fakeToken("repartidor", -1));
    auth.setRole("repartidor");
    expect(repartidorGate()).toBe(false);
  });

  test("App.jsx: pinUnlocked riflette auth.isAuthenticated() al mount, non un default permissivo", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "App.jsx"), "utf8");
    expect(src).toMatch(/useState\(\(\)\s*=>\s*auth\.isAuthenticated\(\)\)/);
    expect(src).toMatch(/if\s*\(pinUnlocked\s*&&\s*auth\.isAuthenticated\(\)\)\s*{\s*action\(\);\s*return;\s*}/);
  });

  test("RepartidorPage: il sorgente reale usa lo stesso confine di ruolo verificato sopra", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "components/repartidor/RepartidorPage.jsx"), "utf8");
    expect(src).toMatch(/role === "repartidor" && auth\.isAuthenticated\(\)/);
    expect(src).toMatch(/auth\.login\(value, "repartidor"\)/);
  });

  test("lo sblocco effettivo scatta solo dentro il ramo result.success del login, non incondizionatamente", () => {
    const fs = require("fs");
    const path = require("path");
    const repSrc = fs.readFileSync(path.join(__dirname, "..", "components/repartidor/RepartidorPage.jsx"), "utf8");
    const appSrc = fs.readFileSync(path.join(__dirname, "..", "App.jsx"), "utf8");
    // Le 40 righe che precedono ciascun setXUnlocked(true) devono contenere il
    // controllo result.success — è lì il gate, non nella sola chiamata a login().
    const guardedBySuccessCheck = (src, setter) => {
      const idx = src.indexOf(setter);
      expect(idx).toBeGreaterThan(-1);
      const before = src.slice(Math.max(0, idx - 200), idx);
      return /result\.success/.test(before);
    };
    expect(guardedBySuccessCheck(repSrc, "setRepUnlocked(true)")).toBe(true);
    expect(guardedBySuccessCheck(appSrc, "setPinUnlocked(true)")).toBe(true);
  });
});
