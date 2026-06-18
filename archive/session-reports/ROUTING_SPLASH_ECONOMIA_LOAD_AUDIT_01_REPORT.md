# ROUTING_SPLASH_ECONOMIA_LOAD_AUDIT_01 — REPORT

**Data:** 2026-06-15 · **Tipo:** AUDIT READ-ONLY (nessuna patch, nessun deploy)
**Codice:** produzione `069c273` · `ladieci-app33/src/App.jsx`, `EconomiaPage.jsx`, `ServicioPage.jsx`, `repartidor/RepartidorPage.jsx`, `EconBotPage.jsx`.

---

## DIAGNOSI PRINCIPALE (ribalta la premessa)
**`getStorico` NON viene caricato quando apri Servizio o Delivery.** È chiamato **solo dentro `EconomiaPage`** (`EconomiaPage.jsx:481`), che viene **montato solo se `screen==="economia"`** (render condizionale `App.jsx:385`). Quindi il payload pesante (~572 KB) parte **solo entrando in Economia**, non altrove.

Cosa è vero invece:
1. **`EconomiaPage` è importato STATICAMENTE** (`App.jsx:13`, nessun `React.lazy`) → il suo **codice** è dentro il bundle principale (parsato sempre, anche per Servizio/Delivery). È peso di bundle, **non** una chiamata API.
2. **Il `loadAll` globale** (`App.jsx:177`) carica **`getOrdenes` + `getWaMsgs` + `conv`** a OGNI schermata, **inclusa Delivery** — dove `wa_msgs`/`conv` non servono.

---

## FASE 1 — Mappa ingressi/URL

`screen` è inizializzato dal **pathname** (`App.jsx:23`), non da localStorage:
- `/repartidor` → **delivery** (diretto, salta splash; back non torna a Home).
- ogni altro path → **splash**, poi un effect deep-link (`App.jsx:47`) decide la destinazione post-splash:
  - `/servizio` → `servicio` (dietro PIN)
  - `/shadow-preview` → `shadowpreview` (admin nascosto, dietro PIN)
  - tutto il resto (incluso `/`) → `econbot` (menu Economia & Bot)... **ma solo se c'era un path**; con `/` puro `postSplashAction` default = `home`.

Risposte:
1. **URL/modalità reali:** `/` (splash→home menu), `/servizio`, `/repartidor`, `/shadow-preview`. **Non esiste un URL `/economia`**: Economia si raggiunge solo da dentro EconBotPage (`onEconomia → setScreen("economia")`).
2. **Pagina iniziale:** decisa dal pathname + PIN. Deterministica.
3. **Perché localhost/test apre pagine diverse:** è il **pathname** a deciderlo (`/repartidor` → delivery, `/servizio` → servizio). Nessun random.
4. **Stato persistente che forza l'ultima tab:** **NO.** Solo `sessionStorage` per il JWT (auth, per-tab). Nessun `localStorage` (regola di progetto: «MAI localStorage»). Le sotto-tab di ServicioPage (Tel/Cocina/…) sono stato React in memoria, si resettano al remount — non persistono tra sessioni.

## FASE 2 — Effect globali (App.jsx) — solo 3
| Effect | riga | trigger | API | Servicio | Economia | Delivery |
|---|---|---|---|---|---|---|
| Deep-link routing | 47 | mount `[]` | nessuna | sì (set dest) | n/a | no (return su /repartidor) |
| Title + favicon | 101 | mount `[]` | nessuna | sì | sì | sì |
| **Realtime + `loadAll`** | 177 | mount `[]` | **getOrdenes + getWaMsgs + conv** | **sì** | **sì** | **sì** ⚠️ |

→ Il `loadAll` globale è l'unico effect con API che parte **ovunque**, delivery inclusa.

## FASE 3 — Mappa chiamate API per pagina
| Chiamata | Dove | Pagina che la usa | All'avvio? | Pesante? | Lazy possibile? |
|---|---|---|---|---|---|
| `getOrdenes` | App.jsx:190 (loadAll) | tutte (ordini) | sì (globale) | medio (~27 KB) | parz. (serve quasi ovunque) |
| `getWaMsgs` | App.jsx:190 | Servicio/WA | sì (globale) | basso | **sì** (inutile in Delivery) |
| `conv` select | App.jsx:190 | Servicio/WA | sì (globale) | basso | **sì** (inutile in Delivery) |
| `getClientes` | ServicioPage:106 · NuevoPedidoModal:435 | Servicio | sì (mount ServicioPage) | medio | cache/once |
| config AI_FORZA/AUTO_RISPOSTA | ServicioPage:120-125 | Servicio | sì (mount) | basso | — |
| `getManualGiros` | TabCocina/PanelCocina/TabEntregas | Cocina/Entregas | on-mount tab | basso | già on-demand |
| `getStatus` | hooks/useOpsHealth | badge salute (non-splash) | sì | basso (Railway /status) | — |
| `previewOrderTiming`/`resolveAddress` | NuevoPedidoModal/ModificaOrdenModal | modal Nuevo/Modifica | on-demand (modal) | medio | già on-demand |
| **`getStorico`** | **EconomiaPage:481** | **Economia** | **solo mount EconomiaPage** | **ALTO (~572 KB, aggregazione client)** | **già deferito ai dati; manca lazy del bundle** |
| `getSerata` | EconomiaPage:473 | Economia | solo mount EconomiaPage | medio | idem |

