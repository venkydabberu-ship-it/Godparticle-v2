-- ─────────────────────────────────────────────────────────────────────────────
-- Nifty 50 constituent stocks — static list with weights & sector
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists nifty_constituents (
  symbol        text primary key,              -- NSE symbol e.g. HDFCBANK
  upstox_key    text not null,                 -- Upstox instrument key e.g. NSE_EQ|HDFCBANK
  company_name  text not null,
  sector        text not null,
  nifty_weight  numeric(5,2) not null,         -- % weight in Nifty 50 (approx, updated quarterly)
  active        boolean default true
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Daily OHLC data for each constituent stock — fetched automatically after
-- market close each day by the fetch-constituent-data edge function.
-- Used for Option B: constituent-driven index forecast (future feature).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists constituent_daily_data (
  id            bigserial primary key,
  symbol        text not null references nifty_constituents(symbol),
  trade_date    date not null,
  open          numeric(10,2),
  high          numeric(10,2),
  low           numeric(10,2),
  close         numeric(10,2),
  volume        bigint,
  change_pct    numeric(6,2),                  -- (close - prev_close) / prev_close * 100
  fetched_at    timestamptz default now(),
  unique (symbol, trade_date)
);

create index if not exists idx_constituent_daily_symbol_date
  on constituent_daily_data (symbol, trade_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: Nifty 50 top 20 constituents (by approximate weight, May 2026)
-- Weights are approximate and should be refreshed quarterly from NSE.
-- ─────────────────────────────────────────────────────────────────────────────
insert into nifty_constituents (symbol, upstox_key, company_name, sector, nifty_weight) values
  ('HDFCBANK',    'NSE_EQ|HDFCBANK',    'HDFC Bank',               'BFSI',        12.50),
  ('ICICIBANK',   'NSE_EQ|ICICIBANK',   'ICICI Bank',              'BFSI',         8.20),
  ('RELIANCE',    'NSE_EQ|RELIANCE',    'Reliance Industries',     'Energy',        7.90),
  ('INFY',        'NSE_EQ|INFY',        'Infosys',                 'IT',            5.90),
  ('TCS',         'NSE_EQ|TCS',         'Tata Consultancy Services','IT',           4.80),
  ('BHARTIARTL',  'NSE_EQ|BHARTIARTL',  'Bharti Airtel',           'Telecom',       4.20),
  ('LT',          'NSE_EQ|LT',          'Larsen & Toubro',         'Infra',         3.80),
  ('KOTAKBANK',   'NSE_EQ|KOTAKBANK',   'Kotak Mahindra Bank',     'BFSI',          3.50),
  ('AXISBANK',    'NSE_EQ|AXISBANK',    'Axis Bank',               'BFSI',          3.20),
  ('SBIN',        'NSE_EQ|SBIN',        'State Bank of India',     'BFSI',          3.10),
  ('HINDUNILVR',  'NSE_EQ|HINDUNILVR',  'Hindustan Unilever',      'FMCG',          2.60),
  ('BAJFINANCE',  'NSE_EQ|BAJFINANCE',  'Bajaj Finance',           'NBFC',          2.50),
  ('SUNPHARMA',   'NSE_EQ|SUNPHARMA',   'Sun Pharmaceutical',      'Pharma',        2.00),
  ('TITAN',       'NSE_EQ|TITAN',       'Titan Company',           'Consumer',      1.90),
  ('ADANIENT',    'NSE_EQ|ADANIENT',    'Adani Enterprises',       'Conglomerate',  1.80),
  ('NTPC',        'NSE_EQ|NTPC',        'NTPC',                    'Power',         1.70),
  ('POWERGRID',   'NSE_EQ|POWERGRID',   'Power Grid Corp',         'Power',         1.60),
  ('WIPRO',       'NSE_EQ|WIPRO',       'Wipro',                   'IT',            1.40),
  ('ULTRACEMCO',  'NSE_EQ|ULTRACEMCO',  'UltraTech Cement',        'Cement',        1.30),
  ('HCLTECH',     'NSE_EQ|HCLTECH',     'HCL Technologies',        'IT',            1.30)
on conflict (symbol) do nothing;
