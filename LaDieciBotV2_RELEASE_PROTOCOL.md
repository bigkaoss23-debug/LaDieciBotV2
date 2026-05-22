# La Dieci Bot V2 — Release Protocol

Protocollo unico per decidere **quando** una patch può essere deployata, **come**
verificarla, e **come** tornare indietro se rompe. Vale per backend Railway e
frontend Netlify del sistema La Dieci Bot V2.

Si applica insieme alle tre matrici operative:
- `LaDieciBotV2_DELIVERY_ETA_STRESS_MATRIX.md`
- `LaDieciBotV2_DELIVERY_VIS_STRESS_MATRIX.md`
- `LaDieciBotV2_OPS_HEALTH_STRESS_MATRIX.md`

---

## 1. Principio generale

1. **Mai deploy senza i gate adeguati alla categoria** (vedi §3).
   "È solo una riga" non è un gate.
2. **Patch piccola ≠ patch sicura.**
   Le patch più dannose della storia del progetto (durata=30 finta, partial_match
   non scartato, RLS che bloccava scritture in silenzio) erano "piccole".
3. **Niente deploy senza rollback chiaro.**
   Prima di pushare deve essere ovvio:
   - chi pinga cosa per accorgersi che è rotto
   - come si torna alla versione precedente in < 5 min
4. **Manuale-first.**
   Il sistema deve poter cadere senza fermare la pizzeria. WhatsApp diretto +
   ordini su carta sono sempre il fallback.
5. **Causa certa, non sintomo.**
   Si patcha solo quando si capisce il componente che ha sbagliato. Se la
   diagnosi è "non lo so ma sembra questo file" → non si patcha.

---

## 2. Tipi di cambiamento

| Tipo | Esempi | Rischio |
|------|--------|---------|
| **T1 — Docs only** | `.md`, README, spec, queste matrici | Quasi nullo |
| **T2 — UI visuale** | Colori, spacing, label, icone | Basso |
| **T3 — Frontend logic** | Modifiche a `NuevoPedidoModal`, `TabEntregas`, validazioni, calcoli ETA frontend | Medio |
| **T4 — Backend logic** | `geoResolver`, `creaOrdine`, `orchestrator`, `agentCucina` | Alto |
| **T5 — DB / migration** | DDL, indici, RLS, nuove colonne, backfill | Molto alto |
| **T6 — Env / config** | `DASHBOARD_API_KEY`, `GEO_PROVIDER`, env Railway, env Netlify | Alto (silenzioso) |
| **T7 — WhatsApp / bot** | `agentWhatsapp`, prompt Claude, webhook handler | Alto (cliente-facing) |
| **T8 — Delivery / geocoding / ETA** | `geoResolver`, `zones.js`, `forno_out`, cache geo | Alto (operativo) |
| **T9 — Stato ordine / transizioni** | `cambiaStato`, naming stati, `POR_CONFIRMAR` etc. | Molto alto |

Un cambio può rientrare in più categorie: vale la categoria più alta.

---

## 3. Gate obbligatori per categoria

✅ = obbligatorio, ⚠️ = consigliato, — = non applicabile.

| Gate | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 |
|------|----|----|----|----|----|----|----|----|----|
| Build CRA (`npm run build`) | — | ✅ | ✅ | — | — | — | — | ✅ | ✅ |
| `node --check` sui file backend | — | — | — | ✅ | — | — | ✅ | ✅ | ✅ |
| Unit test esistenti rilevanti | — | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Nuovi unit test per il caso fixato | — | — | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Stress matrix riga aggiornata | — | — | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Smoke test manuale browser preview | — | ✅ | ✅ | ⚠️ | — | — | ✅ | ✅ | ✅ |
| Verifica DB read-only post-deploy | — | — | — | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| `/health` ok dopo deploy | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Backup branch remoto pre-push main | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deploy window non in servizio | — | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rollback plan scritto nel commit/PR | — | — | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conferma esplicita utente per deploy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Per T5 (DB/migration): in più richiesto piano di backfill + finestra di
manutenzione + verifica RLS + impatto su frontend non aggiornato.

