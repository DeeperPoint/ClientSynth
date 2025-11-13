-- PDF Templates System with Versioning
-- Supports template storage, versioning, and metadata tracking

CREATE TABLE IF NOT EXISTS public.pdf_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  template_config JSONB NOT NULL, -- Stores template structure: fields, layout, fonts, margins, etc.
  template_pdf_base64 TEXT, -- Base64 encoded template PDF (optional, for template-based generation)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_pdf_templates_tenant_name ON public.pdf_templates(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_tenant_active ON public.pdf_templates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_version ON public.pdf_templates(name, version DESC);

-- Template usage tracking for telemetry
CREATE TABLE IF NOT EXISTS public.pdf_template_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.pdf_templates(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  error_message TEXT,
  generation_time_ms INTEGER,
  output_size_bytes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_template_usage_template ON public.pdf_template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_pdf_template_usage_tenant ON public.pdf_template_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pdf_template_usage_status ON public.pdf_template_usage(status);
CREATE INDEX IF NOT EXISTS idx_pdf_template_usage_created ON public.pdf_template_usage(created_at DESC);

-- RLS Policies
ALTER TABLE public.pdf_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_template_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access templates from their tenants
CREATE POLICY pdf_templates_tenant_isolation ON public.pdf_templates
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can only access usage data from their tenants
CREATE POLICY pdf_template_usage_tenant_isolation ON public.pdf_template_usage
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()
    )
  );

-- Function to get latest version of a template
CREATE OR REPLACE FUNCTION public.get_latest_template_version(p_tenant_id UUID, p_name TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT MAX(version) FROM public.pdf_templates 
     WHERE tenant_id = p_tenant_id AND name = p_name AND is_active = true),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get template by name and optional version (defaults to latest)
CREATE OR REPLACE FUNCTION public.get_template(
  p_tenant_id UUID, 
  p_name TEXT, 
  p_version INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  name TEXT,
  version INTEGER,
  description TEXT,
  template_config JSONB,
  template_pdf_base64 TEXT,
  is_active BOOLEAN,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF p_version IS NULL THEN
    RETURN QUERY
    SELECT 
      t.id, t.tenant_id, t.name, t.version, t.description,
      t.template_config, t.template_pdf_base64, t.is_active,
      t.created_by, t.created_at, t.updated_at
    FROM public.pdf_templates t
    WHERE t.tenant_id = p_tenant_id 
      AND t.name = p_name 
      AND t.is_active = true
    ORDER BY t.version DESC
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT 
      t.id, t.tenant_id, t.name, t.version, t.description,
      t.template_config, t.template_pdf_base64, t.is_active,
      t.created_by, t.created_at, t.updated_at
    FROM public.pdf_templates t
    WHERE t.tenant_id = p_tenant_id 
      AND t.name = p_name 
      AND t.version = p_version;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.pdf_templates IS 'Stores PDF template definitions with versioning support';
COMMENT ON TABLE public.pdf_template_usage IS 'Tracks PDF generation usage for telemetry and analytics';
COMMENT ON FUNCTION public.get_latest_template_version IS 'Gets the latest version number for a template';
COMMENT ON FUNCTION public.get_template IS 'Gets a template by name and optional version (defaults to latest)';




