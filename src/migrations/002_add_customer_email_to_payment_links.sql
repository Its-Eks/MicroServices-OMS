-- Add customer email to payment_links table for easier resend functionality

ALTER TABLE payment_links 
ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_payment_links_customer_email ON payment_links(customer_email);

-- Add comment for documentation
COMMENT ON COLUMN payment_links.customer_email IS 'Customer email address for payment notifications and resends';
