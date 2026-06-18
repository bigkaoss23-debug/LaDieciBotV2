# LIVE SERVICE AUDIT — READ-ONLY — 01

**Verdetto: OK** (1 nota ATTENZIONE non bloccante: RLS — pre-esistente)

Audit eseguito interamente in sola lettura durante servizio live. Zero write, zero deploy, zero cambi stato.

---

## 0. Ora audit
- **Madrid:** 2026-06-14 20:51–20:53 CEST
- Local = Madrid (CEST)

## 1. Backend (Railway `397d4061`)
| Endpoint | Esito |
|---|---|
| `/health` | `{ok:true}` ✓ |
| `/status` | `ok:true`, level **yellow** |
| `/version` | deploymentId `397d4061-...`, commit `unknown` (atteso: `railway up`), env production, uptime ~3.5h |

- `backend` green, `database` green (latency 222 ms)
- `whatsappInbound`/`whatsappProcessed` = **yellow** perché `lastAt: null` → unica causa del livello yellow. Coerente con servizio MANUAL-only stasera (0 ordini canale WA). **Non è un guasto.**
- `ordini`: green, `todayCount: 10`, ultimo creato 18:51:43Z (≈20:51 Madrid).

## 2. Frontend production — INTATTO
- `/version.json`: commit **`777ae55`** (`777ae55d...`), deploy **`6a2533b4926549d7ee8937b1`** ✓
- Netlify API getDeploy: site `02bd4c7a-a50b-4964-90da-8c1af1122932`, state `ready`, **`locked: true`** ✓
- branch/commit_ref = null (coerente: deploy ripristinato, non git-linked — come da memoria)
- Nessun marker UX-1 in prod (commit confermato = pulito 777ae55).

## 3. Frontend staging UX-1
- `/version.json`: commit **`9c1be6d`**, deploy **`6a2ed8d169063284abcdde5c`**, branch `consolidation/nuevo-pedido-v1-unified-2026-06-09`, build 16:37Z ✓ (corrisponde all'atteso)

## 4. DB ordini (`ordenes`, 10 righe — servizio di stasera)

**Per stato:** EN_COCINA 5 · LISTO 3 · RETIRADO 2 · POR_CONFIRMAR 0 · EN_ENTREGA 0
**Per tipo:** RITIRO 7 · DOMICILIO 3
**Per zona:** Q1 ×2 (#003,#004) · Q3 ×1 (#001) · null ×7 (tutti RITIRO — corretto)
**Canale:** MANUAL ×10 (0 WA)

| id | nome | estado | tipo | zona | hora | forno_out | salida | entrega | retraso | confl | giro |
|----|------|--------|------|------|------|-----------|--------|---------|---------|-------|------|
| #001 | MIGUEL | RETIRADO | DOMICILIO | Q3 | 20:30 | 20:22 | 20:22 | 20:30 | 0 | f | – |
| #002 | BARRA | RETIRADO | RITIRO | – | 20:05 | 20:05 | – | – | – | f | – |
| #003 | JOSE MANUEL | LISTO | DOMICILIO | Q1 | 21:20 | 21:15 | 21:15 | 21:20 | 0 | f | – |
| #004 | MARTA ALBUSAC | LISTO | DOMICILIO | Q1 | 20:50 | 20:47 | 20:47 | 20:50 | 0 | f | – |
| #005 | JU8AN CARLOS | LISTO | RITIRO | – | 20:40 | 20:40 | – | – | – | f | – |
| #006 | PAULA | EN_COCINA | RITIRO | – | 20:50 | 20:50 | – | – | – | f | – |
| #007 | MARIA DEL MAR | EN_COCINA | RITIRO | – | 21:01 | 21:01 | – | – | – | f | – |
| #008 | PABLO | EN_COCINA | RITIRO | – | 21:30 | 21:30 | – | – | – | f | – |
| #009 | ALICIA | EN_COCINA | RITIRO | – | 21:15 | 21:15 | – | – | – | f | – |
| #010 | EDUARDO MOLINA | EN_COCINA | RITIRO | – | 21:30 | 21:30 | – | – | – | f | – |

## 5. Anomalie — NESSUNA critica
- DOMICILIO senza direccion: **0** (tutti e 3 hanno indirizzo) ✓
- DOMICILIO zona null: **0** ✓
- RITIRO con direccion/zona spuria: **0** (tutti null) ✓
- `forno_out > hora`: **0** (sempre ≤; DOMICILIO forno anticipa hora, RITIRO forno = hora) ✓
- orari 24:xx/25:xx: **0** ✓
- `salida/entrega` incoerenti: solo DOMICILIO le hanno, RITIRO null — corretto ✓
- `retraso_estimado_min > 0`: **0** ✓
- `conflicto_driver = true`: **0** ✓
- `manual_giro_id` orfano: **0** (join FK pulita) ✓
- TEST residui: **0** ✓
- Ordini terminali (RETIRADO #001/#002) ancora in `ordenes`: normale fino a chiusura serata.
- *(minore, non sistemico)* #005 nome "JU8AN CARLOS" = refuso di battitura operatore.

## 6. Manual giros
- Attivi (`dissolved_at IS NULL`): **0**
- Oggi: `mg_260614_1` creato 10:59 Madrid, **dissolto 11:30 Madrid** (anchor `#003`, hora_ref 21:26). Mattutino, già dissolto prima del servizio serale; nessun ordine attuale vi punta. Innocuo.
- Coerenza `ordenes.manual_giro_id` ↔ `manual_giros`: nessun orfano.

## 7. Planner safety (osservazione, nessun dato creato)
- Nessun giro attivo e nessuna proposta live in corso → niente slip/gap da valutare sul reale in questo istante.
- Soglie live attese sul backend `dc36160`: slip >15 ⇒ `no_recomendado`, Δpromised >25 ⇒ `no_recomendado`. Verifica funzionale rimandata alla Fase 2 (draft staging, senza confermare).

## ⚠️ Nota sicurezza (pre-esistente, NON introdotta da questa sessione)
Advisory Supabase: **RLS disabilitato** su `public.manual_giros` e `public.orden_estado_logs` → leggibili/scrivibili con la sola anon key. Da valutare con policy dedicate (non auto-applicare: abilitare RLS senza policy bloccherebbe l'accesso). Segnalato, nessuna azione presa.

---

### Conclusione Fase 1
Servizio **sano**. Backend e DB coerenti con 10 ordini reali, nessuna anomalia di timing/stato/zona, nessun giro orfano, production frontend bloccata su 777ae55. Si può procedere alla **Fase 2** (simulazione operatore draft su staging, senza Confirmar).
