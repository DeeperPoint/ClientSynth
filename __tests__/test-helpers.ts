/**
 * Shared test utilities for API route handler tests.
 *
 * All route handlers accept a NextRequest and return a NextResponse.
 * These helpers make it easy to build mock requests and assert responses.
 */
import { NextRequest } from "next/server"

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"
const TEST_TENANT_ID = "660e8400-e29b-41d4-a716-446655440000"
const TEST_SCHEMA_ID = "770e8400-e29b-41d4-a716-446655440000"
const TEST_JOB_ID = "880e8400-e29b-41d4-a716-446655440000"
const TEST_EXPORT_ID = "aa0e8400-e29b-41d4-a716-446655440000"

export const TEST_IDS = {
  USER: TEST_USER_ID,
  TENANT: TEST_TENANT_ID,
  SCHEMA: TEST_SCHEMA_ID,
  JOB: TEST_JOB_ID,
  EXPORT: TEST_EXPORT_ID,
}

export function mockUser(overrides: Record<string, any> = {}) {
  return {
    id: TEST_USER_ID,
    email: "test@example.com",
    full_name: "Test User",
    avatar_url: null,
    created_at: "2025-10-26T12:00:00.000Z",
    updated_at: "2025-10-26T12:00:00.000Z",
    ...overrides,
  }
}

export function mockTenant(overrides: Record<string, any> = {}) {
  return {
    id: TEST_TENANT_ID,
    name: "Test Org",
    slug: "test-org",
    created_at: "2025-10-26T12:00:00.000Z",
    updated_at: "2025-10-26T12:00:00.000Z",
    ...overrides,
  }
}

/**
 * Build a pg-compatible QueryResult.
 */
export function mockQueryResult(rows: any[] = []) {
  return {
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: 0,
    fields: [],
  }
}

// ---------------------------------------------------------------------------
// NextRequest builder
// ---------------------------------------------------------------------------

/**
 * Create a NextRequest suitable for passing to a Next.js route handler.
 */
export function createNextRequest(
  method: string,
  url = "http://localhost:3000/api/test",
  options: {
    body?: any
    headers?: Record<string, string>
    formData?: FormData
  } = {}
): NextRequest {
  const { body, headers = {}, formData } = options

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  }

  if (body !== undefined && method !== "GET") {
    init.body = JSON.stringify(body)
  }

  if (formData) {
    // Remove Content-Type so fetch sets the boundary automatically
    delete (init.headers as Record<string, string>)["Content-Type"]
    init.body = formData as any
  }

  return new NextRequest(url, init)
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Parse a NextResponse body as JSON.
 */
export async function parseResponse(response: Response) {
  const body = await response.json()
  return { status: response.status, body }
}
