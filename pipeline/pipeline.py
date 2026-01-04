import os
import sys
import sqlite3
import shutil
import json
import subprocess
import multiprocessing
import pytesseract
import img2pdf
import boto3
from pdf2image import convert_from_path
from tqdm import tqdm

# --- CONFIGURATION ---
# Default to current directory if not specified, but user should configure this.
# For now, we use a placeholder or the current working directory as root for scanning.
# WARNING: Recursive scanning of root C:\ might be dangerous. 
# We will default to a 'documents' folder in the current directory for safety during testing.
# Path adjustments for refactored structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "../documents_to_scan"))
PROCESSED_DIR = os.path.abspath(os.path.join(BASE_DIR, "../data/processed"))
DB_PATH = os.path.join(BASE_DIR, "../data/index.db")
NUM_WORKERS = max(1, multiprocessing.cpu_count() - 2)

# --- S3 CONFIGURATION ---
S3_ENDPOINT = os.getenv('S3_ENDPOINT', 'http://localhost:8333')
S3_BUCKET = os.getenv('S3_BUCKET', 'archive')
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID', 'any') # SeaweedFS defaults
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', 'any')

def get_s3_client():
    return boto3.client('s3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY
    )

def upload_to_s3(local_path, s3_key):
    """Uploads a file to S3 compatible storage (SeaweedFS)."""
    try:
        s3 = get_s3_client()
        # Ensure bucket exists
        try:
            s3.head_bucket(Bucket=S3_BUCKET)
        except:
            s3.create_bucket(Bucket=S3_BUCKET)
        
        s3.upload_file(local_path, S3_BUCKET, s3_key)
        return True
    except Exception as e:
        print(f"[S3 Upload Error] {e}")
        return False

