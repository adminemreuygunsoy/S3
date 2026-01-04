const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config(); // Load .env vars
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// --- S3 Configuration ---
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:8333';
const S3_BUCKET = process.env.S3_BUCKET || 'archive';
const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: 'us-east-1', // Dummy region
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'any',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'any'
    },
    forcePathStyle: true
});

// Initialize DB safely
let db;
try {
    const dbPath = path.join(__dirname, '../data/index.db');
    db = new Database(dbPath, { readonly: true });
} catch (err) {
    console.error("Database error:", err);
}

// Helper to sanitize FTS5 queries
function sanitizeFtsQuery(query) {
    if (!query) return "";
    let clean = query.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g, ' ').trim();
    if (!clean) return "";
    return `"${clean}"`;
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false 
        }
    });
    win.loadFile('index.html');
    win.setMenuBarVisibility(false); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC: Get File Tree
ipcMain.handle('get-file-tree', async (event, dirPath) => {
    // Note: This still browses LOCAL filesystem. 
    // For a pure cloud app, this should browse S3 or DB, but for "Hybrid" implies local scan + cloud view.
    const rootPath = dirPath || 'C:/Katalog/IBC Ingenieurbau-Consult GmbH/IBC Ingenieurbau-Consult GmbH - Katalog';
    try {
        const items = await fs.promises.readdir(rootPath, { withFileTypes: true });
        return items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join(rootPath, item.name),
            ext: item.isDirectory() ? null : path.extname(item.name).toLowerCase()
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    } catch (err) {
        console.error("Error reading directory:", err);
        return [];
    }
});

// IPC: Search
ipcMain.handle('search-query', (event, query) => {
    if (!db) return [];
    try {
        const sanitized = sanitizeFtsQuery(query);
        if (!sanitized) return [];

        // Updated query for new Schema (original_path)
        const stmt = db.prepare(`
            SELECT 
                files.original_path as filepath, -- Alias for frontend compatibility
                files.processed_path,
                snippet(search_index, 1, '<b>', '</b>', '...', 15) as snippet
            FROM search_index 
            JOIN files ON search_index.file_id = files.id
            WHERE search_index MATCH ? 
            ORDER BY rank 
            LIMIT 50
        `);
        
        // Add filename manually since it's not in DB anymore (or extract from path)
        const results = stmt.all(sanitized);
        return results.map(r => ({
            ...r,
            filename: path.basename(r.filepath)
        }));

    } catch (err) {
        console.error("Search error:", err);
        return [];
    }
});

// IPC: Get File Content
ipcMain.handle('get-file-content', async (event, filePath) => {
    if (!db) return "";
    try {
        const stmt = db.prepare(`
            SELECT search_index.content 
            FROM search_index 
            JOIN files ON search_index.file_id = files.id
            WHERE files.original_path = ?
        `);
        const result = stmt.get(filePath);
        return result ? result.content : "No indexed content found.";
    } catch (err) {
        console.error(err);
        return "";
    }
});

// IPC: Open File (S3 Logic)
ipcMain.handle('open-file', async (event, filePath) => {
    console.log("Opening file:", filePath);
    
    // 1. Try to find S3 Key in DB
    let s3Key = null;
    if (db) {
        try {
            const stmt = db.prepare("SELECT processed_path FROM files WHERE original_path = ?");
            const row = stmt.get(filePath);
            if (row && row.processed_path) {
                s3Key = row.processed_path;
            }
        } catch (err) {
            console.error("DB Error:", err);
        }
    }

    // 2. If S3 Key exists, generate URL and open in Browser
    if (s3Key) {
        try {
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET,
                Key: s3Key
            });
            // Generate URL valid for 1 hour
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
            console.log("Opening S3 URL:", url);
            shell.openExternal(url);
            return;
        } catch (s3Err) {
            console.error("S3 URL Generation Failed:", s3Err);
        }
    }

    // 3. Fallback: Open Local Path
    console.log("Falling back to local path...");
    shell.openPath(filePath);
});