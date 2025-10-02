-- Migration: Update payment_links table for Stripe integration
-- This migration updates the payment_links table to support Stripe instead of Peach Payments

-- Add Stripe session ID column
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Create index for Stripe session ID
CREATE INDEX IF NOT EXISTS idx_payment_links_stripe_session_id ON payment_links(stripe_session_id);

-- Update webhook events table for Stripe
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Create index for Stripe session ID in webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_session_id ON payment_webhook_events(stripe_session_id);

-- Add paid_at column if it doesn't exist (for tracking payment completion time)
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Update any existing Peach Payments records to mark them as legacy (optional)
-- UPDATE payment_links SET status = 'legacy' WHERE peach_checkout_id IS NOT NULL AND stripe_session_id IS NULL;

-- Note: We're keeping the peach_checkout_id column for backward compatibility
-- but new payments will use stripe_session_id
