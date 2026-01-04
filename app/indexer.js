const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const mime = require('mime-types');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');
const WordExtractor = require("word-extractor");
const extractor = new WordExtractor();

// --- KONFIGÜRASYON ---
const ROOT_DIR = 'C:/Katalog/IBC Ingenieurbau-Consult GmbH/IBC Ingenieurbau-Consult GmbH - Katalog'; // Taranacak klasör
const DB_PATH = path.join(__dirname, '../data/index.db');

// Veritabanı Kurulumu
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Performans için WAL modu
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT UNIQUE,
    filename TEXT,
    file_type TEXT,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    file_id UNINDEXED,
    content,
    tokenize='trigram'
  );
`);

// Yardımcı Fonksiyonlar
function getFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

async function extractText(filePath, mimeType) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // 1. PDF
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    }
    // 2. Word (DOCX)
    else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }
    // 3. Word (DOC) - Eski
    else if (ext === '.doc') {
      const doc = await extractor.extract(filePath);
      return doc.getBody();
    }
    // 4. Excel (XLSX, XLS)
    else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      let text = "";
      workbook.SheetNames.forEach(sheetName => {
        const row = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        text += row + "\n";
      });
      return text;
    }
    // 5. Resimler (OCR)
    else if (mimeType && mimeType.startsWith('image/')) {
      console.log(`OCR processing: ${path.basename(filePath)}...`);
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng+tur', { 
        logger: m => {} 
      });
      return text;
    }
    
    return null;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(ROOT_DIR)) {
    console.error(`ERROR: Target directory not found: ${ROOT_DIR}`);
    return;
  }

  console.log("Scanning files...");
  const allFiles = getFiles(ROOT_DIR);
  console.log(`Found ${allFiles.length} files. Starting indexing...`);

  const insertFile = db.prepare('INSERT OR IGNORE INTO files (filepath, filename, file_type) VALUES (?, ?, ?)');
  const insertIndex = db.prepare('INSERT INTO search_index (file_id, content) VALUES (?, ?)');
  const checkFile = db.prepare('SELECT id FROM files WHERE filepath = ?');

  let processedCount = 0;
  let skippedCount = 0;

  for (const filePath of allFiles) {
    const filename = path.basename(filePath);
    const mimeType = mime.lookup(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Sadece desteklenenleri işle
    if (!mimeType || (!mimeType.includes('pdf') && 
        !mimeType.includes('word') && 
        !mimeType.includes('spreadsheet') && 
        !mimeType.includes('image') &&
        ext !== '.dwg' &&
        ext !== '.dxf' &&
        ext !== '.doc' &&
        ext !== '.docx')) {
      continue;
    }

    const existing = checkFile.get(filePath);
    if (existing) {
      skippedCount++;
      continue;
    }

    processedCount++;
    console.log(`[${processedCount}] Processing: ${filename}`);
    
    let textContent = null;
    if (ext === '.dwg' || ext === '.dxf') {
        textContent = filename; 
    } else {
        textContent = await extractText(filePath, mimeType);
    }

    const info = insertFile.run(filePath, filename, mimeType || 'application/octet-stream');
    const fileId = info.lastInsertRowid;

    if (textContent && textContent.trim().length > 0) {
        if (info.changes > 0) {
            insertIndex.run(fileId, textContent);
        }
    }
  }

  console.log(`Indexing complete! Processed: ${processedCount}, Already Indexed: ${skippedCount}`);
}

main();