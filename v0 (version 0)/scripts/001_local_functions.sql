-- Local PostgreSQL Functions for ClientSynth
-- These replace the Supabase-specific functions

-- Function to get next job safely
CREATE OR REPLACE FUNCTION get_next_job_safe()
RETURNS TABLE(
    job_id UUID,
    tenant_id UUID,
    schema_id UUID,
    name TEXT,
    total_records INTEGER,
    config JSONB,
    recovery_state JSONB,
    schema_definition JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id as job_id,
        j.tenant_id,
        j.schema_id,
        j.name,
        j.total_records,
        j.config,
        j.recovery_state,
        s.definition as schema_definition
    FROM jobs j
    JOIN schemas s ON j.schema_id = s.id
    WHERE j.status IN ('pending', 'paused')
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    -- Update the job status to processing
    UPDATE jobs 
    SET status = 'processing', started_at = NOW()
    WHERE id = (SELECT job_id FROM get_next_job_safe() LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Function to update job status
CREATE OR REPLACE FUNCTION update_job_status(
    p_job_id UUID,
    p_new_status TEXT,
    p_error_message TEXT DEFAULT NULL,
    p_progress INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    current_status TEXT;
    valid_transition BOOLEAN;
BEGIN
    SELECT status INTO current_status FROM jobs WHERE id = p_job_id;

    IF current_status IS NULL THEN
        RAISE EXCEPTION 'Job % not found', p_job_id;
    END IF;

    valid_transition := FALSE;
    -- Define valid status transitions
    IF p_new_status = 'processing' AND current_status IN ('pending', 'paused') THEN
        valid_transition := TRUE;
    ELSIF p_new_status = 'completed' AND current_status IN ('processing', 'paused') THEN
        valid_transition := TRUE;
    ELSIF p_new_status = 'failed' AND current_status IN ('processing', 'paused', 'pending') THEN
        valid_transition := TRUE;
    ELSIF p_new_status = 'paused' AND current_status = 'processing' THEN
        valid_transition := TRUE;
    ELSIF p_new_status = 'pending' AND current_status IN ('paused', 'failed') THEN -- For retry
        valid_transition := TRUE;
    END IF;

    IF NOT valid_transition THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', current_status, p_new_status;
    END IF;

    UPDATE jobs
    SET
        status = p_new_status,
        error_message = p_error_message,
        progress = COALESCE(p_progress, progress),
        updated_at = NOW(),
        started_at = CASE WHEN p_new_status = 'processing' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at = CASE WHEN p_new_status IN ('completed', 'failed') AND completed_at IS NULL THEN NOW() ELSE completed_at END
    WHERE id = p_job_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to update job progress safely
CREATE OR REPLACE FUNCTION update_job_progress_safe(
    p_job_id UUID,
    p_generated_records INTEGER,
    p_progress INTEGER,
    p_recovery_state JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE jobs
    SET
        generated_records = p_generated_records,
        progress = p_progress,
        recovery_state = COALESCE(p_recovery_state, recovery_state),
        updated_at = NOW()
    WHERE id = p_job_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to insert generated data batch
CREATE OR REPLACE FUNCTION insert_generated_data_batch(
    p_records JSONB
) RETURNS BOOLEAN AS $$
DECLARE
    record_item JSONB;
    job_id_val UUID;
BEGIN
    -- Extract job_id from the first record
    job_id_val := (p_records->0->>'job_id')::UUID;
    
    -- Insert all records
    FOR record_item IN SELECT * FROM jsonb_array_elements(p_records)
    LOOP
        INSERT INTO generated_data (job_id, record_data)
        VALUES (job_id_val, record_item->'record_data');
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to send job control signal
CREATE OR REPLACE FUNCTION send_job_control_signal(
    p_job_id UUID,
    p_action TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    control_id UUID;
BEGIN
    INSERT INTO job_controls (job_id, action, metadata)
    VALUES (p_job_id, p_action, p_metadata)
    RETURNING id INTO control_id;
    
    RETURN control_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get job recovery stats
CREATE OR REPLACE FUNCTION get_job_recovery_stats(p_job_id UUID)
RETURNS TABLE(
    total_records INTEGER,
    successful_records INTEGER,
    failed_records INTEGER,
    retry_attempts INTEGER,
    can_retry BOOLEAN
) AS $$
DECLARE
    job_record RECORD;
    recovery_state JSONB;
BEGIN
    SELECT total_records, recovery_state INTO job_record
    FROM jobs WHERE id = p_job_id;
    
    IF job_record IS NULL THEN
        RETURN;
    END IF;
    
    recovery_state := job_record.recovery_state;
    
    RETURN QUERY SELECT
        job_record.total_records as total_records,
        (recovery_state->>'lastSuccessfulRecord')::INTEGER + 1 as successful_records,
        jsonb_array_length(recovery_state->'failedRecords') as failed_records,
        (SELECT COUNT(*) FROM jsonb_object_keys(recovery_state->'retryAttempts')) as retry_attempts,
        (recovery_state->>'canRetry')::BOOLEAN as can_retry;
END;
$$ LANGUAGE plpgsql;

-- Function to complete job
CREATE OR REPLACE FUNCTION complete_job(
    p_job_id UUID,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF p_success THEN
        PERFORM update_job_status(p_job_id, 'completed', NULL, 100);
    ELSE
        PERFORM update_job_status(p_job_id, 'failed', p_error_message);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update job progress (legacy compatibility)
CREATE OR REPLACE FUNCTION update_job_progress(
    p_job_id UUID,
    p_generated_records INTEGER,
    p_progress INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM update_job_progress_safe(p_job_id, p_generated_records, p_progress);
END;
$$ LANGUAGE plpgsql;
