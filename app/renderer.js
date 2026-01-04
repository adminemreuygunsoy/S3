// --- HYBRID API ADAPTER ---
// Automatically detects if running in Electron (Desktop) or Web (Browser/Docker)
const isElectron = () => {
    return typeof process !== 'undefined' && process.versions && !!process.versions.electron;
};

const ApiAdapter = {
    async search(query) {
        if (isElectron()) {
            return await ipcRenderer.invoke('search-query', query);
        } else {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            return await res.json();
        }
    },

    async getTree(dirPath) {
        if (isElectron()) {
            return await ipcRenderer.invoke('get-file-tree', dirPath);
        } else {
            const url = dirPath ? `/api/tree?path=${encodeURIComponent(dirPath)}` : '/api/tree';
            const res = await fetch(url);
            return await res.json();
        }
    },

    async getContent(filePath) {
        if (isElectron()) {
            return await ipcRenderer.invoke('get-file-content', filePath);
        } else {
            const res = await fetch(`/api/content?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            return data.content;
        }
    },

    openFile(filePath) {
        if (isElectron()) {
            ipcRenderer.invoke('open-file', filePath);
        } else {
            // In Web mode, we try to download or view the file via API
            window.open(`/api/file?path=${encodeURIComponent(filePath)}`, '_blank');
        }
    }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log(`Renderer initialized. Mode: ${isElectron() ? 'Electron (Desktop)' : 'Web (Browser)'}`);

    // 1. Sidebar Toggle Logic
    if (hideSidebarBtn && showSidebarBtn && sidebar) {
        hideSidebarBtn.onclick = () => {
            sidebar.style.display = 'none';
            showSidebarBtn.style.display = 'flex'; // Changed to flex for center alignment
        };
        showSidebarBtn.onclick = () => {
            sidebar.style.display = 'flex';
            showSidebarBtn.style.display = 'none';
        };
    }

    // 2. Tab Buttons Logic
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.onclick = () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName, btn);
        };
    });

    // 3. Search Logic (Textbox Input)
    if (searchInput) {
        searchInput.onkeydown = async (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value;
                if (!query.trim()) return;
                
                if (resultsList) resultsList.innerHTML = '<div class="spinner"></div><div class="status-msg">Searching...</div>';
                try {
                    const results = await ApiAdapter.search(query);
                    renderSearchResults(results);
                } catch (err) {
                    console.error(err);
                    if (resultsList) resultsList.innerHTML = `<div class="error-msg">Search Error: ${err.message}</div>`;
                }
            }
        };
    }

    // UX IMPROVEMENT: Auto-open 'Folders' tab on startup
    const foldersBtn = document.querySelector('.tab-btn[data-tab="folders"]');
    if (foldersBtn) {
        // console.log("Auto-switching to Folders tab...");
        foldersBtn.click();
    }
});

// --- FUNCTIONS ---

function clearSelection() {
    document.querySelectorAll('.result-item, .folder-item').forEach(el => {
        el.classList.remove('selected');
    });
}

function switchTab(tabName, clickedBtn) {
    try {
        // Update Buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        if (clickedBtn) clickedBtn.classList.add('active');

        // Update Content
        document.querySelectorAll('.tab-content').forEach(div => {
            div.style.display = 'none';
            div.classList.remove('active');
        });

        const activeTab = document.getElementById(`tab-${tabName}`);
        if (activeTab) {
            activeTab.style.display = 'block';
            activeTab.classList.add('active');
        }

        // Lazy Load Folders
        if (tabName === 'folders' && folderTree && folderTree.innerHTML.includes('Loading...')) {
            loadFolder(null, folderTree);
        }
    } catch (err) {
        console.error("Tab switch error:", err);
    }
}

function renderSearchResults(results) {
    if (!resultsList) return;
    resultsList.innerHTML = '';
    if (results.length === 0) {
        resultsList.innerHTML = '<div class="status-msg">No matches found.</div>';
        return;
    }

    results.forEach(res => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <span class="result-title">${res.filename}</span>
            <span class="result-snippet">${res.snippet}</span>
        `;
        div.onclick = () => {
            clearSelection();
            div.classList.add('selected');
            showPreview({ filepath: res.filepath });
        };
        div.ondblclick = () => ApiAdapter.openFile(res.filepath);
        resultsList.appendChild(div);
    });
}

async function loadFolder(dirPath, parentElement) {
    if (!parentElement) return;
    try {
        parentElement.innerHTML = '<div class="spinner"></div><div class="status-msg">Loading folders...</div>';
        const items = await ApiAdapter.getTree(dirPath);
        parentElement.innerHTML = ''; 

        const ul = document.createElement('ul');
        ul.className = 'tree-list';

        if (dirPath) {
            const backLi = document.createElement('li');
            backLi.className = 'folder-item folder';
            backLi.innerHTML = '<span class="icon">📁</span> .. (Up)';
            backLi.onclick = () => loadFolder(path.dirname(dirPath), parentElement);
            ul.appendChild(backLi);
        }

        items.forEach(item => {
            const li = document.createElement('li');
            li.className = `folder-item ${item.isDirectory ? 'folder' : 'file'}`;
            
            let icon = '📄';
            if (item.isDirectory) icon = '📁';
            else if (item.ext === '.pdf') icon = '📕';
            else if (item.ext === '.docx') icon = '📘';
            else if (item.ext === '.xlsx') icon = '📗';
            else if (item.ext === '.dwg' || item.ext === '.dxf') icon = '📐';
            else if (['.jpg','.png'].includes(item.ext)) icon = '🖼️';

            li.innerHTML = `<span class="icon">${icon}</span> ${item.name}`;

            if (item.isDirectory) {
                li.onclick = () => loadFolder(item.path, parentElement);
            } else {
                li.onclick = () => {
                    clearSelection();
                    li.classList.add('selected');
                    showPreview({ filepath: item.path });
                };
                li.ondblclick = () => ApiAdapter.openFile(item.path);
            }
            ul.appendChild(li);
        });

        parentElement.appendChild(ul);
    } catch (err) {
        console.error("Error loading folder:", err);
        parentElement.innerHTML = `<div class="error-msg">Folder Load Error: ${err.message}</div>`;
    }
}

function showPreview(file) {
    if (!previewContainer) return;
    const ext = path.extname(file.filepath).toLowerCase();
    previewContainer.innerHTML = '';

    // In WEB mode, file.filepath is an absolute server path.
    // We need to convert it to a serve-able URL.
    // For now, we assume the API handles it via /api/file?path=...
    const fileUrl = isElectron() ? file.filepath : `/api/file?path=${encodeURIComponent(file.filepath)}`;

    if (ext === '.pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl; 
        previewContainer.appendChild(iframe);
    } else if (['.jpg', '.png', '.jpeg', '.gif'].includes(ext)) {
        const img = document.createElement('img');
        img.src = fileUrl;
        previewContainer.appendChild(img);
    } else if (ext === '.dwg' || ext === '.dxf') {
        const cadType = ext.toUpperCase().replace('.', '');
        previewContainer.innerHTML = `
            <div class="placeholder-text">
                <div style="font-size: 64px; color: #d32f2f; margin-bottom: 10px;">📐</div>
                <h3 style="margin: 0;">CAD Drawing (${cadType})</h3>
                <p style="margin: 10px 0 20px 0;">Internal preview is not supported for CAD files.</p>
                <button 
                    class="btn-primary"
                    onclick="ApiAdapter.openFile('${file.filepath.replace(/\\/g, '\\\\')}')">
                    Open in External Application
                </button>
            </div>
        `;
    } else if (['.doc', '.docx', '.xlsx', '.xls'].includes(ext)) {
        previewContainer.innerHTML = '<div class="spinner"></div><div class="status-msg">Extracting text preview...</div>';
        ApiAdapter.getContent(file.filepath).then(content => {
            previewContainer.innerHTML = `
                <div style="padding:24px; width:100%; height:100%; box-sizing:border-box; overflow:auto; background: #fff; color:var(--text-color); white-space: pre-wrap; font-family: 'Consolas', monospace; font-size: 13px;">
                    <div style="margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size:14px;">Text Preview</strong>
                        <button class="btn-primary" style="padding: 4px 12px; font-size:12px;" onclick="ApiAdapter.openFile('${file.filepath.replace(/\\/g, '\\\\')}')">Open Original File</button>
                    </div>
                    ${content || "No text content available for this file."} 
                </div>
            `;
        });
    } else {
        previewContainer.innerHTML = `
            <div class="placeholder-text">
                <div style="font-size: 48px; margin-bottom: 15px;">📄</div>
                <h3 style="margin: 0;">${path.basename(file.filepath)}</h3>
                <p style="margin: 10px 0 20px 0;">Preview not available for this file type.</p>
                <button class="btn-primary" onclick="ApiAdapter.openFile('${file.filepath.replace(/\\/g, '\\\\')}')">Open with System Viewer</button>
            </div>
        `;
    }
}
