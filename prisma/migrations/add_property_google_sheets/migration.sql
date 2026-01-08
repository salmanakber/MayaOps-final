-- Add Google Sheets integration fields to Property table
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "google_sheet_url" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "google_sheet_id" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "google_sheet_name" TEXT;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sheet_column_mapping" TEXT; -- JSON mapping of sheet columns to task fields
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sheet_unique_column" TEXT; -- Column name that uniquely identifies rows
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sheet_last_synced_at" TIMESTAMP(3);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "sheet_sync_enabled" BOOLEAN DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "properties_sheet_sync_enabled_idx" ON "properties"("sheet_sync_enabled");
CREATE INDEX IF NOT EXISTS "properties_sheet_last_synced_at_idx" ON "properties"("sheet_last_synced_at");


