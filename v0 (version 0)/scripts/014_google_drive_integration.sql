-- Phase 3: Google Drive Integration
-- Create tables for Google Drive file management and OAuth

-- Google Drive OAuth tokens
CREATE TABLE google_drive_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Drive files tracking
CREATE TABLE drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  drive_file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100) NOT NULL, -- 'image', 'dataset', 'report', 'export'
  mime_type VARCHAR(200),
  file_size BIGINT,
  drive_folder_id VARCHAR(255),
  drive_url TEXT,
  local_path TEXT, -- Path in our system if also stored locally
  metadata JSONB DEFAULT '{}',
  upload_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'uploading', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drive folder structure for organization
CREATE TABLE drive_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  drive_folder_id VARCHAR(255) NOT NULL,
  folder_name VARCHAR(500) NOT NULL,
  parent_folder_id VARCHAR(255), -- Google Drive parent folder ID
  folder_type VARCHAR(100) NOT NULL, -- 'root', 'project', 'images', 'datasets', 'reports'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync status tracking
CREATE TABLE drive_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  sync_type VARCHAR(100) NOT NULL, -- 'upload', 'download', 'sync'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_google_drive_tokens_user ON google_drive_tokens(user_id);
CREATE INDEX idx_google_drive_tokens_tenant ON google_drive_tokens(tenant_id);
CREATE INDEX idx_drive_files_job ON drive_files(job_id);
CREATE INDEX idx_drive_files_tenant ON drive_files(tenant_id);
CREATE INDEX idx_drive_files_type ON drive_files(file_type);
CREATE INDEX idx_drive_folders_tenant ON drive_folders(tenant_id);
CREATE INDEX idx_drive_folders_type ON drive_folders(folder_type);
CREATE INDEX idx_drive_sync_status_job ON drive_sync_status(job_id);

-- Enable RLS
ALTER TABLE google_drive_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_sync_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies (tenant-scoped)
CREATE POLICY "google_drive_tokens_tenant_policy" ON google_drive_tokens 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "drive_files_tenant_policy" ON drive_files 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "drive_folders_tenant_policy" ON drive_folders 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "drive_sync_status_tenant_policy" ON drive_sync_status 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );
