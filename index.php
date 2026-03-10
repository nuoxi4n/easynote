<?php
/**
 * EasyNote - Minimalist Web Notepad
 * Main entry point handling all requests.
 */

require_once __DIR__ . '/config.php';

// Ensure data directory exists
if (!is_dir($data_dir)) {
    mkdir($data_dir, 0755, true);
}

// Get note name from query
$note = isset($_GET['note']) ? trim($_GET['note'], '/') : '';

// Sanitize note name: allow alphanumeric, hyphens, underscores
$note = preg_replace('/[^a-zA-Z0-9_\-]/', '', $note);

// Check if this is an API request
$is_api = false;
if (strpos($note, 'api') === 0) {
    $note = preg_replace('/^api\/?/', '', $note);
    $is_api = true;
}

// If no note name, show home page
if (empty($note)) {
    if ($is_api) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'No note name specified. Use /api/{note-name}'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Show home page
    showHomePage();
    exit;
}

// Note file path
$note_file = $data_dir . $note . '.txt';

// Handle API requests
if ($is_api) {
    if (!$allow_api) {
        header('HTTP/1.1 403 Forbidden');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'API access is disabled'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    handleApiRequest($note, $note_file);
    exit;
}

// Handle AJAX save (POST with JSON body)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    handleSaveRequest($note, $note_file);
    exit;
}

// Handle note page (GET)
showNotePage($note, $note_file);

// ========== Functions ==========

/**
 * Handle API requests for AI/programmatic access
 */
