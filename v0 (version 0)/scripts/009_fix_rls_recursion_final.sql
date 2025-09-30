-- Complete fix for RLS infinite recursion
-- The issue is that we're checking user_tenant_roles in RLS policies
-- while user_tenant_roles itself has RLS enabled, creating circular dependency

-- Disable RLS on user_tenant_roles to break the cycle
-- We'll handle security for this table at the application level
ALTER TABLE user_tenant_roles DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own roles" ON user_tenant_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON user_tenant_roles;
DROP POLICY IF EXISTS "Users can view accessible tenants" ON tenants;
DROP POLICY IF EXISTS "Users can create tenants" ON tenants;
DROP POLICY IF EXISTS "Tenant admins can update tenants" ON tenants;
DROP POLICY IF EXISTS "Users can view tenant schemas" ON schemas;
DROP POLICY IF EXISTS "Users can create schemas" ON schemas;
DROP POLICY IF EXISTS "Users can update own schemas" ON schemas;
DROP POLICY IF EXISTS "Users can delete own schemas" ON schemas;
DROP POLICY IF EXISTS "Users can view tenant jobs" ON jobs;
DROP POLICY IF EXISTS "Users can create jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can delete own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can view job data" ON generated_data;
DROP POLICY IF EXISTS "System can insert generated data" ON generated_data;
DROP POLICY IF EXISTS "Users can view tenant exports" ON exports;
DROP POLICY IF EXISTS "Users can create exports" ON exports;
DROP POLICY IF EXISTS "Users can update own exports" ON exports;
DROP POLICY IF EXISTS "Users can delete own exports" ON exports;
DROP POLICY IF EXISTS "Users can view job logs" ON job_logs;
DROP POLICY IF EXISTS "System can insert job logs" ON job_logs;

-- Create simple, non-recursive policies
-- tenants: Users can only see tenants they have access to
CREATE POLICY "tenant_select_policy" ON tenants
  FOR SELECT USING (
    id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_insert_policy" ON tenants
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tenant_update_policy" ON tenants
  FOR UPDATE USING (
    id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- schemas: Based on tenant access
CREATE POLICY "schema_select_policy" ON schemas
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "schema_insert_policy" ON schemas
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "schema_update_policy" ON schemas
  FOR UPDATE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "schema_delete_policy" ON schemas
  FOR DELETE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- jobs: Based on tenant access
CREATE POLICY "job_select_policy" ON jobs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "job_insert_policy" ON jobs
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "job_update_policy" ON jobs
  FOR UPDATE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "job_delete_policy" ON jobs
  FOR DELETE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- generated_data: Based on job access
CREATE POLICY "generated_data_select_policy" ON generated_data
  FOR SELECT USING (
    job_id IN (
      SELECT j.id FROM jobs j
      WHERE j.tenant_id IN (
        SELECT tenant_id FROM user_tenant_roles 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "generated_data_insert_policy" ON generated_data
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- exports: Based on tenant access
CREATE POLICY "export_select_policy" ON exports
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "export_insert_policy" ON exports
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "export_update_policy" ON exports
  FOR UPDATE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "export_delete_policy" ON exports
  FOR DELETE USING (
    created_by = auth.uid() OR
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- job_logs: Based on job access
CREATE POLICY "job_log_select_policy" ON job_logs
  FOR SELECT USING (
    job_id IN (
      SELECT j.id FROM jobs j
      WHERE j.tenant_id IN (
        SELECT tenant_id FROM user_tenant_roles 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "job_log_insert_policy" ON job_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Keep RLS enabled on all tables except user_tenant_roles
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
