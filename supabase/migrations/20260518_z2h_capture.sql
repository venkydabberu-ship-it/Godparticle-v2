-- Z2H Auto-Capture Log
-- Records every scheduled (and manual) snapshot capture run

CREATE TABLE IF NOT EXISTS z2h_capture_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text        NOT NULL,          -- 'EXPIRY_930' | 'EXPIRY_1115'
  capture_date  date        NOT NULL,
  saved_count   int         NOT NULL DEFAULT 0,
  skipped_count int         NOT NULL DEFAULT 0,
  error_count   int         NOT NULL DEFAULT 0,
  details       jsonb,                          -- per-index results array
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS z2h_capture_log_date_idx ON z2h_capture_log (capture_date DESC);

-- RLS: only admins can read; service role (edge function) writes via service_role key
ALTER TABLE z2h_capture_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_capture_log" ON z2h_capture_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- SETUP INSTRUCTIONS (run these once in Supabase SQL editor)
-- ─────────────────────────────────────────────────────────────────
--
-- 1. Enable required extensions:
--    CREATE EXTENSION IF NOT EXISTS pg_cron;
--    CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- 2. Schedule 9:30 AM IST capture (= 4:00 AM UTC, every weekday):
--    SELECT cron.schedule(
--      'z2h-auto-930',
--      '0 4 * * 1-5',
--      $$
--        SELECT net.http_post(
--          url     := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/z2h-auto-capture',
--          headers := jsonb_build_object(
--            'Content-Type',  'application/json',
--            'Authorization', 'Bearer <YOUR-ANON-KEY>'
--          ),
--          body    := '{"snapshot_type":"EXPIRY_930"}'::jsonb
--        );
--      $$
--    );
--
-- 3. Schedule 11:15 AM IST capture (= 5:45 AM UTC, every weekday):
--    SELECT cron.schedule(
--      'z2h-auto-1115',
--      '45 5 * * 1-5',
--      $$
--        SELECT net.http_post(
--          url     := 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/z2h-auto-capture',
--          headers := jsonb_build_object(
--            'Content-Type',  'application/json',
--            'Authorization', 'Bearer <YOUR-ANON-KEY>'
--          ),
--          body    := '{"snapshot_type":"EXPIRY_1115"}'::jsonb
--        );
--      $$
--    );
--
-- 4. Verify cron jobs are registered:
--    SELECT jobname, schedule, command FROM cron.job;
--
-- 5. To remove a job later:
--    SELECT cron.unschedule('z2h-auto-930');
--    SELECT cron.unschedule('z2h-auto-1115');
-- ─────────────────────────────────────────────────────────────────
