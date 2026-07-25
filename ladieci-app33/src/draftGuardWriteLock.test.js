// S2-7D4D-FIX1 — draft write lock.
// Jest, because it needs process.env manipulated before module load.

describe("draftGuard", () => {
  const OLD = process.env.REACT_APP_DRAFT_NO_PERSIST;
  afterEach(() => {
    if (OLD === undefined) delete process.env.REACT_APP_DRAFT_NO_PERSIST;
    else process.env.REACT_APP_DRAFT_NO_PERSIST = OLD;
    jest.resetModules();
  });

  const load = (val) => {
    jest.resetModules();
    if (val === undefined) delete process.env.REACT_APP_DRAFT_NO_PERSIST;
    else process.env.REACT_APP_DRAFT_NO_PERSIST = val;
    return require("./draftGuard");
  };

  describe("flag absent or false — no effect at all", () => {
    test.each([[undefined], ["false"], ["1"], ["TRUE"], [""]])(
      "value %p leaves every mutation allowed", (val) => {
        const g = load(val);
        expect(g.DRAFT_NO_PERSIST).toBe(false);
        expect(g.isBlockedMutation("createOrden")).toBe(false);
        expect(() => g.assertMutationAllowed("createOrden")).not.toThrow();
        expect(g.getBlockedWrites()).toHaveLength(0);
      });

    // Only the exact string "true" arms the lock — same convention as the other
    // build-time flags on this line.
    test('only exact "true" arms it', () => {
      expect(load("true").DRAFT_NO_PERSIST).toBe(true);
    });
  });

  describe("flag on", () => {
    test("blocks a mutation and records it", () => {
      const g = load("true");
      g._resetBlockedWrites();
      expect(g.isBlockedMutation("createOrden")).toBe(true);
      expect(() => g.assertMutationAllowed("createOrden")).toThrow(/Escritura bloqueada/);
      const rec = g.getBlockedWrites();
      expect(rec).toHaveLength(1);
      expect(rec[0].what).toBe("createOrden");
    });

    test("the thrown error is identifiable, not a bare Error", () => {
      const g = load("true");
      try { g.assertMutationAllowed("eliminaOrdine"); throw new Error("should have thrown"); }
      catch (e) {
        expect(e.name).toBe("DraftWriteBlockedError");
        expect(e.draftBlocked).toBe(true);
        expect(e.what).toBe("eliminaOrdine");
      }
    });

    // The lock must not make the draft unusable: the read-only POST computations
    // the planner depends on have to keep working, or the visual acceptance pass
    // this draft exists for would be impossible.
    test.each([
      ["previewOrderPlanner"], ["previewOrderTiming"],
      ["previewStrategicOpportunities"], ["previewManualGiroRoute"],
    ])("read-only POST %s stays allowed", (action) => {
      const g = load("true");
      expect(g.isBlockedMutation(action)).toBe(false);
      expect(() => g.assertMutationAllowed(action)).not.toThrow();
    });

    test.each([
      ["createOrden"], ["modificaOrdine"], ["eliminaOrdine"], ["cambiaStato"],
      ["setConfig"], ["rispondiWA"], ["upsertCliente"], ["updateNotaCucina"],
      ["sb.upsert(geo_cache)"], ["sb.update(clientes)"],
      ["sb.insert(ordenes)"], ["sb.del(ordenes)"],
    ])("mutation %s is blocked", (action) => {
      const g = load("true");
      expect(g.isBlockedMutation(action)).toBe(true);
    });

    test("an unknown/new action is blocked by default (fail closed)", () => {
      const g = load("true");
      expect(g.isBlockedMutation("someBrandNewWriteAddedLater")).toBe(true);
    });

    test("exposes the Spanish notice for the final mutation controls", () => {
      const g = load("true");
      expect(g.DRAFT_NOTICE).toBe("Borrador de prueba — no se guardarán cambios");
    });
  });

  // The lock must come from the build ONLY. If a URL query, localStorage,
  // sessionStorage, user input or a role/body claim could turn it off, the
  // "draft cannot write" guarantee would be a suggestion, not a property.
  describe("not switchable at runtime", () => {
    test("query string, storage and user input cannot disarm it", () => {
      const g = load("true");
      const before = g.DRAFT_NO_PERSIST;
      try {
        window.history.replaceState({}, "", "/?draft=false&REACT_APP_DRAFT_NO_PERSIST=false");
        window.localStorage.setItem("REACT_APP_DRAFT_NO_PERSIST", "false");
        window.sessionStorage.setItem("REACT_APP_DRAFT_NO_PERSIST", "false");
      } catch (e) { /* jsdom limits */ }
      expect(g.DRAFT_NO_PERSIST).toBe(before);
      expect(g.isBlockedMutation("createOrden")).toBe(true);
      expect(() => g.assertMutationAllowed("createOrden")).toThrow();
    });

    test("a role/body claim cannot widen the allowlist", () => {
      const g = load("true");
      expect(g.isBlockedMutation("createOrden", { role: "admin", allow: true })).toBe(true);
    });

    test("the module reads no storage and no query at all", () => {
      const src = require("fs").readFileSync(require("path").join(__dirname, "draftGuard.js"), "utf8");
      expect(src).not.toMatch(/localStorage|sessionStorage|location\.search|URLSearchParams|document\.cookie/);
    });
  });
});
