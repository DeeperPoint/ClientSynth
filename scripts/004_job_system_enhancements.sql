-- Enhanced job system with detailed tracking and queue management

-- Job execution logs table
CREATE TABLE IF NOT EXISTS public.job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generated data table (stores the actual generated records)
CREATE TABLE IF NOT EXISTS public.generated_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_data JSONB NOT NULL,
  record_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job queue management functions
CREATE OR REPLACE FUNCTION public.get_next_job()
RETURNS TABLE(
  job_id UUID,
  tenant_id UUID,
  schema_id UUID,
  name TEXT,
  total_records INTEGER,
  config JSONB,
  schema_definition JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Get the next pending job and mark it as running
  UPDATE public.jobs 
  SET status = 'running', updated_at = NOW()
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
    jobs.config
  INTO job_id, tenant_id, schema_id, name, total_records, config;

  -- If we found a job, get the schema definition
  IF job_id IS NOT NULL THEN
    SELECT s.schema_definition INTO schema_definition
    FROM public.schemas s
    WHERE s.id = schema_id;

    RETURN QUERY SELECT 
      job_id, tenant_id, schema_id, name, total_records, config, schema_definition;
  END IF;
END;
$$;

-- Function to update job progress
CREATE OR REPLACE FUNCTION public.update_job_progress(
  p_job_id UUID,
  p_generated_records INTEGER,
  p_progress INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.jobs
  SET 
    generated_records = p_generated_records,
    progress = COALESCE(p_progress, LEAST(100, (p_generated_records * 100 / total_records))),
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Function to complete job
CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id UUID,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.jobs
  SET 
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    error_message = p_error_message,
    progress = CASE WHEN p_success THEN 100 ELSE progress END,
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Enable RLS for new tables
ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for job_logs
CREATE POLICY "job_logs_select_tenant_member" ON public.job_logs FOR SELECT 
  USING (job_id IN (SELECT id FROM public.jobs WHERE tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid())));

-- RLS Policies for generated_data
CREATE POLICY "generated_data_select_tenant_member" ON public.generated_data FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "generated_data_insert_system" ON public.generated_data FOR INSERT 
  WITH CHECK (true); -- System inserts, will be restricted by application logic

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON public.jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON public.job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_job_id ON public.generated_data(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_tenant_id ON public.generated_data(tenant_id);
