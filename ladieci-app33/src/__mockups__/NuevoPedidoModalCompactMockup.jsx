import React, { useMemo, useState } from "react";
import "./NuevoPedidoModalCompactMockup.css";

const SHOW_EMPTY_STATE = false;

const MOCK_PRODUCTS = [
  { id: 1, name: "Zizou", note: "+ jamon · + cebolla · cortar mitad", qty: 1, price: 13.5 },
  { id: 2, name: "Margherita", note: "+ aceitunas x2 · sin queso", qty: 1, price: 9.5 },
  { id: 3, name: "Diavola", note: "extra picante", qty: 1, price: 13 },
  { id: 4, name: "El Pelusa", note: "sin cebolla", qty: 1, price: 12 },
  { id: 5, name: "Napoli", note: "", qty: 1, price: 11.5 },
  { id: 6, name: "Prosciutto", note: "cortar en 8", qty: 1, price: 12 },
  { id: 7, name: "Coca-Cola", note: "", qty: 2, price: 2.4 },
  { id: 8, name: "Agua", note: "", qty: 1, price: 1.6 },
  { id: 9, name: "Tiramisu", note: "", qty: 1, price: 5.5 },
  { id: 10, name: "Cafe", note: "", qty: 1, price: 1.8 },
];

export default function NuevoPedidoModalCompactMockup() {
  const [showEmpty, setShowEmpty] = useState(SHOW_EMPTY_STATE);
  const products = showEmpty ? [] : MOCK_PRODUCTS;

  const itemCount = useMemo(
    () => products.reduce((sum, product) => sum + product.qty, 0),
    [products]
  );
  const total = useMemo(
    () => products.reduce((sum, product) => sum + product.qty * product.price, 4.5),
    [products]
  );

  return (
    <div className="np-mockup-stage">
      <div className="np-toolbar" aria-label="Controlli mockup locale">
        <button type="button" onClick={() => setShowEmpty((value) => !value)}>
          {showEmpty ? "Ver pedido cargado" : "Ver estado vacio"}
        </button>
      </div>

      <section className="np-modal" role="dialog" aria-label="Nuevo pedido compacto">
        <header className="np-header">
          <div className="np-title-row">
            <h1>Nuevo Pedido</h1>
            <p className="np-kicker">☎ Origen: Telefono</p>
          </div>
          <button className="np-close" type="button" aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="np-top">
          <section className="np-panel np-customer-panel" aria-label="Cliente">
            <h2>Cliente</h2>
            <div className="np-customer-grid">
              <button className="np-input-like np-name-field" type="button">
                <strong>Big Art Video Agency</strong>
                <span className="np-ok">✓</span>
              </button>
              <button className="np-icon-action" type="button" aria-label="Editar cliente">
                👤+
              </button>
              <button className="np-input-like np-phone-field" type="button">
                <span>☎</span>
                <strong>41767011848</strong>
              </button>
              <button className="np-whatsapp" type="button" aria-label="WhatsApp">
                WhatsApp
              </button>
            </div>
            <div className="np-customer-flags">
              <span>★ Cliente habitual</span>
              <span>53 pedidos</span>
              <span>Direccion guardada</span>
            </div>
          </section>

          <section className="np-panel np-address-panel" aria-label="Direccion de entrega">
            <h2>Direccion de entrega</h2>
            <button className="np-input-like np-address-input" type="button">
              <strong>C. Delfin, 45-47</strong>
              <em>✎ Editar</em>
            </button>

            <div className="np-delivery-line">
              <span>🗺 Q2 Buenavista</span>
              <span>↻ 8 min</span>
              <span>G Google</span>
            </div>

            <div className="np-delivery-cards">
              <div>
                <small>Entrega estimada</small>
                <strong>16:55</strong>
              </div>
              <div>
                <small>Salida horno</small>
                <strong>16:47</strong>
              </div>
              <button type="button">⚙ Recalcular</button>
            </div>
          </section>
        </div>

        <div className="np-products-head">
          <div>
            <h2>Productos</h2>
            <span>{products.length} items</span>
          </div>
          <button type="button">⊕ Anadir producto</button>
        </div>

        <div className="np-products">
          {products.length === 0 ? (
            <div className="np-empty">
              <strong>Todavia no hay productos</strong>
              <button type="button">+ Anadir pizza, bebida o postre</button>
            </div>
          ) : (
            products.map((product) => (
              <article className="np-row" key={product.id}>
                <span className="np-index">{product.id}</span>
                <div className="np-product-name">
                  <strong>{product.name}</strong>
                </div>

                <p className={product.note ? "np-note" : "np-note np-note-muted"}>
                  {product.note || "-"}
                </p>

                <strong className="np-price">{product.price.toFixed(2)}€</strong>

                <div className="np-actions" aria-label={`Acciones ${product.name}`}>
                  <button type="button" title="Editar ingredientes">
                    ✎
                  </button>
                  <button type="button" title="Quitar una unidad">
                    −
                  </button>
                  <strong>{product.qty}</strong>
                  <button type="button" title="Anadir una unidad">
                    +
                  </button>
                  <button className="np-danger" type="button" title="Eliminar">
                    🗑
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <footer className="np-footer">
          <div className="np-summary">
            <span>{itemCount} items</span>
            <strong>Total {total.toFixed(2)}€</strong>
            <small>Incl. 2.50€ entrega</small>
          </div>

          <button className="np-secondary" type="button">
            % Descuento
          </button>

          <label className="np-paid">
            <input type="checkbox" />
            Pagado
          </label>

          <button className="np-confirm" type="button" disabled={products.length === 0}>
            Confirmar pedido
          </button>
        </footer>
      </section>
    </div>
  );
}
