# Product Guide

## 1. System Overview
A robust, high-performance local document archive system consisting of a Python-based ETL pipeline for data processing and an Electron-based frontend for viewing and searching. The system handles mixed file types (PDF, DOCX, XLSX, JPG, PNG) totaling approximately 108 GB.

## 2. Core Components

### Phase 1: Python Data Pipeline (The Factory)
*   **Goal:** Convert, Compress, and Index documents.
*   **Normalization:** Recursively scan and convert non-PDF files (DOCX, XLSX, Images) to standard PDF using LibreOffice and img2pdf.
*   **Optimization:** Compress all PDFs using Ghostscript (`-dPDFSETTINGS=/ebook`) to reduce size (~150 DPI).
*   **Indexing:** Use **SQLite with FTS5** (Full Text Search) instead of MessagePack.
    *   OCR processing page-by-page using `pytesseract`.
    *   Store metadata, text content, and bounding box coordinates (JSON) for highlighting.

### Phase 2: Electron Frontend (The Viewer)
*   **Goal:** A modern, snappy application to search and view documents.
*   **Tech Stack:** Electron, Vanilla JS/React, `better-sqlite3`, `pdfjs-dist`.
*   **Navigation:** Sidebar with FTS5-powered search bar (instant results with snippets).
*   **Viewing:** Main view using `pdf.js` with lazy loading.
*   **Highlighting:** Overlay approach to highlight search terms on the PDF canvas using stored `bbox_json` coordinates.

## 3. Key Requirements
*   **Performance:** Python script must utilize `multiprocessing`. Electron app must handle 100,000+ indexed pages smoothly.
*   **Resumability:** The pipeline must be able to resume if interrupted.
*   **Data Integrity:** Preserve original folder structure in the processed output.