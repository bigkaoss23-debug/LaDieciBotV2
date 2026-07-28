import React, { forwardRef, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useOrderCreationQueue } from "./useOrderCreationQueue";

global.IS_REACT_ACT_ENVIRONMENT = true;

const order = {
  id: "local-only",
  client_req_id: "request-1",
  canal: "MANUAL",
  estado: "POR_CONFIRMAR",
  nombre: "Cliente iPhone",
  items: [{ n: "Margherita", q: 2 }],
  total: 20,
};

const Harness = forwardRef(({ persisted = [] }, ref) => {
  const queue = useOrderCreationQueue(persisted);
  useImperativeHandle(ref, () => queue, [queue]);
  return (
    <div>
      {queue.visibleOrders.map(item => (
        <div key={item.id || item._localKey} data-phase={item._localPhase || "persisted"}>
          {item.nombre}
        </div>
      ))}
    </div>
  );
});

const mount = (persisted = []) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const ref = React.createRef();
  act(() => root.render(<Harness ref={ref} persisted={persisted} />));
  return {
    container,
    ref,
    rerender: next => act(() => root.render(<Harness ref={ref} persisted={next} />)),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
};

describe("useOrderCreationQueue", () => {
  test("shows an immutable pending card immediately while a controlled create promise is unresolved", async () => {
    const view = mount();
    let resolveCreate;
    const createPromise = new Promise(resolve => { resolveCreate = resolve; });

    act(() => {
      const pending = view.ref.current.begin(order);
      expect(pending.id).toBeUndefined();
    });

    expect(view.container.textContent).toContain("Cliente iPhone");
    expect(view.container.querySelector('[data-phase="saving"]')).toBeTruthy();

    await act(async () => {
      resolveCreate({ id: "DB-101" });
      const response = await createPromise;
      view.ref.current.confirm(order.client_req_id, { ...order, ...response, _temp: false });
    });

    expect(view.container.querySelector('[data-phase="saving"]')).toBeNull();
    expect(view.container.textContent).toContain("Cliente iPhone");
    view.unmount();
  });

  test("a stale refetch cannot remove a recently confirmed card and backend reconciliation deduplicates it", () => {
    const view = mount();
    act(() => {
      view.ref.current.begin(order);
      view.ref.current.confirm(order.client_req_id, { ...order, id: "DB-102", _temp: false });
    });

    view.rerender([]);
    expect(view.container.textContent).toContain("Cliente iPhone");
    expect(view.container.querySelectorAll("div[data-phase]")).toHaveLength(1);

    view.rerender([{ ...order, id: "DB-102", _temp: false }]);
    expect(view.container.querySelectorAll("div[data-phase]")).toHaveLength(1);
    view.unmount();
  });

  test("failure removes only the pending card and releases the idempotency lock for an explicit retry", () => {
    const view = mount();
    act(() => view.ref.current.begin(order));
    expect(view.container.textContent).toContain("Cliente iPhone");

    act(() => view.ref.current.fail(order.client_req_id));
    expect(view.container.textContent).not.toContain("Cliente iPhone");

    let retry;
    act(() => { retry = view.ref.current.begin(order); });
    expect(retry).not.toBeNull();
    expect(view.container.textContent).toContain("Cliente iPhone");
    view.unmount();
  });

  test("a domicilio order survives the same success and stale-refetch reconciliation", () => {
    const domicilio = {
      ...order,
      client_req_id: "request-home",
      tipo_consegna: "DOMICILIO",
      direccion: "Dirección de prueba",
    };
    const view = mount();
    act(() => {
      view.ref.current.begin(domicilio);
      view.ref.current.confirm(domicilio.client_req_id, { ...domicilio, id: "DB-HOME", _temp: false });
    });
    view.rerender([]);
    expect(view.container.textContent).toContain("Cliente iPhone");
    view.rerender([{ ...domicilio, id: "DB-HOME", _temp: false }]);
    expect(view.container.querySelectorAll("div[data-phase]")).toHaveLength(1);
    view.unmount();
  });
});
