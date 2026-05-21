-- MOD-2 — campi audit per modifiche post-creazione ordine.
-- Pattern allineato a 2026-05-20_add_listo_audit_fields.sql.
-- File pending: NON applicato in questo micro-step. Applicazione manuale
-- da V2 test richiede approvazione esplicita (vedi
-- LaDieciBotV2_NEXT_CRITICAL_AREAS.md).
--
-- Wiring backend (separato, post-apply):
--   - cambiaStato(ord, "EN_COCINA"): set cocina_started_at = COALESCE(cocina_started_at, now())
--     così rollback LISTO -> EN_COCINA non sovrascrive il primo ingresso.
--   - modificaOrdine(ord, updates): mod_ts = now(); mod_count = mod_count + 1.
--   - Guardia MOD-4 invariata (RETIRADO/COMPLETADO/EN_ENTREGA bloccati).
--
-- Rendering UI (separato):
--   - isModifiedAfterCocina(orden) in ladieci-app33/src/utils/orderModBadge.js
--     → badge "MODIFICADO" in TabCocina + PanelCocina.

-- mod_ts: timestamp dell'ultima modifica applicata via modificaOrdine.
-- NULL = ordine mai modificato dopo la creazione.
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS mod_ts TIMESTAMPTZ NULL;

-- mod_count: numero cumulativo di modifiche applicate. Default 0 sui record
-- esistenti. Utile per UX "ha avuto N modifiche", non solo "è stato modificato".
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS mod_count INT NOT NULL DEFAULT 0;

-- cocina_started_at: timestamp della PRIMA transizione a EN_COCINA. Mantenuto
-- stabile su rollback LISTO -> EN_COCINA (vedi COALESCE nel wiring backend).
-- Riferimento temporale per il badge "MODIFICADO": è "modificato" solo se
-- mod_ts > cocina_started_at.
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cocina_started_at TIMESTAMPTZ NULL;
