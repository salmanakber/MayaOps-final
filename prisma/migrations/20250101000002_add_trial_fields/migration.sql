-- Add trial period fields to companies table
ALTER TABLE companies 
ADD COLUMN trial_ends_at TIMESTAMP,
ADD COLUMN is_trial_active BOOLEAN DEFAULT false;

-- Add trial period fields to billing_records table
ALTER TABLE billing_records 
ADD COLUMN trial_ends_at TIMESTAMP,
ADD COLUMN is_trial_period BOOLEAN DEFAULT false;

-- Create indexes for better query performance
CREATE INDEX idx_companies_trial_ends_at ON companies(trial_ends_at);
CREATE INDEX idx_billing_records_trial_ends_at ON billing_records(trial_ends_at);
CREATE INDEX idx_billing_records_is_trial_period ON billing_records(is_trial_period);





