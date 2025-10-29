"""
DOCX Parser
Extracts text from DOCX files
"""

import sys

try:
    from docx import Document
except ImportError:
    print("Error: python-docx not installed. Run: pip install python-docx", file=sys.stderr)
    sys.exit(1)

def parse_docx(file_path):
    """Extract text from DOCX file"""
    try:
        doc = Document(file_path)
        text = ""
        
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text += cell.text + "\t"
                text += "\n"
        
        return text.strip()
    except Exception as e:
        print(f"Error parsing DOCX: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python docx_parser.py <docx_file_path>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    text = parse_docx(file_path)
    print(text)


