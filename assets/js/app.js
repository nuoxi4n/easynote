/**
 * EasyNote - Frontend Application
 * Auto-save, encryption, markdown toggle, keyboard shortcuts
 * Uses window.LANG for i18n translations
 */
(function () {
    'use strict';

    // === i18n helper ===
    var L = window.LANG || {};
    function t(key) { return L[key] || key; }

    // === State ===
    var state = {
        noteName: '',
        baseUrl: '',
        isEncrypted: false,
        password: null,
        markdownMode: false,
        saveTimer: null,
        lastSavedContent: '',
        saving: false
    };

    // === DOM Elements ===
    var $editor, $preview, $saveStatus, $btnMarkdown, $btnLock, $btnCopy;
    var $modalOverlay, $modalTitle, $modalDesc, $passwordInput, $modalConfirm, $modalCancel;
    var $toast;
    var $iconLock, $iconUnlock;

    // === Initialize ===
    function init() {
        state.noteName = document.getElementById('noteName').value;
        state.baseUrl = document.getElementById('baseUrl').value;
        state.isEncrypted = document.getElementById('isEncrypted').value === '1';

        $editor = document.getElementById('editor');
        $preview = document.getElementById('markdownPreview');
        $saveStatus = document.getElementById('saveStatus');
        $btnMarkdown = document.getElementById('btnMarkdown');
        $btnLock = document.getElementById('btnLock');
        $btnCopy = document.getElementById('btnCopy');
        $modalOverlay = document.getElementById('modalOverlay');
        $modalTitle = document.getElementById('modalTitle');
        $modalDesc = document.getElementById('modalDesc');
        $passwordInput = document.getElementById('passwordInput');
        $modalConfirm = document.getElementById('modalConfirm');
        $modalCancel = document.getElementById('modalCancel');
        $toast = document.getElementById('toast');
        $iconLock = $btnLock.querySelector('.icon-lock');
        $iconUnlock = $btnLock.querySelector('.icon-unlock');

        // Track initial content
        state.lastSavedContent = $editor.value;

        // If encrypted, show password prompt
        if (state.isEncrypted) {
            updateLockIcon(true);
            showDecryptPrompt();
        }

        // Bind events
        bindEvents();

        // Set initial status
        if ($editor.value.length > 0) {
            setStatus('saved', t('saved'));
        }
    }

    // === Event Bindings ===
    function bindEvents() {
        // Auto-save on input
        $editor.addEventListener('input', function () {
            scheduleSave();
        });

        // Tab key support
        $editor.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                var value = this.value;
                this.value = value.substring(0, start) + '\t' + value.substring(end);
                this.selectionStart = this.selectionEnd = start + 1;
                scheduleSave();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                forceSave();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                toggleMarkdown();
            }
            if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Markdown toggle
        $btnMarkdown.addEventListener('click', toggleMarkdown);

        // Lock button
        $btnLock.addEventListener('click', handleLockClick);

        // Copy URL
        $btnCopy.addEventListener('click', copyNoteUrl);

        // Modal
        $modalCancel.addEventListener('click', closeModal);
        $modalOverlay.addEventListener('click', function (e) {
            if (e.target === $modalOverlay) closeModal();
        });
        $passwordInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') $modalConfirm.click();
        });
    }

    // === Auto-Save ===
    function scheduleSave() {
        if (state.saveTimer) clearTimeout(state.saveTimer);
        setStatus('', '');
        state.saveTimer = setTimeout(function () {
            doSave();
        }, 1500);
    }

    function forceSave() {
        if (state.saveTimer) clearTimeout(state.saveTimer);
        doSave();
    }

    function doSave() {
        var content = $editor.value;
        if (content === state.lastSavedContent && !state.isEncrypted) return;
        if (state.saving) return;

        state.saving = true;
        setStatus('saving', t('saving'));

        var body = { action: 'save', content: content };
        if (state.password) {
            body.password = state.password;
        }

        fetch(state.baseUrl + '/' + state.noteName, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                state.saving = false;
                if (data.status === 'ok') {
                    state.lastSavedContent = content;
                    setStatus('saved', t('saved'));
                } else {
                    setStatus('error', t('error'));
                    showToast(t('save_failed') + (data.error || t('unknown_error')));
                }
            })
            .catch(function (err) {
                state.saving = false;
                setStatus('error', t('error'));
                showToast(t('network_error'));
            });
    }

    // === Status Indicator ===
    function setStatus(cls, text) {
        $saveStatus.className = 'save-status' + (cls ? ' ' + cls : '');
        $saveStatus.querySelector('.status-text').textContent = text;
    }

    // === Markdown Toggle ===
    function toggleMarkdown() {
        state.markdownMode = !state.markdownMode;
        $btnMarkdown.classList.toggle('active', state.markdownMode);

        if (state.markdownMode) {
            // Show preview
            if (typeof marked !== 'undefined') {
                $preview.innerHTML = marked.parse($editor.value);
            } else {
                $preview.innerHTML = '<p style="color:var(--color-text-secondary)">' + t('md_not_loaded') + '</p>';
            }
            $editor.style.display = 'none';
            $preview.style.display = 'block';
        } else {
            // Show editor
            $editor.style.display = 'block';
            $preview.style.display = 'none';
            $editor.focus();
        }
    }

    // === Lock / Encryption ===
    function handleLockClick() {
        if (state.isEncrypted && state.password) {
            // Already encrypted and unlocked - offer to remove encryption
            showModal(
                t('remove_encrypt'),
                t('remove_encrypt_desc'),
                function (pwd) {
                    state.password = null;
                    state.isEncrypted = false;
                    updateLockIcon(false);
                    closeModal();
                    forceSave();
                    showToast(t('encrypt_removed'));
                },
                true // no password needed
            );
        } else if (!state.isEncrypted) {
            // Set new password
            showModal(
                t('set_password'),
                t('set_password_desc'),
                function (pwd) {
                    if (!pwd) {
                        showToast(t('pwd_empty'));
                        return;
                    }
                    state.password = pwd;
                    state.isEncrypted = true;
                    updateLockIcon(true);
                    closeModal();
                    forceSave();
                    showToast(t('note_encrypted'));
                }
            );
        }
    }

    function showDecryptPrompt() {
        $editor.disabled = true;
        $editor.value = '';
        $editor.placeholder = t('placeholder_encrypted');

        showModal(
            t('unlock_note'),
            t('unlock_desc'),
            function (pwd) {
                if (!pwd) {
                    showToast(t('pwd_empty'));
                    return;
                }
                // Try to decrypt
                fetch(state.baseUrl + '/' + state.noteName, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'decrypt', password: pwd })
                })
                    .then(function (res) { return res.json(); })
                    .then(function (data) {
                        if (data.error) {
                            showToast(t('pwd_invalid'));
                            $passwordInput.value = '';
                            $passwordInput.focus();
                        } else {
                            state.password = pwd;
                            $editor.disabled = false;
                            $editor.value = data.content;
                            $editor.placeholder = t('placeholder');
                            state.lastSavedContent = data.content;
                            closeModal();
                            setStatus('saved', t('saved'));
                            $editor.focus();
                        }
                    })
                    .catch(function () {
                        showToast(t('network_error'));
                    });
            }
        );
    }

    function updateLockIcon(locked) {
        if (locked) {
            $iconLock.style.display = '';
            $iconUnlock.style.display = 'none';
        } else {
            $iconLock.style.display = 'none';
            $iconUnlock.style.display = '';
        }
    }

    // === Modal ===
    function showModal(title, desc, onConfirm, noPassword) {
        $modalTitle.textContent = title;
        $modalDesc.textContent = desc;
        $passwordInput.value = '';

        if (noPassword) {
            $passwordInput.style.display = 'none';
        } else {
            $passwordInput.style.display = '';
            $passwordInput.placeholder = t('enter_password');
        }

        $modalOverlay.style.display = 'flex';

        if (!noPassword) {
            setTimeout(function () { $passwordInput.focus(); }, 100);
        }

        $modalConfirm.onclick = function () {
            onConfirm($passwordInput.value);
        };
    }

    function closeModal() {
        $modalOverlay.style.display = 'none';
    }

    // === Copy URL ===
    function copyNoteUrl() {
        var url = window.location.href;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
                showToast(t('url_copied'));
            }).catch(function () {
                fallbackCopy(url);
            });
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(t('url_copied'));
        } catch (e) {
            showToast(t('copy_failed'));
        }
        document.body.removeChild(textarea);
    }

    // === Toast ===
    function showToast(message) {
        $toast.textContent = message;
        $toast.classList.add('show');
        setTimeout(function () {
            $toast.classList.remove('show');
        }, 2500);
    }

    // === Boot ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
