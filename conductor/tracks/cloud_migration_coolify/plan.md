# Implementation Plan: Cloud Migration

## Phase 1: Dockerization (The Foundation)
- [ ] **Create `Dockerfile.app`**: Setup Node.js environment for the web server.
- [ ] **Create `Dockerfile.worker`**: Setup Python environment + Tesseract + Ghostscript.
- [ ] **Create `docker-compose.yml`**: Orchestrate App, Worker, and SeaweedFS (for local testing).
- [ ] **Verify:** Ensure the app builds and runs in Docker containers locally.

## Phase 2: Refactoring Frontend (Decoupling Electron)
- [ ] **API Standardization**: Ensure `app/server.js` has all necessary endpoints (`/api/search`, `/api/tree`, `/api/content`).
- [ ] **Update `renderer.js`**:
    - [ ] Detect environment (Electron vs Web).
    - [ ] Replace `ipcRenderer.invoke` with `fetch('/api/...')` calls when in Web mode.
    - [ ] Remove `shell.openPath` (replace with `window.open(url)`).
- [ ] **Serve Static Assets**: Ensure Express correctly serves `index.html` and `renderer.js`.

## Phase 3: Storage Integration (SeaweedFS / S3)
- [ ] **Python Pipeline**:
    - [ ] Install `boto3`.
    - [ ] Refactor `pipeline.py` to upload processed files to S3 bucket instead of local folders.
    - [ ] Update DB records to store `s3_key` instead of `file_path`.
- [ ] **Node Backend**:
    - [ ] Install `@aws-sdk/client-s3`.
    - [ ] Create an S3 Client helper.
    - [ ] Update `/api/file` endpoint to stream from S3.

## Phase 4: Coolify Deployment Prep
- [ ] **Environment Variables**: Create `.env.example` (S3_ENDPOINT, ACCESS_KEY, etc.).
- [ ] **Health Checks**: Add `/health` endpoint for Coolify monitoring.
- [ ] **Persistence**: Configure Docker Volumes for SQLite DB and SeaweedFS data.

## Phase 5: Security & Cleanup
- [ ] **Auth**: Implement simple Login middleware (Username/Password) for the Web Interface.
- [ ] **Cleanup**: Remove unused Electron boilerplate if deciding to go 100% Web (Optional).
