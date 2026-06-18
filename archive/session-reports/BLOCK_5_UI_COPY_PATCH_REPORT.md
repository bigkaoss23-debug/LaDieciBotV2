# BLOCK_5_UI_COPY_PATCH_REPORT

Data: 2026-06-17 — **Patch frontend LOCALE (presentazione/copy). NO deploy, NO push.** File: `ladieci-app33/src/components/PremiumPlannerPopup.jsx`.

## Fatto (mirato, coerente col fix P0/P1)
1. **Card "Mejor propuesta" segue la proposta `recommended`** (rank 1 del backend), non più il diretto fisso. Quando il diretto è in conflitto rider, il backend (BLOCCO 3) promuove il giro compatibile come `recommended` → la card ora mostra il **giro** (entrega/status/label del giro) invece del diretto cieco. Render puro: legge `proposals[].recommended`/`timeLabel`/`status`/`label` già decisi dal contract; fallback a `bestProposal` se `recommended` assente (happy-path invariato). I 3 box e la selezione di default già seguivano `proposals[]` → mappa + "Aplicar" puntavano già al giro consigliato.
2. **Copy ruoli più chiari** (`PROPOSAL_ROLE_COPY`): `direct: 'Directo'`, `insertion: 'Añadir al giro'` (era `Directa`/`Giro compatible`).

## Test
`PremiumPlannerPopup.smoke` + `PremiumPlannerPopup.cabling` — **12/12 PASS**.

## Deferred (non fatto in questo blocco — motivazione)
Gli altri item UI dello spec toccano **altri componenti** (`NuevoPedidoModal.jsx`, `DireccionInlinePanel.jsx`), sono **cosmetici** e **non validabili a runtime** finché il backend non è deployato. Li elenco per un blocco UI dedicato, per non rischiare un overhaul ampio fuori scope:
- **Rimuovere testi tecnici** `cache-street`/`haversine`/`google`/`Google no disponible` (oggi mostrati in `DireccionInlinePanel`/footer modal).
- **Affidabilità indirizzo** a 3 colori (verde "Dirección confirmada" / giallo "Estimación aproximada" / arancione "Revisar dirección") mappando `geo_source`.
- **Prima pagina**: mini-riga che distingue *ora richiesta cliente* / *primer hueco libre* / *giro compatible* con CTA `Ver propuestas`.
- **Copy esteso proposte**: es. `Directo Q2 · conflicto rider`, `Añadir al giro Q5 · Q2 20:52 · Q5 +4 min` (richiede comporre zona+slip nella label; oggi la `label` insertion arriva vuota dal backend → opportunità: valorizzarla nel contract).
- **`Sin opción`** styling più pulito.
- **Totale 2,50€ con 0 prodotti**: non deve sembrare un ordine valido (validazione modal).

## Nota deploy/runtime
La card riflette il `recommended` **solo se il contract lo espone** → richiede il deploy del backend patchato (BLOCCO 2/3). Oggi vietato: validato via test componente.

**BLOCK 5 = PATCH MIRATA FATTA + TEST VERDI. Resto UI elencato come deferred.**