Per T6 (env): mai stampare valori, mai commit di `.env`, change tracciato
fuori dal repo, e annotazione su quale env (Railway/Netlify/Supabase).

---

## 4. Regole servizio live

**Servizio live** = orario apertura pizzeria (≈ 19:00–23:30 Europe/Madrid)
oppure quando `lastWaInbound` è < 30 min.

Durante servizio live:
1. **Solo emergenze bloccanti.** Patch consentite solo se:
   - bug attivo che genera ordini sbagliati / persi
   - bot che risponde male a clienti
   - watchdog rosso fisso
   - cassa che salta
2. **NIENTE** refactor, rename, riorganizzazioni, cleanup.
3. **NIENTE** DB write, migration, DDL, RLS change, env change.
4. **NIENTE** feature nuove, anche piccole.
5. **NIENTE** "ne approfitto per…": una patch, una causa, un commit.
6. La patch deve essere **chirurgica** (≤ ~10 righe quando possibile) e con
   **causa certa** documentata in §1.5.
7. Backup branch obbligatorio anche per "1 riga".
8. Se la causa non è certa → **NON si patcha**: si scrive nota incidente e
   si aspetta finestra fuori servizio.

**Anti-pattern live: "intanto deployo e vediamo".** Vietato.

---

## 5. Regole backup

Per ogni cambio merge-ato su `main` (qualsiasi categoria):

1. **Commit locale** chirurgico, messaggio in lower-kebab style come da log:
   `fix avoid saving fallback delivery eta`,
   `docs add delivery eta stress matrix`,
   `style strengthen order card colors`.
2. **Backup branch remoto** PRIMA del push su `main`:
   ```
   git push origin main:backup/v2-<scope-kebab>-YYYY-MM-DD
   ```
   - `<scope-kebab>` descrive il cambio (`delivery-eta-04`, `tab-entregas`, `ops-health`).
   - Data ISO `YYYY-MM-DD`.
3. **Push main solo dopo conferma esplicita utente** ("VAI PUSH MAIN" o
   simile). Nessun push speculativo.
4. **Mai force-push** su `main` o su un backup esistente.
   `--force-with-lease` consentito solo su branch personale dell'operatore.
5. **Mai skip hooks** (`--no-verify`) e mai bypass gpg.
6. Se due cambi diversi confluiscono nello stesso giorno, usare suffisso
   `-a`, `-b`: `backup/v2-eta-2026-05-22-a`, `-b`.

Repo coperti:
- Frontend V2: `https://github.com/bigkaoss23-debug/LaDieciBotV2`
- Backend Railway: `https://github.com/bigkaoss23-debug/ladieci_bot`
Entrambi seguono lo stesso protocollo backup.

---

## 6. Regole deploy

### 6.1 Frontend Netlify

- **Comando autorizzato** (vedi `CLAUDE.md`):
  ```
  npx -y @netlify/mcp@latest --site-id 02bd4c7a-a50b-4964-90da-8c1af1122932
  ```
- **Pre-deploy obbligatorio:**
  - Working tree pulito.
  - Build OK (`BROWSERSLIST_IGNORE_OLD_DATA=true CI=true npm --prefix ladieci-app33 run build`).
  - Unit test rilevanti verdi.
  - Conferma utente esplicita ("VAI DEPLOY").
- **Post-deploy:**
  - Aprire `https://magnificent-lollipop-6dff70.netlify.app`.
  - Verificare nuovo bundle (hash file `main.<sha>.js`) caricato.
  - Smoke test minimo: aprire ServicioPage, TabWA, TabCocina, TabEntregas, Pedidos.
  - Watchdog Railway: 🟢.

### 6.2 Backend Railway

- **Trigger:** push su `main` del repo `ladieci_bot` (auto-deploy).
- **Pre-deploy obbligatorio:**
  - `node --check` su tutti i file toccati.
  - Test unitari esistenti verdi.
  - Backup branch creato.
  - Conferma utente esplicita.
- **Post-deploy:**
  - `GET /health` → `{ok:true}` entro 60s.
  - (Quando esisterà) `GET /version` → SHA atteso.
  - Smoke endpoint chiave per il cambio:
    - cambi delivery → `resolveAddress` test live su 2 indirizzi P0.
    - cambi orchestrator → controllare un messaggio WA simulato passa.
    - cambi cron → controllare LAST_CLOSE_DATE non si rompa.
  - Watchdog ServicioPage resta 🟢 per ≥ 5 min.

