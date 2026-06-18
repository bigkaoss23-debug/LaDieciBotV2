# SECURITY_ROTATION_PROD_GUIDE_REPORT

**Data:** 2026-06-17
**Tipo:** GUIDA operativa (azioni utente). **Io NON ho eseguito alcuna rotazione.**
Tutte le rotazioni toccano produzione (Supabase prod / Railway prod / provider esterni)
→ fuori dal mio perimetro: **STOP, le fai tu**. Nessun valore segreto stampato qui.

> Contesto: in `ENV_SPLIT_V1_07` il preview V1 cadde sui default prod e lesse via
> `getConfig` segreti di produzione (`ANTHROPIC_KEY`, `WA_ACCESS_TOKEN`, identificatori WA)
> e indirettamente l'`APP_PIN` prod (coincideva col seed `123456`). Vanno considerati
> compromessi e ruotati. La patch fail-closed (`8c51909`) impedisce il ripetersi del
> fail-open, ma non annulla l'esposizione già avvenuta.

---

## 1. `APP_PIN` production  (+ valutare `REPARTIDOR_PIN`)

**Dove è salvato:** Supabase **prod** `wnswassgfuuivmfwjxsf`, tabella `config`,
`chiave='APP_PIN'` (e `chiave='REPARTIDOR_PIN'`). `auth.js` lo legge da lì.

**Perché:** l'`APP_PIN` prod era `123456` ed è stato indirettamente rivelato.

**Come ruotarlo (scegli UNA via):**
- **Via app (consigliata):** se l'app ha la UI di cambio PIN (l'owner cambia i PIN
  dall'app, vedi CLAUDE.md), imposta un **nuovo PIN ≠ `123456`**.
- **Via Supabase dashboard:** progetto prod → SQL Editor →
  `update config set valore = '<NUOVO_PIN>' where chiave = 'APP_PIN';`
  (e idem `REPARTIDOR_PIN` se vuoi ruotarlo).

**Attenzioni:**
- Nuovo PIN **diverso da `123456`** e diverso dal PIN staging.
- Comunicalo **solo agli operatori reali** (canale sicuro), non scriverlo in report/chat.
- Lo staging resta col suo PIN `123456` (isolato): non confonderli.

> ⚠️ Io non scrivo su Supabase prod (regola). Esegui tu l'UPDATE.

---

## 2. `ANTHROPIC_KEY`

**Dove è salvato:** risulta sia in **Supabase prod `config`** (`chiave='ANTHROPIC_KEY'`)
sia leggibile come env del backend (`process.env.ANTHROPIC_KEY` su Railway prod).

**Come ruotarla:**
1. **Anthropic Console** → API Keys → **crea una nuova key** → **revoca/disattiva la vecchia**.
2. Aggiorna il valore dove è consumato in **produzione**:
   - **Railway prod** (env `ANTHROPIC_KEY`) — se il backend la legge da env;
   - **Supabase prod `config`** (`update config set valore='<NUOVA>' where chiave='ANTHROPIC_KEY';`) — se la legge da DB.
   - In dubbio, aggiorna **entrambi** per coerenza.
3. Verifica che il bot risponda ancora (un messaggio di test fuori servizio).

**Attenzioni:** non incollare la key in chat/report. Ruota la vecchia **dopo** aver messo la nuova, per non interrompere il servizio.

---

## 3. WhatsApp production

**Dove è salvato:** Supabase prod `config` →
`WA_ACCESS_TOKEN`, `WA_PHONE_ID`, `WA_BUSINESS_ID`, `WA_NUMBER`; il backend usa anche
`WA_VERIFY_TOKEN` come env Railway.

**Cosa ruotare (per priorità):**
- **`WA_ACCESS_TOKEN`** — è il segreto critico (token di accesso). **Ruotare**.
- `WA_PHONE_ID`, `WA_BUSINESS_ID`, `WA_NUMBER` — identificatori (non segreti veri):
  cambiano solo se cambi numero/asset; non serve "ruotarli", ma erano esposti — valuta.
- `WA_VERIFY_TOKEN` — stringa che TU scegli per la verifica webhook: puoi rigenerarla,
  ma va riallineata su Meta **e** su Railway insieme, altrimenti il webhook si rompe.

**Come ruotare `WA_ACCESS_TOKEN`:**
1. **Meta for Developers** → la tua app WhatsApp → genera un **nuovo access token**
   (System User token a lunga durata se lo usi così).
2. Aggiorna il valore in **produzione** dove è letto: Supabase prod `config`
   (`update config set valore='<NUOVO>' where chiave='WA_ACCESS_TOKEN';`) e/o env Railway prod.
3. Invalida il vecchio token dal pannello Meta.

**⚠️ Attenzione webhook live:** non toccare `WA_VERIFY_TOKEN`/URL webhook **durante il
servizio** — rischi di staccare la ricezione messaggi dei clienti reali. Fai la
rotazione **fuori orario di servizio** e verifica subito dopo con un messaggio di test.

---

## STOP / DISCLAIMER
- Tutte e 3 le rotazioni richiedono **provider esterni** (Anthropic, Meta) e/o
  **scrittura su Supabase/Railway prod**: **azioni tue**, io mi fermo.
- Non ho inventato né stampato valori segreti.
- La rotazione **non blocca** le fasi 2–4 (sono read-only/prep su staging), ma resta
  **prerequisito di sicurezza** prima di considerare chiuso il rischio V1_07.
