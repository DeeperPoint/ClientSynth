-- Phase 4: Intelligence Layer
-- Create tables for ML-based seed quality scoring and predictive analytics

-- Seed quality feedback and scoring
CREATE TABLE seed_quality_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id UUID REFERENCES seeds(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  feedback_type VARCHAR(50) NOT NULL, -- 'manual', 'automatic', 'user_rating'
  feedback_data JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Generation performance metrics
CREATE TABLE generation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  metric_type VARCHAR(100) NOT NULL, -- 'similarity_score', 'diversity_index', 'quality_score'
  metric_value DECIMAL(10,4) NOT NULL,
  metric_metadata JSONB DEFAULT '{}',
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Predictive recommendations
CREATE TABLE generation_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  recommendation_type VARCHAR(100) NOT NULL, -- 'seed_selection', 'parameter_tuning', 'quality_improvement'
  recommendation_data JSONB NOT NULL,
  confidence_score DECIMAL(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Learning model states (for storing ML model parameters)
CREATE TABLE ml_model_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  model_type VARCHAR(100) NOT NULL, -- 'seed_quality_predictor', 'diversity_optimizer', 'similarity_detector'
  model_version VARCHAR(50) NOT NULL,
  model_parameters JSONB NOT NULL,
  training_data_hash VARCHAR(64),
  accuracy_metrics JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  trained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance optimization suggestions
CREATE TABLE optimization_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  suggestion_type VARCHAR(100) NOT NULL, -- 'batch_size', 'seed_variety', 'cooldown_adjustment'
  suggestion_data JSONB NOT NULL,
  expected_improvement DECIMAL(5,4), -- Expected improvement percentage
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'applied', 'dismissed', 'expired'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  applied_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Indexes for performance
CREATE INDEX idx_seed_quality_feedback_seed ON seed_quality_feedback(seed_id);
CREATE INDEX idx_seed_quality_feedback_job ON seed_quality_feedback(job_id);
CREATE INDEX idx_seed_quality_feedback_tenant ON seed_quality_feedback(tenant_id);
CREATE INDEX idx_generation_metrics_job ON generation_metrics(job_id);
CREATE INDEX idx_generation_metrics_type ON generation_metrics(metric_type);
CREATE INDEX idx_generation_recommendations_tenant ON generation_recommendations(tenant_id);
CREATE INDEX idx_generation_recommendations_active ON generation_recommendations(is_active, expires_at);
CREATE INDEX idx_ml_model_states_tenant_type ON ml_model_states(tenant_id, model_type);
CREATE INDEX idx_ml_model_states_active ON ml_model_states(is_active, model_type);
CREATE INDEX idx_optimization_suggestions_tenant ON optimization_suggestions(tenant_id);
CREATE INDEX idx_optimization_suggestions_status ON optimization_suggestions(status, expires_at);

-- Enable RLS
ALTER TABLE seed_quality_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_model_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimization_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (tenant-scoped)
CREATE POLICY "seed_quality_feedback_tenant_policy" ON seed_quality_feedback 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "generation_metrics_tenant_policy" ON generation_metrics 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "generation_recommendations_tenant_policy" ON generation_recommendations 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ml_model_states_tenant_policy" ON ml_model_states 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "optimization_suggestions_tenant_policy" ON optimization_suggestions 
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenant_roles 
      WHERE user_id = auth.uid()
    )
  );
