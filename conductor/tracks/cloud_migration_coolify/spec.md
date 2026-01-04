# Technical Specification: Cloud Migration (SeaweedFS + Coolify)

## 1. Architectural Shift
The application is moving from a **Local Electron App** to a **Containerized Web Application**.

### Current Architecture (Legacy)
*   **Storage:** Local Filesystem (`C:\...`)
*   **Database:** Local SQLite (`index.db`)
*   **Frontend:** Electron (IPC Communication)
*   **Backend:** Node.js (Embedded in Electron)
*   **Pipeline:** Local Python Script

### New Architecture (Target)
*   **Infrastructure:** Docker Compose (Managed by Coolify)
*   **Storage:** **SeaweedFS** (S3 Protocol)
    *   All PDFs, Images, and Thumbnails will be stored here.
    *   No local file dependency on the application server.
*   **Database:** SQLite (Stored on a Docker Volume for persistence) OR PostgreSQL (Optional for future).
*   **Frontend:** Standard Web App (Vanilla JS + HTML served via Express).
    *   Communication: REST API (Fetch) instead of IPC.
*   **Backend:** Express.js Server.
    *   Acts as the API Gateway.
    *   Streams files from SeaweedFS to the Client.
*   **Pipeline:** Python Worker (Docker Container).
    *   Monitors an "Upload" folder (or API endpoint) -> Processes -> Uploads to SeaweedFS -> Updates DB.

## 2. Component Details

### A. The Storage Layer (SeaweedFS)
*   **Role:** Replaces `fs.readFile` and local paths.
*   **Protocol:** S3 API (boto3 for Python, @aws-sdk/client-s3 for Node).
*   **Bucket Structure:**
    *   `archive-master`: Original files.
    *   `archive-thumbnails`: Generated previews.

### B. The Application Layer (Node.js/Express)
*   **Authentication:** Basic Auth or JWT (Required for public access).
*   **File Serving:** 
    *   Instead of `res.sendFile(localPath)`, it will use `s3.getObject(key).createReadStream().pipe(res)`.
*   **Search:** Remains FTS5 (SQLite), but returns S3 Keys instead of Windows paths.

### C. The Processing Layer (Python ETL)
*   **Trigger:** Cron job or File Watcher inside the container.
*   **Output:** Instead of writing processed PDFs to disk, it uploads them to SeaweedFS buckets.

## 3. Infrastructure (Docker)
We will define a `docker-compose.yml` compatible with Coolify.

*   **Service 1: App** (Node.js Web Server)
*   **Service 2: Worker** (Python Pipeline)
*   **Service 3: SeaweedFS** (Master + Volume) - *Optional if using external SeaweedFS*
