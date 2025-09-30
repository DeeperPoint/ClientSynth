-- Export tracking and management system

-- Exports table to track export jobs
CREATE TABLE IF NOT EXISTS public.exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'xlsx', 'sql')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  file_size BIGINT,
  record_count INTEGER,
  filters JSONB DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for exports
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for exports
CREATE POLICY "exports_select_tenant_member" ON public.exports FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "exports_insert_tenant_member" ON public.exports FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()) AND created_by = auth.uid());

CREATE POLICY "exports_update_own" ON public.exports FOR UPDATE 
  USING (created_by = auth.uid());

CREATE POLICY "exports_delete_own" ON public.exports FOR DELETE 
  USING (created_by = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exports_tenant_id ON public.exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exports_job_id ON public.exports(job_id);
CREATE INDEX IF NOT EXISTS idx_exports_created_by ON public.exports(created_by);
CREATE INDEX IF NOT EXISTS idx_exports_status ON public.exports(status);
