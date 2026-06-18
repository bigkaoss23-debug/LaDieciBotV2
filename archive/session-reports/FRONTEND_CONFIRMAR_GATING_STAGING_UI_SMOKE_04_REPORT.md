# FRONTEND CONFIRMAR GATING — STAGING UI SMOKE 04 — REPORT

**Data:** 2026-06-14
**Fix sotto test:** `fix gate confirm on planner hard blocks` — commit `49eee1f`
**Scope:** solo smoke UI read-only (nessun Confirmar premuto). Nessun deploy / commit / push / cleanup.

---

## Ambiente usato

- **Eseguito su:** dev locale `http://localhost:8888` (netlify dev, preview MCP).
- **Commit servito dal dev:** `49eee1f` — **lo stesso** deployato su staging.
- **Motivo:** lo smoke interattivo sul **live staging URL** non è eseguibile con il tooling
  disponibile (vedi nota onesta sotto), quindi è stato eseguito sul dev locale che serve
  lo stesso identico source del commit deployato.

## Staging verificato (via HTTP, no UI)

| Campo | Valore |
|-------|--------|
| commit | `49eee1f` |
| deployId | `6a2e883f7031f4b13a6a85d0` |
| bundle | `main.e928fb23.js` |
| siteUrl | https://ladieci-v1-staging.netlify.app |

(Confermato via `GET /version.json` e HTML root dello staging. Bundle deployato già verificato
contenere il gate — `can_confirm_requested_hora`, `requested_hora_too_soon`, le stringhe-motivo
e il render `<small style="color:#fca5a5;font-weight:800">🚫 {reason}</small>` — nel report 03.)

## Nota onesta — click sullo staging reale NON possibile

Lo smoke a click sul live staging `ladieci-v1-staging.netlify.app` **non è stato eseguito**:
- Preview MCP è legato a `localhost:8888` (non naviga origin esterni).
- Chrome MCP: nessun browser con l'estensione Claude risulta agganciabile a questa sessione
  (`list_connected_browsers` = `[]`, `switch_browser` = "No other browsers available", ripetuto).
- computer-use: i browser sono tier "read" (no click/type).
- Staging è PIN-gated; il login PIN spetta comunque all'utente.

→ Verifica fatta sul dev locale (stesso commit) + verifica bundle staging. Nessun risultato
inventato: i click sul live staging restano da fare manualmente se serve conferma UI-level lì.

---

## Risultati casi 1–5 (localhost dev, commit 49eee1f)

Ogni esito confermato sia a schermo (screenshot) sia via DOM
(`button.np-confirm.disabled` + presenza `<small>🚫…</small>`).

| # | Caso | Input | Confirmar | 🚫 footer / note | Esito |
|---|------|-------|-----------|------------------|-------|
| 1 | RITIRO too-early | nome + 1 pizza, hora 13:24 (min 13:30) | **disabled** | `🚫 Hora pedida muy pronta · mínimo 13:30 (cocina)` | ✅ PASS |
| 2 | DOMICILIO Q1 too-early | Avda Juan Carlos I 50, nome + 1 pizza, hora 13:20 (min 13:35) | **disabled** | `🚫 Hora pedida muy pronta · mínimo 13:35 (cocina + andata)` | ✅ PASS |
| 3 | DOMICILIO Q1 valido | stesso indirizzo, hora 21:35 | **enabled** | badge ✅ Compatible, nessun 🚫 | ✅ PASS |
| 4 | Q5 "no llega" confermabile | Las Marinas, hora 21:55 | **enabled** | mostra "no llega a la hora pedida" + chip "Usa giro compatible", ma NON si blocca; nessun 🚫 | ✅ PASS (no falso-rosso) |
| 5 | BUG A invariato | caso valido | — | "Usa esta hora" **assente**; "Usa giro compatible" presente | ✅ PASS (invariato) |

### Conferme DOM (output reale)

| # | `button.np-confirm.disabled` | footer `🚫` |
|---|------------------------------|-------------|
| 1 | `true` | `🚫 Hora pedida muy pronta · mínimo 13:30 (cocina)` |
| 2 | `true` | `🚫 Hora pedida muy pronta · mínimo 13:35 (cocina + andata)` |
| 3 | `false` | (nessuno) |
| 4 | `false` | (nessuno) — `hasNoLlega: true` |
| 5 | — | `usaEstaHora: false`, `usaGiroCompatible: true` |

---

## Verifiche di contorno

- **Console errors:** **zero** (`preview_console_logs level=error` → vuoto).
- **Network write:** **zero**. Solo preview read-only (`previewOrderPlanner` / `previewOrderTiming`,
  `safety.writes:false`). Nessun `createOrden` / `cambiaStato`.
- **Confirmar:** **mai premuto** in nessun caso → **zero ordini creati**.

## Safety

- ✅ Production frontend **non toccata** (PROD `02bd4c7a` ancora `777ae55` / deploy `6a2533b4926549d7ee8937b1`).
- ✅ Staging non modificato in questo step (nessun deploy).
- ✅ Ordini TEST **#001–#012 intatti**.
- ✅ Manual giro **`mg_260614_1` intatto**.
- ✅ `ORDINI_2026-05-23.md` non toccato.
- ✅ WIP `PremiumPlannerPopup.jsx` non incluso / non toccato.
- ✅ **BUG A invariato** (non corretto).
- ✅ Nessun deploy / commit / push / cleanup.

---

## Verdetto: ✅ OK (comportamento)

Il gate funziona su tutti e 5 i casi: too-early RITIRO e DOMICILIO **bloccati** (Confirmar
disabled + motivo `🚫`), casi validi e Q5 "no llega" **confermabili** (nessun falso-rosso),
BUG A invariato. **Too-early NON resta confermabile.**

**Nota ambiente:** verifica su dev locale (stesso commit `49eee1f` dello staging) + verifica
bundle staging, NON con click sul live staging URL (limite tooling).
