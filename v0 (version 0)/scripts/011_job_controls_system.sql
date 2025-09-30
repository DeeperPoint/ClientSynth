-- Job controls and recovery system
CREATE TABLE IF NOT EXISTS job_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pause', 'resume', 'cancel', 'retry')),
  requested_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Add recovery state column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recovery_state JSONB DEFAULT '{
  "lastSuccessfulRecord": -1,
  "failedRecords": [],
  "retryAttempts": {}
}'::jsonb;

-- Add job control status tracking
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS can_be_cancelled BOOLEAN DEFAULT true;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS can_be_paused BOOLEAN DEFAULT true;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS can_be_retried BOOLEAN DEFAULT true;

-- Add RLS policies for job controls
ALTER TABLE job_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job controls from their tenant" ON job_controls
  FOR SELECT USING (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create job controls for their tenant" ON job_controls
  FOR INSERT WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM user_tenant_roles WHERE user_id = auth.uid()
  ));

-- Add indexes for performance
CREATE INDEX idx_job_controls_job_id ON job_controls(job_id);
CREATE INDEX idx_job_controls_tenant_id ON job_controls(tenant_id);
CREATE INDEX idx_job_controls_action ON job_controls(action);
CREATE INDEX idx_job_controls_processed_at ON job_controls(processed_at);

-- Function to send job control signal
CREATE OR REPLACE FUNCTION send_job_control_signal(
  p_job_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_control_id UUID;
BEGIN
  -- Get tenant_id from job
  SELECT tenant_id INTO v_tenant_id
  FROM jobs
  WHERE id = p_job_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;

  -- Insert control signal
  INSERT INTO job_controls (job_id, tenant_id, action, requested_by, metadata)
  VALUES (p_job_id, v_tenant_id, p_action, auth.uid(), p_metadata)
  RETURNING id INTO v_control_id;

  RETURN v_control_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get job recovery statistics
CREATE OR REPLACE FUNCTION get_job_recovery_stats(p_job_id UUID)
RETURNS TABLE (
  total_records INTEGER,
  successful_records INTEGER,
  failed_records INTEGER,
  retry_attempts INTEGER,
  can_retry BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.total_records,
    COALESCE((j.recovery_state->>'lastSuccessfulRecord')::INTEGER + 1, 0) as successful_records,
    COALESCE(jsonb_array_length(j.recovery_state->'failedRecords'), 0)::INTEGER as failed_records,
    COALESCE(jsonb_object_keys_count(j.recovery_state->'retryAttempts'), 0)::INTEGER as retry_attempts,
    (j.status IN ('failed', 'paused') AND jsonb_array_length(j.recovery_state->'failedRecords') > 0) as can_retry
  FROM jobs j
  WHERE j.id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Helper function to count jsonb object keys
CREATE OR REPLACE FUNCTION jsonb_object_keys_count(obj JSONB)
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM jsonb_object_keys(obj));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
