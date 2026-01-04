# Workflow

1.  **Branching:** Use `main` for stable code. Create feature branches for tracks (e.g., `track/pipeline`).
2.  **Commits:** Atomic commits with clear messages (e.g., `feat: add OCR logic`).
3.  **Testing:**
    *   **Python:** Test the pipeline on a small subset of files first.
    *   **Electron:** Verify the app launches and can query the sample DB.
4.  **Checkpoints:**
    *   After Phase 1 (Python), verify `index.db` is populated correctly.
    *   After Phase 2 (Electron), verify search returns results from DB.
