import {
  OPERATIONAL_TRANSACTION_MIN_DURATION_MS,
  runOperationalTransaction,
} from "./operationalTransaction";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("click-based operational transaction", () => {
  test.each([
    ["Confirmar", "¡Pedido confirmado!"],
    ["A Cocina", "¡Pedido enviado a cocina!"],
  ])("%s publishes exactly one optimistic message before the request resolves", async (
    _label, optimisticTitle
  ) => {
    const backend = deferred();
    const events = [];
    const transaction = runOperationalTransaction({
      now: () => 100,
      optimisticTitle,
      beforeRequest: () => {
        events.push("snapshot");
        events.push("modal-closed");
        events.push("tel-active");
        events.push("pending-card");
      },
      publishFeedback: (feedback) => events.push(feedback?.title || "cleared"),
      request: () => {
        events.push("request-started");
        return backend.promise;
      },
      onSuccess: () => events.push("actionable-card-render-requested"),
    });

    expect(events).toEqual([
      "snapshot", "modal-closed", "tel-active", "pending-card",
      optimisticTitle, "request-started",
    ]);
    expect(events).not.toContain("Guardando pedido…");
    expect(events).not.toContain("Enviando a cocina…");

    backend.resolve({ id: "persisted", serviceOrderNumber: 1 });
    await transaction;
    expect(events.indexOf("actionable-card-render-requested"))
      .toBeGreaterThan(events.indexOf("request-started"));
    expect(events.filter(event => event === optimisticTitle)).toHaveLength(1);
  });

  test("failure clears pending and restores the form without false success", async () => {
    const backend = deferred();
    const events = [];
    const transaction = runOperationalTransaction({
      pendingTitle: "Guardando pedido…",
      successTitle: "Pedido confirmado",
      beforeRequest: () => events.push("pending-card"),
      publishFeedback: (feedback) => events.push(feedback?.phase || "cleared"),
      request: () => backend.promise,
      onFailure: () => events.push("form-restored"),
    });
    backend.reject(new Error("offline"));
    await expect(transaction).rejects.toThrow("offline");
    expect(events).toEqual(["pending-card", "pending", "cleared", "form-restored"]);
    expect(events).not.toContain("success");
  });

  test("continues a modal-started transaction without restarting its timestamp", async () => {
    const feedback = [];
    const result = await runOperationalTransaction({
      now: () => 900,
      startedAt: 100,
      pendingAlreadyPublished: true,
      pendingTitle: "Guardando pedido…",
      successTitle: "Pedido confirmado",
      beforeRequest: () => { throw new Error("must not restart"); },
      publishFeedback: (value) => feedback.push(value),
      request: async () => ({ id: "persisted" }),
    });

    expect(result.startedAt).toBe(100);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ phase: "success", startedAt: 100 });
  });

  test("shared optimistic feedback duration is 1500 ms", () => {
    expect(OPERATIONAL_TRANSACTION_MIN_DURATION_MS).toBe(1500);
  });
});
