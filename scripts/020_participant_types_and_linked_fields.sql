-- Migration 020: Add Market Participant Types and Support for Linked Fields
-- This migration adds:
-- 1. participant_types lookup table
-- 2. participant_type column to schemas table
-- 3. Indexes for performance

-- Create participant_types lookup table
CREATE TABLE IF NOT EXISTS public.participant_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_name TEXT NOT NULL,
  icon_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default participant types
INSERT INTO public.participant_types (name, display_name, description, icon_name) VALUES
  ('producer', 'Producer', 'Companies or individuals that create/manufacture products or services', 'factory'),
  ('buyer', 'Buyer', 'Companies or individuals that purchase products or services', 'shopping-cart'),
  ('logistics_provider', 'Logistics Provider', 'Companies that handle transportation, warehousing, and distribution', 'truck'),
  ('supplier', 'Supplier', 'Companies that provide raw materials or components', 'package'),
  ('distributor', 'Distributor', 'Companies that distribute products to retailers or end consumers', 'store'),
  ('retailer', 'Retailer', 'Companies that sell products directly to consumers', 'shopping-bag'),
  ('service_provider', 'Service Provider', 'Companies that provide services rather than physical products', 'briefcase'),
  ('other', 'Other', 'Other types of market participants', 'circle')
ON CONFLICT (name) DO NOTHING;

-- Add participant_type column to schemas table (nullable for backward compatibility)
ALTER TABLE public.schemas 
ADD COLUMN IF NOT EXISTS participant_type TEXT REFERENCES public.participant_types(name);

-- Create index for participant_type lookups
CREATE INDEX IF NOT EXISTS idx_schemas_participant_type ON public.schemas(participant_type);

-- Add comment for documentation
COMMENT ON COLUMN public.schemas.participant_type IS 'Type of market participant this schema represents (e.g., producer, buyer, logistics_provider)';
COMMENT ON TABLE public.participant_types IS 'Lookup table for market participant types used to categorize schemas';

