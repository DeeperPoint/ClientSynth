-- Fix job processing schema issues
-- This script addresses all the identified database schema problems

-- 1. Add missing columns to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS generated_records INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS recovery_state JSONB DEFAULT '{
  "lastSuccessfulRecord": -1,
  "failedRecords": [],
  "retryAttempts": {}
}'::jsonb,
ADD COLUMN IF NOT EXISTS can_be_cancelled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_be_paused BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_be_retried BOOLEAN DEFAULT true;

-- 2. Fix status values - update schema to match code
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check 
CHECK (status IN ('pending', 'processing', 'paused', 'completed', 'failed', 'cancelled'));

-- 3. Add proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON public.jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON public.jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON public.jobs(completed_at);
CREATE INDEX IF NOT EXISTS idx_jobs_processing ON public.jobs(status, created_at) WHERE status IN ('pending', 'processing', 'paused');

-- 4. Add indexes for generated_data table
CREATE INDEX IF NOT EXISTS idx_generated_data_job_id ON public.generated_data(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_tenant_id ON public.generated_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_record_index ON public.generated_data(job_id, record_index);

-- 5. Add indexes for job_logs table
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON public.job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_level ON public.job_logs(level);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON public.job_logs(created_at);

-- 6. Add indexes for job_controls table
CREATE INDEX IF NOT EXISTS idx_job_controls_job_id ON public.job_controls(job_id);
CREATE INDEX IF NOT EXISTS idx_job_controls_tenant_id ON public.job_controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_controls_action ON public.job_controls(action);
CREATE INDEX IF NOT EXISTS idx_job_controls_processed_at ON public.job_controls(processed_at);

-- 7. Update existing jobs to have proper timestamps
UPDATE public.jobs 
SET started_at = created_at 
WHERE status IN ('processing', 'completed', 'failed', 'cancelled') 
AND started_at IS NULL;

UPDATE public.jobs 
SET completed_at = updated_at 
WHERE status IN ('completed', 'failed', 'cancelled') 
AND completed_at IS NULL;

-- 8. Create function to safely update job status with validation
CREATE OR REPLACE FUNCTION public.update_job_status(
  p_job_id UUID,
  p_new_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_progress INTEGER DEFAULT NULL,
  p_generated_records INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_current_status TEXT;
  v_valid_transition BOOLEAN := false;
BEGIN
  -- Get current status
  SELECT status INTO v_current_status
  FROM public.jobs
  WHERE id = p_job_id;
  
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Validate status transition
  CASE v_current_status
    WHEN 'pending' THEN
      v_valid_transition := p_new_status IN ('processing', 'cancelled');
    WHEN 'processing' THEN
      v_valid_transition := p_new_status IN ('paused', 'completed', 'failed', 'cancelled');
    WHEN 'paused' THEN
      v_valid_transition := p_new_status IN ('processing', 'cancelled');
    WHEN 'completed', 'failed', 'cancelled' THEN
      v_valid_transition := false; -- Terminal states
    ELSE
      v_valid_transition := false;
  END CASE;
  
  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
  END IF;
  
  -- Update job with atomic operation
  UPDATE public.jobs
  SET 
    status = p_new_status,
    error_message = CASE WHEN p_error_message IS NOT NULL THEN p_error_message ELSE error_message END,
    progress = CASE WHEN p_progress IS NOT NULL THEN p_progress ELSE progress END,
    generated_records = CASE WHEN p_generated_records IS NOT NULL THEN p_generated_records ELSE generated_records END,
    started_at = CASE WHEN p_new_status = 'processing' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN p_new_status IN ('completed', 'failed', 'cancelled') AND completed_at IS NULL THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = p_job_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to get next job with proper locking
CREATE OR REPLACE FUNCTION public.get_next_job_safe()
RETURNS TABLE(
  job_id UUID,
  tenant_id UUID,
  schema_id UUID,
  name TEXT,
  total_records INTEGER,
  config JSONB,
  recovery_state JSONB,
  schema_definition JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Get the next pending job and atomically mark it as processing
  UPDATE public.jobs 
  SET status = 'processing', started_at = NOW(), updated_at = NOW()
  WHERE id = (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    jobs.id,
    jobs.tenant_id,
    jobs.schema_id,
    jobs.name,
    jobs.total_records,
    jobs.config,
    jobs.recovery_state
  INTO job_id, tenant_id, schema_id, name, total_records, config, recovery_state;

  -- If we found a job, get the schema definition
  IF job_id IS NOT NULL THEN
    SELECT s.schema_definition INTO schema_definition
    FROM public.schemas s
    WHERE s.id = schema_id;

    RETURN QUERY SELECT 
      job_id, tenant_id, schema_id, name, total_records, config, recovery_state, schema_definition;
  END IF;
END;
$$;

-- 10. Create function to update job progress safely
CREATE OR REPLACE FUNCTION public.update_job_progress_safe(
  p_job_id UUID,
  p_generated_records INTEGER,
  p_progress INTEGER,
  p_recovery_state JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.jobs
  SET 
    generated_records = p_generated_records,
    progress = p_progress,
    recovery_state = CASE WHEN p_recovery_state IS NOT NULL THEN p_recovery_state ELSE recovery_state END,
    updated_at = NOW()
  WHERE id = p_job_id AND status = 'processing';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Add RLS policies for job_logs if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'job_logs' 
    AND policyname = 'job_logs_select_tenant_member'
  ) THEN
    ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "job_logs_select_tenant_member" ON public.job_logs FOR SELECT 
      USING (job_id IN (
        SELECT id FROM public.jobs 
        WHERE tenant_id IN (
          SELECT tenant_id FROM public.user_tenant_roles 
          WHERE user_id = auth.uid()
        )
      ));
      
    CREATE POLICY "job_logs_insert_system" ON public.job_logs FOR INSERT 
      WITH CHECK (true); -- System inserts
  END IF;
END $$;

-- 12. Add RLS policies for generated_data if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'generated_data' 
    AND policyname = 'generated_data_select_tenant_member'
  ) THEN
    ALTER TABLE public.generated_data ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "generated_data_select_tenant_member" ON public.generated_data FOR SELECT 
      USING (tenant_id IN (
        SELECT tenant_id FROM public.user_tenant_roles 
        WHERE user_id = auth.uid()
      ));
      
    CREATE POLICY "generated_data_insert_system" ON public.generated_data FOR INSERT 
      WITH CHECK (true); -- System inserts
  END IF;
END $$;

-- 13. Create function for batch insert with transaction
CREATE OR REPLACE FUNCTION public.insert_generated_data_batch(
  p_records JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  record_item JSONB;
BEGIN
  -- Start transaction (implicit in function)
  FOR record_item IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    INSERT INTO public.generated_data (
      job_id,
      tenant_id,
      record_data,
      record_index,
      created_at
    ) VALUES (
      (record_item->>'job_id')::UUID,
      (record_item->>'tenant_id')::UUID,
      record_item->'record_data',
      (record_item->>'record_index')::INTEGER,
      (record_item->>'created_at')::TIMESTAMPTZ
    );
  END LOOP;
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    -- Transaction will be rolled back automatically
    RAISE EXCEPTION 'Failed to insert generated data batch: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
