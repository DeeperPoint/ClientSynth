-- Core multi-tenant schema for Client Synth platform
-- Based on the milestone plan: tenants, users, user_tenant_roles

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_records INTEGER NOT NULL,
  generated_records INTEGER DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for tenants (users can see tenants they belong to)
CREATE POLICY "tenants_select_member" ON public.tenants FOR SELECT 
  USING (id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "tenants_insert_owner" ON public.tenants FOR INSERT 
  WITH CHECK (true); -- Will be restricted by application logic

CREATE POLICY "tenants_update_admin" ON public.tenants FOR UPDATE 
  USING (id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- RLS Policies for user_tenant_roles
CREATE POLICY "user_tenant_roles_select_own" ON public.user_tenant_roles FOR SELECT 
  USING (user_id = auth.uid() OR tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE POLICY "user_tenant_roles_insert_admin" ON public.user_tenant_roles FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- RLS Policies for schemas (tenant-scoped)
CREATE POLICY "schemas_select_tenant_member" ON public.schemas FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "schemas_insert_tenant_member" ON public.schemas FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()) AND created_by = auth.uid());

CREATE POLICY "schemas_update_tenant_member" ON public.schemas FOR UPDATE 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

-- RLS Policies for jobs (tenant-scoped)
CREATE POLICY "jobs_select_tenant_member" ON public.jobs FOR SELECT 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));

CREATE POLICY "jobs_insert_tenant_member" ON public.jobs FOR INSERT 
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()) AND created_by = auth.uid());

CREATE POLICY "jobs_update_tenant_member" ON public.jobs FOR UPDATE 
  USING (tenant_id IN (SELECT tenant_id FROM public.user_tenant_roles WHERE user_id = auth.uid()));
