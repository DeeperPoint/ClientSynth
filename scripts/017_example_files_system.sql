-- Example Files System for AI Generation Context
-- This script adds support for uploading example files to guide AI generation

-- Example files table (stores metadata about uploaded example files)
CREATE TABLE IF NOT EXISTS public.example_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'json', 'xlsx', 'xls')),
  file_size INTEGER NOT NULL,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  md5_hash TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example data table (stores parsed example data from files)
CREATE TABLE IF NOT EXISTS public.example_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  example_file_id UUID NOT NULL REFERENCES public.example_files(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  example_value TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_example_files_tenant_schema ON public.example_files(tenant_id, schema_id);
CREATE INDEX IF NOT EXISTS idx_example_files_schema ON public.example_files(schema_id);
CREATE INDEX IF NOT EXISTS idx_example_data_file_field ON public.example_data(example_file_id, field_name);
CREATE INDEX IF NOT EXISTS idx_example_data_field_value ON public.example_data(field_name, example_value);

-- Add RLS policies for example files
ALTER TABLE public.example_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.example_data ENABLE ROW LEVEL SECURITY;

-- RLS policy for example_files - users can only access files from their tenants
CREATE POLICY "Users can view example files from their tenants" ON public.example_files
  FOR SELECT USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert example files for their tenants" ON public.example_files
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update example files from their tenants" ON public.example_files
  FOR UPDATE USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete example files from their tenants" ON public.example_files
  FOR DELETE USING (
    tenant_id IN (
      SELECT utr.tenant_id 
      FROM public.user_tenant_roles utr 
      WHERE utr.user_id = auth.uid()
    )
  );

-- RLS policy for example_data - users can only access data from their tenant's files
CREATE POLICY "Users can view example data from their tenant files" ON public.example_data
  FOR SELECT USING (
    example_file_id IN (
      SELECT ef.id 
      FROM public.example_files ef
      JOIN public.user_tenant_roles utr ON ef.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert example data for their tenant files" ON public.example_data
  FOR INSERT WITH CHECK (
    example_file_id IN (
      SELECT ef.id 
      FROM public.example_files ef
      JOIN public.user_tenant_roles utr ON ef.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update example data from their tenant files" ON public.example_data
  FOR UPDATE USING (
    example_file_id IN (
      SELECT ef.id 
      FROM public.example_files ef
      JOIN public.user_tenant_roles utr ON ef.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete example data from their tenant files" ON public.example_data
  FOR DELETE USING (
    example_file_id IN (
      SELECT ef.id 
      FROM public.example_files ef
      JOIN public.user_tenant_roles utr ON ef.tenant_id = utr.tenant_id
      WHERE utr.user_id = auth.uid()
    )
  );

-- Add updated_at trigger for example_files
CREATE OR REPLACE FUNCTION update_example_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_example_files_updated_at
  BEFORE UPDATE ON public.example_files
  FOR EACH ROW
  EXECUTE FUNCTION update_example_files_updated_at();

-- Add function to get example data for a field
CREATE OR REPLACE FUNCTION get_examples_for_field(
  p_schema_id UUID,
  p_field_name TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  example_value TEXT,
  frequency INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ed.example_value,
    COUNT(*)::INTEGER as frequency
  FROM public.example_data ed
  JOIN public.example_files ef ON ed.example_file_id = ef.id
  WHERE ef.schema_id = p_schema_id
    AND ed.field_name = p_field_name
  GROUP BY ed.example_value
  ORDER BY frequency DESC, ed.example_value
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function to get all examples for a schema
CREATE OR REPLACE FUNCTION get_schema_examples(p_schema_id UUID)
RETURNS TABLE (
  field_name TEXT,
  example_values TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ed.field_name,
    ARRAY_AGG(DISTINCT ed.example_value ORDER BY ed.example_value) as example_values
  FROM public.example_data ed
  JOIN public.example_files ef ON ed.example_file_id = ef.id
  WHERE ef.schema_id = p_schema_id
  GROUP BY ed.field_name
  ORDER BY ed.field_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
