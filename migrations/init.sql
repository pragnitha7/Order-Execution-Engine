CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  payload JSONB,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_update TIMESTAMP WITH TIME ZONE DEFAULT now(),
  attempts INT DEFAULT 0,
  failure_reason TEXT,
  tx_hash TEXT
);
