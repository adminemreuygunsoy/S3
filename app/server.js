const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- S3 Configuration ---
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:8333';
const S3_BUCKET = process.env.S3_BUCKET || 'archive';
const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: 'us-east-1', // Dummy region for SeaweedFS/MinIO
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'any',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'any'
    },
    forcePathStyle: true // Required for self-hosted S3 like SeaweedFS
});

// Database Connection
let db;
const DB_PATH = path.join(__dirname, '../data/index.db');
try {
    if (!fs.existsSync(DB_PATH)) {
        console.error(`Database file not found at: ${DB_PATH}`);
    } else {
        db = new Database(DB_PATH, { readonly: true });
        console.log(`Connected to database at ${DB_PATH}`);
    }
} catch (err) {
    console.error("Database connection error:", err);
}

// Configuration: Root Directory for Files
const ROOT_DIR = process.env.ROOT_DIR || '/app/documents_to_scan';

// Helper: Sanitize FTS Query
function sanitizeFtsQuery(query) {
    if (!query) return "";
    let clean = query.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g, ' ').trim();
    if (!clean) return "";
    return `"${clean}"`;
}

// API: Get File Tree
app.get('/api/tree', async (req, res) => {
    // If 'path' query is provided, use it. Otherwise default to ROOT_DIR.
    // SECURITY NOTE: In a production app, you must validate that 'reqPath' is inside ROOT_DIR to prevent directory traversal attacks.
    let reqPath = req.query.path || ROOT_DIR;
    
    // Simple security check (ensure we don't go above drive root or specific restrictions if needed)
    // For this internal tool, we allow navigation.

    try {
        const items = await fs.promises.readdir(reqPath, { withFileTypes: true });
        const result = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(reqPath, item.name),
            ext: item.isDirectory() ? null : path.extname(item.name).toLowerCase()
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        res.json(result);
    } catch (err) {
        console.error("Error reading directory:", err);
        res.json([]);
    }
});

// API: Search
app.get('/api/search', (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    const query = req.query.q;
    if (!query) return res.json([]);

    try {
        const sanitized = sanitizeFtsQuery(query);
        if (!sanitized) return res.json([]);

        const stmt = db.prepare(`
            SELECT 
                files.original_path as filepath, -- Corrected column name
                files.processed_path,
                snippet(search_index, 1, '<b>', '</b>', '...', 15) as snippet
            FROM search_index 
            JOIN files ON search_index.file_id = files.id
            WHERE search_index MATCH ? 
            ORDER BY rank 
            LIMIT 50
        `);
        const results = stmt.all(sanitized);
        
        const mappedResults = results.map(r => ({
            filepath: r.filepath,
            filename: path.basename(r.filepath), // Derive filename from path
            snippet: r.snippet
        }));

        res.json(mappedResults);
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: err.message });
    }
});

// API: Get Text Content (Preview)
app.get('/api/content', (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not connected" });
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: "Missing path" });

    try {
        const stmt = db.prepare(`
            SELECT search_index.content 
            FROM search_index 
            JOIN files ON search_index.file_id = files.id
            WHERE files.original_path = ?
        `);
        const result = stmt.get(filePath);
        res.json({ content: result ? result.content : "No indexed content found." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// API: Serve File (S3 Stream or Local Fallback)
app.get('/api/file', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send("Missing path");

    // 1. Check DB for S3 Key
    let s3Key = null;
    if (db) {
        try {
            const stmt = db.prepare("SELECT processed_path FROM files WHERE original_path = ?");
            const row = stmt.get(filePath);
            if (row && row.processed_path) {
                s3Key = row.processed_path;
            }
        } catch (err) {
            console.error("DB Lookup Error:", err);
        }
    }

    // 2. Try serving from S3
    if (s3Key) {
        try {
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: s3Key
            });
            const response = await s3.send(command);
            
            // Set Headers
            if (response.ContentType) res.setHeader('Content-Type', response.ContentType);
            if (response.ContentLength) res.setHeader('Content-Length', response.ContentLength);
            
            // Pipe Stream
            response.Body.pipe(res);
            return;
        } catch (s3Err) {
            console.warn(`S3 Fetch Failed for key ${s3Key}, falling back to local file. Error: ${s3Err.message}`);
        }
    }

    // 3. Fallback: Serve Local File
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("Error sending file:", filePath, err);
            if (!res.headersSent) res.status(404).send("File not found or inaccessible.");
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Root Directory: ${ROOT_DIR}`);
});
