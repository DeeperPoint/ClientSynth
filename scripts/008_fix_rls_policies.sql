-- Fix infinite recursion in RLS policies
-- Drop all existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view their tenant roles" ON user_tenant_roles;
DROP POLICY IF EXISTS "Users can insert tenant roles" ON user_tenant_roles;
DROP POLICY IF EXISTS "Users can update their tenant roles" ON user_tenant_roles;
DROP POLICY IF EXISTS "Users can delete their tenant roles" ON user_tenant_roles;

DROP POLICY IF EXISTS "Users can view their tenants" ON tenants;
DROP POLICY IF EXISTS "Users can insert tenants" ON tenants;
DROP POLICY IF EXISTS "Users can update their tenants" ON tenants;

DROP POLICY IF EXISTS "Users can view tenant schemas" ON schemas;
DROP POLICY IF EXISTS "Users can insert schemas" ON schemas;
DROP POLICY IF EXISTS "Users can update schemas" ON schemas;
DROP POLICY IF EXISTS "Users can delete schemas" ON schemas;

DROP POLICY IF EXISTS "Users can view tenant jobs" ON jobs;
DROP POLICY IF EXISTS "Users can insert jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete jobs" ON jobs;

DROP POLICY IF EXISTS "Users can view tenant generated data" ON generated_data;
DROP POLICY IF EXISTS "Users can insert generated data" ON generated_data;

DROP POLICY IF EXISTS "Users can view tenant exports" ON exports;
DROP POLICY IF EXISTS "Users can insert exports" ON exports;
DROP POLICY IF EXISTS "Users can update exports" ON exports;
DROP POLICY IF EXISTS "Users can delete exports" ON exports;

DROP POLICY IF EXISTS "Users can view job logs" ON job_logs;
DROP POLICY IF EXISTS "Users can insert job logs" ON job_logs;

-- Create simplified RLS policies without recursion
-- user_tenant_roles: Allow users to see only their own roles
CREATE POLICY "Users can view own roles" ON user_tenant_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all roles" ON user_tenant_roles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- tenants: Allow users to see tenants they belong to (using simple auth check)
CREATE POLICY "Users can view accessible tenants" ON tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = tenants.id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tenants" ON tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Tenant admins can update tenants" ON tenants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = tenants.id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

-- schemas: Allow access based on tenant membership
CREATE POLICY "Users can view tenant schemas" ON schemas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = schemas.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create schemas" ON schemas
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = schemas.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own schemas" ON schemas
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = schemas.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

CREATE POLICY "Users can delete own schemas" ON schemas
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = schemas.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

-- jobs: Allow access based on tenant membership
CREATE POLICY "Users can view tenant jobs" ON jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = jobs.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create jobs" ON jobs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = jobs.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own jobs" ON jobs
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = jobs.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

CREATE POLICY "Users can delete own jobs" ON jobs
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = jobs.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

-- generated_data: Allow access based on job ownership
CREATE POLICY "Users can view job data" ON generated_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN user_tenant_roles utr ON utr.tenant_id = j.tenant_id
      WHERE j.id = generated_data.job_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert generated data" ON generated_data
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- exports: Allow access based on tenant membership
CREATE POLICY "Users can view tenant exports" ON exports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = exports.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create exports" ON exports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = exports.tenant_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own exports" ON exports
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = exports.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

CREATE POLICY "Users can delete own exports" ON exports
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_tenant_roles utr 
      WHERE utr.tenant_id = exports.tenant_id 
      AND utr.user_id = auth.uid() 
      AND utr.role = 'admin'
    )
  );

-- job_logs: Allow access based on job ownership
CREATE POLICY "Users can view job logs" ON job_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN user_tenant_roles utr ON utr.tenant_id = j.tenant_id
      WHERE j.id = job_logs.job_id 
      AND utr.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert job logs" ON job_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure RLS is enabled on all tables
ALTER TABLE user_tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
