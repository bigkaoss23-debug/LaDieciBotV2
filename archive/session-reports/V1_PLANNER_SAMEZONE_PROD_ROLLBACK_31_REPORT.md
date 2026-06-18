# V1_PLANNER_SAMEZONE_PROD_ROLLBACK_31_REPORT

**Azione:** rollback del deploy backend prod del fix same-zone (`a7ad091`) → ripristino del codice precedente.
**Autorizzazione:** utente — "fai tu con CLI e poi mi fai report" (opzione B: rebuild via CLI).
**Data:** 2026-06-18
**Esito:** ✅ **ROLLBACK COMPLETE — produzione tornata allo stato pre-fix, live sano.**

---

## 1. Perché il rollback

Su richiesta esplicita dell'utente: l'app live del ristorante non deve essere toccata finché la nuova versione non è pronta. Il fix `a7ad091` (deploy `V1_PLANNER_SAMEZONE_PROD_DEPLOY_30`) è stato rimosso dalla produzione.

## 2. Metodo

Metodo di rollback consolidato del progetto: `railway up` del **commit precedente** `dc36160` (= il deployment prod precedente `397d4061`, confermato dalla mappa deploy). Il primo tentativo via CLI era stato bloccato dal classifier di sicurezza (preferiva il restore image-exact); l'utente ha poi autorizzato esplicitamente il rebuild via CLI.

## 3. Sequenza eseguita

1. `railway service ladieci_bot` + `railway status` → target **provato**: service `ladieci_bot`, url `ladiecibot-production.up.railway.app`, deployment attivo era `80228fb0` (il fix).
2. `git checkout dc36160` (working tree = codice live precedente, senza il fix).
3. `railway up --service ladieci_bot --ci` → **Deploy complete** (image `2026-06-18T16:25:30Z`, digest `sha256:68268f6724378a9c317ab4ef34dba062544b722ceaa92507ba58eb6d453346e9`).
4. Smoke read-only (sotto).
5. `git checkout backup/v2-route-impact-slip-guard-2026-06-14` → HEAD ripristinato a `a7ad091`, working tree pulito.
6. `railway service fearless-reverence` → CLI riportato su staging (leave-state sicuro).

## 4. Smoke post-rollback (prod, read-only)

| Endpoint | Risultato |
|---|---|
| `/health` | `{"ok":true,...}` |
| `/version` | `{"service":"ladieci_bot","commit":"unknown","deploymentId":"402b30df-db54-4214-95ac-0d40d5227336","bootTime":"2026-06-18T16:25:46Z","uptimeSec":14}` |
| `/status` | `level:yellow` → backend **green**, database **green** (402ms), ordini **green** (todayCount 0); yellow SOLO WhatsApp idle |

Nuovo deployment **`402b30df-db54-4214-95ac-0d40d5227336`** (rebuild di `dc36160`). Il fix same-zone NON è più in produzione.

## 5. Stato finale

- **Produzione backend:** codice `dc36160` (stato pre-fix, lo stesso che girava fino a stamattina). Live e sano.
- **Frontend prod:** mai toccato (resta `069c273`, locked).
- **Supabase prod:** mai toccato.
- **Fix `a7ad091`:** salvo in locale (HEAD branch) + backup branch remoto `backup/v2-planner-samezone-rider-availability-2026-06-18` + validato su staging. Pronto per un futuro re-deploy pianificato, quando deciderai.
- **CLI Railway:** su `fearless-reverence` (staging).

## 6. Cronologia deployment prod (oggi)

| deploymentId | commit | nota |
|---|---|---|
| `397d4061` | dc36160 | live fino a stamattina (REMOVED dopo il deploy fix) |
| `80228fb0` | a7ad091 | deploy fix same-zone (DEPLOY_30) — poi rimpiazzato |
| **`402b30df`** | **dc36160** | **rollback (ATTIVO ORA)** |

## 7. Rollback ulteriore (se mai servisse)

`railway up` di `dc36160` è ripetibile; oppure dashboard Railway rollback al deployment desiderato.

## 8. Safety

- ✅ rollback autorizzato dall'utente · ✅ SOLO `ladieci_bot` (target provato prima)
- ✅ no Supabase write · ✅ no Netlify · ✅ no push main · ✅ no frontend · ✅ no WhatsApp · ✅ no ordini test
- ✅ no secrets stampati · ✅ `ORDINI_2026-05-23.md` non toccato
- ✅ CLI lasciato su staging

## 9. Follow-up (proposti, NON eseguiti)

1. **Blindare la produzione** con regole DENY nelle impostazioni (railway/netlify/supabase prod) → prod impossibile da toccare per errore. In attesa di tuo OK.
2. **Pulizia repo:** 114 file `*_REPORT.md` non tracciati + audit anti-bloat del codice planner.
3. Re-deploy del fix `a7ad091` SOLO con processo pianificato e autorizzato, fuori servizio.

> Rollback concluso. Produzione allo stato precedente, sana. Nessun push main, nessun frontend, nessuna scrittura DB.