### 6.3 Cosa NON è autorizzato automaticamente
- Deploy a marchi/siti diversi da quelli registrati in CLAUDE.md.
- Deploy che richiedono modifica env senza autorizzazione esplicita.
- Deploy che includono cambi DB non separatamente approvati.

---

## 7. Rollback

### 7.1 Quando rollbackare
- Ordini che si moltiplicano o si perdono.
- Bot risponde con messaggi rotti / vuoti / in lingua sbagliata.
- TabCocina/TabEntregas non mostra più ordini in flusso.
- Watchdog rosso fisso > 5 min dopo deploy.
- `/health` 500/503 dopo deploy.
- DB scrittura silenziosamente non avviene (vedi RLS).

### 7.2 Come riconoscere deploy rotto
- Pre-deploy SHA noto. Post-deploy `/version` (quando esiste) mostra SHA atteso.
- Operatore segnala "non vedo più gli ordini" / "il bot non risponde".
- Errori 5xx in DevTools Network o Railway logs.
- Health watchdog cambia colore subito dopo il push.

### 7.3 Rollback frontend (Netlify)
- Netlify dashboard → Deploys → selezionare deploy precedente → "Publish deploy".
- Tempo target: < 2 min.
- Nessuna implicazione DB.
- Comunicare a operatore "ricaricare la pagina" (Ctrl+R).

### 7.4 Rollback backend (Railway)
- Opzione A — git revert + push:
  ```
  git revert <bad-sha>
  git push origin main
  ```
  Railway redeploya automaticamente. Tempo target < 5 min.
- Opzione B — Railway dashboard → Deployments → selezionare deployment
  precedente → "Redeploy".
- Verificare `/health` post-rollback.

### 7.5 Rollback DB
- **Mai automatico.** Richiede piano scritto separato:
  - backup pre-cambio (snapshot Supabase).
  - script SQL inverso testato.
  - conferma esplicita utente.
- Per cambi RLS / DDL: rollback significa revertire la migration + verificare
  che il frontend vecchio funzioni ancora.

---

## 8. Definition of Done

Una patch è "done" SOLO se TUTTI questi punti sono veri:

1. ✅ Codice modificato con scope chirurgico (solo i file necessari).
2. ✅ Unit test esistenti verdi.
3. ✅ Nuovo unit test aggiunto se la categoria lo richiede (vedi §3).
4. ✅ Build / `node --check` verdi.
5. ✅ Stress matrix rilevante aggiornata (riga nuova o note "trovato + fixato il YYYY-MM-DD commit SHA").
6. ✅ Docs aggiornate se la patch cambia comportamento osservabile (`CLAUDE.md`, spec features, README).
7. ✅ Commit locale con messaggio coerente con lo stile log esistente.
8. ✅ Backup branch remoto pushato.
9. ✅ Push `main` solo dopo conferma utente.
10. ✅ Deploy verificato post-push (frontend Netlify e/o backend Railway secondo categoria).
11. ✅ Smoke test post-deploy passato.
12. ✅ Problemi noti residui dichiarati esplicitamente nel report al utente
    (es. "resta aperto P1: canonicalizzazione spazio civico in cache key").
