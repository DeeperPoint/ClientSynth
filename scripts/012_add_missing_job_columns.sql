-- Add missing timestamp columns to jobs table for proper job lifecycle tracking
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Create index for better query performance on job timestamps
CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON jobs(completed_at);

-- Update existing jobs to set started_at for processing/completed jobs
UPDATE jobs 
SET started_at = created_at 
WHERE status IN ('processing', 'completed') AND started_at IS NULL;

-- Update existing jobs to set completed_at for completed jobs
UPDATE jobs 
SET completed_at = updated_at 
WHERE status = 'completed' AND completed_at IS NULL;
