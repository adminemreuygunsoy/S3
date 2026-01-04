# Plan: Initial Implementation & Pipeline Setup

## Phase 1: Project Skeleton & Dependencies
- [ ] Task: Create project root structure and `package.json`.
- [ ] Task: Install Electron dependencies (`electron`, `better-sqlite3`, `pdfjs-dist`).
- [ ] Task: Install Python dependencies (`pytesseract`, `pdf2image`, `img2pdf`, `tqdm`).

## Phase 2: Python Data Pipeline
- [ ] Task: Create `pipeline.py` with database initialization (SQLite FTS5).
- [ ] Task: Implement File Conversion Logic (LibreOffice/img2pdf).
- [ ] Task: Implement Compression Logic (Ghostscript).
- [ ] Task: Implement OCR & Indexing Logic (Tesseract -> SQLite).

## Phase 3: Electron Frontend Core
- [ ] Task: Create `main.js` (IPC Handlers, Window creation).
- [ ] Task: Create `index.html` (Layout).
- [ ] Task: Create `renderer.js` (Search logic, PDF rendering).
- [ ] Task: Create `styles.css`.

## Phase 4: Verification
- [ ] Task: Verify Python script runs (dry run on small folder).
- [ ] Task: Verify Electron app launches and reads DB.
