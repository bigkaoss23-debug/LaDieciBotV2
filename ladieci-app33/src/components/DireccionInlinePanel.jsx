const PIZZERIA_ADDRESS = "Plaza Italica 8, Roquetas de Mar";

const routeUrlFor = direccion => (
  `https://www.google.com/maps/dir/${encodeURIComponent(PIZZERIA_ADDRESS)}/${encodeURIComponent(`${direccion.trim()}, Roquetas de Mar`)}`
);

const DireccionInlinePanel = ({
  tipoConsegna,
  direccion,
  setDireccion,
  direccionNote,
  setDireccionNote,
  deliveryZona,
  zonaInfo,
  zonaLoading,
  zonaManuale,
  setZonaInfo,
  setZonaManuale,
  zoneOptions,
  ZonaBadgeComponent,
  backendTiming,
  backendTimingLoading,
  deliveryFornoOut,
  hora,
  setHoraFromOperator,
  deliveryStatus,
  onOpenPlannerLab,
}) => {
  const isDomicilio = tipoConsegna === "DOMICILIO";
  const trimmedDireccion = direccion.trim();
  const showManualZone =
    isDomicilio &&
    trimmedDireccion.length >= 3 &&
    !zonaLoading &&
    (!deliveryZona || (zonaInfo?.metodo === "keyword" && !zonaManuale)) &&
    zonaInfo !== null;

  return (
    <section className="np-panel np-address-panel" aria-label="Dirección de entrega">
      <h2>Dirección de entrega</h2>

      <div className="np-input-like np-address-input">
        {isDomicilio && deliveryZona && <ZonaBadgeComponent zona={deliveryZona} size="sm" />}
        <span className="np-address-ic">{isDomicilio ? "📍" : "🏪"}</span>
        <input
          className="np-address-text"
          value={direccion}
          onChange={e => setDireccion(e.target.value)}
          placeholder="Añadir dirección de entrega"
        />
      </div>

      {isDomicilio && (
        <input
          className="np-address-note"
          value={direccionNote}
          onChange={e => setDireccionNote(e.target.value)}
          placeholder="🏠 Planta, timbre, referencias (opcional)"
        />
      )}

      {showManualZone && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {zonaInfo?.metodo === "keyword" && deliveryZona ? (
            <span style={{ fontSize: 12, color: "rgba(255,200,50,0.9)", fontWeight: 700 }}>
              ⚠️ Calle no encontrada — selecciona zona manualmente
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "rgba(255,200,50,0.8)", fontWeight: 600 }}>⚠️ Zona no detectada —</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {zoneOptions.map(z => (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setZonaInfo({ zona: z, lat: null, lon: null, metodo: "manuale" });
                  setZonaManuale(true);
                }}
                style={{
                  background: "transparent",
                  border: `2px solid ${z.colore}`,
                  color: z.colore,
                  borderRadius: 8,
                  padding: "5px 12px",
                  cursor: "pointer",
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 900 }}>{z.id}</span>
                <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8 }}>{(z.nomeBreve || z.nome).toUpperCase()}</span>
              </button>
            ))}
            {trimmedDireccion && (
              <a
                href={routeUrlFor(direccion)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: "#1D4ED8",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                🗺 Ver ruta
              </a>
            )}
          </div>
        </div>
      )}

      {isDomicilio && (
        <div className="np-delivery-line">
          {(backendTiming?.zona || deliveryZona?.id) && (
            <span>🗺 {backendTiming?.zona || deliveryZona?.id}{deliveryZona?.nome ? ` ${deliveryZona.nome}` : ""}</span>
          )}
          {(backendTiming?.durata_andata_min != null || zonaInfo?.durataAndataMin != null) && (
            <span>↻ {backendTiming?.durata_andata_min ?? zonaInfo?.durataAndataMin} min</span>
          )}
          {(backendTiming?.geo_source || zonaInfo?.metodo) && (
            <span>📡 {backendTiming?.geo_source || zonaInfo?.metodo}</span>
          )}
          {backendTimingLoading && !backendTiming && <span>Calculando…</span>}
        </div>
      )}

      <div className="np-delivery-cards">
        <div className={`np-dcard${isDomicilio ? " is-deliv" : ""}`}>
          <small>{isDomicilio ? "Entrega estimada" : "Retirar a las"}</small>
          <input type="time" value={hora} onChange={e => setHoraFromOperator(e.target.value)} />
        </div>
        <div className="np-dcard">
          <small>Salida horno</small>
          <strong>{isDomicilio ? (deliveryFornoOut || "—") : (hora || "—")}</strong>
        </div>
        <button type="button" className="np-recalc" onClick={onOpenPlannerLab}>◎ Ver propuestas LAB</button>
      </div>

      {isDomicilio && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            color: deliveryStatus.isBlocked ? "#fca5a5" : "#86efac",
            background: deliveryStatus.isBlocked ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
            border: `1px solid ${deliveryStatus.isBlocked ? "rgba(239,68,68,0.30)" : "rgba(34,197,94,0.30)"}`,
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}>
            {deliveryStatus.isBlocked ? "Revisar" : "Compatible"}
          </span>
          {backendTiming?.giro?.suggested && (
            <span style={{
              color: "#bbf7d0",
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.22)",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 12,
              fontWeight: 800,
            }}>
              Giro compatible {(backendTiming?.giro?.zona || deliveryZona?.id || "").trim()}
              {backendTiming?.giro?.slot_hora ? ` · ${backendTiming.giro.slot_hora}` : ""}
            </span>
          )}
        </div>
      )}
    </section>
  );
};

export default DireccionInlinePanel;
