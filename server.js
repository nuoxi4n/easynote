/**
 * EasyNote - Node.js Development Server
 * For testing when PHP is not available.
 * Usage: node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8080;
const DATA_DIR = path.join(__dirname, '_notes');
const SITE_TITLE = 'EasyNote';
const CIPHER = 'aes-256-cbc';

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// MIME types
const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function encrypt(text, password) {
    const key = crypto.createHash('sha256').update(password).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(CIPHER, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return 'ENCRYPTED:' + iv.toString('base64') + ':' + encrypted;
}

function decrypt(text, password) {
    const parts = text.split(':');
    if (parts.length !== 3 || parts[0] !== 'ENCRYPTED') return false;
    try {
        const key = crypto.createHash('sha256').update(password).digest();
        const iv = Buffer.from(parts[1], 'base64');
        const decipher = crypto.createDecipheriv(CIPHER, key, iv);
        let decrypted = decipher.update(parts[2], 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return false;
    }
}

function isEncrypted(content) {
    return content.startsWith('ENCRYPTED:');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getHomePage() {
    // Read index.php to extract the HTML structure, but generate it directly
    return generatePage('', '', false, true);
}

function getNotePage(note) {
    const noteFile = path.join(DATA_DIR, note + '.txt');
    let content = '';
    let encrypted = false;

    if (fs.existsSync(noteFile)) {
        const raw = fs.readFileSync(noteFile, 'utf8');
        encrypted = isEncrypted(raw);
        if (!encrypted) content = raw;
    }

    return generatePage(note, content, encrypted, false);
}

function generatePage(note, content, encrypted, isHome) {
    const pageTitle = isHome ? SITE_TITLE : escapeHtml(note) + ' - ' + SITE_TITLE;
    const contentEscaped = escapeHtml(content);
    const noteEscaped = escapeHtml(note);

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="description" content="EasyNote - A minimalist web notepad. Create, edit, and share notes instantly.">
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="/assets/css/style.css">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">
</head>
<body>`;

    if (isHome) {
        html += `
    <div class="home-container">
        <div class="home-card glass-panel">
            <div class="home-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
            </div>
            <h1 class="home-title">${SITE_TITLE}</h1>
            <p class="home-subtitle">MINIMALIST WEB NOTEPAD</p>
            <p class="home-desc">Create a note by typing any name below. Your note will be accessible via URL.</p>
            <form class="home-form" id="homeForm" onsubmit="return goToNote()">
                <div class="input-group">
                    <span class="input-prefix">localhost:${PORT}/</span>
                    <input type="text" id="noteNameInput" class="note-name-input" placeholder="my-note" autofocus autocomplete="off" spellcheck="false" pattern="[a-zA-Z0-9_\\-]+" title="Only letters, numbers, hyphens and underscores">
                </div>
                <button type="submit" class="btn-primary" id="goBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    <span>Open Note</span>
                </button>
            </form>
            <div class="home-api-hint">
                <span class="label-industrial">API</span>
                <code>GET /api/{note-name}</code>
            </div>
        </div>
    </div>
    <script>
    function goToNote() {
        var name = document.getElementById('noteNameInput').value.trim();
        if (name) {
            name = name.replace(/[^a-zA-Z0-9_\\-]/g, '');
            if (name) window.location.href = '/' + name;
        }
        return false;
    }
    </script>`;
    } else {
        html += `
    <input type="hidden" id="noteName" value="${noteEscaped}">
    <input type="hidden" id="isEncrypted" value="${encrypted ? '1' : '0'}">
    <input type="hidden" id="baseUrl" value="">
    
    <div class="note-container">
        <header class="note-header glass-panel">
            <div class="header-left">
                <a href="/" class="logo-link" title="Home">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
                </a>
                <span class="note-name-display">${noteEscaped}</span>
            </div>
            <div class="header-actions">
                <span class="save-status" id="saveStatus">
                    <span class="status-dot"></span>
                    <span class="status-text"></span>
                </span>
                <button class="btn-icon" id="btnMarkdown" title="Toggle Markdown Preview (Ctrl+M)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>
                </button>
                <button class="btn-icon" id="btnLock" title="Encryption Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-unlock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-lock" style="display:none"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                <button class="btn-icon" id="btnCopy" title="Copy Note URL">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </button>
            </div>
        </header>
        <div class="editor-wrapper glass-panel">
            <textarea id="editor" class="editor" placeholder="Start typing your note..." spellcheck="false">${contentEscaped}</textarea>
            <div id="markdownPreview" class="markdown-preview" style="display:none"></div>
        </div>
    </div>
    <div class="modal-overlay" id="modalOverlay" style="display:none">
        <div class="modal glass-panel" id="passwordModal">
            <h3 class="modal-title" id="modalTitle">Set Password</h3>
            <p class="modal-desc" id="modalDesc">Encrypt this note with a password.</p>
            <input type="password" id="passwordInput" class="modal-input" placeholder="Enter password" autocomplete="off">
            <div class="modal-actions">
                <button class="btn-secondary" id="modalCancel">Cancel</button>
                <button class="btn-primary btn-sm" id="modalConfirm">Confirm</button>
            </div>
        </div>
    </div>
    <div class="toast" id="toast"></div>
    <script src="/assets/js/marked.min.js"></script>
    <script src="/assets/js/app.js"></script>`;
    }

    html += `
</body>
</html>`;
    return html;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Serve static assets
    if (pathname.startsWith('/assets/')) {
        const filePath = path.join(__dirname, pathname);
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(fs.readFileSync(filePath));
            return;
        }
        res.writeHead(404);
        res.end('Not found');
        return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
        const note = pathname.slice(5).replace(/[^a-zA-Z0-9_\-]/g, '');

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Password');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (!note) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No note name specified. Use /api/{note-name}' }));
            return;
        }

        const noteFile = path.join(DATA_DIR, note + '.txt');

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                let content = '', password = '';
                try {
                    const json = JSON.parse(body);
                    content = json.content || '';
                    password = json.password || '';
                } catch (e) {
                    content = body;
                    password = req.headers['x-password'] || '';
                }
                if (password) content = encrypt(content, password);
                fs.writeFileSync(noteFile, content);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', note, length: content.length }));
            });
            return;
        }

        // GET
        if (!fs.existsSync(noteFile)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ note, content: '', exists: false }));
            return;
        }

        let content = fs.readFileSync(noteFile, 'utf8');
        const enc = isEncrypted(content);

        if (enc) {
            const pwd = req.headers['x-password'] || url.searchParams.get('password') || '';
            if (!pwd) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ note, encrypted: true, error: 'Provide password via X-Password header or ?password= parameter.' }));
                return;
            }
            const dec = decrypt(content, pwd);
            if (dec === false) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ note, encrypted: true, error: 'Invalid password.' }));
                return;
            }
            content = dec;
        }

        if (url.searchParams.has('raw') || (req.headers.accept || '').includes('text/plain')) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        } else {
            const stat = fs.statSync(noteFile);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                note, content, exists: true, encrypted: enc,
                length: content.length,
                modified: stat.mtime.toISOString()
            }));
        }
        return;
    }

    // Note routes (POST for save/decrypt)
    let note = pathname.slice(1).replace(/[^a-zA-Z0-9_\-]/g, '');

    if (req.method === 'POST' && note) {
        const noteFile = path.join(DATA_DIR, note + '.txt');
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const json = JSON.parse(body);
                const action = json.action || 'save';

                if (action === 'save') {
                    let content = json.content || '';
                    if (json.password) content = encrypt(content, json.password);
                    fs.writeFileSync(noteFile, content);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok', length: content.length }));
                } else if (action === 'decrypt') {
                    if (!fs.existsSync(noteFile)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Note not found' }));
                        return;
                    }
                    const raw = fs.readFileSync(noteFile, 'utf8');
                    if (!isEncrypted(raw)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ content: raw, encrypted: false }));
                        return;
                    }
                    const dec = decrypt(raw, json.password || '');
                    if (dec === false) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid password' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ content: dec, encrypted: true }));
                    }
                } else if (action === 'check') {
                    if (!fs.existsSync(noteFile)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ exists: false, encrypted: false }));
                    } else {
                        const raw = fs.readFileSync(noteFile, 'utf8');
                        const enc = isEncrypted(raw);
                        const resp = { exists: true, encrypted: enc };
                        if (!enc) resp.content = raw;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(resp));
                    }
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // GET: Home or note page
    if (!note || pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getHomePage());
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getNotePage(note));
    }
});

server.listen(PORT, () => {
    console.log(`\n  EasyNote dev server running at http://localhost:${PORT}\n`);
});
