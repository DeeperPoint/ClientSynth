import base64
import io
from typing import Any, Dict, List, Optional
import json

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject, BooleanObject, DictionaryObject       
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.lib.units import mm, inch
    from reportlab.pdfgen import canvas
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
except ImportError as e:
    raise ImportError(f"Missing dependencies: {e}")

def pdf_fill(pdf_base64: str, data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        raw = base64.b64decode(pdf_base64)
        r = PdfReader(io.BytesIO(raw))
        w = PdfWriter()
        for p in r.pages:
            w.add_page(p)
        
        try:
            root = r.trailer["/Root"]
            acro = root.get("/AcroForm")
            if acro is not None:
                w._root_object.update({NameObject("/AcroForm"): acro})
        except Exception:
            pass
        
        if data:
            fields_map = {str(k): str(v) for k, v in data.items()}
            for page in w.pages:
                w.update_page_form_field_values(page, fields_map)
        
        try:
            root = w._root_object
            if "/AcroForm" in root:
                af = root["/AcroForm"]
                af.update({NameObject("/NeedAppearances"): BooleanObject(True)})
            else:
                root.update({NameObject("/AcroForm"): DictionaryObject({NameObject("/NeedAppearances"): BooleanObject(True)})})
        except Exception:
            pass
        
        out = io.BytesIO()
        w.write(out)
        return {"success": True, "pdf_base64": base64.b64encode(out.getvalue()).decode("ascii")}
    except Exception as e:
        return {"success": False, "error": str(e)}

def pdf_content_create(title: str, content: str, page_size: str = "A4", margin_mm: int = 20) -> Dict[str, Any]:
    """Create a PDF with actual text content (not form fields)"""
    try:
        if not title.strip():
            return {"success": False, "error": "title required"}
        if not content:
            return {"success": False, "error": "content required"}
        if page_size not in {"A4", "LETTER"}:
            return {"success": False, "error": "bad page_size"}

        ps = A4 if page_size == "A4" else LETTER
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=ps)
        pw, ph = ps
        m = float(margin_mm) * mm

        c.setTitle(title.strip())
        
        # Draw title
        c.setFont("Helvetica-Bold", 16)
        c.drawString(m, ph - m, title.strip())
        
        # Draw content
        y = ph - m - 15 * mm
        c.setFont("Helvetica", 10)
        
        # Split content into lines and handle wrapping
        lines = content.split('\n')
        line_height = 4 * mm
        max_width = pw - 2 * m
        
        for line in lines:
            # Handle empty lines
            if not line.strip():
                y -= line_height
                if y < m:
                    c.showPage()
                    c.setFont("Helvetica", 10)
                    y = ph - m
                continue
            
            # Check if line starts with special markers for formatting
            if line.strip().startswith('**') and line.strip().endswith('**'):
                # Bold section header
                c.setFont("Helvetica-Bold", 12)
                text = line.strip().replace('**', '')
                c.drawString(m, y, text)
                c.setFont("Helvetica", 10)
                y -= line_height * 1.5
            elif line.strip().startswith('- '):
                # Bullet point
                c.drawString(m + 5*mm, y, '•')
                c.drawString(m + 10*mm, y, line.strip()[2:])
                y -= line_height
            else:
                # Regular text - wrap if needed
                words = line.split()
                current_line = ""
                for word in words:
                    test_line = current_line + " " + word if current_line else word
                    if c.stringWidth(test_line, "Helvetica", 10) < max_width:
                        current_line = test_line
                    else:
                        if current_line:
                            c.drawString(m, y, current_line)
                            y -= line_height
                            if y < m:
                                c.showPage()
                                c.setFont("Helvetica", 10)
                                y = ph - m
                        current_line = word
                
                if current_line:
                    c.drawString(m, y, current_line)
                    y -= line_height
            
            # Check if we need a new page
            if y < m:
                c.showPage()
                c.setFont("Helvetica", 10)
                y = ph - m

        c.save()

        pdf_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {
            "success": True,
            "title": title.strip(),
            "page_size": page_size,
            "pdf_base64": pdf_b64,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def pdf_template_create(title: str, fields: List[Dict[str, Any]], page_size: str = "A4", margin_mm: int = 20) -> Dict[str, Any]:
    try:
        if not title.strip():
            return {"success": False, "error": "title required"}
        if not fields:
            return {"success": False, "error": "fields required"}
        if page_size not in {"A4", "LETTER"}:
            return {"success": False, "error": "bad page_size"}

        ps = A4 if page_size == "A4" else LETTER
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=ps)
        pw, ph = ps
        m = float(margin_mm) * mm

        c.setTitle(title.strip())
        c.setFont("Helvetica-Bold", 16)
        c.drawString(m, ph - m, title.strip())

        y = ph - m - 15 * mm
        c.setFont("Helvetica", 11)

        n = min(len(fields), 100)
        fh = 8 * mm
        gap = 6 * mm
        tfw = pw - 2 * m

        for i in range(n):
            f = fields[i]
            if not isinstance(f, dict):
                return {"success": False, "error": "bad field"}
            name = str(f.get("name", "")).strip()
            if not name:
                return {"success": False, "error": "field name required"}
            label = str(f.get("label", name)).strip()
            c.drawString(m, y + fh + 2, label)
            c.acroForm.textfield(
                name=name,
                x=m,
                y=y,
                width=tfw,
                height=fh,
                borderStyle="underlined",
            )
            y -= (fh + gap)
            if y < m + fh + gap:
                c.showPage()
                c.setFont("Helvetica", 11)
                y = ph - m

        c.showPage()
        c.save()

        pdf_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {
            "success": True,
            "title": title.strip(),
            "page_size": page_size,
            "field_count": n,
            "pdf_base64": pdf_b64,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def pdf_template_generate(
    template_config: Dict[str, Any],
    data: Dict[str, Any],
    page_size: str = "A4",
    margin_mm: int = 20
) -> Dict[str, Any]:
    """
    Generate PDF from template configuration with full layout preservation.
    Supports placeholders, dynamic tables, page breaks, fonts, and margins.
    
    template_config structure:
    {
        "title": "Document Title",
        "pageSize": "A4" | "LETTER",
        "marginMm": 20,
        "fonts": {
            "default": "Helvetica",
            "defaultSize": 11,
            "title": {"family": "Helvetica-Bold", "size": 16},
            "header": {"family": "Helvetica-Bold", "size": 12}
        },
        "sections": [
            {
                "type": "title",
                "content": "{{title}}"  // Supports placeholders
            },
            {
                "type": "text",
                "content": "{{description}}",
                "font": {"family": "Helvetica", "size": 11}
            },
            {
                "type": "table",
                "headers": ["Column 1", "Column 2"],
                "rows": "{{table_data}}",  // Placeholder for dynamic data
                "style": {
                    "headerBackground": "#CCCCCC",
                    "alternateRows": True,
                    "columnWidths": [0.5, 0.5]
                },
                "pageBreakBefore": False,
                "pageBreakAfter": False
            },
            {
                "type": "pageBreak"
            }
        ]
    }
    """
    try:
        if not template_config:
            return {"success": False, "error": "template_config required"}
        if page_size not in {"A4", "LETTER"}:
            return {"success": False, "error": "bad page_size"}

        ps = A4 if page_size == "A4" else LETTER
        m = float(margin_mm) * mm
        
        # Create buffer and document
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=ps,
            rightMargin=m,
            leftMargin=m,
            topMargin=m,
            bottomMargin=m
        )
        
        # Get styles
        styles = getSampleStyleSheet()
        
        # Extract font configuration
        font_config = template_config.get("fonts", {})
        default_font = font_config.get("default", "Helvetica")
        default_size = font_config.get("defaultSize", 11)
        title_font = font_config.get("title", {"family": "Helvetica-Bold", "size": 16})
        header_font = font_config.get("header", {"family": "Helvetica-Bold", "size": 12})
        
        # Create custom styles
        custom_styles = {
            "title": ParagraphStyle(
                "CustomTitle",
                parent=styles["Heading1"],
                fontName=title_font.get("family", "Helvetica-Bold"),
                fontSize=title_font.get("size", 16),
                spaceAfter=12,
                alignment=TA_LEFT
            ),
            "header": ParagraphStyle(
                "CustomHeader",
                parent=styles["Heading2"],
                fontName=header_font.get("family", "Helvetica-Bold"),
                fontSize=header_font.get("size", 12),
                spaceAfter=8,
                alignment=TA_LEFT
            ),
            "normal": ParagraphStyle(
                "CustomNormal",
                parent=styles["Normal"],
                fontName=default_font,
                fontSize=default_size,
                spaceAfter=6,
                alignment=TA_LEFT
            )
        }
        
        # Build story (content elements)
        story = []
        sections = template_config.get("sections", [])
        
        for section in sections:
            section_type = section.get("type")
            
            if section_type == "title":
                # Title section
                content = _replace_placeholders(section.get("content", ""), data)
                if content:
                    story.append(Paragraph(content, custom_styles["title"]))
                    story.append(Spacer(1, 6*mm))
                    
            elif section_type == "text":
                # Text section
                content = _replace_placeholders(section.get("content", ""), data)
                if content:
                    section_font = section.get("font", {})
                    text_style = ParagraphStyle(
                        "SectionText",
                        parent=custom_styles["normal"],
                        fontName=section_font.get("family", default_font),
                        fontSize=section_font.get("size", default_size),
                        spaceAfter=section.get("spaceAfter", 6)
                    )
                    story.append(Paragraph(content.replace("\n", "<br/>"), text_style))
                    
            elif section_type == "table":
                # Dynamic table section
                if section.get("pageBreakBefore", False):
                    story.append(PageBreak())
                
                headers = section.get("headers", [])
                rows_data = section.get("rows")
                
                # Handle placeholder for rows data
                if isinstance(rows_data, str) and rows_data.startswith("{{") and rows_data.endswith("}}"):
                    placeholder = rows_data[2:-2].strip()
                    rows_data = data.get(placeholder, [])
                
                if not isinstance(rows_data, list):
                    rows_data = []
                
                # Build table data
                table_data = [headers] if headers else []
                for row in rows_data:
                    if isinstance(row, dict):
                        # Convert dict to list based on headers
                        table_data.append([str(row.get(h, "")) for h in headers])
                    elif isinstance(row, list):
                        table_data.append([str(cell) for cell in row])
                
                if table_data:
                    # Create table
                    table_style_config = section.get("style", {})
                    col_widths = table_style_config.get("columnWidths")
                    if col_widths and len(col_widths) == len(headers):
                        # Convert to actual widths
                        available_width = ps[0] - 2 * m
                        col_widths = [w * available_width for w in col_widths]
                    
                    table = Table(table_data, colWidths=col_widths)
                    
                    # Apply table style
                    table_style = [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(table_style_config.get("headerBackground", "#CCCCCC"))),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("FONTNAME", (0, 0), (-1, 0), header_font.get("family", "Helvetica-Bold")),
                        ("FONTSIZE", (0, 0), (-1, 0), header_font.get("size", 12)),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                        ("TOPPADDING", (0, 0), (-1, 0), 12),
                        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                        ("FONTNAME", (0, 1), (-1, -1), default_font),
                        ("FONTSIZE", (0, 1), (-1, -1), default_size),
                        ("GRID", (0, 0), (-1, -1), 1, colors.grey),
                    ]
                    
                    # Add alternate row colors if enabled
                    if table_style_config.get("alternateRows", False):
                        for i in range(1, len(table_data)):
                            if i % 2 == 0:
                                table_style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F5F5F5")))
                    
                    table.setStyle(TableStyle(table_style))
                    story.append(table)
                    story.append(Spacer(1, 6*mm))
                
                if section.get("pageBreakAfter", False):
                    story.append(PageBreak())
                    
            elif section_type == "pageBreak":
                # Explicit page break
                story.append(PageBreak())
                
            elif section_type == "spacer":
                # Spacer
                height_mm = section.get("heightMm", 6)
                story.append(Spacer(1, height_mm * mm))
        
        # Build PDF
        doc.build(story)
        
        pdf_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return {
            "success": True,
            "pdf_base64": pdf_b64,
            "page_size": page_size,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _replace_placeholders(text: str, data: Dict[str, Any]) -> str:
    """Replace placeholders like {{key}} with values from data dict."""
    if not isinstance(text, str):
        return str(text)
    
    result = text
    import re
    pattern = r'\{\{(\w+)\}\}'
    
    def replace_func(match):
        key = match.group(1)
        value = data.get(key, "")
        return str(value) if value is not None else ""
    
    result = re.sub(pattern, replace_func, result)
    return result


if __name__ == "__main__":
    import sys
    import json
    import os
    
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing command"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "generate":
        # New template-based generation command
        if len(sys.argv) < 6:
            print(json.dumps({"success": False, "error": "Missing generate arguments"}))
            sys.exit(1)
        
        template_file = sys.argv[2]
        data_file = sys.argv[3]
        page_size = sys.argv[4]
        margin_mm = int(sys.argv[5])
        
        try:
            with open(template_file, 'r') as f:
                template_config = json.load(f)
            with open(data_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read files: {e}"}))
            sys.exit(1)
        
        result = pdf_template_generate(template_config, data, page_size, margin_mm)
        print(json.dumps(result))
        
    elif command == "content":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "error": "Missing content arguments"}))
            sys.exit(1)
        
        title = sys.argv[2]
        content = sys.argv[3]
        page_size = sys.argv[4]
        margin_mm = int(sys.argv[5]) if len(sys.argv) > 5 else 20
        
        result = pdf_content_create(title, content, page_size, margin_mm)
        print(json.dumps(result))
        
    elif command == "template":
        if len(sys.argv) < 6:
            print(json.dumps({"success": False, "error": "Missing template arguments"}))
            sys.exit(1)
        
        title = sys.argv[2]
        fields_file = sys.argv[3]
        page_size = sys.argv[4]
        margin_mm = int(sys.argv[5])
        
        try:
            with open(fields_file, 'r') as f:
                fields = json.load(f)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read fields file: {e}"}))
            sys.exit(1)
        
        result = pdf_template_create(title, fields, page_size, margin_mm)       
        print(json.dumps(result))
        
    elif command == "fill":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Missing fill arguments"}))
            sys.exit(1)

        pdf_base64 = sys.argv[2]
        data_file = sys.argv[3]
        
        try:
            with open(data_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read data file: {e}"}))
            sys.exit(1)

        result = pdf_fill(pdf_base64, data)
        print(json.dumps(result))
        
    elif command == "generate":
        # Template-based generation command
        if len(sys.argv) < 6:
            print(json.dumps({"success": False, "error": "Missing generate arguments"}))
            sys.exit(1)
        
        template_file = sys.argv[2]
        data_file = sys.argv[3]
        page_size = sys.argv[4]
        margin_mm = int(sys.argv[5])
        
        try:
            with open(template_file, 'r') as f:
                template_config = json.load(f)
            with open(data_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Failed to read files: {e}"}))
            sys.exit(1)
        
        result = pdf_template_generate(template_config, data, page_size, margin_mm)
        print(json.dumps(result))

    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)

