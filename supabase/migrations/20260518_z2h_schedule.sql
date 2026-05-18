-- Z2H Capture Scheduler
-- Admin creates schedule entries; z2h-scheduler-tick (runs every 5 min) executes them

CREATE TABLE IF NOT EXISTS z2h_schedule (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  index_name    text        NOT NULL,           -- 'NIFTY50' | 'BANKNIFTY' | 'ALL' etc.
  expiry_date   date        NOT NULL,           -- the options expiry date
  capture_date  date        NOT NULL,           -- date to actually run (may differ for DAY_BEFORE)
  capture_time  text        NOT NULL,           -- '09:30' IST (24h)
  snapshot_type text        NOT NULL,           -- 'EXPIRY_930' | 'EXPIRY_1115' | 'EXPIRY_115' | 'EXPIRY_315' | 'DAY_BEFORE'
  status        text        NOT NULL DEFAULT 'pending',  -- pending/running/done/partial/error/cancelled
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  executed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS z2h_schedule_lookup_idx ON z2h_schedule (capture_date, status, capture_time);

ALTER TABLE z2h_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_z2h_schedule" ON z2h_schedule
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );
