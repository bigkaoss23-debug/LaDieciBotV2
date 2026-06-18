# BLOCK_4_SERVICELINE_TIMESTAMPS_PATCH_REPORT

Data: 2026-06-17 — **Patch backend LOCALE. NO deploy, NO push.** File: `ladieci-bot/src/agents/previewStrategicOpportunities.js` (`sanitizeAnchor` + serviceLine output).

## Premessa (dall'audit BLOCCO 1)
Lo scheletro salida/entrega/regreso era GIÀ presente in working tree (non committato). Il "—" runtime è solo perché Railway gira codice vecchio. Qui ho **rifinito** la derivazione e aggiunto i test.

## Cosa fa ora `serviceLine[]`
Per ogni anchor (giro esistente) il contract espone `{ id, zone, promised, pizzas, salida, entrega, regreso }`. Derivazione con **precedenza ai campi reali del DB** già propagati dallo snapshot (`plannerSnapshot.normalizeOrder` mappa `salida_driver_estimada`, `entrega_estimada`, `forno_out`, `durata_andata_min→andata_min`):

- `entrega` = `entrega_estimada` (DB) → `promised`
- `salida`  = `salida_driver_estimada` (DB) → `forno_out` → `entrega − andata`
- `regreso` = `entrega + andata` (nessuna colonna DB esiste → calcolato deterministicamente dal modello simmetrico del rientro, **mai inventato**)
- `null` se i dati non bastano → la UI mostrerà empty-state, non un dato falso.

Nessun calcolo nel frontend: mostra solo i campi del contract.

## Beneficio collaterale (P0)
Gli stessi `salida`/`regreso` dell'anchor alimentano il rilevamento conflitto rider del BLOCCO 2 → il P0 e la "línea de servicio" condividono un'unica fonte coerente.

## Test
`tests/previewStrategicRiderConflict.test.js` (sezione "BLOCCO 4") — **30/30 PASS** complessivo:
- Q5 #001: `salida=20:47` (forno_out), `entrega=21:00` (promised), `regreso=21:13` (entrega+andata).
- Variante con campi DB: `salida_driver_estimada=20:50`/`entrega_estimada=21:02` → la serviceLine **preferisce** i valori DB (20:50 / 21:02).

## Nota deploy
Il "—" sparirà a runtime **solo dopo un deploy Railway autorizzato** (oggi vietato). In locale il contract è corretto.

**BLOCK 4 = PATCH FATTA/RIFINITA + TEST VERDI (locale).**
