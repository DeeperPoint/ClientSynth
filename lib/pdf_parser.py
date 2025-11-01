"""
PDF Parser
Extracts text from PDF files with improved error handling
"""

import sys
import io
import os

def parse_pdf(file_path):
    """Extract text from PDF file"""
    # Validate file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF file not found: {file_path}")
    
    # Check file is not empty
    if os.path.getsize(file_path) == 0:
        raise ValueError("PDF file is empty")
    
    # Try multiple PDF parsing libraries
    text = ""
    
    # Try pypdf (preferred)
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        
        # Check if PDF is encrypted
        if reader.is_encrypted:
            # Try to decrypt with empty password (many PDFs use empty password)
            try:
                reader.decrypt("")
            except:
                raise ValueError("PDF is encrypted and cannot be decrypted")
        
        text = ""
        total_pages = len(reader.pages)
        
        for page_num, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n\n"
            except Exception as e:
                # Continue with other pages if one fails
                print(f"Warning: Failed to extract text from page {page_num + 1}: {str(e)}", file=sys.stderr)
                continue
        
        if not text.strip():
            raise ValueError("No text content found in PDF")
        
        return text.strip()
        
    except ImportError:
        # Fallback to pdfminer if pypdf not available
        try:
            from pdfminer.high_level import extract_text
            text = extract_text(file_path)
            if not text.strip():
                raise ValueError("No text content found in PDF")
            return text.strip()
        except ImportError:
            # Last resort: try PyPDF2
            try:
                import PyPDF2
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    if pdf_reader.is_encrypted:
                        pdf_reader.decrypt("")
                    text = ""
                    for page in pdf_reader.pages:
                        text += page.extract_text() + "\n\n"
                    if not text.strip():
                        raise ValueError("No text content found in PDF")
                    return text.strip()
            except ImportError:
                raise ImportError("No PDF parsing library available. Install: pip install pypdf pdfminer.six PyPDF2")
    except Exception as e:
        error_msg = str(e)
        # Provide more helpful error messages
        if "encrypted" in error_msg.lower():
            raise ValueError("PDF is encrypted and cannot be decrypted")
        elif "corrupted" in error_msg.lower() or "invalid" in error_msg.lower():
            raise ValueError("PDF file appears to be corrupted or invalid")
        else:
            raise Exception(f"Failed to parse PDF: {error_msg}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python pdf_parser.py <pdf_file_path>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    try:
        text = parse_pdf(file_path)
        # Ensure UTF-8 output (fixes Windows cp1252 UnicodeEncodeError)
        try:
            sys.stdout.reconfigure(encoding='utf-8')  # Python 3.7+
        except Exception:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        print(text)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)



