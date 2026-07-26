// S2-7D4E-A — persistence gateway contract.
// The gateway is the ONLY place that knows draft mode exists.

describe("persistenceGateway", () => {
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
    return require("./persistenceGateway");
  };

  describe("normal mode (flag absent)", () => {
    test("calls persist and reports success", async () => {
      const g = load(undefined);
      const calls = [];
      const r = await g.submitOrderPayload({ id: 1 }, { persist: async (p) => { calls.push(p); return { id: "REAL" }; } });
      expect(calls).toHaveLength(1);
      expect(r.status).toBe("success");
      expect(r.data).toEqual({ id: "REAL" });
    });

    test("a throwing persist becomes a typed error, never an exception", async () => {
      const g = load(undefined);
      const r = await g.submitOrderPayload({}, { persist: async () => { throw new Error("sin red"); } });
      expect(r.status).toBe("error");
      expect(r.message).toBe("sin red");
    });

    test("honours a deeper fail-closed guard that reports draftBlocked", async () => {
      const g = load(undefined);
      const r = await g.submitOrderPayload({}, { persist: async () => ({ draftBlocked: true, error: "bloqueado" }) });
      expect(r.status).toBe("blocked");
    });
  });

  describe("draft mode (flag true)", () => {
    test("blocks BEFORE the persist function is ever invoked", async () => {
      const g = load("true");
      let invoked = false;
      const r = await g.submitOrderPayload({}, { persist: async () => { invoked = true; } });
      // This is the guarantee: no mutating request can be constructed, let alone sent.
      expect(invoked).toBe(false);
      expect(r.status).toBe("blocked");
      expect(r.code).toBe("draft_no_persist");
      expect(r.message).toBe("Borrador de prueba — no se guardarán cambios");
    });

    test("blocked is returned, not thrown", async () => {
      const g = load("true");
      await expect(g.submitOrderPayload({}, { persist: async () => {} })).resolves.toBeDefined();
    });

    test("only the exact string 'true' arms it", async () => {
      for (const v of ["false", "1", "TRUE", ""]) {
        const g = load(v);
        expect(g.isPersistenceBlocked()).toBe(false);
      }
      expect(load("true").isPersistenceBlocked()).toBe(true);
    });
  });

  test("a missing persist channel is a typed error, not a crash", async () => {
    const g = load(undefined);
    const r = await g.submitOrderPayload({}, {});
    expect(r.status).toBe("error");
    expect(r.code).toBe("no_persist_fn");
  });
});
