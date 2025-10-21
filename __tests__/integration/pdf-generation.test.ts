import { PDFGenerator } from '@/lib/pdf-generator'

describe('PDF Generation Integration', () => {
  let pdfGenerator: PDFGenerator

  beforeAll(() => {
    pdfGenerator = new PDFGenerator()
  })

  test('should create PDF template', async () => {
    const fields = [
      { name: 'name', label: 'Full Name' },
      { name: 'email', label: 'Email Address' },
      { name: 'company', label: 'Company Name' }
    ]

    const result = await pdfGenerator.createTemplate({
      title: 'Test PDF Template',
      fields,
      pageSize: 'A4',
      marginMm: 20
    })

    expect(result.success).toBe(true)
    expect(result.pdfBase64).toBeDefined()
    expect(typeof result.pdfBase64).toBe('string')
    expect(result.pdfBase64.length).toBeGreaterThan(0)
  })

  test('should fill PDF with data', async () => {
    // First create a template
    const templateResult = await pdfGenerator.createTemplate({
      title: 'Test Fill PDF',
      fields: [
        { name: 'name', label: 'Full Name' },
        { name: 'email', label: 'Email Address' }
      ]
    })

    expect(templateResult.success).toBe(true)
    expect(templateResult.pdfBase64).toBeDefined()

    // Then fill it with data
    const fillResult = await pdfGenerator.fillPDF({
      pdfBase64: templateResult.pdfBase64!,
      data: {
        name: 'John Doe',
        email: 'john.doe@example.com'
      }
    })

    expect(fillResult.success).toBe(true)
    expect(fillResult.pdfBase64).toBeDefined()
    expect(fillResult.pdfBase64).not.toBe(templateResult.pdfBase64)
  })

  test('should handle invalid PDF base64', async () => {
    const result = await pdfGenerator.fillPDF({
      pdfBase64: 'invalid-base64',
      data: { name: 'Test' }
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  test('should handle empty fields array', async () => {
    const result = await pdfGenerator.createTemplate({
      title: 'Empty Fields Test',
      fields: []
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('fields required')
  })
})

