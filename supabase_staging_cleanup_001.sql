-- ============================================================================
-- supabase_staging_cleanup_001.sql
-- Cleanup MIRATO dell'anchor di test #001 (LORENA SANCHEZ, Q5, EN_COCINA) su
-- Supabase STAGING. Eseguire nel SQL editor del progetto staging
-- (tdikhfeinufaahagmpjz). Le righe figlie orden_estado_logs di #001 sono già
-- state rimosse via anon (RLS aperta su quella tabella); resta solo la riga
-- ordenes #001, che l'anon NON può cancellare (RLS lock) → serve qui.
--
-- ⚠️ NON eseguire su production. Il guard sotto interrompe se PIZZERIA_NOME non
--    contiene 'STAGING'. Scoped al SOLO id '#001'. Niente cleanup generico.
-- ============================================================================

-- ── GUARD ANTI-PROD (obbligatorio) ──────────────────────────────────────────
do $$
declare nome text;
begin
  select valore into nome from public.config where chiave = 'PIZZERIA_NOME';
  if nome is null or position('STAGING' in upper(coalesce(nome,''))) = 0 then
    raise exception 'ABORT: questo NON sembra lo staging (PIZZERIA_NOME=%). Cleanup annullato.', nome;
  end if;
end $$;

-- ── BEFORE ──────────────────────────────────────────────────────────────────
select 'BEFORE' as fase,
  (select count(*) from public.ordenes where id = '#001') as ordenes_001,
  (select count(*) from public.orden_estado_logs where orden_id = '#001') as logs_001;

-- ── DELETE (scoped a #001) ──────────────────────────────────────────────────
begin;
  delete from public.orden_estado_logs where orden_id = '#001';  -- idempotente (già 0)
  delete from public.ordenes           where id       = '#001';
commit;

-- ── AFTER (atteso: ordenes totali residui di test = 0) ──────────────────────
select 'AFTER' as fase,
  (select count(*) from public.ordenes) as ordenes_total,
  (select count(*) from public.ordenes where id = '#001') as ordenes_001,
  (select count(*) from public.manual_giros) as manual_giros_total;
