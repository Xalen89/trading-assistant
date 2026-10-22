CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS strategies (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  rules jsonb NOT NULL,
  parameters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  strategy_id text NOT NULL REFERENCES strategies(id),
  instrument text NOT NULL CHECK (instrument IN ('NAS100', 'XAUUSD')),
  timeframe text NOT NULL CHECK (timeframe IN ('5m','15m','1h','4h','1d')),
  direction text NOT NULL CHECK (direction IN ('long','short')),
  entry double precision NOT NULL CHECK (entry > 0),
  exit double precision NOT NULL CHECK (exit > 0),
  quantity double precision NOT NULL CHECK (quantity > 0),
  entry_time timestamptz NOT NULL,
  exit_time timestamptz NOT NULL CHECK (exit_time >= entry_time),
  notes text NOT NULL DEFAULT '',
  stop_loss double precision,
  take_profit double precision,
  risk_amount double precision,
  pnl double precision GENERATED ALWAYS AS ((exit - entry) * quantity * CASE WHEN direction = 'long' THEN 1 ELSE -1 END) STORED,
  outcome text GENERATED ALWAYS AS (CASE WHEN exit = entry THEN 'breakeven' WHEN (exit > entry) = (direction = 'long') THEN 'win' ELSE 'loss' END) STORED
);
CREATE INDEX IF NOT EXISTS trades_lookup ON trades(instrument, timeframe, strategy_id, exit_time);
CREATE TABLE IF NOT EXISTS candles (
  instrument text NOT NULL,
  timeframe text NOT NULL,
  time bigint NOT NULL,
  open double precision NOT NULL,
  high double precision NOT NULL,
  low double precision NOT NULL,
  close double precision NOT NULL,
  volume double precision NOT NULL,
  source text NOT NULL CHECK (source IN ('oanda','demo')),
  PRIMARY KEY(instrument, timeframe, time, source)
);
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL,
  instrument text NOT NULL,
  timeframe text NOT NULL,
  strategy_id text NOT NULL REFERENCES strategies(id),
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_lookup ON analyses(instrument, timeframe, created_at DESC);
