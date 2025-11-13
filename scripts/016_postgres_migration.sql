-- PostgreSQL Migration: Create standalone authentication schema
-- This script creates all necessary tables and functions for the application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create auth schema for user management
CREATE SCHEMA IF NOT EXISTS auth;

-- Users table (replaces auth.users)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  raw_user_meta_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenants table (organizations/companies)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles table (references auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User tenant roles (many-to-many with roles)
CREATE TABLE IF NOT EXISTS public.user_tenant_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

-- Schemas table (for data generation schemas)
CREATE TABLE IF NOT EXISTS public.schemas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  schema_definition JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Jobs table (for data generation jobs)
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_records INTEGER NOT NULL,
  generated_records INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  text_model TEXT DEFAULT 'google/gemini-2.5-flash',
  image_model TEXT DEFAULT NULL,
  model_config JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  recovery_state JSONB DEFAULT '{"lastSuccessfulRecord": -1, "failedRecords": [], "retryAttempts": {}}',
  can_be_cancelled BOOLEAN DEFAULT true,
  can_be_paused BOOLEAN DEFAULT true,
  can_be_retried BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job execution logs table
CREATE TABLE IF NOT EXISTS public.job_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'debug')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generated data table (stores the actual generated records)
CREATE TABLE IF NOT EXISTS public.generated_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_data JSONB NOT NULL,
  record_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media storage table for generated images
CREATE TABLE IF NOT EXISTS public.media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/png',
  file_size INTEGER NOT NULL,
  md5_hash TEXT NOT NULL,
  model_used TEXT,
  prompt_used TEXT,
  generation_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exports table to track export jobs
CREATE TABLE IF NOT EXISTS public.exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('csv', 'json', 'xlsx', 'sql')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  file_size BIGINT,
  record_count INTEGER,
  filters JSONB DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Job controls table
CREATE TABLE IF NOT EXISTS public.job_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('pause', 'resume', 'cancel', 'retry')),
  requested_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);

-- Seed categories and templates
CREATE TABLE IF NOT EXISTS public.seed_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  field_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual seed prompts/templates
CREATE TABLE IF NOT EXISTS public.seeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.seed_categories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  seed_type VARCHAR(50) NOT NULL,
  quality_score INTEGER DEFAULT 50 CHECK (quality_score >= 0 AND quality_score <= 100),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track seed usage to prevent repetition
CREATE TABLE IF NOT EXISTS public.seed_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seed_id UUID REFERENCES public.seeds(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  context JSONB DEFAULT '{}',
  cooldown_until TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour'
);