def init_db():
    """Initializes the SQLite database with FTS5."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_path TEXT UNIQUE,
        processed_path TEXT,
        page_count INTEGER,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        file_id UNINDEXED,
        page_num UNINDEXED,
        content,
        bbox_json UNINDEXED,
        width UNINDEXED,
        height UNINDEXED
    )''')
    
    conn.commit()
    conn.close()

def convert_to_pdf(input_path, output_path):
    """Converts DOCX/XLSX/Images to PDF."""
    ext = os.path.splitext(input_path)[1].lower()
    
    if ext == '.pdf':
        shutil.copy2(input_path, output_path)
        return True

    try:
        if ext in ['.jpg', '.jpeg', '.png']:
            with open(output_path, "wb") as f:
                f.write(img2pdf.convert(input_path))
            return True
        
        elif ext in ['.docx', '.doc', '.xlsx', '.xls']:
            # LibreOffice headless conversion
            # Assumes 'soffice' is in PATH
            cmd = [
                'soffice', '--headless', '--convert-to', 'pdf',
                '--outdir', os.path.dirname(output_path),
                input_path
            ]
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # LibreOffice output filename handling might be needed if it changes case
            # But usually it keeps the name. 
            # We need to ensure the file exists at output_path.
            # Ideally we check what LO created and rename it to output_path if different.
            base_name = os.path.splitext(os.path.basename(input_path))[0]
            lo_output = os.path.join(os.path.dirname(output_path), base_name + ".pdf")
            
            if os.path.exists(lo_output) and lo_output != output_path:
                 shutil.move(lo_output, output_path)
            
            return os.path.exists(output_path)
            
    except Exception as e:
        print(f"[Conversion Error] {input_path}: {e}")
        return False
    return False

def compress_pdf(input_path, output_path):
    """Compresses PDF using Ghostscript."""
    try:
        # Check for gs or gswin64c
        gs_cmd = 'gswin64c' if os.name == 'nt' else 'gs'
        
        cmd = [
            gs_cmd,
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/ebook', 
            '-dNOPAUSE', '-dQUIET', '-dBATCH',
            f'-sOutputFile={output_path}',
            input_path
        ]
        subprocess.run(cmd, check=True)
        return True
    except FileNotFoundError:
        print("Ghostscript not found. Please install Ghostscript and add to PATH.")
        return False
    except Exception as e:
        print(f"[Compression Error] {input_path}: {e}")
        return False

def process_file(task):
    """Worker function to process a single file."""
    file_path, rel_path = task
    
    # Use temporary directory for processing
    # In Docker, /tmp is good. locally, PROCESSED_DIR can act as temp.
    # We maintain the structure just for unique naming.
    dest_path = os.path.join(PROCESSED_DIR, rel_path)
    final_pdf_path = os.path.splitext(dest_path)[0] + ".pdf"
    os.makedirs(os.path.dirname(final_pdf_path), exist_ok=True)

    # S3 Key Generation (Using relative path but ensuring forward slashes)
    s3_key = os.path.splitext(rel_path)[0].replace("\\", "/") + ".pdf"

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if already processed (Check for S3 key in processed_path)
    # Note: We assume processed_path now stores the S3 Key or s3:// URI
    cursor.execute("SELECT id FROM files WHERE original_path = ?", (file_path,))
    if cursor.fetchone():
        conn.close()
        return

    temp_pdf = final_pdf_path + ".temp"

    try:
        # 1. Convert to PDF
        if not convert_to_pdf(file_path, temp_pdf):
            conn.close()
            return

        # 2. Compress PDF
        if not compress_pdf(temp_pdf, final_pdf_path):
            if os.path.exists(temp_pdf):
                shutil.move(temp_pdf, final_pdf_path)

        if os.path.exists(temp_pdf):
            os.remove(temp_pdf)

        # 3. OCR (Requires local file)
        try:
             images = convert_from_path(final_pdf_path)
        except Exception as e:
             print(f"Poppler error on {final_pdf_path}: {e}")
             if os.path.exists(final_pdf_path): os.remove(final_pdf_path)
             conn.close()
             return

        # 4. Upload to S3 (New Step)
        if not upload_to_s3(final_pdf_path, s3_key):
            print(f"Failed to upload {s3_key} to S3.")
            conn.close()
            return
        
        # 5. Cleanup Local File (New Step)
        # We don't need the local PDF anymore
        os.remove(final_pdf_path)

        # 6. Update Database
        # Storing 's3_key' in processed_path column.
        cursor.execute("INSERT INTO files (original_path, processed_path, page_count) VALUES (?, ?, ?)", 
                       (file_path, s3_key, len(images)))
        file_id = cursor.lastrowid
        
        for i, image in enumerate(images):
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            
            page_text = []
            bboxes = []
            
            n_boxes = len(data['text'])
            for j in range(n_boxes):
                if int(data['conf'][j]) > 0:
                    txt = data['text'][j].strip()
                    if txt:
                        page_text.append(txt)
                        bboxes.append({
                            't': txt,
                            'x': data['left'][j],
                            'y': data['top'][j],
                            'w': data['width'][j],
                            'h': data['height'][j]
                        })
            
            full_text = " ".join(page_text)
            
            cursor.execute('''INSERT INTO search_index (file_id, page_num, content, bbox_json, width, height) 
                              VALUES (?, ?, ?, ?, ?, ?)''', 
                           (file_id, i + 1, full_text, json.dumps(bboxes), image.width, image.height))
        
        conn.commit()
    except Exception as e:
        print(f"[Processing Failed] {file_path}: {e}")
        conn.rollback()
    finally:
        conn.close()

def main():
    if not os.path.exists(ROOT_DIR):
        print(f"Root directory '{ROOT_DIR}' not found. Please create it or update ROOT_DIR in script.")
        # Create it for user convenience
        os.makedirs(ROOT_DIR, exist_ok=True)
        print(f"Created empty directory '{ROOT_DIR}'. Please put files in there to scan.")
        return

    init_db()
    
    tasks = []
    print(f"Scanning directory: {ROOT_DIR}")
    for root, dirs, files in os.walk(ROOT_DIR):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ['.pdf', '.docx', '.xlsx', '.jpg', '.png']:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, ROOT_DIR)
                tasks.append((abs_path, rel_path))

    print(f"Found {len(tasks)} files. Starting processing with {NUM_WORKERS} workers...")
    
    if tasks:
        with multiprocessing.Pool(NUM_WORKERS) as pool:
            list(tqdm(pool.imap_unordered(process_file, tasks), total=len(tasks)))
    else:
        print("No files to process.")

if __name__ == '__main__':
    multiprocessing.freeze_support() 
    main()
