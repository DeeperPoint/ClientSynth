# Testing Guide

This document provides comprehensive information about testing the Client Synth platform.

## Test Structure

\`\`\`
__tests__/
├── integration/           # Backend integration tests
│   ├── google-flash-provider.test.ts
│   ├── batch-image-generator.test.ts
│   ├── job-processor.test.ts
│   └── image-service.test.ts
├── e2e/                  # End-to-end workflow tests
│   ├── job-workflow.test.ts
│   └── image-generation-workflow.test.ts
└── README.md
\`\`\`

## Running Tests

### Quick Start

\`\`\`bash
# Run all tests
npm run test:all

# Run backend integration tests only
npm run test:backend

# Run Jest unit tests
npm test

# Run integration tests with Jest
npm run test:integration

# Run E2E tests with Jest
npm run test:e2e

# Watch mode for development
npm run test:watch
\`\`\`

## Backend Integration Tests

The backend integration test suite (`scripts/run-tests.ts`) validates the entire job processing pipeline with real services.

### Prerequisites

Set the following environment variables:

\`\`\`bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GOOGLE_AI_API_KEY=your_google_ai_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your_bucket_name
AWS_REGION=your_region
OPENROUTER_API_KEY=your_openrouter_key
\`\`\`

### Test Coverage

1. **Google Flash Provider Test**
   - Validates image generation with Gemini 2.0 Flash
   - Checks response format and data URL structure
   - Verifies rate limiting and error handling

2. **Batch Image Generator Test**
   - Creates test job in database
   - Generates multiple images in batch
   - Validates S3 upload and database updates
   - Tests progress tracking callbacks

3. **Image Service Integration Test**
   - Tests the unified image service interface
   - Validates provider selection and routing
   - Checks result format consistency

4. **Job Processor End-to-End Test**
   - Creates complete schema with text and image fields
   - Processes job from start to finish
   - Validates all generated data
   - Tests AI text generation + image generation
   - Verifies database state after completion

### Running Backend Tests

\`\`\`bash
npm run test:backend
\`\`\`

Expected output:
\`\`\`
🚀 Starting Backend Integration Tests
============================================================

📋 Validating Environment...
✅ All required environment variables present

🧪 Running: Google Flash Provider
[v0] Initializing Google Flash Provider...
[v0] Generating test image...
[v0] Image generated successfully...
✅ PASSED (2341ms)

🧪 Running: Batch Image Generator
[v0] Creating test job...
[v0] Generating batch images...
[v0] Progress: 1/2
[v0] Progress: 2/2
✅ PASSED (4523ms)

🧪 Running: Image Service Integration
[v0] Testing Image Service with Google Flash...
✅ PASSED (2156ms)

🧪 Running: Job Processor End-to-End
[v0] Creating test schema...
[v0] Processing job...
[v0] Job completed successfully!
✅ PASSED (15234ms)

============================================================

📊 Test Summary

✅ Google Flash Provider: PASSED (2341ms)
✅ Batch Image Generator: PASSED (4523ms)
✅ Image Service Integration: PASSED (2156ms)
✅ Job Processor End-to-End: PASSED (15234ms)

Total: 4 passed, 0 failed
Duration: 24254ms (24.25s)

✅ All tests passed!
\`\`\`

## Jest Tests

### Unit Tests

Located in `__tests__/integration/` and `__tests__/e2e/`, these tests use Jest with mocked dependencies for faster execution.

### Running Jest Tests

\`\`\`bash
# All Jest tests
npm test

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Watch mode
npm run test:watch
\`\`\`

## Test Best Practices

### Writing Tests

1. **Use descriptive test names**
   \`\`\`typescript
   test("should generate image with Google Flash provider", async () => {
     // test code
   })
   \`\`\`

2. **Add verbose logging**
   \`\`\`typescript
   console.log("[v0] Starting image generation...")
   console.log(`[v0] Generated image URL: ${result.url}`)
   \`\`\`

3. **Clean up after tests**
   \`\`\`typescript
   afterEach(async () => {
     await supabase.from("jobs").delete().eq("id", testJobId)
   })
   \`\`\`

4. **Test error cases**
   \`\`\`typescript
   test("should handle API rate limits gracefully", async () => {
     // test rate limiting
   })
   \`\`\`

### Debugging Failed Tests

1. Check the verbose logs with `[v0]` prefix
2. Verify environment variables are set correctly
3. Check Supabase database state
4. Verify S3 bucket permissions
5. Check API key validity and quotas

## Continuous Integration

Add to your CI/CD pipeline:

\`\`\`yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:all
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_KEY }}
          GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_KEY }}
\`\`\`

## Troubleshooting

### Common Issues

**Test timeout errors**
- Increase Jest timeout: `jest.setTimeout(30000)`
- Check network connectivity
- Verify API endpoints are accessible

**Database connection errors**
- Verify Supabase credentials
- Check RLS policies
- Ensure service role key has proper permissions

**Image generation failures**
- Verify Google AI API key
- Check API quota limits
- Ensure proper rate limiting

**S3 upload errors**
- Verify AWS credentials
- Check bucket permissions
- Ensure bucket exists and is accessible

## Performance Benchmarks

Expected test durations:
- Google Flash Provider: ~2-3 seconds
- Batch Image Generator: ~4-5 seconds
- Image Service Integration: ~2-3 seconds
- Job Processor E2E: ~15-20 seconds

Total suite: ~25-30 seconds

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all existing tests pass
3. Add integration tests for new providers
4. Update this documentation