-- Pattern detection for avoiding repetition
CREATE TABLE IF NOT EXISTS public.generation_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  pattern_hash VARCHAR(64) NOT NULL,
  pattern_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users(email);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_user_id ON public.user_tenant_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_roles_tenant_id ON public.user_tenant_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schemas_tenant_id ON public.schemas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON public.jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON public.jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON public.job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_job_id ON public.generated_data(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_data_tenant_id ON public.generated_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_job_id ON public.media(job_id);
CREATE INDEX IF NOT EXISTS idx_media_tenant_id ON public.media(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_record_id ON public.media(record_id);
CREATE INDEX IF NOT EXISTS idx_exports_tenant_id ON public.exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exports_job_id ON public.exports(job_id);
CREATE INDEX IF NOT EXISTS idx_exports_created_by ON public.exports(created_by);
CREATE INDEX IF NOT EXISTS idx_exports_status ON public.exports(status);
CREATE INDEX IF NOT EXISTS idx_job_controls_job_id ON public.job_controls(job_id);
CREATE INDEX IF NOT EXISTS idx_job_controls_tenant_id ON public.job_controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_controls_action ON public.job_controls(action);
CREATE INDEX IF NOT EXISTS idx_job_controls_processed_at ON public.job_controls(processed_at);
CREATE INDEX IF NOT EXISTS idx_seeds_category_type ON public.seeds(category_id, seed_type);
CREATE INDEX IF NOT EXISTS idx_seeds_active_quality ON public.seeds(is_active, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_seed_usage_cooldown ON public.seed_usage(seed_id, cooldown_until);
CREATE INDEX IF NOT EXISTS idx_generation_patterns_hash ON public.generation_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_generation_patterns_job ON public.generation_patterns(job_id);

-- Functions for user management
CREATE OR REPLACE FUNCTION public.create_user(
  p_email TEXT,
  p_password_hash TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
  tenant_id UUID;
BEGIN
  -- Create user
  INSERT INTO auth.users (email, password_hash, raw_user_meta_data)
  VALUES (p_email, p_password_hash, jsonb_build_object('full_name', p_full_name))
  RETURNING id INTO user_id;

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (user_id, p_email, p_full_name);

  -- Create default tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (
    COALESCE(
      CASE 
        WHEN p_email LIKE '%@gmail.com' OR p_email LIKE '%@yahoo.com' OR p_email LIKE '%@hotmail.com' 
        THEN 'My Organization'
        ELSE INITCAP(SPLIT_PART(SPLIT_PART(p_email, '@', 2), '.', 1))
      END,
      'My Organization'
    ),
    LOWER(REPLACE(COALESCE(
      CASE 
        WHEN p_email LIKE '%@gmail.com' OR p_email LIKE '%@yahoo.com' OR p_email LIKE '%@hotmail.com' 
        THEN 'My Organization'
        ELSE INITCAP(SPLIT_PART(SPLIT_PART(p_email, '@', 2), '.', 1))
      END,
      'My Organization'
    ) || '-' || SUBSTRING(user_id::TEXT, 1, 8), ' ', '-'))
  )
  RETURNING id INTO tenant_id;

  -- Add user as owner
  INSERT INTO public.user_tenant_roles (user_id, tenant_id, role)
  VALUES (user_id, tenant_id, 'owner');

  RETURN user_id;
END;
$$;

-- Function to authenticate user
CREATE OR REPLACE FUNCTION public.authenticate_user(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email, p.full_name, p.avatar_url
  FROM auth.users u
  INNER JOIN public.profiles p ON u.id = p.id
  WHERE u.email = p_email AND u.password_hash = p_password_hash;
END;
$$;

-- Job management functions
CREATE OR REPLACE FUNCTION public.get_next_job()
RETURNS TABLE(
  job_id UUID,
  tenant_id UUID,
  schema_id UUID,
  name TEXT,
  total_records INTEGER,
  config JSONB,
  text_model TEXT,
  image_model TEXT,
  model_config JSONB,
  schema_definition JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Get the next pending job and mark it as running
  UPDATE public.jobs 
  SET status = 'running', updated_at = NOW()
  WHERE id = (
    SELECT j.id 
    FROM public.jobs j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    jobs.id,
    jobs.tenant_id,
    jobs.schema_id,
    jobs.name,
    jobs.total_records,
    jobs.config,
    jobs.text_model,
    jobs.image_model,
    jobs.model_config
  INTO job_id, tenant_id, schema_id, name, total_records, config, text_model, image_model, model_config;

  -- If we found a job, get the schema definition
  IF job_id IS NOT NULL THEN
    SELECT s.schema_definition INTO schema_definition
    FROM public.schemas s
    WHERE s.id = schema_id;

    RETURN QUERY SELECT 
      job_id, tenant_id, schema_id, name, total_records, config, text_model, image_model, model_config, schema_definition;
  END IF;
END;
$$;

-- Function to update job progress
CREATE OR REPLACE FUNCTION public.update_job_progress(
  p_job_id UUID,
  p_generated_records INTEGER,
  p_progress INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.jobs
  SET 
    generated_records = p_generated_records,
    progress = COALESCE(p_progress, LEAST(100, (p_generated_records * 100 / total_records))),
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Function to complete job
CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id UUID,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.jobs
  SET 
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    error_message = p_error_message,
    progress = CASE WHEN p_success THEN 100 ELSE progress END,
    completed_at = CASE WHEN p_success THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = p_job_id;
END;
$$;

-- Function to send job control signal
CREATE OR REPLACE FUNCTION public.send_job_control_signal(
  p_job_id UUID,
  p_action TEXT,
  p_requested_by UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_control_id UUID;
BEGIN
  -- Get tenant_id from job
  SELECT tenant_id INTO v_tenant_id
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;

  -- Insert control signal
  INSERT INTO public.job_controls (job_id, tenant_id, action, requested_by, metadata)
  VALUES (p_job_id, v_tenant_id, p_action, p_requested_by, p_metadata)
  RETURNING id INTO v_control_id;

  RETURN v_control_id;
END;
$$;

-- Insert default seed categories
INSERT INTO public.seed_categories (name, description, field_types) VALUES
('Portrait Images', 'Professional headshots and portrait photography', ARRAY['image', 'avatar', 'photo']),
('Product Images', 'Commercial product photography and mockups', ARRAY['image', 'product_image']),
('Landscape Images', 'Nature, cityscapes, and environmental photography', ARRAY['image', 'background', 'banner']),
('Abstract Images', 'Artistic and abstract visual elements', ARRAY['image', 'decoration']),
('Personal Names', 'Realistic first and last name combinations', ARRAY['name', 'first_name', 'last_name']),
('Company Names', 'Business and organization names', ARRAY['company', 'business_name']),
('Addresses', 'Realistic address templates', ARRAY['address', 'location']),
('Text Content', 'Descriptions, bios, and content templates', ARRAY['text', 'description', 'bio'])
ON CONFLICT (name) DO NOTHING;

-- Insert sample seeds
INSERT INTO public.seeds (category_id, content, seed_type, quality_score) VALUES
((SELECT id FROM public.seed_categories WHERE name = 'Portrait Images'), 'Professional headshot of a confident business person in modern office setting, natural lighting, high quality photography', 'image_prompt', 85),
((SELECT id FROM public.seed_categories WHERE name = 'Portrait Images'), 'Friendly professional portrait with warm smile, clean background, corporate attire', 'image_prompt', 80),
((SELECT id FROM public.seed_categories WHERE name = 'Product Images'), 'Sleek modern product photography with clean white background, professional lighting', 'image_prompt', 90),
((SELECT id FROM public.seed_categories WHERE name = 'Landscape Images'), 'Beautiful urban cityscape at golden hour, modern architecture, vibrant colors', 'image_prompt', 75),
((SELECT id FROM public.seed_categories WHERE name = 'Abstract Images'), 'Minimalist geometric pattern with gradient colors, modern design aesthetic', 'image_prompt', 70)
ON CONFLICT DO NOTHING;
