// --- DOM ELEMENTS ---
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('resultsList');
const previewContainer = document.getElementById('preview-container');
const folderTree = document.getElementById('folderTree');

const sidebar = document.getElementById('sidebar');
const hideSidebarBtn = document.getElementById('hideSidebarBtn');
const showSidebarBtn = document.getElementById('showSidebarBtn');

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    console.log("Client script loaded and DOM ready.");
    
    try {
        // 1. Sidebar Toggle Logic
        if (hideSidebarBtn && showSidebarBtn && sidebar) {
            hideSidebarBtn.onclick = () => {
                sidebar.style.display = 'none';
                showSidebarBtn.style.display = 'flex'; 
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

        // Initial Load
        loadFolder(null, folderTree);

        // 3. Search Logic
        const performSearch = async () => {
            const query = searchInput.value;
            if (!query.trim()) return;
            
            if (resultsList) resultsList.innerHTML = '<div class="spinner"></div><div class="status-msg">Searching...</div>';
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                if (!response.ok) throw new Error('Network response was not ok');
                const results = await response.json();
                renderSearchResults(results);
            } catch (err) {
                console.error(err);
                if (resultsList) resultsList.innerHTML = `<div class="error-msg">Search Error: ${err.message}</div>`;
            }
        };

        if (searchInput) {
            searchInput.onkeydown = (e) => {
                if (e.key === 'Enter') performSearch();
            };
        }

        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.onclick = performSearch;
        }
        
    } catch (err) {
        console.error("Initialization Error:", err);
        alert("Arayüz yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.");
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
        if (tabName === 'folders' && folderTree && folderTree.innerHTML.includes('Initializing')) {
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
        // Double click to download/open
        div.ondblclick = () => window.open(`/api/file?path=${encodeURIComponent(res.filepath)}`, '_blank');
        resultsList.appendChild(div);
    });
}

async function loadFolder(dirPath, parentElement) {
    if (!parentElement) return;
    try {
        parentElement.innerHTML = '<div class="spinner"></div><div class="status-msg">Loading folders...</div>';
        
        let url = '/api/tree';
        if (dirPath) url += `?path=${encodeURIComponent(dirPath)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load tree');
        const items = await response.json();
        
        parentElement.innerHTML = ''; 

        const ul = document.createElement('ul');
        ul.className = 'tree-list';

        if (dirPath) {
            const backLi = document.createElement('li');
            backLi.className = 'folder-item folder';
            backLi.innerHTML = '<span class="icon">📁</span> .. (Up)';
            // We need a way to go up. Since we don't have 'path.dirname' in browser JS easily without a library,
            // we rely on the server logic or simple string manipulation.
            // A simple hack for now: remove the last segment.
            // Better: The server could return 'parentPath'.
            // For now, let's just assume we can't easily go back without reloading root or implementing path logic.
            // Let's implement simple string manipulation:
            const parentPath = dirPath.substring(0, dirPath.lastIndexOf((dirPath.includes('/') ? '/' : '\\')));
            
            backLi.onclick = () => loadFolder(parentPath, parentElement);
            ul.appendChild(backLi);
        }

        items.forEach(item => {
            const li = document.createElement('li');
            li.className = `folder-item ${item.isDirectory ? 'folder' : 'file'}`;
            
            let icon = '📄';
            // Simple extension check
            const ext = item.isDirectory ? null : item.name.split('.').pop().toLowerCase();
            
            if (item.isDirectory) icon = '📁';
            else if (ext === 'pdf') icon = '📕';
            else if (['docx', 'doc'].includes(ext)) icon = '📘';
            else if (['xlsx', 'xls'].includes(ext)) icon = '📗';
            else if (['dwg', 'dxf'].includes(ext)) icon = '📐';
            else if (['jpg', 'png', 'jpeg'].includes(ext)) icon = '🖼️';

            li.innerHTML = `<span class="icon">${icon}</span> ${item.name}`;

            if (item.isDirectory) {
                li.onclick = () => loadFolder(item.path, parentElement);
            } else {
                li.onclick = () => {
                    clearSelection();
                    li.classList.add('selected');
                    showPreview({ filepath: item.path });
                };
                li.ondblclick = () => window.open(`/api/file?path=${encodeURIComponent(item.path)}`, '_blank');
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
    const ext = file.filepath.split('.').pop().toLowerCase();
    previewContainer.innerHTML = '';
    
    // Construct the file URL for the server
    const fileUrl = `/api/file?path=${encodeURIComponent(file.filepath)}`;

    if (ext === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.src = fileUrl; 
        previewContainer.appendChild(iframe);
    } else if (['jpg', 'png', 'jpeg', 'gif'].includes(ext)) {
        const img = document.createElement('img');
        img.src = fileUrl;
        previewContainer.appendChild(img);
    } else if (['dwg', 'dxf'].includes(ext)) {
        const cadType = ext.toUpperCase();
        previewContainer.innerHTML = `
            <div class="placeholder-text">
                <div style="font-size: 64px; color: #d32f2f; margin-bottom: 10px;">📐</div>
                <h3 style="margin: 0;">CAD Drawing (${cadType})</h3>
                <p style="margin: 10px 0 20px 0;">Preview not supported in browser.</p>
                <a href="${fileUrl}" target="_blank" class="btn-primary" style="text-decoration:none;">Download / Open File</a>
            </div>
        `;
    } else if (['doc', 'docx', 'xlsx', 'xls'].includes(ext)) {
        previewContainer.innerHTML = '<div class="spinner"></div><div class="status-msg">Extracting text preview...</div>';
        
        fetch(`/api/content?path=${encodeURIComponent(file.filepath)}`)
            .then(res => res.json())
            .then(data => {
                previewContainer.innerHTML = `
                    <div style="padding:24px; width:100%; height:100%; box-sizing:border-box; overflow:auto; background: #fff; color:var(--text-color); white-space: pre-wrap; font-family: 'Consolas', monospace; font-size: 13px;">
                        <div style="margin-bottom: 15px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <strong style="font-size:14px;">Text Preview</strong>
                            <a href="${fileUrl}" target="_blank" class="btn-primary" style="padding: 4px 12px; font-size:12px; text-decoration:none;">Download Original</a>
                        </div>
                        ${data.content || "No text content available for this file."} 
                    </div>
                `;
            })
            .catch(err => {
                 previewContainer.innerHTML = `<div class="error-msg">Preview Error: ${err.message}</div>`;
            });

    } else {
        // Generic fallback
        previewContainer.innerHTML = `
            <div class="placeholder-text">
                <div style="font-size: 48px; margin-bottom: 15px;">📄</div>
                <h3 style="margin: 0;">${file.filepath.split(/[\/]/).pop()}</h3>
                <p style="margin: 10px 0 20px 0;">Preview not available.</p>
                <a href="${fileUrl}" target="_blank" class="btn-primary" style="text-decoration:none;">Download File</a>
            </div>
        `;
    }
}
