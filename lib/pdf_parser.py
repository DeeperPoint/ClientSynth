"""
PDF Parser
Extracts text from PDF files
"""

import sys

try:
    from pypdf import PdfReader
except ImportError:
    print("Error: pypdf not installed. Run: pip install pypdf", file=sys.stderr)
    sys.exit(1)

def parse_pdf(file_path):
    """Extract text from PDF file"""
    try:
        reader = PdfReader(file_path)
        text = ""
        
        for page in reader.pages:
            text += page.extract_text() + "\n\n"
        
        return text.strip()
    except Exception as e:
        print(f"Error parsing PDF: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pdf_parser.py <pdf_file_path>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    text = parse_pdf(file_path)
    print(text)


