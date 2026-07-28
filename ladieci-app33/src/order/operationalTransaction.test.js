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
    ["Confirmar", "Guardando pedido…", "Pedido confirmado"],
    ["A Cocina", "Enviando a cocina…", "Pedido enviado a cocina"],
  ])("%s publishes pending synchronously before the request resolves", async (
    _label, pendingTitle, successTitle
  ) => {
    const backend = deferred();
    const events = [];
    const transaction = runOperationalTransaction({
      now: () => 100,
      pendingTitle,
      successTitle,
      beforeRequest: () => {
        events.push("snapshot");
        events.push("modal-closed");
        events.push("tel-active");
        events.push("pending-card");
      },
      publishFeedback: (feedback) => events.push(feedback?.phase || "cleared"),
      request: () => {
        events.push("request-started");
        return backend.promise;
      },
      onSuccess: () => events.push("actionable-card-render-requested"),
    });

    expect(events).toEqual([
      "snapshot", "modal-closed", "tel-active", "pending-card",
      "pending", "request-started",
    ]);
    expect(events).not.toContain("success");

    backend.resolve({ id: "persisted", serviceOrderNumber: 1 });
    await transaction;
    expect(events.indexOf("actionable-card-render-requested"))
      .toBeLessThan(events.indexOf("success"));
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

  test("shared minimum is one second", () => {
    expect(OPERATIONAL_TRANSACTION_MIN_DURATION_MS).toBe(1000);
  });
});
