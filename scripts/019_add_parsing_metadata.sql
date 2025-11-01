-- Add parsing_metadata column to example_files table
-- This column stores extracted fields, confidence scores, and parsing metadata

ALTER TABLE public.example_files 
ADD COLUMN IF NOT EXISTS parsing_metadata JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN public.example_files.parsing_metadata IS 'Stores parsed fields, record counts, confidence scores, and extraction metadata from file parsing';

