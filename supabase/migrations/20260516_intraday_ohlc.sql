-- intraday_ohlc: 30-min OHLCV candles for all tracked indices (fetched from Upstox)
CREATE TABLE IF NOT EXISTS intraday_ohlc (
  id          bigserial     PRIMARY KEY,
  index_name  text          NOT NULL,
  trade_date  date          NOT NULL,
  candle_time timestamptz   NOT NULL,
  open        numeric(12,2) NOT NULL,
  high        numeric(12,2) NOT NULL,
  low         numeric(12,2) NOT NULL,
  close       numeric(12,2) NOT NULL,
  volume      bigint        DEFAULT 0,
  UNIQUE(index_name, candle_time)
);

CREATE INDEX IF NOT EXISTS idx_intraday_ohlc_index_date ON intraday_ohlc (index_name, trade_date DESC);

ALTER TABLE intraday_ohlc ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read intraday_ohlc" ON intraday_ohlc FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role write intraday_ohlc" ON intraday_ohlc FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
