# HANDOFF REPORT — Nuevo Pedido V1 · Staging

**Data:** 2026-06-12 · **Branch:** `consolidation/nuevo-pedido-v1-unified-2026-06-09` · **HEAD:** `b8d89e4`

---

## 1. Stato staging
| Campo | Valore |
|---|---|
| URL | https://ladieci-v1-staging.netlify.app |
| site_id | `a3ad035a-e73f-4da3-8873-6403e31f04b6` (`ladieci-v1-staging`) |
| Deploy ID (pubblicato) | `6a2bc9f0129f332840b55889` · context `production` · published 08:57 |
| Commit / version.json | `b8d89e4` (`b8d89e4108c9e7ccff97d42f3ce57fa2a96e992c`) |
| Bundle | `main.35860334.js` |
| Backend preflight | `/health` 200 · `/status` overall 🟡 → **backend 🟢 green · DB 🟢 green** · ordini 0 · WA 🟡 (solo assenza traffico, non guasto) |

---

## 2. Commit principali inclusi
| Tema | Commit |
|---|---|
| Picker edit/modal + extras | `5182a9b` focus item edit modal + picker usability · `567db58` improve ingredient picker flow |
| Note cucina overlay | `239f7f3` overlay ingredienti dal pencil · `a1a0cb3` show item notes in overlay |
| Desktop UI refresh | `b6e34aa` (parte UI) |
| Planner reale | `b6e34aa` (parte: real planner proposals, read-only) |
| zoneMap naming cleanup | `b8d89e4` |

---

## 3. Cosa È verificato (automatico)
- ✅ Deploy sul **site_id staging corretto** `a3ad035a` (MCP autoritativo, non prod)
- ✅ **Version stamp** `b8d89e4` (curl live `/version.json`)
- ✅ **Bundle** `main.35860334.js` (curl live `index.html`)
- ✅ **Dominio Netlify reale** (`server: Netlify`, `x-nf-request-id`, HTTP/2 200) — non localhost
- ✅ **backend + DB verdi**
- ✅ **Production `02bd4c7a` NON toccata** (tutti i deploy scoped `--site=a3ad035a`)

---

## 4. Cosa NON è verificato (serve smoke manuale)
Login operatore · RITIRO senza planner · DOMICILIO con planner reale · assenza mock/LAB nel popup · nota cucina + Jamón ×2 · layout desktop reale · mobile/tablet · console live.
*(Motivo: nessun browser automatico raggiunge il dominio live + login PIN non eseguibile da me.)*

---

## 5. Checklist smoke manuale (≤10)
> Desktop largo · hard-refresh (Cmd+Shift+R) · Console aperta.
1. Apri URL → header `version` / Network: bundle `main.35860334.js`.
2. Login operatore.
3. RITIRO → **`Ver propuestas` ASSENTE**.
4. DOMICILIO + indirizzo + hora → **`Ver propuestas` PRESENTE**, `Compatible` compatto in header.
5. Click planner → proposte **reali** (coerenti col tuo draft) **o** overlay errore sicuro.
6. ❌ Nessuna riga finta canonica / scritta LAB / static_lab.
7. Pencil prodotto → overlay ingredienti mostra **nota cucina** (rossa).
8. **Jamón cocido ×2** → riga 2 livelli leggibile, no troncamento.
9. Layout **desktop compatto ~1280px** (non mobile gigante).
10. **Console 0 errori** · ⛔ **NON premere Confirmar**.

---

## 6. Criteri PASS / FAIL
**PASS se:** nessun mock · planner nascosto in RITIRO · planner visibile in DOMICILIO · note/extra ok · nessun Confirmar premuto · console pulita.
→ *Esito PASS:* staging **validato**. La promozione a produzione è un passo **separato e autorizzato a parte** (non automatico, non ora).

**FAIL se:** mock/LAB visibile · bottone planner in RITIRO · nota cucina non visibile · layout mobile gigante su desktop · errore rosso bloccante in console.

---

## 7. Rollback / stop
- ❌ Se staging FALLISCE → **NON toccare production**.
- 🔧 Aprire **fix locale sul branch V1** (`consolidation/nuevo-pedido-v1-unified-2026-06-09`) → ri-build → ri-deploy **solo staging** (`--site=a3ad035a` esplicito).
- 🗄️ **No DB cleanup** salvo ordine TEST creato → marker `TEST_V1_STAGING_B8D89E4_DELETE_OK`, PREVIEW→DELETE fuori servizio.
- ↩️ *(Opz.)* Rollback deploy staging precedente disponibile: `6a2ad578d6e1131a8f391dad`.

---

**Vincoli rispettati:** ❌ patch ❌ deploy ❌ commit ❌ backend ❌ DB ❌ main ❌ production.
