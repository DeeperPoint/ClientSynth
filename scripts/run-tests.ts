import { createClient } from "@supabase/supabase-js"
import { GoogleFlashProvider } from "../lib/image-generation/providers/google-flash-provider"
import { BatchImageGenerator } from "../lib/batch-image-generator"
import { JobProcessor } from "../lib/job-processor"
import { S3Uploader } from "../lib/s3-uploader"

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  googleApiKey: process.env.GOOGLE_AI_API_KEY!,
  testTenantId: process.env.TEST_TENANT_ID || "test-tenant-id",
  testSchemaId: process.env.TEST_SCHEMA_ID || "test-schema-id",
}

// Test results tracking
interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, testFn: () => Promise<void>) {
  console.log(`\n🧪 Running: ${name}`)
  const startTime = Date.now()

  try {
    await testFn()
    const duration = Date.now() - startTime
    results.push({ name, passed: true, duration })
    console.log(`✅ PASSED (${duration}ms)`)
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    results.push({ name, passed: false, duration, error: errorMessage })
    console.log(`❌ FAILED (${duration}ms)`)
    console.error(`   Error: ${errorMessage}`)
  }
}

// Test 1: Google Flash Provider
async function testGoogleFlashProvider() {
  console.log("[v0] Initializing Google Flash Provider...")
  const provider = new GoogleFlashProvider(TEST_CONFIG.googleApiKey)

  console.log("[v0] Generating test image...")
  const result = await provider.generateImage({
    prompt: "A professional headshot of a business person",
    width: 512,
    height: 512,
    quality: "standard",
  })

  console.log("[v0] Validating result...")
  if (!result.url) throw new Error("No image URL returned")
  if (!result.url.startsWith("data:image/")) throw new Error("Invalid image URL format")

  console.log(`[v0] Image generated successfully: ${result.url.substring(0, 50)}...`)
}

// Test 2: Batch Image Generator
async function testBatchImageGenerator() {
  console.log("[v0] Initializing Batch Image Generator...")
  const supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey)
  const s3Uploader = new S3Uploader()
  const generator = new BatchImageGenerator(supabase, s3Uploader)

  console.log("[v0] Creating test job...")
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      tenant_id: TEST_CONFIG.testTenantId,
      schema_id: TEST_CONFIG.testSchemaId,
      status: "pending",
      total_records: 2,
      configuration: {
        imageProvider: "google-flash",
        imageSettings: {
          width: 512,
          height: 512,
          quality: "standard",
        },
      },
    })
    .select()
    .single()

  if (jobError) throw new Error(`Failed to create job: ${jobError.message}`)
  console.log(`[v0] Job created: ${job.id}`)

  console.log("[v0] Generating batch images...")
  const prompts = ["A professional headshot of a business person", "A modern office workspace"]

  const results = await generator.generateBatch({
    jobId: job.id,
    prompts,
    settings: {
      width: 512,
      height: 512,
      quality: "standard",
      provider: "google-flash",
    },
    onProgress: (progress) => {
      console.log(`[v0] Progress: ${progress.completed}/${progress.total}`)
    },
  })

  console.log("[v0] Validating batch results...")
  if (results.length !== 2) throw new Error(`Expected 2 results, got ${results.length}`)
  if (results.some((r) => !r.success)) throw new Error("Some images failed to generate")

  console.log(`[v0] Batch generation successful: ${results.length} images`)

  // Cleanup
  await supabase.from("jobs").delete().eq("id", job.id)
}