13. ✅ Memoria di sessione aggiornata se la patch introduce convenzioni o
    incidenti che il futuro-Claude deve sapere (es. "cache exact accetta
    durata=null dal 17/05").

Se anche uno solo manca → la patch NON è done. Si scrive cosa manca e si
attende, non si dichiara verde.

---

## 9. Anti-pattern vietati

1. **"Sembra piccolo, deployiamo"**
   La taglia del diff non garantisce sicurezza. La regola è la categoria (§2),
   non il numero di righe.
2. **"Lo testiamo in live"**
   Live non è ambiente di test. Se non c'è preview/staging adeguato, si
   testa manualmente in browser preview prima.
3. **"Fallback finto come valore reale"**
   Vedi caso `durata=30` salvato come se Google avesse risposto. Mai. Se
   non sappiamo, scriviamo `null` + warning UI.
4. **"Cerotto specifico per un indirizzo"**
   Patch che dice "se direccion ILIKE '%lucena%' allora …" è vietata. La
   patch deve essere generica e basata sul componente sbagliato (cache
   normalizer, resolver, ecc.).
5. **"Patch senza capire il componente reale"**
   Se non sappiamo se il bug è frontend o backend, si fa diagnosi (DB read-only,
   log, audit codice) PRIMA di patchare. Vedi commit `f60e1bb` preceduto dal
   doc `DELIVERY_ETA_STRESS_MATRIX`.
6. **"Deploy senza sapere cosa guarda l'operatore"**
   Prima di toccare TabEntregas / TabCocina / TabWA, l'operatore in pizzeria
   deve essere considerato: cosa cambia visivamente, cosa cambia nei bottoni,
   serve preavviso?
7. **"Refactor durante hotfix"**
   Hotfix ≠ pulizia. Anche se la riga vicina fa pena, si tocca solo la riga
   del bug. Cleanup va in un commit separato fuori servizio.
8. **"Skip dei test perché sono lenti"**
   I test rotti vanno risolti, non bypassati.
9. **"Nessun backup, è urgente"**
   Backup branch costa 5 secondi. È sempre più veloce della procedura di
   recovery se il push rompe qualcosa.
10. **"Commit -m 'fix'"** o messaggio vago. Il log deve raccontare la storia.

---

## 10. Checklist finale pre-deploy

Stampabile / leggibile prima di ogni push su `main` o deploy:

- [ ] Categoria del cambio identificata (§2) → gate corretti scelti (§3).
- [ ] Siamo dentro/fuori servizio live? Se dentro → causa certa + chirurgica + autorizzazione esplicita.
- [ ] `git status` mostra solo i file attesi (niente file orfani, niente .env, niente build/).
- [ ] `git diff --stat` rivisto: numero righe coerente con scope dichiarato.
- [ ] Build / `node --check` verdi.
- [ ] Unit test rilevanti verdi (con output mostrato).
- [ ] Stress matrix rilevante aggiornata o nota aggiunta al cambi recenti.
- [ ] Backup branch remoto creato:
      `git push origin main:backup/v2-<scope>-YYYY-MM-DD` (o repo backend equivalente).
- [ ] Push `main` autorizzato esplicitamente dall'utente.
- [ ] Deploy autorizzato esplicitamente dall'utente.
- [ ] `/health` controllato dopo deploy (Railway) o bundle nuovo (Netlify).
- [ ] Smoke test post-deploy passato.
- [ ] Watchdog 🟢 stabile.
- [ ] Problemi noti residui dichiarati nel report finale.
- [ ] Nessun segreto stampato, nessun token in log, nessun payload sensibile.

Se anche **uno** dei punti è NO → fermarsi e risolvere, non procedere.

---

## Cambi tracciati (release recenti)

| Data | Repo | Commit | Categoria | Scope |
|------|------|--------|-----------|-------|
| 22/05 | ladieci-bot | `2c3946a` | T8 | retry geocode senza civico |
| 22/05 | ladieci-bot | `15729fc` | T8 | accept street-level google geocode fallback |
| 22/05 | ladieci-bot | `f60e1bb` | T8 | street cache fallback con coordinate (durata null OK) |
| 22/05 | LaDieciBotV2 | `2cd3685` | T3 + T8 | NuevoPedidoModal: no durata=30 finta |
| 22/05 | LaDieciBotV2 | `c5365ab` | T1 | docs DELIVERY ETA stress matrix |
| 22/05 | LaDieciBotV2 | `c654a20` | T1 | docs DELIVERY VIS stress matrix |
| 22/05 | LaDieciBotV2 | `65da276` | T1 | docs OPS HEALTH stress matrix |

Backup branches: `backup/live-delivery-eta-05-2026-05-22`,
`backup/v2-delivery-eta-stress-matrix-2026-05-22`,
`backup/v2-delivery-vis-stress-matrix-2026-05-22`,
`backup/v2-ops-health-stress-matrix-2026-05-22`.

STOP DOC.
