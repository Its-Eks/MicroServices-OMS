-- Peach COPYandPAY support: ensure columns and indexes exist

-- payment_links: add peach_checkout_id and paid_at if missing
ALTER TABLE IF EXISTS payment_links
  ADD COLUMN IF NOT EXISTS peach_checkout_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL;

-- Unique or at least indexed for quick lookups by reference
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_links_peach_checkout_id
  ON payment_links (peach_checkout_id)
  WHERE peach_checkout_id IS NOT NULL;

-- orders: add paid_at if you want to timestamp payment moment
ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL;

-- Optional: speed up reconciler queries
CREATE INDEX IF NOT EXISTS idx_payment_links_status_created_at
  ON payment_links (status, created_at);