// Test 3: Job Processor End-to-End
async function testJobProcessorEndToEnd() {
  console.log("[v0] Initializing Job Processor...")
  const supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey)

  console.log("[v0] Creating test schema...")
  const { data: schema, error: schemaError } = await supabase
    .from("schemas")
    .insert({
      tenant_id: TEST_CONFIG.testTenantId,
      name: "Test Schema",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "email", type: "email", required: true },
        { name: "avatar", type: "image", required: true },
      ],
    })
    .select()
    .single()

  if (schemaError) throw new Error(`Failed to create schema: ${schemaError.message}`)
  console.log(`[v0] Schema created: ${schema.id}`)

  console.log("[v0] Creating test job...")
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      tenant_id: TEST_CONFIG.testTenantId,
      schema_id: schema.id,
      status: "pending",
      total_records: 3,
      configuration: {
        textModel: "openai/gpt-4o-mini",
        imageProvider: "google-flash",
        imageSettings: {
          width: 512,
          height: 512,
          quality: "standard",
        },
      },
    })
    .select()
    .single()

  if (jobError) throw new Error(`Failed to create job: ${jobError.message}`)
  console.log(`[v0] Job created: ${job.id}`)

  console.log("[v0] Processing job...")
  const processor = new JobProcessor()
  await processor.processJob(job.id)

  console.log("[v0] Waiting for job completion...")
  let attempts = 0
  const maxAttempts = 30

  while (attempts < maxAttempts) {
    const { data: updatedJob } = await supabase
      .from("jobs")
      .select("status, records_generated")
      .eq("id", job.id)
      .single()

    console.log(`[v0] Job status: ${updatedJob?.status}, Records: ${updatedJob?.records_generated}`)

    if (updatedJob?.status === "completed") {
      console.log("[v0] Job completed successfully!")
      break
    }

    if (updatedJob?.status === "failed") {
      throw new Error("Job failed during processing")
    }

    attempts++
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  if (attempts >= maxAttempts) {
    throw new Error("Job did not complete within timeout")
  }

  console.log("[v0] Verifying generated data...")
  const { data: generatedData, error: dataError } = await supabase
    .from("generated_data")
    .select("*")
    .eq("job_id", job.id)

  if (dataError) throw new Error(`Failed to fetch generated data: ${dataError.message}`)
  if (!generatedData || generatedData.length !== 3) {
    throw new Error(`Expected 3 records, got ${generatedData?.length || 0}`)
  }

  console.log("[v0] Validating data structure...")
  for (const record of generatedData) {
    if (!record.data.name) throw new Error("Missing name field")
    if (!record.data.email) throw new Error("Missing email field")
    if (!record.data.avatar) throw new Error("Missing avatar field")
  }

  console.log(`[v0] All ${generatedData.length} records validated successfully!`)

  // Cleanup
  await supabase.from("generated_data").delete().eq("job_id", job.id)
  await supabase.from("jobs").delete().eq("id", job.id)
  await supabase.from("schemas").delete().eq("id", schema.id)
}

// Test 4: Image Service Integration
async function testImageServiceIntegration() {
  console.log("[v0] Testing Image Service with Google Flash...")
  const { ImageService } = await import("../lib/image-generation/image-service")

  console.log("[v0] Generating image via service...")
  const result = await ImageService.generateImage({
    prompt: "A professional business portrait",
    provider: "google-flash",
    settings: {
      width: 512,
      height: 512,
      quality: "standard",
    },
  })

  console.log("[v0] Validating service result...")
  if (!result.url) throw new Error("No image URL returned from service")
  if (!result.provider || result.provider !== "google-flash") {
    throw new Error("Provider mismatch")
  }

  console.log(`[v0] Image service working correctly with provider: ${result.provider}`)
}

// Main test runner
async function main() {
  console.log("🚀 Starting Backend Integration Tests\n")
  console.log("=".repeat(60))

  // Validate environment
  console.log("\n📋 Validating Environment...")
  const requiredEnvVars = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_AI_API_KEY"]

  const missingVars = requiredEnvVars.filter((v) => !process.env[v])
  if (missingVars.length > 0) {
    console.error(`❌ Missing environment variables: ${missingVars.join(", ")}`)
    process.exit(1)
  }
  console.log("✅ All required environment variables present")

  // Run tests
  await runTest("Google Flash Provider", testGoogleFlashProvider)
  await runTest("Batch Image Generator", testBatchImageGenerator)
  await runTest("Image Service Integration", testImageServiceIntegration)
  await runTest("Job Processor End-to-End", testJobProcessorEndToEnd)

  // Print summary
  console.log("\n" + "=".repeat(60))
  console.log("\n📊 Test Summary\n")

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  results.forEach((result) => {
    const icon = result.passed ? "✅" : "❌"
    const status = result.passed ? "PASSED" : "FAILED"
    console.log(`${icon} ${result.name}: ${status} (${result.duration}ms)`)
    if (result.error) {
      console.log(`   └─ ${result.error}`)
    }
  })

  console.log(`\nTotal: ${passed} passed, ${failed} failed`)
  console.log(`Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`)

  if (failed > 0) {
    console.log("\n❌ Some tests failed!")
    process.exit(1)
  } else {
    console.log("\n✅ All tests passed!")
    process.exit(0)
  }
}

// Run tests
main().catch((error) => {
  console.error("\n💥 Fatal error running tests:", error)
  process.exit(1)
})
