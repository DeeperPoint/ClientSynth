#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { PDFGenerator, type PDFTemplateConfig, type PDFTemplateGenerateOptions } from '../lib/pdf-generator.js'
import { query } from '../lib/postgres/client.js'

const PDF_GENERATOR = new PDFGenerator()

interface GeneratePDFFromTemplateArgs {
  templateName: string
  tenantId: string
  data: Record<string, any>
  version?: number
  pageSize?: 'A4' | 'LETTER'
  marginMm?: number
}

async function trackTemplateUsage(
  templateId: string,
  tenantId: string,
  status: 'success' | 'failure',
  errorMessage?: string,
  generationTimeMs?: number,
  outputSizeBytes?: number
): Promise<void> {
  try {
    await query(
      `INSERT INTO pdf_template_usage 
       (template_id, tenant_id, status, error_message, generation_time_ms, output_size_bytes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [templateId, tenantId, status, errorMessage || null, generationTimeMs || null, outputSizeBytes || null]
    )
  } catch (error) {
    console.error('[MCP] Failed to track template usage:', error)
    // Don't throw - telemetry failures shouldn't break the main operation
  }
}

async function getTemplate(
  tenantId: string,
  templateName: string,
  version?: number
): Promise<{
  id: string
  template_config: PDFTemplateConfig
  version: number
} | null> {
  if (version) {
    const result = await query(
      `SELECT id, template_config, version 
       FROM pdf_templates 
       WHERE tenant_id = $1 AND name = $2 AND version = $3 AND is_active = true`,
      [tenantId, templateName, version]
    )
    if (result.rows.length > 0) {
      return {
        id: result.rows[0].id,
        template_config: result.rows[0].template_config as PDFTemplateConfig,
        version: result.rows[0].version,
      }
    }
  } else {
    // Get latest version
    const result = await query(
      `SELECT id, template_config, version 
       FROM pdf_templates 
       WHERE tenant_id = $1 AND name = $2 AND is_active = true 
       ORDER BY version DESC 
       LIMIT 1`,
      [tenantId, templateName]
    )
    if (result.rows.length > 0) {
      return {
        id: result.rows[0].id,
        template_config: result.rows[0].template_config as PDFTemplateConfig,
        version: result.rows[0].version,
      }
    }
  }
  return null
}

async function generatePDFFromTemplate(args: GeneratePDFFromTemplateArgs): Promise<{
  success: boolean
  pdfBase64?: string
  templateId?: string
  templateVersion?: number
  error?: string
  generationTimeMs?: number
  outputSizeBytes?: number
}> {
  const startTime = Date.now()

  try {
    // Validate inputs
    if (!args.templateName || !args.tenantId || !args.data) {
      return {
        success: false,
        error: 'Missing required fields: templateName, tenantId, and data are required',
      }
    }

    // Get template from database
    const template = await getTemplate(args.tenantId, args.templateName, args.version)
    if (!template) {
      return {
        success: false,
        error: `Template "${args.templateName}" not found${args.version ? ` (version ${args.version})` : ''}`,
      }
    }

    // Prepare generation options
    const generateOptions: PDFTemplateGenerateOptions = {
      templateConfig: template.template_config,
      data: args.data,
      pageSize: args.pageSize || template.template_config.pageSize || 'A4',
      marginMm: args.marginMm || template.template_config.marginMm || 20,
    }

    // Generate PDF
    const result = await PDF_GENERATOR.generateFromTemplate(generateOptions)

    const generationTimeMs = Date.now() - startTime
    const outputSizeBytes = result.pdfBase64 ? Buffer.from(result.pdfBase64, 'base64').length : undefined

    // Track usage (async, don't await)
    trackTemplateUsage(
      template.id,
      args.tenantId,
      result.success ? 'success' : 'failure',
      result.error,
      generationTimeMs,
      outputSizeBytes
    ).catch(() => {})

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'PDF generation failed',
        templateId: template.id,
        templateVersion: template.version,
        generationTimeMs,
      }
    }

    return {
      success: true,
      pdfBase64: result.pdfBase64,
      templateId: template.id,
      templateVersion: template.version,
      generationTimeMs,
      outputSizeBytes,
    }
  } catch (error) {
    const generationTimeMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Try to track failure (async, don't await)
    if (args.templateName && args.tenantId) {
      const template = await getTemplate(args.tenantId, args.templateName, args.version).catch(() => null)
      if (template) {
        trackTemplateUsage(
          template.id,
          args.tenantId,
          'failure',
          errorMessage,
          generationTimeMs
        ).catch(() => {})
      }
    }

    return {
      success: false,
      error: errorMessage,
      generationTimeMs,
    }
  }
}

class PDFTemplateMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'pdf-template-generator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupToolHandlers()
    this.setupErrorHandling()
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_pdf_from_template',
          description:
            'Generate a PDF document from a versioned template with placeholders, dynamic tables, and preserved layout (fonts, margins, pagination). Supports template versioning and tracks usage telemetry.',
          inputSchema: {
            type: 'object',
            properties: {
              templateName: {
                type: 'string',
                description: 'Name of the template to use',
              },
              tenantId: {
                type: 'string',
                description: 'Tenant ID for template lookup',
              },
              data: {
                type: 'object',
                description: 'Data object containing values for template placeholders (e.g., {{key}})',
                additionalProperties: true,
              },
              version: {
                type: 'number',
                description: 'Optional template version (defaults to latest)',
              },
              pageSize: {
                type: 'string',
                enum: ['A4', 'LETTER'],
                description: 'Page size (defaults to template setting)',
              },
              marginMm: {
                type: 'number',
                description: 'Margin in millimeters (defaults to template setting)',
              },
            },
            required: ['templateName', 'tenantId', 'data'],
          },
        },
      ],
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      if (name === 'generate_pdf_from_template') {
        const result = await generatePDFFromTemplate(args as GeneratePDFFromTemplateArgs)

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: result.error,
                    templateId: result.templateId,
                    templateVersion: result.templateVersion,
                    generationTimeMs: result.generationTimeMs,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  templateId: result.templateId,
                  templateVersion: result.templateVersion,
                  generationTimeMs: result.generationTimeMs,
                  outputSizeBytes: result.outputSizeBytes,
                  pdfBase64: result.pdfBase64,
                },
                null,
                2
              ),
            },
          ],
        }
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
    })
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Server] Error:', error)
    }

    process.on('SIGINT', async () => {
      await this.server.close()
      process.exit(0)
    })
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('[MCP Server] PDF Template Generator MCP server running on stdio')
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PDFTemplateMCPServer()
  server.run().catch((error) => {
    console.error('[MCP Server] Fatal error:', error)
    process.exit(1)
  })
}

export { PDFTemplateMCPServer }




