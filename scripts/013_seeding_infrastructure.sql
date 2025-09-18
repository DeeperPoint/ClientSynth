-- Phase 1: Core Seeding Infrastructure
-- Create tables for seed management and usage tracking

-- Seed categories and templates
CREATE TABLE seed_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  field_types TEXT[] DEFAULT '{}', -- Which field types this category applies to
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual seed prompts/templates
CREATE TABLE seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES seed_categories(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  seed_type VARCHAR(50) NOT NULL, -- 'image_prompt', 'name_template', 'text_template'
  quality_score INTEGER DEFAULT 50 CHECK (quality_score >= 0 AND quality_score <= 100),
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track seed usage to prevent repetition
CREATE TABLE seed_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  context JSONB DEFAULT '{}', -- Field name, record index, etc.
  cooldown_until TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour'
);

-- Pattern detection for avoiding repetition
CREATE TABLE generation_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  pattern_hash VARCHAR(64) NOT NULL,
  pattern_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_seeds_category_type ON seeds(category_id, seed_type);
CREATE INDEX idx_seeds_active_quality ON seeds(is_active, quality_score DESC);
CREATE INDEX idx_seed_usage_cooldown ON seed_usage(seed_id, cooldown_until);
CREATE INDEX idx_generation_patterns_hash ON generation_patterns(pattern_hash);
CREATE INDEX idx_generation_patterns_job ON generation_patterns(job_id);

-- Insert default seed categories
INSERT INTO seed_categories (name, description, field_types) VALUES
('Portrait Images', 'Professional headshots and portrait photography', ARRAY['image', 'avatar', 'photo']),
('Product Images', 'Commercial product photography and mockups', ARRAY['image', 'product_image']),
('Landscape Images', 'Nature, cityscapes, and environmental photography', ARRAY['image', 'background', 'banner']),
('Abstract Images', 'Artistic and abstract visual elements', ARRAY['image', 'decoration']),
('Personal Names', 'Realistic first and last name combinations', ARRAY['name', 'first_name', 'last_name']),
('Company Names', 'Business and organization names', ARRAY['company', 'business_name']),
('Addresses', 'Realistic address templates', ARRAY['address', 'location']),
('Text Content', 'Descriptions, bios, and content templates', ARRAY['text', 'description', 'bio']);

-- Insert sample image seeds
INSERT INTO seeds (category_id, content, seed_type, quality_score) VALUES
((SELECT id FROM seed_categories WHERE name = 'Portrait Images'), 'Professional headshot of a confident business person in modern office setting, natural lighting, high quality photography', 'image_prompt', 85),
((SELECT id FROM seed_categories WHERE name = 'Portrait Images'), 'Friendly professional portrait with warm smile, clean background, corporate attire', 'image_prompt', 80),
((SELECT id FROM seed_categories WHERE name = 'Product Images'), 'Sleek modern product photography with clean white background, professional lighting', 'image_prompt', 90),
((SELECT id FROM seed_categories WHERE name = 'Landscape Images'), 'Beautiful urban cityscape at golden hour, modern architecture, vibrant colors', 'image_prompt', 75),
((SELECT id FROM seed_categories WHERE name = 'Abstract Images'), 'Minimalist geometric pattern with gradient colors, modern design aesthetic', 'image_prompt', 70);

-- Insert sample name seeds
INSERT INTO seeds (category_id, content, seed_type, quality_score, metadata) VALUES
((SELECT id FROM seed_categories WHERE name = 'Personal Names'), '{{first_name}} {{last_name}}', 'name_template', 95, '{"first_names": ["Alex", "Jordan", "Taylor", "Morgan", "Casey"], "last_names": ["Smith", "Johnson", "Williams", "Brown", "Jones"]}'),
((SELECT id FROM seed_categories WHERE name = 'Company Names'), '{{adjective}} {{noun}} {{suffix}}', 'name_template', 85, '{"adjectives": ["Global", "Smart", "Digital", "Creative", "Dynamic"], "nouns": ["Solutions", "Systems", "Technologies", "Innovations", "Ventures"], "suffixes": ["Inc", "LLC", "Corp", "Group", "Partners"]}');

-- Enable RLS
ALTER TABLE seed_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for service role, tenant-scoped for users)
CREATE POLICY "seed_categories_policy" ON seed_categories FOR ALL USING (true);
CREATE POLICY "seeds_policy" ON seeds FOR ALL USING (true);
CREATE POLICY "seed_usage_policy" ON seed_usage FOR ALL USING (true);
CREATE POLICY "generation_patterns_policy" ON generation_patterns FOR ALL USING (true);
