-- Enhanced job system with model selection and media storage

-- Add model configuration to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS text_model TEXT DEFAULT 'google/gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS image_model TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}';

-- Media storage table for generated images
CREATE TABLE IF NOT EXISTS public.media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/png',
  file_size INTEGER NOT NULL,
  md5_hash TEXT NOT NULL,
  model_used TEXT,
  prompt_used TEXT,
  generation_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_job_id ON public.media(job_id);
CREATE INDEX IF NOT EXISTS idx_media_tenant_id ON public.media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_record_id ON public.media(record_id);

-- Enable RLS for media table
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- RLS Policies for media
CREATE POLICY "media_select_tenant_member" ON public.media FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "media_insert_system" ON public.media FOR INSERT 
  WITH CHECK (true); -- System inserts, will be restricted by application logic

-- Function to get job with enhanced details
CREATE OR REPLACE FUNCTION public.get_next_job_enhanced()
RETURNS TABLE(
  job_id UUID,
  tenant_id UUID,
  schema_id UUID,
  name TEXT,
  total_records INTEGER,
  config JSONB,
  text_model TEXT,
  image_model TEXT,
  model_config JSONB,
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
    jobs.config,
    jobs.text_model,
    jobs.image_model,
    jobs.model_config
  INTO job_id, tenant_id, schema_id, name, total_records, config, text_model, image_model, model_config;

  -- If we found a job, get the schema definition
  IF job_id IS NOT NULL THEN
    SELECT s.schema_definition INTO schema_definition
    FROM public.schemas s
    WHERE s.id = schema_id;

    RETURN QUERY SELECT 
      job_id, tenant_id, schema_id, name, total_records, config, text_model, image_model, model_config, schema_definition;
  END IF;
END;
$$;
