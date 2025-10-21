import { NextRequest, NextResponse } from "next/server"
import { PDFGenerator } from "@/lib/pdf-generator"

export async function POST(req: NextRequest) {
  try {
    const { action, ...params } = await req.json()
    const pdfGen = new PDFGenerator()

    if (action === "template") {
      const { title, fields, pageSize, marginMm } = params
      const result = await pdfGen.createTemplate({
        title,
        fields,
        pageSize: pageSize || "A4",
        marginMm: marginMm || 20
      })
      return NextResponse.json(result)
    } else if (action === "fill") {
      const { pdfBase64, data } = params
      const result = await pdfGen.fillPDF({ pdfBase64, data })
      return NextResponse.json(result)
    } else {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("[PDF API] Error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

