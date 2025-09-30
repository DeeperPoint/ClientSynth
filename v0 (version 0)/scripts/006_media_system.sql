-- Media system for image generation and storage
CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  record_id UUID NOT NULL, -- References the generated data record
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL DEFAULT 'client-synth-media',
  md5_hash TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size BIGINT,
  model_name TEXT NOT NULL,
  prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies for media
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view media from their tenant" ON media
  FOR SELECT USING (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert media for their tenant" ON media
  FOR INSERT WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update media from their tenant" ON media
  FOR UPDATE USING (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete media from their tenant" ON media
  FOR DELETE USING (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

-- Add indexes for performance
CREATE INDEX idx_media_tenant_id ON media(tenant_id);
CREATE INDEX idx_media_job_id ON media(job_id);
CREATE INDEX idx_media_record_id ON media(record_id);
CREATE INDEX idx_media_s3_key ON media(s3_key);

-- Add image generation settings to schemas
ALTER TABLE schemas ADD COLUMN IF NOT EXISTS image_generation JSONB DEFAULT '{"enabled": false, "count_per_record": 1, "model": "black-forest-labs/flux-schnell", "prompt_template": "A professional headshot of a person"}';

-- Add image generation status to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS images_generated INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_images INTEGER DEFAULT 0;
