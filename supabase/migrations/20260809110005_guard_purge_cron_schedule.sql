-- ============================================================
-- Migration : 20260809110005_guard_purge_cron_schedule
-- Objectif  : Rendre la planification pg_cron de la purge tolérante à une
--             ré-application de la suite de migrations sur un environnement
--             où l'extension pg_cron ne serait pas disponible (ex: clone de
--             projet, nouvel environnement) — on avertit au lieu de faire
--             échouer toute la migration.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-deleted-orders') THEN
      PERFORM cron.unschedule('purge-expired-deleted-orders');
    END IF;

    PERFORM cron.schedule(
      'purge-expired-deleted-orders',
      '0 3 * * *',
      $cron$SELECT public.purge_expired_deleted_orders();$cron$
    );
  ELSE
    RAISE WARNING 'pg_cron indisponible sur cet environnement : la purge automatique des commandes supprimées n''est pas planifiée. Activez l''extension pg_cron puis rejouez cette migration.';
  END IF;
END $$;
