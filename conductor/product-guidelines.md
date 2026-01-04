# Product Guidelines

## 1. Design Principles
*   **Performance First:** The UI must remain responsive. Heavy operations (search) are offloaded to SQLite FTS5. PDF rendering is lazy-loaded.
*   **Clean & Minimalist:** Focus on the content (the document). Sidebar for tools, main area for reading.
*   **Native Feel:** The application should feel like a native file explorer/viewer extension.

## 2. User Experience (UX)
*   **Instant Feedback:** Search results should appear as the user types (debounced).
*   **Contextual Highlighting:** Users should immediately see *where* their search term appears in the document.
*   **Seamless Transition:** Moving from search result to document view should be instantaneous.

## 3. Code Quality
*   **Modular Architecture:** Clear separation between Backend (Python Pipeline), Main Process (Electron/SQLite), and Renderer (UI).
*   **Error Handling:** Robust handling for corrupt files in the pipeline (skip and log, don't crash).
