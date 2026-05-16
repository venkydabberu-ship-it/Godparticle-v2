-- fii_activity: daily FII/DII cash market + futures activity (from NSE / MoneyControl)
-- trade_date = the day the activity occurred (published after market close that day)
-- Backtest uses previous trading day's row as the input signal for next day's forecast.
CREATE TABLE IF NOT EXISTS fii_activity (
  trade_date       date          PRIMARY KEY,
  fii_cm_net       numeric(12,2) NOT NULL DEFAULT 0,   -- FII cash market net buy (₹Cr, + = buying)
  dii_cm_net       numeric(12,2) NOT NULL DEFAULT 0,   -- DII cash market net buy (₹Cr)
  fii_idx_fut_net  numeric(12,2) NOT NULL DEFAULT 0,   -- FII index futures net (₹Cr)
  fii_idx_opt_net  numeric(12,2) NOT NULL DEFAULT 0,   -- FII index options net (₹Cr)
  updated_at       timestamptz   DEFAULT now()
);

ALTER TABLE fii_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read fii_activity" ON fii_activity FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role write fii_activity" ON fii_activity FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed data extracted from MoneyControl screenshots (Apr 10 – May 15, 2026) ──
INSERT INTO fii_activity (trade_date, fii_cm_net, dii_cm_net, fii_idx_fut_net, fii_idx_opt_net)
VALUES
  ('2026-04-10',   672.09,   410.05,  3438.35,  7018.01),
  ('2026-04-13', -1983.18,  2432.30,  -346.30,-34725.52),
  ('2026-04-15',   666.15,  -568.98,  1242.85, -4453.45),
  ('2026-04-16',   382.36, -3427.75,   266.16,  -963.99),
  ('2026-04-17',   683.20, -4721.48,  1278.11,  4205.30),
  ('2026-04-20', -1059.93,  2966.89,   159.19,-10219.95),
  ('2026-04-21', -1918.99,  2221.27,  2564.75,-23472.18),
  ('2026-04-22', -2078.36, -1048.17, -1520.32, -5321.18),
  ('2026-04-23', -3254.71,   941.35, -1268.30, -1310.22),
  ('2026-04-24', -8827.87,  4700.71, -2103.78,  5411.38),
  ('2026-04-27', -1151.48,  4123.92,  -320.90, -6179.72),
  ('2026-04-28', -2103.74,  1712.01, -3094.39,-12874.08),
  ('2026-04-29', -2468.42,  2262.17,   -68.88, -3879.06),
  ('2026-04-30', -8047.86,  3487.10, -2097.66,  3528.83),
  ('2026-05-04',  2835.62,  4764.16, -1271.12,  4635.58),
  ('2026-05-05', -3621.58,  2602.62,  -871.52,-27166.29),
  ('2026-05-06', -5834.90,  6836.87,   634.79, -1310.15),
  ('2026-05-07',  -340.89,   441.07,  -177.40, -7283.68),
  ('2026-05-08', -4110.60,  6748.13, -2277.76,  2968.34),
  ('2026-05-11', -8437.56,  5939.65, -1685.41, -3179.62),
  ('2026-05-12', -1959.39,  7990.32, -2507.82, -5760.26),
  ('2026-05-13', -4703.15,  5869.05,  -127.58, -5752.22),
  ('2026-05-14',   187.46,   684.33,  1912.52, -6656.94),
  ('2026-05-15',  1329.17, -1958.82,  1393.18, -2133.48)
ON CONFLICT (trade_date) DO UPDATE SET
  fii_cm_net      = EXCLUDED.fii_cm_net,
  dii_cm_net      = EXCLUDED.dii_cm_net,
  fii_idx_fut_net = EXCLUDED.fii_idx_fut_net,
  fii_idx_opt_net = EXCLUDED.fii_idx_opt_net,
  updated_at      = now();
