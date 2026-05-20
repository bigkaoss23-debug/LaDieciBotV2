-- ===============================================================
-- 2026-05-20 — LISTO minimal audit fields
-- ===============================================================
-- Adds minimal persistent fields to track the UI origin that marked
-- an order as LISTO.
--
-- These fields are intentionally scoped to the latest LISTO event
-- stored directly on `ordenes`.
--
-- They do NOT replace a future full audit/event table. A future
-- `order_events` / audit log could store every transition, actor,
-- timestamp, metadata payload, and rollback.
-- ===============================================================

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS listo_origin TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS listo_actor TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS listo_at TIMESTAMPTZ;
