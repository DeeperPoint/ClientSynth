# Test Suite Documentation

This directory contains comprehensive tests for the synthetic client generation system.

## Test Structure

\`\`\`
__tests__/
├── integration/          # Integration tests for backend services
│   ├── google-flash-provider.test.ts
│   ├── batch-image-generator.test.ts
│   ├── job-processor.test.ts
│   └── image-service.test.ts
└── e2e/                 # End-to-end tests
    └── job-workflow.test.ts
\`\`\`

## Running Tests

### All Tests
\`\`\`bash
npm test
\`\`\`

### Integration Tests Only
\`\`\`bash
npm run test:integration
\`\`\`

### End-to-End Tests Only
\`\`\`bash
npm run test:e2e
\`\`\`

### Watch Mode
\`\`\`bash
npm run test:watch
\`\`\`

## Test Categories

### Integration Tests

Integration tests verify that individual components work correctly with external services:

- **google-flash-provider.test.ts**: Tests Google Flash image generation provider
  - Single image generation
  - Batch image generation
  - Rate limiting
  - Error handling
  - Model support

- **batch-image-generator.test.ts**: Tests batch image generation system
  - Multiple record processing
  - Large batch handling
  - Progress tracking
  - S3 upload integration

- **job-processor.test.ts**: Tests job processing pipeline
  - Complete job processing
  - Text-only jobs
  - Job pause/resume
  - Error handling and retries
  - Logging

- **image-service.test.ts**: Tests image generation service
  - Image generation and upload
  - Provider selection
  - Metadata handling
  - Error handling

### End-to-End Tests

End-to-end tests verify complete workflows from start to finish:

- **job-workflow.test.ts**: Tests complete job lifecycle
  - Job creation
  - Data generation
  - Image generation
  - Job completion
  - Export functionality

## Environment Variables

Tests require the following environment variables:

\`\`\`env
POSTGRES_URL=postgres://user:password@localhost:5432/db
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_s3_bucket
AWS_REGION=your_aws_region
OPENROUTER_API_KEY=your_openrouter_key
\`\`\`

## Test Timeouts

- Integration tests: 30-180 seconds (depending on API calls)
- E2E tests: 300 seconds (5 minutes)

## Best Practices

1. **Cleanup**: All tests clean up their test data after completion
2. **Isolation**: Tests are isolated and don't depend on each other
3. **Real Services**: Integration tests use real services (PostgreSQL, S3, Google AI)
4. **Mocking**: Only mock when necessary to avoid flaky tests
5. **Assertions**: Use specific assertions to catch regressions

## Troubleshooting

### Tests Timing Out
- Check your internet connection
- Verify API keys are valid
- Increase timeout in jest.config.js

### Database Errors
- Ensure PostgreSQL is accessible
- Check service role key permissions
- Verify database schema is up to date

### S3 Upload Failures
- Verify AWS credentials
- Check S3 bucket permissions
- Ensure bucket exists in specified region

## Coverage

Run tests with coverage:
\`\`\`bash
npm test -- --coverage
\`\`\`

Target coverage: 80%+ for critical paths
