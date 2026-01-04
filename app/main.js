const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

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

        const stmt = db.prepare(`
            SELECT 
                files.filepath, 
                files.filename,
                snippet(search_index, 1, '<b>', '</b>', '...', 15) as snippet
            FROM search_index 
            JOIN files ON search_index.file_id = files.id
            WHERE search_index MATCH ? 
            ORDER BY rank 
            LIMIT 50
        `);
        return stmt.all(sanitized);
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
            WHERE files.filepath = ?
        `);
        const result = stmt.get(filePath);
        return result ? result.content : "No indexed content found.";
    } catch (err) {
        console.error(err);
        return "";
    }
});

// IPC: Open File
ipcMain.handle('open-file', (event, filePath) => {
    shell.openPath(filePath);
});