function handleApiRequest($note, $note_file) {
    global $cipher;
    
    // CORS headers for API
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Password');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // Save note via API
        $input = file_get_contents('php://input');
        $json = json_decode($input, true);
        
        $content = '';
        $password = '';
        
        if ($json !== null) {
            $content = isset($json['content']) ? $json['content'] : '';
            $password = isset($json['password']) ? $json['password'] : '';
        } else {
            // Fallback: raw body as content
            $content = $input;
            $password = isset($_SERVER['HTTP_X_PASSWORD']) ? $_SERVER['HTTP_X_PASSWORD'] : '';
        }
        
        if (!empty($password)) {
            $content = encryptContent($content, $password);
        }
        
        $result = file_put_contents($note_file, $content);
        
        header('Content-Type: application/json; charset=utf-8');
        if ($result !== false) {
            echo json_encode([
                'status' => 'ok',
                'note' => $note,
                'length' => strlen($content)
            ], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save note'], JSON_UNESCAPED_UNICODE);
        }
        exit;
    }
    
    // GET: Read note
    if (!file_exists($note_file)) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'note' => $note,
            'content' => '',
            'exists' => false
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    $content = file_get_contents($note_file);
    $encrypted = isEncrypted($content);
    
    if ($encrypted) {
        $password = isset($_SERVER['HTTP_X_PASSWORD']) ? $_SERVER['HTTP_X_PASSWORD'] : 
                    (isset($_GET['password']) ? $_GET['password'] : '');
        
        if (empty($password)) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(401);
            echo json_encode([
                'note' => $note,
                'encrypted' => true,
                'error' => 'This note is encrypted. Provide password via X-Password header or ?password= parameter.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        $decrypted = decryptContent($content, $password);
        if ($decrypted === false) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(403);
            echo json_encode([
                'note' => $note,
                'encrypted' => true,
                'error' => 'Invalid password.'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $content = $decrypted;
    }
    
    // Check Accept header for raw text
    $accept = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
    $raw = isset($_GET['raw']);
    
    if ($raw || strpos($accept, 'text/plain') !== false) {
        header('Content-Type: text/plain; charset=utf-8');
        echo $content;
    } else {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'note' => $note,
            'content' => $content,
            'exists' => true,
            'encrypted' => $encrypted,
            'length' => strlen($content),
            'modified' => date('c', filemtime($note_file))
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

/**
 * Handle AJAX save request from frontend
 */
function handleSaveRequest($note, $note_file) {
    global $cipher;
    
    $input = file_get_contents('php://input');
    $json = json_decode($input, true);
    
    header('Content-Type: application/json; charset=utf-8');
    
    if ($json === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    $action = isset($json['action']) ? $json['action'] : 'save';
    
    switch ($action) {
        case 'save':
            $content = isset($json['content']) ? $json['content'] : '';
            $password = isset($json['password']) ? $json['password'] : '';
            
            if (!empty($password)) {
                $content = encryptContent($content, $password);
            }
            
            $result = file_put_contents($note_file, $content);
            if ($result !== false) {
                echo json_encode(['status' => 'ok', 'length' => strlen($content)], JSON_UNESCAPED_UNICODE);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to save'], JSON_UNESCAPED_UNICODE);
            }
            break;
            
        case 'decrypt':
            $password = isset($json['password']) ? $json['password'] : '';
            if (!file_exists($note_file)) {
                echo json_encode(['error' => 'Note not found'], JSON_UNESCAPED_UNICODE);
                break;
            }
            $content = file_get_contents($note_file);
            if (!isEncrypted($content)) {
                echo json_encode(['content' => $content, 'encrypted' => false], JSON_UNESCAPED_UNICODE);
                break;
            }
            $decrypted = decryptContent($content, $password);
            if ($decrypted === false) {
                http_response_code(403);
                echo json_encode(['error' => 'Invalid password'], JSON_UNESCAPED_UNICODE);
            } else {
                echo json_encode(['content' => $decrypted, 'encrypted' => true], JSON_UNESCAPED_UNICODE);
            }
            break;
            
        case 'check':
            // Check if note exists and if encrypted
            if (!file_exists($note_file)) {
                echo json_encode(['exists' => false, 'encrypted' => false], JSON_UNESCAPED_UNICODE);
            } else {
                $content = file_get_contents($note_file);
                $encrypted = isEncrypted($content);
                $resp = ['exists' => true, 'encrypted' => $encrypted];
                if (!$encrypted) {
                    $resp['content'] = $content;
                }
                echo json_encode($resp, JSON_UNESCAPED_UNICODE);
            }
            break;
            
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Unknown action'], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

/**
 * Encrypt content with AES-256-CBC
 */
function encryptContent($content, $password) {
    global $cipher;
    $key = hash('sha256', $password, true);
    $iv = openssl_random_pseudo_bytes(openssl_cipher_iv_length($cipher));
    $encrypted = openssl_encrypt($content, $cipher, $key, 0, $iv);
    return 'ENCRYPTED:' . base64_encode($iv) . ':' . $encrypted;
}

/**
 * Decrypt content
 */
function decryptContent($content, $password) {
    global $cipher;
    $parts = explode(':', $content, 3);
    if (count($parts) !== 3 || $parts[0] !== 'ENCRYPTED') {
        return false;
    }
    $iv = base64_decode($parts[1]);
    $encrypted = $parts[2];
    $key = hash('sha256', $password, true);
    $decrypted = openssl_decrypt($encrypted, $cipher, $key, 0, $iv);
    return $decrypted;
}

/**
 * Check if content is encrypted
 */
function isEncrypted($content) {
    return strpos($content, 'ENCRYPTED:') === 0;
}

/**
 * Show the home page
 */
function showHomePage() {
    global $site_title, $base_url;
    renderPage('', '', false, true);
}

/**
 * Show the note editor page
 */
function showNotePage($note, $note_file) {
    $content = '';
    $encrypted = false;
    
    if (file_exists($note_file)) {
        $raw = file_get_contents($note_file);
        $encrypted = isEncrypted($raw);
        if (!$encrypted) {
            $content = $raw;
        }
    }
    
    renderPage($note, $content, $encrypted, false);
}

/**
 * Render the HTML page
 */
function renderPage($note, $content, $encrypted, $is_home) {
    global $site_title, $base_url;
    
    $page_title = $is_home ? $site_title : htmlspecialchars($note) . ' - ' . $site_title;
    $content_escaped = htmlspecialchars($content, ENT_QUOTES, 'UTF-8');
    $note_escaped = htmlspecialchars($note, ENT_QUOTES, 'UTF-8');
    $base = $base_url;
    
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="EasyNote - A minimalist web notepad. Create, edit, and share notes instantly.">
    <meta name="theme-color" content="#F2F2F7">
    <title><?php echo $page_title; ?></title>
    <!-- Preload critical fonts -->
    <link rel="preload" href="<?php echo $base; ?>/assets/fonts/Inter-Regular.ttf" as="font" type="font/ttf" crossorigin>
    <link rel="preload" href="<?php echo $base; ?>/assets/fonts/Inter-Bold.ttf" as="font" type="font/ttf" crossorigin>
    <!-- Inline critical CSS to eliminate render-blocking -->
    <style>
    @font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url('<?php echo $base; ?>/assets/fonts/Inter-Regular.ttf') format('truetype')}
    @font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url('<?php echo $base; ?>/assets/fonts/Inter-Bold.ttf') format('truetype')}
    :root{--bg-base:#F2F2F7;--bg-white:rgba(255,255,255,0.55);--border-inner:rgba(255,255,255,0.6);--border-outer:rgba(229,229,234,0.4);--shadow-float:0 24px 48px -12px rgba(0,0,0,0.08);--color-text:#1C1C1E;--color-text-secondary:#636366;--color-text-tertiary:#8E8E93;--font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    html{font-size:16px}body{font-family:var(--font-family);background-color:var(--bg-base);color:var(--color-text);min-height:100vh;line-height:1.6;overflow-x:hidden}
    .home-container{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .glass-panel{background:var(--bg-white);backdrop-filter:blur(50px);-webkit-backdrop-filter:blur(50px);border:1px solid var(--border-inner);box-shadow:var(--shadow-float),inset 0 1px 0 rgba(255,255,255,0.5);position:relative}
    .home-card{width:100%;max-width:520px;padding:48px 40px;border-radius:50px;text-align:center;animation:cardIn .6s cubic-bezier(.16,1,.3,1) both}
    @keyframes cardIn{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
    .note-container{display:flex;flex-direction:column;min-height:100vh;padding:16px;gap:12px;max-width:960px;margin:0 auto}
    .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    </style>
    <!-- Async load full stylesheet -->
    <link rel="preload" href="<?php echo $base; ?>/assets/css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="<?php echo $base; ?>/assets/css/style.css"></noscript>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">
</head>
<body>
    <?php if ($is_home): ?>
    <!-- Home Page -->
    <main class="home-container">
        <div class="home-card glass-panel">
            <div class="home-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
            </div>
            <h1 class="home-title"><?php echo $site_title; ?></h1>
            <p class="home-subtitle">MINIMALIST WEB NOTEPAD</p>
            <p class="home-desc">Create a note by typing any name below. Your note will be accessible via URL.</p>
            <form class="home-form" id="homeForm" onsubmit="return goToNote()">
                <div class="input-group">
                    <label for="noteNameInput" class="sr-only">Note name</label>
                    <span class="input-prefix"><?php echo $_SERVER['HTTP_HOST'] . $base; ?>/</span>
                    <input type="text" id="noteNameInput" class="note-name-input" placeholder="my-note" autofocus autocomplete="off" spellcheck="false" pattern="[a-zA-Z0-9_\-]+" title="Only letters, numbers, hyphens and underscores">
                </div>
                <button type="submit" class="btn-primary" id="goBtn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    <span>Open Note</span>
                </button>
            </form>
            <div class="home-api-hint">
                <span class="label-industrial">API</span>
                <code>GET /api/{note-name}</code>
            </div>
        </div>
    </main>

    <script>
    function goToNote() {
        var name = document.getElementById('noteNameInput').value.trim();
        if (name) {
            name = name.replace(/[^a-zA-Z0-9_\-]/g, '');
            if (name) {
                window.location.href = '<?php echo $base; ?>/' + name;
            }
        }
        return false;
    }
    </script>

    <?php else: ?>
    <!-- Note Editor Page -->
    <input type="hidden" id="noteName" value="<?php echo $note_escaped; ?>">
    <input type="hidden" id="isEncrypted" value="<?php echo $encrypted ? '1' : '0'; ?>">
    <input type="hidden" id="baseUrl" value="<?php echo $base; ?>">
    
    <main class="note-container">
        <!-- Header Bar -->
        <header class="note-header glass-panel" role="banner">
            <div class="header-left">
                <a href="<?php echo $base; ?>/" class="logo-link" title="Home" aria-label="Back to home">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
                </a>
                <span class="note-name-display"><?php echo $note_escaped; ?></span>
            </div>
            <div class="header-actions">
                <span class="save-status" id="saveStatus" role="status" aria-live="polite">
                    <span class="status-dot"></span>
                    <span class="status-text"></span>
                </span>
                
                <button class="btn-icon" id="btnMarkdown" title="Toggle Markdown Preview (Ctrl+M)" aria-label="Toggle Markdown Preview">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>
                </button>
                
                <button class="btn-icon" id="btnLock" title="Encryption Settings" aria-label="Encryption Settings">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-unlock" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="icon-lock" style="display:none" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
                
                <button class="btn-icon" id="btnCopy" title="Copy Note URL" aria-label="Copy Note URL">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </button>
            </div>
        </header>
        
        <!-- Editor Area -->
        <div class="editor-wrapper glass-panel">
            <label for="editor" class="sr-only">Note content</label>
            <textarea id="editor" class="editor" placeholder="Start typing your note..." spellcheck="false"><?php echo $content_escaped; ?></textarea>
            <div id="markdownPreview" class="markdown-preview" style="display:none"></div>
        </div>
    </main>
    
    <!-- Password Modal -->
    <div class="modal-overlay" id="modalOverlay" style="display:none">
        <div class="modal glass-panel" id="passwordModal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
            <h3 class="modal-title" id="modalTitle">Set Password</h3>
            <p class="modal-desc" id="modalDesc">Encrypt this note with a password. Anyone will need the password to view or edit.</p>
            <label for="passwordInput" class="sr-only">Password</label>
            <input type="password" id="passwordInput" class="modal-input" placeholder="Enter password" autocomplete="off">
            <div class="modal-actions">
                <button class="btn-secondary" id="modalCancel">Cancel</button>
                <button class="btn-primary btn-sm" id="modalConfirm">Confirm</button>
            </div>
        </div>
    </div>
    
    <!-- Toast -->
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    
    <script src="<?php echo $base; ?>/assets/js/marked.min.js" defer></script>
    <script src="<?php echo $base; ?>/assets/js/app.js" defer></script>
    
    <?php endif; ?>
</body>
</html>
<?php
}
