"""
DOCX Parser
Extracts text from DOCX files with improved error handling
"""

import sys
import io
import zipfile
import xml.etree.ElementTree as ET
import os

def parse_docx(file_path):
    """Extract text from DOCX file"""
    # Validate file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"DOCX file not found: {file_path}")
    
    # Check file is not empty
    if os.path.getsize(file_path) == 0:
        raise ValueError("DOCX file is empty")
    
    text_chunks = []
    
    try:
        # Try python-docx first (preferred method)
        try:
            from docx import Document
            doc = Document(file_path)
            
            # Extract paragraphs
            for paragraph in doc.paragraphs:
                para_text = paragraph.text.strip()
                if para_text:
                    text_chunks.append(para_text)
            
            # Extract tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = []
                    for cell in row.cells:
                        cell_text = cell.text.strip()
                        if cell_text:
                            row_text.append(cell_text)
                    if row_text:
                        text_chunks.append('\t'.join(row_text))
            
            result = "\n".join(text_chunks).strip()
            if not result:
                raise ValueError("No text content found in DOCX")
            return result
            
        except ImportError:
            # Fallback to zipfile-based extraction
            pass
        except Exception as e:
            # If python-docx fails, try fallback
            if "python-docx" in str(e) or "docx" not in str(e).lower():
                raise
            # Otherwise try fallback method
            
        # Fallback: unzip DOCX (it's a ZIP) and read word/document.xml
        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                # Verify it's a valid ZIP
                if z.testzip() is not None:
                    raise ValueError("DOCX file is corrupted or not a valid ZIP archive")
                
                # Main document body
                if 'word/document.xml' not in z.namelist():
                    raise ValueError("DOCX file structure is invalid: missing word/document.xml")
                
                xml_bytes = z.read('word/document.xml')
                root = ET.fromstring(xml_bytes)
                
                # Namespaces commonly used in DOCX
                ns = {
                    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
                }
                
                # Extract text from paragraphs
                for para_node in root.findall('.//w:p', ns):
                    para_text_parts = []
                    for text_node in para_node.findall('.//w:t', ns):
                        if text_node.text:
                            para_text_parts.append(text_node.text)
                    
                    if para_text_parts:
                        para_text = ''.join(para_text_parts).strip()
                        if para_text:
                            text_chunks.append(para_text)
                
                # Extract text from tables
                for tbl_node in root.findall('.//w:tbl', ns):
                    for row_node in tbl_node.findall('.//w:tr', ns):
                        row_text_parts = []
                        for cell_node in row_node.findall('.//w:tc', ns):
                            cell_text_parts = []
                            for text_node in cell_node.findall('.//w:t', ns):
                                if text_node.text:
                                    cell_text_parts.append(text_node.text)
                            cell_text = ''.join(cell_text_parts).strip()
                            if cell_text:
                                row_text_parts.append(cell_text)
                        if row_text_parts:
                            text_chunks.append('\t'.join(row_text_parts))
            
            result = "\n".join(text_chunks).strip()
            if not result:
                raise ValueError("No text content found in DOCX")
            return result
            
        except zipfile.BadZipFile:
            raise ValueError("File is not a valid DOCX/ZIP archive")
        except ET.ParseError as e:
            raise ValueError(f"Failed to parse DOCX XML: {str(e)}")
        
    except FileNotFoundError:
        raise
    except ValueError:
        raise
    except Exception as e:
        error_msg = str(e)
        if "corrupted" in error_msg.lower() or "invalid" in error_msg.lower():
            raise ValueError(f"DOCX file appears to be corrupted: {error_msg}")
        else:
            raise Exception(f"Failed to parse DOCX: {error_msg}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python docx_parser.py <docx_file_path>", file=sys.stderr)
        sys.exit(1)
    
    file_path = sys.argv[1]
    try:
        text = parse_docx(file_path)
        # Ensure UTF-8 output
        try:
            sys.stdout.reconfigure(encoding='utf-8')  # Python 3.7+
        except Exception:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        print(text)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)



