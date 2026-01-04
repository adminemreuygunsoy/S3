# Technology Stack

## Backend (Data Pipeline)
*   **Language:** Python 3.10+
*   **Concurrency:** `multiprocessing`
*   **OCR:** `pytesseract` (Tesseract-OCR Engine)
*   **PDF Manipulation:** `pdf2image`, `img2pdf`
*   **Compression:** `ghostscript` (via subprocess)
*   **Office Conversion:** `LibreOffice` (headless mode)
*   **Database:** SQLite 3 (with FTS5 extension enabled)

## Frontend (Desktop App)
*   **Framework:** Electron
*   **Language:** JavaScript (Vanilla or simple modular structure)
*   **Database Client:** `better-sqlite3` (Native binding for performance)
*   **PDF Rendering:** `pdfjs-dist`
*   **Styling:** CSS3 (Flexbox/Grid)

## Tools
*   **Package Manager:** `npm` (Node), `pip` (Python)
*   **Version Control:** Git
