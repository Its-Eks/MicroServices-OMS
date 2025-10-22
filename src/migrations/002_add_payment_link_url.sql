-- Add payment_link_url column to payment_links table for Payment Links API
-- This stores the short Payment Links URL (e.g., https://l.ppay.io/...)

ALTER TABLE payment_links 
ADD COLUMN IF NOT EXISTS payment_link_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_links_payment_link_url ON payment_links(payment_link_url);

-- Add comment
COMMENT ON COLUMN payment_links.payment_link_url IS 'Peach Payment Links short URL (e.g., https://l.ppay.io/...)';

