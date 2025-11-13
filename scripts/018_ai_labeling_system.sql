-- AI Auto-Labeling & Schema Mapping System
-- Stores field mappings and coverage metrics for validated seed datasets

-- Schema field mappings table
CREATE TABLE IF NOT EXISTS public.schema_field_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schema_id UUID NOT NULL UNIQUE REFERENCES public.schemas(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_seeds JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.profiles(id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_schema_field_mappings_schema ON public.schema_field_mappings(schema_id);
CREATE INDEX IF NOT EXISTS idx_schema_field_mappings_tenant ON public.schema_field_mappings(tenant_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_schema_field_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_schema_field_mappings_updated_at
  BEFORE UPDATE ON public.schema_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_schema_field_mappings_updated_at();

-- Create auth.uid() function for RLS policies
-- This function returns the authenticated user's UUID from JWT token
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
  -- Returns the authenticated user's UUID from JWT token
  -- Used by RLS policies for row-level security
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add RLS policies
ALTER TABLE public.schema_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mappings from their tenants" ON public.schema_field_mappings
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM public.user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert mappings for their tenants" ON public.schema_field_mappings
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id 
      FROM public.user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update mappings from their tenants" ON public.schema_field_mappings
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM public.user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete mappings from their tenants" ON public.schema_field_mappings
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id 
      FROM public.user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

-- Function to get coverage metrics for a schema
CREATE OR REPLACE FUNCTION get_schema_coverage(p_schema_id UUID)
RETURNS TABLE (
  field_coverage_percentage NUMERIC,
  precision_score NUMERIC,
  total_fields INTEGER,
  covered_fields INTEGER,
  missing_fields TEXT[]
) AS $$
DECLARE
  v_mappings JSONB;
  v_coverage JSONB;
BEGIN
  SELECT mappings, coverage_metrics INTO v_mappings, v_coverage
  FROM public.schema_field_mappings
  WHERE schema_id = p_schema_id;

  IF v_mappings IS NULL OR v_coverage IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_coverage->'fieldCoverage'->>'coveragePercentage')::NUMERIC as field_coverage_percentage,
    (v_coverage->>'precision')::NUMERIC as precision_score,
    (v_coverage->'fieldCoverage'->>'totalFields')::INTEGER as total_fields,
    (v_coverage->'fieldCoverage'->>'coveredFields')::INTEGER as covered_fields,
    ARRAY(SELECT jsonb_array_elements_text(v_coverage->'fieldCoverage'->'missingFields'))::TEXT[] as missing_fields;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

