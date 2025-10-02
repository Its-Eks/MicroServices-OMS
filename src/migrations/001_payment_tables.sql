-- Payment gateway tables for onboarding service

-- Payment links table
CREATE TABLE IF NOT EXISTS payment_links (
  id VARCHAR(255) PRIMARY KEY,
  order_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  peach_checkout_id VARCHAR(255) NOT NULL UNIQUE,
  url TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  status VARCHAR(50) DEFAULT 'pending', -- pending, paid, expired, cancelled, failed
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment notifications table (email tracking)
CREATE TABLE IF NOT EXISTS payment_notifications (
  id SERIAL PRIMARY KEY,
  payment_link_id VARCHAR(255) REFERENCES payment_links(id),
  customer_email VARCHAR(255) NOT NULL,
  notification_type VARCHAR(50) NOT NULL, -- payment_request, payment_reminder, payment_confirmation
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, bounced
  sent_at TIMESTAMP NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment webhook events table (for audit and debugging)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id SERIAL PRIMARY KEY,
  peach_checkout_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  payment_link_id VARCHAR(255) NULL,
  order_id UUID NULL,
  processed BOOLEAN DEFAULT FALSE,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_links_order_id ON payment_links(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_customer_id ON payment_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_notifications_payment_link_id ON payment_notifications(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_peach_checkout_id ON payment_webhook_events(peach_checkout_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id ON payment_webhook_events(order_id);

-- Add comments for documentation
COMMENT ON TABLE payment_links IS 'Stores Peach Payments checkout links for orders';
COMMENT ON TABLE payment_notifications IS 'Tracks payment-related email notifications sent to customers';
COMMENT ON TABLE payment_webhook_events IS 'Logs webhook events from Peach Payments for audit and debugging';

COMMENT ON COLUMN payment_links.amount_cents IS 'Total amount in cents (ZAR)';
COMMENT ON COLUMN payment_links.status IS 'Payment status: pending, paid, expired, cancelled';
COMMENT ON COLUMN payment_notifications.notification_type IS 'Type of notification: payment_request, payment_reminder, payment_confirmation';
COMMENT ON COLUMN payment_webhook_events.processed IS 'Whether the webhook event has been processed';
