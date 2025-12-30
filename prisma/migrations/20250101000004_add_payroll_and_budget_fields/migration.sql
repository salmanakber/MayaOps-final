-- Add payroll type and fixed salary fields to payroll_records
ALTER TABLE "payroll_records" 
  ADD COLUMN "payroll_type" TEXT NOT NULL DEFAULT 'hourly',
  ADD COLUMN "fixed_salary" DECIMAL(10,2),
  ALTER COLUMN "hours_worked" DROP NOT NULL,
  ALTER COLUMN "hourly_rate" DROP NOT NULL;

-- Add index for period queries
CREATE INDEX IF NOT EXISTS "payroll_records_period_idx" ON "payroll_records" ("period_start", "period_end");

-- Add budget field to tasks
ALTER TABLE "tasks" ADD COLUMN "budget" DECIMAL(10,2);