## FASE 4 — Focus Economia (risposte secche)
- `getStorico` parte aprendo **Servizio**? **NO.**
- `getStorico` parte aprendo **Delivery**? **NO.**
- `getStorico` parte solo entrando in **Economia**? **SÌ** (mount `EconomiaPage`, `:481`).
- Se "sembra" partire sempre: è la **confusione tra import statico** (codice nel bundle) e **mount/fetch** (solo su screen=economia). Il fetch NON parte fuori da Economia.
- Quanto pesa: `getStorico` ~**572 KB** / ~0.58s (500 righe storico + aggregazione lato client) — vedi `LIVE_PERFORMANCE_AUDIT_APP_SLOW_01`.
- Componenti Economia montati sempre: **nessuno** — `EconomiaPage` è montata solo su `screen==="economia"`. È solo **importata** sempre (peso bundle).

## Cosa carica OGGI ogni link
| Link | Monta | API all'avvio |
|---|---|---|
| **Servizio** (`/servizio`) | ServicioPage | loadAll(ordenes+wa+conv) + getClientes + 2 config + getStatus. **NO getStorico** |
| **Economia & Bot** (`/econbot`) | EconBotPage (menu) | solo loadAll globale + getStatus. **NO getStorico** finché non clicchi "Economia" |
| → **Economia** (da menu) | EconomiaPage | **getStorico (572KB) + getSerata** (qui, e solo qui) |
| **Delivery** (`/repartidor`) | RepartidorPage | loadAll(ordenes **+ wa + conv inutili**) + getStatus. **NO getStorico, NO getClientes** |

## Cosa DOVREBBE caricare
- Servizio: ordenes + wa + conv + clientes (ok com'è).
- Delivery: **solo ordenes** (no wa_msgs, no conv) + status.
- Economia: getStorico/getSerata (ok, già lazy ai dati); il **bundle** di Economia non dovrebbe pesare sull'avvio di Servizio/Delivery.

---

## FASE 5/6 — Proposta architettura (NON applicata)

**R1 — modalità iniziale deterministica (rischio BASSO-MEDIO)**
- Aggiungere path espliciti `/economia` e `/delivery` (alias di `/repartidor`) e usarli come unica fonte di verità. La logica è già pathname-based; manca solo `/economia` come deep-link e dopo-PIN tornare alla **modalità dell'URL**, non a un default. (Già oggi NON c'è "ultima pagina casuale": il default è `home`/menu.)

**R2 — lazy loading EconomiaPage (rischio BASSO, vincita su avvio)**
- `const EconomiaPage = React.lazy(() => import('./components/EconomiaPage'))` + `<Suspense fallback={…}>`. Toglie il codice Economia dal bundle iniziale di Servizio/Delivery. `getStorico` è già deferito ai dati; questo deferisce anche il **codice**.

**R3 — `loadAll` scoped per pagina (rischio MEDIO)**
- Per `screen==="repartidor"` saltare `getWaMsgs` + `conv` (delivery non li usa) → meno carico all'avvio delivery. ⚠️ tocca il `loadAll` globale condiviso col realtime: va fatto con cura (il realtime su wa_msgs/conv resta per Servizio).

**R4 — smoke routing**
- Test che `/servizio`, `/repartidor`, `/economia` aprano la pagina giusta e che `getStorico` parta **solo** su Economia (instrumentazione `fetch` come nello smoke P1A).

### Piano patch a blocchi (da fare su branch isolato + staging, con OK)
- **R1** modalità iniziale deterministica (+ `/economia`, `/delivery`).
- **R2** lazy EconomiaPage (la più sicura e di impatto sull'avvio).
- **R3** loadAll scoped delivery (più delicata).
- **R4** smoke routing.

## Rischio sintesi
- R2: basso (standard React.lazy; verificare Suspense + che il chunk carichi entrando in Economia).
- R1: basso-medio (entry/deep-link + flusso PIN da ritestare).
- R3: medio (tocca il data-flow globale/realtime — la parte più rischiosa).

## Cosa NON toccare
- `NuevoPedidoModal` vecchio, Planner, V1, backend, DB, `ORDINI_2026-05-23.md`, deploy/produzione senza autorizzazione.

## Safety
- ✅ Audit READ-ONLY. Nessun patch/deploy/DB write/cleanup/push main/consolidation. Produzione invariata (`069c273` / `6a303f3d…` locked).
