/**
 * @jest-environment node
 */
/**
 * Auth endpoint tests
 * Tests: POST /api/auth/register, POST /api/auth/login,
 *        GET /api/auth/me, POST /api/auth/logout
 */

// ---- Mocks must be declared before imports ----

const mockQuery = jest.fn()
const mockGetCurrentUser = jest.fn()

jest.mock("@/lib/postgres/client", () => ({
  query: (...args: any[]) => mockQuery(...args),
  getCurrentUser: () => mockGetCurrentUser(),
  getPool: jest.fn(),
  getClient: jest.fn(),
}))

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$hashedpassword"),
  compare: jest.fn(),
}))

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mock-jwt-token"),
  verify: jest.fn(),
}))

import { POST as registerRoute } from "@/app/api/auth/register/route"
import { POST as loginRoute } from "@/app/api/auth/login/route"
import { GET as meRoute } from "@/app/api/auth/me/route"
import { POST as logoutRoute } from "@/app/api/auth/logout/route"
import { createNextRequest, parseResponse, mockUser, mockQueryResult, TEST_IDS } from "../test-helpers"
import bcrypt from "bcryptjs"

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should register a new user successfully", async () => {
    // No existing user
    mockQuery
      .mockResolvedValueOnce(mockQueryResult([]))              // check existing
      .mockResolvedValueOnce(mockQueryResult([{ user_id: TEST_IDS.USER }])) // create_user

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/register", {
      body: { email: "new@example.com", password: "SecurePass123!", full_name: "New User" },
    })

    const res = await registerRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.user.email).toBe("new@example.com")
    expect(body.user.id).toBe(TEST_IDS.USER)
  })

  it("should return 400 when email is missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/auth/register", {
      body: { password: "SecurePass123!" },
    })

    const res = await registerRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toBeDefined()
  })

  it("should return 400 when password is missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/auth/register", {
      body: { email: "test@example.com" },
    })

    const res = await registerRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toBeDefined()
  })

  it("should return 400 for invalid JSON body", async () => {
    const req = new (require("next/server").NextRequest)(
      "http://localhost:3000/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{{",
      }
    )

    const res = await registerRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Invalid JSON")
  })

  it("should return 409 when email already exists", async () => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([{ id: "existing-id" }]))

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/register", {
      body: { email: "existing@example.com", password: "SecurePass123!", full_name: "Existing" },
    })

    const res = await registerRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(409)
    expect(body.error).toContain("already exists")
  })

  it("should return 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB connection failed"))

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/register", {
      body: { email: "test@example.com", password: "Pass123!", full_name: "Test" },
    })

    const res = await registerRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should login successfully with valid credentials", async () => {
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([{
        id: TEST_IDS.USER,
        email: "test@example.com",
        password_hash: "$2a$12$hashedpassword",
        full_name: "Test User",
        avatar_url: null,
      }])
    )
    ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(true)

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/login", {
      body: { email: "test@example.com", password: "SecurePass123!" },
    })

    const res = await loginRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.user.email).toBe("test@example.com")
  })

  it("should return 400 when email is missing", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/auth/login", {
      body: { password: "SecurePass123!" },
    })

    const res = await loginRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(400)
  })

  it("should return 401 for non-existent user", async () => {
    mockQuery.mockResolvedValueOnce(mockQueryResult([]))

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/login", {
      body: { email: "nobody@example.com", password: "Pass123!" },
    })

    const res = await loginRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(401)
    expect(body.error).toContain("Invalid credentials")
  })

  it("should return 401 for wrong password", async () => {
    mockQuery.mockResolvedValueOnce(
      mockQueryResult([{
        id: TEST_IDS.USER,
        email: "test@example.com",
        password_hash: "$2a$12$hashedpassword",
        full_name: "Test User",
        avatar_url: null,
      }])
    )
    ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/login", {
      body: { email: "test@example.com", password: "WrongPassword!" },
    })

    const res = await loginRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(401)
    expect(body.error).toContain("Invalid credentials")
  })

  it("should return 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB error"))

    const req = createNextRequest("POST", "http://localhost:3000/api/auth/login", {
      body: { email: "test@example.com", password: "Pass123!" },
    })

    const res = await loginRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

describe("GET /api/auth/me", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should return authenticated user data", async () => {
    const user = mockUser()
    mockGetCurrentUser.mockResolvedValueOnce(user)

    const req = createNextRequest("GET", "http://localhost:3000/api/auth/me")
    const res = await meRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.data.user).toEqual(user)
    expect(body.error).toBeNull()
  })

  it("should return null user when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const req = createNextRequest("GET", "http://localhost:3000/api/auth/me")
    const res = await meRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.data.user).toBeNull()
  })

  it("should return 500 on error", async () => {
    mockGetCurrentUser.mockRejectedValueOnce(new Error("Token error"))

    const req = createNextRequest("GET", "http://localhost:3000/api/auth/me")
    const res = await meRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.error).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("should clear auth cookie and return success", async () => {
    const res = await logoutRoute()
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)

    // Verify cookie is cleared (maxAge=0 or expires in the past)
    const setCookie = res.headers.get("set-cookie")
    expect(setCookie).toContain("auth-token=")
    expect(setCookie).toContain("Max-Age=0")
  })
})
