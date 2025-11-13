-- Bulk Upload System Enhancements
-- This script adds support for bulk file uploads with enhanced metadata tracking

-- Update example_files table to support bulk uploads and enhanced metadata
ALTER TABLE public.example_files 
ADD COLUMN IF NOT EXISTS batch_id UUID,
ADD COLUMN IF NOT EXISTS upload_session_id UUID,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS extracted_fields_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS extracted_records_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2) DEFAULT 0.0;

-- Create bulk upload sessions table for tracking batch uploads
CREATE TABLE IF NOT EXISTS public.bulk_upload_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  session_name TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Create bulk upload file status table for detailed tracking
CREATE TABLE IF NOT EXISTS public.bulk_upload_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.bulk_upload_sessions(id) ON DELETE CASCADE,
  example_file_id UUID REFERENCES public.example_files(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  progress_percentage INTEGER DEFAULT 0,
  error_message TEXT,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  extracted_fields_count INTEGER DEFAULT 0,
  extracted_records_count INTEGER DEFAULT 0,
  confidence_score DECIMAL(3,2) DEFAULT 0.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_example_files_batch_id ON public.example_files(batch_id);
CREATE INDEX IF NOT EXISTS idx_example_files_upload_session ON public.example_files(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_example_files_processing_status ON public.example_files(processing_status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_tenant_schema ON public.bulk_upload_sessions(tenant_id, schema_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_status ON public.bulk_upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_files_session ON public.bulk_upload_files(session_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_files_status ON public.bulk_upload_files(status);

-- Add RLS policies for new tables
ALTER TABLE public.bulk_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_upload_files ENABLE ROW LEVEL SECURITY;

-- RLS policy for bulk_upload_sessions - users can only access sessions from their tenants
CREATE POLICY "Users can view bulk upload sessions from their tenants" ON public.bulk_upload_sessions
  FOR SELECT USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert bulk upload sessions for their tenants" ON public.bulk_upload_sessions
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update bulk upload sessions from their tenants" ON public.bulk_upload_sessions
  FOR UPDATE USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

-- RLS policy for bulk_upload_files - users can only access files from their tenant sessions
CREATE POLICY "Users can view bulk upload files from their tenant sessions" ON public.bulk_upload_files
  FOR SELECT USING (
    session_id IN (
      SELECT bus.id 
      FROM bulk_upload_sessions bus
      JOIN user_tenant_roles utr ON bus.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert bulk upload files for their tenant sessions" ON public.bulk_upload_files
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT bus.id 
      FROM bulk_upload_sessions bus
      JOIN user_tenant_roles utr ON bus.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update bulk upload files from their tenant sessions" ON public.bulk_upload_files
  FOR UPDATE USING (
    session_id IN (
      SELECT bus.id 
      FROM bulk_upload_sessions bus
      JOIN user_tenant_roles utr ON bus.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

-- Update existing example_files RLS policies to include new columns
DROP POLICY IF EXISTS "Users can view example files from their tenants" ON public.example_files;
CREATE POLICY "Users can view example files from their tenants" ON public.example_files
  FOR SELECT USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

-- Add function to clean up old bulk upload sessions (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_bulk_upload_sessions()
RETURNS void AS $$
BEGIN
  -- Delete old completed sessions and their files
  DELETE FROM bulk_upload_sessions 
  WHERE status = 'completed' 
    AND completed_at < NOW() - INTERVAL '30 days';
    
  -- Delete old failed sessions and their files  
  DELETE FROM bulk_upload_sessions 
  WHERE status = 'failed' 
    AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Add function to get bulk upload statistics
CREATE OR REPLACE FUNCTION get_bulk_upload_stats(p_tenant_id UUID, p_schema_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_sessions BIGINT,
  completed_sessions BIGINT,
  failed_sessions BIGINT,
  total_files BIGINT,
  completed_files BIGINT,
  failed_files BIGINT,
  total_size_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(bus.id) as total_sessions,
    COUNT(CASE WHEN bus.status = 'completed' THEN 1 END) as completed_sessions,
    COUNT(CASE WHEN bus.status = 'failed' THEN 1 END) as failed_sessions,
    COALESCE(SUM(bus.total_files), 0) as total_files,
    COALESCE(SUM(bus.completed_files), 0) as completed_files,
    COALESCE(SUM(bus.failed_files), 0) as failed_files,
    COALESCE(SUM(bus.total_size_bytes), 0) as total_size_bytes
  FROM bulk_upload_sessions bus
  WHERE bus.tenant_id = p_tenant_id
    AND (p_schema_id IS NULL OR bus.schema_id = p_schema_id);
END;
$$ LANGUAGE plpgsql;

-- Add function to get recent bulk upload activity
CREATE OR REPLACE FUNCTION get_recent_bulk_upload_activity(p_tenant_id UUID, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  session_id UUID,
  session_name TEXT,
  schema_name TEXT,
  total_files INTEGER,
  completed_files INTEGER,
  failed_files INTEGER,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bus.id as session_id,
    bus.session_name,
    s.name as schema_name,
    bus.total_files,
    bus.completed_files,
    bus.failed_files,
    bus.status,
    bus.created_at,
    bus.completed_at,
    p.full_name as created_by_name
  FROM bulk_upload_sessions bus
  JOIN schemas s ON bus.schema_id = s.id
  JOIN profiles p ON bus.created_by = p.id
  WHERE bus.tenant_id = p_tenant_id
  ORDER BY bus.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;







