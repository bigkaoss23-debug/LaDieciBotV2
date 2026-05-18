-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001 — Sistema Consegne a Domicilio ("Repartidor")
-- ═══════════════════════════════════════════════════════════════════════════
-- Data: 2026-04-17
-- Descrizione: aggiunge i campi necessari per gestire le consegne a domicilio
-- ed il PIN di accesso all'applicazione operatore.
--
-- SICURO — solo ALTER/INSERT IF NOT EXISTS, nessuna operazione distruttiva.
-- Rollback in fondo al file (commentato).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabella ORDENES — campi consegna ──────────────────────────────────
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS tipo_consegna   TEXT DEFAULT 'RITIRO';
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS direccion       TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS direccion_note  TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS repartidor      TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS hora_salida     BIGINT;    -- ms epoch
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS hora_entrega    BIGINT;    -- ms epoch
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS cobrado         BOOLEAN DEFAULT FALSE;

-- tipo_consegna values: 'RITIRO' | 'DOMICILIO'
-- estado per ordini domicilio: DA_CONFERMARE → EN_COCINA → LISTO → EN_ENTREGA → RETIRADO

-- ─── 2. Tabella CLIENTES — indirizzo memorizzato ──────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion       TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion_note  TEXT;

-- ─── 3. Tabella CONFIG — PIN e lista repartidores ─────────────────────────
-- (La tabella config esiste già; inseriamo le chiavi di default)
INSERT INTO config (chiave, valore) VALUES ('APP_PIN', '1234')
  ON CONFLICT (chiave) DO NOTHING;

INSERT INTO config (chiave, valore) VALUES ('REPARTIDORES', 'Juan')
  ON CONFLICT (chiave) DO NOTHING;

-- ─── 4. Indici per performance tab Entregas ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_consegna
  ON ordenes (tipo_consegna) WHERE tipo_consegna = 'DOMICILIO';

CREATE INDEX IF NOT EXISTS idx_ordenes_estado
  ON ordenes (estado);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA (esegui dopo la migration per controllare)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'ordenes'
--    AND column_name IN ('tipo_consegna','direccion','direccion_note','repartidor','hora_salida','hora_entrega','cobrado');
--
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'clientes'
--    AND column_name IN ('direccion','direccion_note');
--
-- SELECT chiave, valore FROM config WHERE chiave IN ('APP_PIN','REPARTIDORES');

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (SOLO in caso di problemi — decommentare ed eseguire)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS tipo_consegna;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS direccion;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS direccion_note;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS repartidor;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS hora_salida;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS hora_entrega;
-- ALTER TABLE ordenes DROP COLUMN IF EXISTS cobrado;
-- ALTER TABLE clientes DROP COLUMN IF EXISTS direccion;
-- ALTER TABLE clientes DROP COLUMN IF EXISTS direccion_note;
-- DROP INDEX IF EXISTS idx_ordenes_tipo_consegna;
-- DROP INDEX IF EXISTS idx_ordenes_estado;
-- DELETE FROM config WHERE chiave IN ('APP_PIN','REPARTIDORES');
