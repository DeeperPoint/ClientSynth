import base64
import io
from typing import Any, Dict, List

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject, BooleanObject, DictionaryObject
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
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

if __name__ == "__main__":
    import sys
    import json
    import os
    
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing command"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "content":
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
        
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)

