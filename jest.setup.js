// Learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom"

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key"
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "test-access-key"
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test-secret-key"
process.env.AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || "test-bucket"
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1"
