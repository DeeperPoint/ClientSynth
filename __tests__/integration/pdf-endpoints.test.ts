/**
 * @jest-environment node
 */
/**
 * PDF endpoint tests
 * Tests: POST /api/pdf/generate
 */

const mockCreateTemplate = jest.fn()
const mockFillPDF = jest.fn()

jest.mock("@/lib/pdf-generator", () => ({
  PDFGenerator: jest.fn().mockImplementation(() => ({
    createTemplate: mockCreateTemplate,
    fillPDF: mockFillPDF,
  })),
}))

import { POST as pdfGenerateRoute } from "@/app/api/pdf/generate/route"
import { createNextRequest, parseResponse } from "../test-helpers"

describe("POST /api/pdf/generate", () => {
  beforeEach(() => jest.clearAllMocks())

  it("should create a PDF template", async () => {
    mockCreateTemplate.mockResolvedValueOnce({
      success: true,
      pdfBase64: "base64-encoded-pdf",
      pageCount: 1,
    })

    const req = createNextRequest("POST", "http://localhost:3000/api/pdf/generate", {
      body: {
        action: "template",
        title: "Test Template",
        fields: [{ name: "full_name", label: "Full Name" }],
        pageSize: "A4",
        marginMm: 20,
      },
    })

    const res = await pdfGenerateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.pdfBase64).toBeDefined()
  })

  it("should fill a PDF with data", async () => {
    mockFillPDF.mockResolvedValueOnce({
      success: true,
      pdfBase64: "filled-pdf-base64",
    })

    const req = createNextRequest("POST", "http://localhost:3000/api/pdf/generate", {
      body: {
        action: "fill",
        pdfBase64: "template-base64",
        data: { full_name: "John Smith" },
      },
    })

    const res = await pdfGenerateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it("should return 400 for invalid action", async () => {
    const req = createNextRequest("POST", "http://localhost:3000/api/pdf/generate", {
      body: { action: "invalid" },
    })

    const res = await pdfGenerateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(400)
    expect(body.error).toContain("Invalid action")
  })

  it("should return 500 when template creation fails", async () => {
    mockCreateTemplate.mockRejectedValueOnce(new Error("Template creation failed"))

    const req = createNextRequest("POST", "http://localhost:3000/api/pdf/generate", {
      body: {
        action: "template",
        title: "Test",
        fields: [],
      },
    })

    const res = await pdfGenerateRoute(req)
    const { status, body } = await parseResponse(res)

    expect(status).toBe(500)
    expect(body.success).toBe(false)
  })

  it("should return 500 when PDF fill fails", async () => {
    mockFillPDF.mockRejectedValueOnce(new Error("Fill failed"))

    const req = createNextRequest("POST", "http://localhost:3000/api/pdf/generate", {
      body: {
        action: "fill",
        pdfBase64: "template",
        data: {},
      },
    })

    const res = await pdfGenerateRoute(req)
    const { status } = await parseResponse(res)

    expect(status).toBe(500)
  })
})
